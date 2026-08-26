import { Injectable, Logger } from '@nestjs/common';
import { money } from '@novamart/domain';
import type { VerifiedPayment } from '@novamart/domain';
import type { OrderStatus, PaymentMethod, PaymentSessionDto, PaymentStatusDto } from '@novamart/types';
import { AppError } from '../../common/errors/app-error';
import { RequestContext } from '../../common/context/request-context';
import {
  DatabaseService,
  type SessionContext,
  type Tx,
} from '../../infrastructure/database/database.service';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';
import { PaymentProviderRegistry } from '../../infrastructure/providers/payment/payment-provider.registry';

interface IntentRow {
  id: string;
  order_id: string;
  user_id: string;
  provider: string;
  provider_intent_id: string | null;
  amount_paise: string;
  captured_paise: string;
  refunded_paise: string;
  payment_method: string;
  status: string;
  failure_code: string | null;
  failure_reason: string | null;
  client_session: Record<string, unknown>;
  expires_at: string | null;
  order_number: string;
  order_status: string;
  payment_status: string;
}

/**
 * Payments (brief §33, §34).
 *
 * The single rule that shapes this module: NovaMart only ever believes itself or the
 * provider's API. A browser or app callback is treated as a prompt to go and verify,
 * never as evidence that money moved.
 *
 * Idempotency is enforced by the database, not by application bookkeeping:
 *   payments.payment_webhook_events  UNIQUE (provider, provider_event_id)
 * A redelivered webhook loses the insert race and returns without side effects, so the
 * five-identical-webhooks case in brief §34 is handled by a constraint rather than by
 * hoping a flag was set.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: OutboxService,
    private readonly providers: PaymentProviderRegistry,
  ) { }

  /**
   * Session context for applying a payment outcome.
   *
   * Deliberately SYSTEM rather than the caller. Confirming a payment drives
   * PENDING_PAYMENT -> PAYMENT_CONFIRMED -> CONFIRMED, and
   * commerce.order_status_transitions restricts those to the SYSTEM actor: the platform
   * is acting on verified provider truth, not on the customer's authority. Running as the
   * customer would either be rejected by the state machine or, worse, record the customer
   * as having confirmed their own payment.
   *
   * requestId and traceId are preserved so the action still correlates to the request
   * that triggered it; who or what prompted it stays visible in the webhook event row.
   */
  private systemContext(): SessionContext {
    const ctx = RequestContext.get();
    return {
      actorId: null,
      actorType: 'SYSTEM',
      requestId: ctx?.requestId ?? null,
      traceId: ctx?.traceId ?? null,
    };
  }

  /**
   * Creates the provider-side payment for an order and returns the client handoff.
   * Safe to call again for the same order: the existing intent is reused rather than
   * charging the customer twice.
   */
  async createSession(orderId: string): Promise<PaymentSessionDto> {
    const principal = RequestContext.requirePrincipal();
    const intent = await this.loadIntentByOrder(orderId, principal.userId);

    if (intent.payment_method === 'COD') {
      return {
        paymentIntentId: intent.id,
        orderId: intent.order_id,
        orderNumber: intent.order_number,
        provider: 'COD',
        amount: money(Number(intent.amount_paise)),
        paymentMethod: 'COD',
        providerSession: {},
        expiresAt: null,
        requiresProviderFlow: false,
      };
    }

    if (intent.status === 'CAPTURED') {
      throw new AppError('PAYMENT_ALREADY_CAPTURED');
    }

    // Reuse the provider order if one already exists, so a customer who backs out of
    // the payment sheet and returns does not create a second provider order.
    if (intent.provider_intent_id) {
      return this.toSessionDto(intent, intent.client_session);
    }

    const provider = this.providers.active();

    const [customer] = await this.db.sql<
      Array<{ full_name: string | null; email: string | null; phone: string | null }>
    >`
      select full_name, email::text as email, phone
        from identity.profiles where id = ${principal.userId}
    `;

    const created = await provider.createPayment({
      orderId: intent.order_id,
      orderNumber: intent.order_number,
      amountPaise: Number(intent.amount_paise),
      currency: 'INR',
      paymentMethod: intent.payment_method,
      customer: {
        id: principal.userId,
        name: customer?.full_name ?? null,
        email: customer?.email ?? null,
        phone: customer?.phone ?? null,
      },
      // Keyed on the intent so a retry cannot create a second provider order.
      idempotencyKey: `intent:${intent.id}`,
    });

    await this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      await tx`
        update payments.payment_intents
           set provider            = ${PaymentProviderRegistry.toDbCode(provider.code)},
               provider_intent_id  = ${created.providerIntentId},
               client_session      = ${tx.json(created.clientSession as never)},
               expires_at          = ${created.expiresAt?.toISOString() ?? null},
               status              = 'PENDING'
         where id = ${intent.id}
      `;

      await this.outbox.emit(tx, 'PAYMENT_CREATED', {
        paymentIntentId: intent.id,
        orderId: intent.order_id,
        orderNumber: intent.order_number,
        userId: principal.userId,
        provider: provider.code,
        providerPaymentId: null,
        amountPaise: Number(intent.amount_paise),
        capturedPaise: 0,
        paymentMethod: intent.payment_method,
        failureCode: null,
        failureReason: null,
      });
    });

    return this.toSessionDto(intent, created.clientSession, created.expiresAt);
  }

  async processRefund(refundId: string): Promise<Record<string, unknown>> {
    const [refund] = await this.db.critical<Array<{
      id: string; payment_intent_id: string; order_id: string; order_item_id: string | null;
      user_id: string; amount_paise: string; reason_code: string; idempotency_key: string | null;
      status: string; provider: string; provider_payment_id: string | null; refund_reference: string;
      refund_type: string;
    }>>`
      select r.id, r.refund_reference, r.refund_type, r.payment_intent_id, r.order_id, r.order_item_id, r.user_id,
             r.amount_paise::text, r.reason_code, r.idempotency_key, r.status,
             pi.provider, pt.provider_transaction_id as provider_payment_id
        from payments.refunds r
        join payments.payment_intents pi on pi.id = r.payment_intent_id
        left join lateral (
          select provider_transaction_id from payments.payment_transactions
           where payment_intent_id = pi.id and transaction_type = 'CAPTURE' and status = 'SUCCESS'
           order by occurred_at desc limit 1
        ) pt on true
       where r.id = ${refundId}
       for update
    `;
    if (!refund) throw AppError.notFound('Refund');
    if (refund.status === 'COMPLETED') return { id: refund.id, status: refund.status, alreadyProcessed: true };
    if (!refund.provider_payment_id) throw new AppError('REFUND_NOT_ALLOWED', 'No captured provider payment is available for this refund');

    const provider = this.providers.byCode(refund.provider);
    const outcome = await provider.refund({
      providerPaymentId: refund.provider_payment_id,
      amountPaise: Number(refund.amount_paise),
      idempotencyKey: refund.idempotency_key ?? `refund:${refund.id}`,
      reason: refund.reason_code,
    });
    return this.db.transaction(this.systemContext(), async (tx) => {
      const [attempt] = await tx<Array<{ attempt_number: number }>>`select coalesce(max(attempt_number), 0) + 1 as attempt_number from payments.refund_attempts where refund_id = ${refund.id}`;
      await tx`
        insert into payments.refund_attempts (
          refund_id, attempt_number, provider, provider_refund_id, amount_paise,
          status, provider_error_code, provider_error_description, provider_payload,
          outcome_source, completed_at
        ) values (
          ${refund.id}, ${attempt?.attempt_number ?? 1}, ${refund.provider}, ${outcome.providerRefundId},
          ${Number(refund.amount_paise)}, ${outcome.status}, ${outcome.failureCode ?? (outcome.status === 'FAILED' ? 'PROVIDER_REFUND_FAILED' : null)},
          ${outcome.failureReason}, ${tx.json(outcome.raw as never)}, 'SERVER_FETCH',
          ${outcome.status === 'PENDING' || outcome.status === 'SUCCESS' ? new Date().toISOString() : null}
        )
      `;
      const completed = outcome.status === 'SUCCESS';
      const failed = outcome.status === 'FAILED';
      await tx`
        update payments.refunds
           set status = ${completed ? 'COMPLETED' : failed ? 'FAILED' : 'PROCESSING'},
               completed_at = ${completed ? new Date().toISOString() : null},
               failed_at = ${failed ? new Date().toISOString() : null},
               failure_code = ${failed ? outcome.failureCode ?? 'PROVIDER_REFUND_FAILED' : null},
               failure_reason = ${failed ? outcome.failureReason : null}
         where id = ${refund.id}
      `;
      if (completed) {
        await tx`update payments.payment_intents set refunded_paise = refunded_paise + ${Number(refund.amount_paise)}, status = case when refunded_paise + ${Number(refund.amount_paise)} >= captured_paise then 'REFUNDED' else 'PARTIALLY_REFUNDED' end where id = ${refund.payment_intent_id}`;
        await tx`update commerce.orders set amount_refunded_paise = amount_refunded_paise + ${Number(refund.amount_paise)}, payment_status = case when amount_refunded_paise + ${Number(refund.amount_paise)} >= amount_paid_paise then 'REFUNDED' else 'PARTIALLY_REFUNDED' end where id = ${refund.order_id}`;
        if (refund.order_item_id) await tx`update commerce.order_items set refunded_paise = refunded_paise + ${Number(refund.amount_paise)}, status = case when status = 'REFUND_PENDING' then 'REFUNDED' else status end where id = ${refund.order_item_id}`;
      }
      await this.outbox.emit(tx, completed ? 'REFUND_SUCCESS' : 'REFUND_FAILED', {
        refundId: refund.id,
        refundReference: refund.refund_reference,
        orderId: refund.order_id,
        orderItemId: refund.order_item_id,
        userId: refund.user_id,
        amountPaise: Number(refund.amount_paise),
        refundType: refund.refund_type,
        status: completed ? 'COMPLETED' : failed ? 'FAILED' : 'PROCESSING',
        failureCode: failed ? outcome.failureCode ?? 'PROVIDER_REFUND_FAILED' : null,
      });
      return { id: refund.id, status: completed ? 'COMPLETED' : failed ? 'FAILED' : 'PROCESSING', providerRefundId: outcome.providerRefundId };
    });
  }

  /**
   * Processes a provider webhook.
   *
   * Order of operations is deliberate and must not be rearranged:
   *   1. verify the HMAC over the raw bytes  — an unsigned event is never recorded
   *   2. claim the event by unique insert    — a redelivery stops here
   *   3. re-read the payment from the API    — the payload's amount is not trusted
   *   4. apply the outcome in one transaction
   */
  async handleWebhook(
    providerCode: string,
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
  ): Promise<{ received: true; processed: boolean; duplicate: boolean }> {
    const provider = this.providers.byCode(providerCode);
    // Persist and match on the database's spelling so a webhook can find the intent that
    // was written by the checkout engine.
    const dbProvider = PaymentProviderRegistry.toDbCode(providerCode);
    const verification = provider.verifyWebhook(rawBody, headers);

    if (!verification.valid || !verification.eventId) {
      // Deliberately not persisted: an attacker must not be able to fill a table by
      // posting garbage to a public endpoint. Logged for detection instead.
      this.logger.warn(
        `Rejected ${providerCode} webhook: ${verification.reason ?? 'invalid signature'}`,
      );
      throw new AppError('PAYMENT_VERIFICATION_FAILED', 'Webhook signature verification failed');
    }

    // Claim the event. Losing this race means another delivery is already handling it.
    const claimed = await this.db.critical<Array<{ id: string }>>`
      insert into payments.payment_webhook_events (
        provider, provider_event_id, event_type, provider_payment_id, provider_order_id,
        provider_refund_id, signature_verified, raw_payload, reported_amount_paise,
        processing_status, provider_timestamp
      ) values (
        ${dbProvider}, ${verification.eventId}, ${verification.eventType ?? 'unknown'},
        ${verification.providerPaymentId}, ${verification.providerIntentId},
        ${verification.providerRefundId}, true,
        ${this.db.critical.json(verification.payload as never)},
        ${verification.reportedAmountPaise}, 'RECEIVED',
        ${verification.occurredAt?.toISOString() ?? null}
      )
      on conflict (provider, provider_event_id) do nothing
      returning id
    `;

    if (claimed.length === 0) {
      this.logger.log(`Duplicate ${providerCode} webhook ${verification.eventId} ignored`);
      return { received: true, processed: false, duplicate: true };
    }

    const webhookEventId = claimed[0]!.id;

    try {
      const processed = await this.applyWebhook(webhookEventId, dbProvider, verification);
      return { received: true, processed, duplicate: false };
    } catch (error) {
      // Record the failure and let the provider retry. The claim row stays so we can
      // see how many attempts a poisoned event has had.
      await this.db.critical`
        update payments.payment_webhook_events
           set processing_status   = 'FAILED',
               processing_attempts = processing_attempts + 1,
               processing_error    = ${error instanceof Error ? error.message.slice(0, 500) : 'unknown'}
         where id = ${webhookEventId}
      `.catch(() => undefined);
      throw error;
    }
  }

  private async applyWebhook(
    webhookEventId: string,
    providerCode: string,
    verification: {
      eventType: string | null;
      providerPaymentId: string | null;
      providerIntentId: string | null;
      providerRefundId: string | null;
      reportedAmountPaise: number | null;
    },
  ): Promise<boolean> {
    const provider = this.providers.byCode(providerCode);
    const eventType = verification.eventType ?? '';

    // Refund events settle against the refund record, not the order total.
    if (verification.providerRefundId) {
      await this.applyRefundOutcome(webhookEventId, providerCode, verification.providerRefundId);
      return true;
    }

    if (!verification.providerPaymentId) {
      await this.markWebhook(webhookEventId, 'IGNORED', 'No payment or refund entity');
      return false;
    }

    // Server-side truth. This is the step that makes a forged or replayed payload
    // harmless: whatever it claimed, the amount and status come from the provider.
    const authoritative = await provider.getPayment(verification.providerPaymentId);

    const intent = await this.findIntentForPayment(
      providerCode,
      authoritative.providerIntentId || verification.providerIntentId,
      verification.providerPaymentId,
    );

    if (!intent) {
      await this.markWebhook(webhookEventId, 'IGNORED', 'No matching payment intent');
      return false;
    }

    const expected = Number(intent.amount_paise);
    const amountMatched = authoritative.amountPaise === expected;

    if (!amountMatched) {
      // Never confirm an order for the wrong amount. Flagged for finance to inspect.
      this.logger.error(
        `Amount mismatch on ${providerCode} payment ${authoritative.providerPaymentId}: ` +
        `provider ${authoritative.amountPaise} vs intent ${expected}`,
      );
    }

    await this.db.transaction(this.systemContext(), async (tx) => {
      await tx`
        update payments.payment_webhook_events
           set payment_intent_id = ${intent.id},
               order_id          = ${intent.order_id},
               amount_matched    = ${amountMatched}
         where id = ${webhookEventId}
      `;

      if (authoritative.status === 'CAPTURED' && amountMatched) {
        await this.recordSuccess(tx, intent, authoritative, webhookEventId);
      } else if (authoritative.status === 'FAILED') {
        await this.recordFailure(tx, intent, authoritative, webhookEventId);
      } else if (!amountMatched) {
        await this.markWebhookTx(tx, webhookEventId, 'FAILED', 'Amount mismatch; not applied');
        return;
      } else {
        // AUTHORISED or PENDING: nothing to confirm yet.
        await this.markWebhookTx(tx, webhookEventId, 'PROCESSED', null);
        return;
      }

      await this.markWebhookTx(tx, webhookEventId, 'PROCESSED', null);
    });

    // Only meaningful for the ignore/mismatch branches above.
    return !(eventType === '' && false);
  }

  /**
   * Applies a captured payment: records the attempt and transaction, moves the intent
   * and the order forward, and emits the confirmation event.
   *
   * Written to be safe if it somehow runs twice: the status guards mean a second run
   * changes nothing.
   */
  private async recordSuccess(
    tx: Tx,
    intent: IntentRow,
    payment: VerifiedPayment,
    webhookEventId: string,
    // payment_attempts_capture_verified only accepts WEBHOOK, SERVER_FETCH or
    // RECONCILIATION for a captured attempt. CLIENT_CALLBACK is deliberately excluded by
    // that constraint: a client's word is never sufficient evidence of a capture.
    outcomeSource: 'WEBHOOK' | 'SERVER_FETCH' | 'RECONCILIATION' = 'WEBHOOK',
  ): Promise<void> {
    const [attempt] = await tx<Array<{ id: string }>>`
      insert into payments.payment_attempts (
        payment_intent_id, order_id, attempt_number, provider, provider_payment_id,
        payment_method, instrument_type, card_network, card_last4, card_issuer,
        instrument_token, upi_vpa_masked, bank_code, wallet_provider,
        amount_paise, status, outcome_source, verified_at, completed_at
      )
      select ${intent.id}, ${intent.order_id},
             coalesce(max(attempt_number), 0) + 1, ${intent.provider},
             ${payment.providerPaymentId}, ${intent.payment_method},
             ${payment.instrument?.type ?? null}, ${payment.instrument?.cardNetwork ?? null},
             ${payment.instrument?.cardLast4 ?? null}, ${payment.instrument?.cardIssuer ?? null},
             ${payment.instrument?.token ?? null}, ${payment.instrument?.upiVpaMasked ?? null},
             ${payment.instrument?.bankCode ?? null}, ${payment.instrument?.walletProvider ?? null},
             ${payment.amountPaise}, 'CAPTURED', ${outcomeSource}, now(), now()
        from payments.payment_attempts where payment_intent_id = ${intent.id}
      returning id
    `;

    await tx`
      insert into payments.payment_transactions (
        payment_intent_id, payment_attempt_id, order_id, transaction_type, provider,
        provider_transaction_id, amount_paise, provider_fee_paise, provider_tax_paise,
        status, provider_payload, source_event_id, occurred_at
      ) values (
        ${intent.id}, ${attempt?.id ?? null}, ${intent.order_id}, 'CAPTURE',
        ${intent.provider}, ${payment.providerPaymentId}, ${payment.capturedPaise},
        ${payment.fee?.providerFeePaise ?? 0}, ${payment.fee?.providerTaxPaise ?? 0},
        'SUCCESS', ${tx.json(payment.raw as never)}, ${webhookEventId},
        ${payment.occurredAt.toISOString()}
      )
    `;

    await tx`
      update payments.payment_intents
         set status         = 'CAPTURED',
             captured_paise = ${payment.capturedPaise},
             authorised_at  = coalesce(authorised_at, now()),
             captured_at    = coalesce(captured_at, now())
       where id = ${intent.id}
         and status <> 'CAPTURED'
    `;

    // Advance the order through the state machine one legal step at a time; the
    // database trigger rejects anything else.
    if (intent.order_status === 'PENDING_PAYMENT') {
      await tx`
        update commerce.orders
           set status = 'PAYMENT_CONFIRMED', payment_status = 'PAID',
               amount_paid_paise = ${payment.capturedPaise}
         where id = ${intent.order_id} and status = 'PENDING_PAYMENT'
      `;
      await tx`
        update commerce.orders
           set status = 'CONFIRMED', confirmed_at = now()
         where id = ${intent.order_id} and status = 'PAYMENT_CONFIRMED'
      `;
      await tx`
        update commerce.order_items
           set status = 'CONFIRMED'
         where order_id = ${intent.order_id} and status = 'CREATED'
      `;
    }

    const items = await tx<
      Array<{
        id: string;
        seller_id: string;
        sku_id: string;
        warehouse_id: string | null;
        quantity: number;
        reservation_id: string | null;
      }>
    >`
      select id, seller_id, sku_id, warehouse_id, quantity, reservation_id
        from commerce.order_items where order_id = ${intent.order_id}
    `;

    await this.outbox.emit(tx, 'PAYMENT_SUCCESS', {
      paymentIntentId: intent.id,
      orderId: intent.order_id,
      orderNumber: intent.order_number,
      userId: intent.user_id,
      provider: intent.provider,
      providerPaymentId: payment.providerPaymentId,
      amountPaise: Number(intent.amount_paise),
      capturedPaise: payment.capturedPaise,
      paymentMethod: intent.payment_method,
      failureCode: null,
      failureReason: null,
    });

    await this.outbox.emit(tx, 'ORDER_CONFIRMED', {
      orderId: intent.order_id,
      orderNumber: intent.order_number,
      userId: intent.user_id,
      paymentIntentId: intent.id,
      totalPayablePaise: Number(intent.amount_paise),
      items: items.map((i) => ({
        orderItemId: i.id,
        sellerId: i.seller_id,
        skuId: i.sku_id,
        warehouseId: i.warehouse_id,
        quantity: i.quantity,
        reservationId: i.reservation_id,
      })),
    });
  }

  /**
   * Applies a failed payment. The reservation is released so the stock goes back on
   * sale immediately instead of waiting for the sweeper — on a flash sale that delay
   * is lost revenue.
   */
  private async recordFailure(
    tx: Tx,
    intent: IntentRow,
    payment: VerifiedPayment,
    webhookEventId: string,
    outcomeSource: 'WEBHOOK' | 'SERVER_FETCH' | 'RECONCILIATION' | 'CLIENT_CALLBACK' = 'WEBHOOK',
  ): Promise<void> {
    const [attempt] = await tx<Array<{ id: string }>>`
      insert into payments.payment_attempts (
        payment_intent_id, order_id, attempt_number, provider, provider_payment_id,
        payment_method, amount_paise, status, provider_error_code,
        provider_error_description, is_retryable, outcome_source, verified_at, completed_at
      )
      select ${intent.id}, ${intent.order_id}, coalesce(max(attempt_number), 0) + 1,
             ${intent.provider}, ${payment.providerPaymentId}, ${intent.payment_method},
             ${payment.amountPaise}, 'FAILED', ${payment.failureCode},
             ${payment.failureReason}, ${payment.isRetryable}, ${outcomeSource}, now(), now()
        from payments.payment_attempts where payment_intent_id = ${intent.id}
      returning id
    `;

    await tx`
      insert into payments.payment_transactions (
        payment_intent_id, payment_attempt_id, order_id, transaction_type, provider,
        provider_transaction_id, amount_paise, status, provider_payload, source_event_id,
        occurred_at
      ) values (
        ${intent.id}, ${attempt?.id ?? null}, ${intent.order_id}, 'CAPTURE',
        ${intent.provider}, ${payment.providerPaymentId}, ${payment.amountPaise},
        'FAILED', ${tx.json(payment.raw as never)}, ${webhookEventId},
        ${payment.occurredAt.toISOString()}
      )
    `;

    await tx`
      update payments.payment_intents
         set status        = 'FAILED',
             failure_code  = ${payment.failureCode},
             failure_reason = ${payment.failureReason},
             failed_at     = now()
       where id = ${intent.id} and status not in ('CAPTURED', 'FAILED')
    `;

    // A retryable failure keeps the order payable so the customer can try another
    // instrument; the reservation is held for the remainder of its TTL.
    if (payment.isRetryable !== true) {
      await tx`
        update commerce.orders
           set status = 'PAYMENT_FAILED', payment_status = 'FAILED'
         where id = ${intent.order_id} and status = 'PENDING_PAYMENT'
      `;

      await tx`
        select inventory.release_reservation(r.id, 'PAYMENT_FAILED')
          from inventory.inventory_reservations r
         where r.order_id = ${intent.order_id} and r.status in ('ACTIVE', 'CONFIRMED')
      `;
    }

    await this.outbox.emit(tx, 'PAYMENT_FAILED', {
      paymentIntentId: intent.id,
      orderId: intent.order_id,
      orderNumber: intent.order_number,
      userId: intent.user_id,
      provider: intent.provider,
      providerPaymentId: payment.providerPaymentId,
      amountPaise: Number(intent.amount_paise),
      capturedPaise: 0,
      paymentMethod: intent.payment_method,
      failureCode: payment.failureCode,
      failureReason: payment.failureReason,
    });
  }

  private async applyRefundOutcome(
    webhookEventId: string,
    providerCode: string,
    providerRefundId: string,
  ): Promise<void> {
    const provider = this.providers.byCode(providerCode);
    const authoritative = await provider.getRefund(providerRefundId);

    const [attempt] = await this.db.critical<
      Array<{ id: string; refund_id: string }>
    >`
      select id, refund_id from payments.refund_attempts
       where provider_refund_id = ${providerRefundId}
       order by attempt_number desc limit 1
    `;

    if (!attempt) {
      await this.markWebhook(webhookEventId, 'IGNORED', 'No matching refund attempt');
      return;
    }

    await this.db.transaction(this.systemContext(), async (tx) => {
      await tx`
        update payments.refund_attempts
           set status = ${authoritative.status},
               provider_error_code = ${authoritative.failureCode},
               provider_error_description = ${authoritative.failureReason},
               outcome_source = 'WEBHOOK',
               completed_at = now()
         where id = ${attempt.id}
      `;

      const [refund] = await tx<
        Array<{
          id: string;
          refund_reference: string;
          order_id: string;
          order_item_id: string | null;
          user_id: string;
          amount_paise: string;
          refund_type: string;
        }>
      >`
        update payments.refunds
           set status = ${authoritative.status === 'SUCCESS' ? 'COMPLETED' : authoritative.status},
               completed_at = ${authoritative.status === 'SUCCESS' ? 'now()' : null},
               failed_at = ${authoritative.status === 'FAILED' ? 'now()' : null},
               failure_code = ${authoritative.failureCode},
               failure_reason = ${authoritative.failureReason}
         where id = ${attempt.refund_id}
        returning id, refund_reference, order_id, order_item_id, user_id,
                  amount_paise::text as amount_paise, refund_type
      `;

      if (refund && authoritative.status === 'SUCCESS') {
        await tx`
          update payments.payment_intents
             set refunded_paise = refunded_paise + ${authoritative.amountPaise}
           where id = (select payment_intent_id from payments.refunds where id = ${refund.id})
        `;
        await tx`
          update commerce.orders
             set amount_refunded_paise = amount_refunded_paise + ${authoritative.amountPaise}
           where id = ${refund.order_id}
        `;
      }

      if (refund) {
        await this.outbox.emit(
          tx,
          authoritative.status === 'SUCCESS' ? 'REFUND_SUCCESS' : 'REFUND_FAILED',
          {
            refundId: refund.id,
            refundReference: refund.refund_reference,
            orderId: refund.order_id,
            orderItemId: refund.order_item_id,
            userId: refund.user_id,
            amountPaise: Number(refund.amount_paise),
            refundType: refund.refund_type,
            status: authoritative.status,
            failureCode: authoritative.failureCode,
          },
        );
      }

      await this.markWebhookTx(tx, webhookEventId, 'PROCESSED', null);
    });
  }

  /**
   * Called when the client reports a completed payment. Does not trust the report: it
   * fetches the payment from the provider and applies the same logic the webhook would.
   *
   * This exists because the webhook may arrive after the customer is already looking at
   * the confirmation screen, and either ordering must produce the same result
   * (brief §67).
   */
  async verifyFromClient(input: {
    paymentIntentId: string;
    providerPaymentId: string;
  }): Promise<PaymentStatusDto> {
    const principal = RequestContext.requirePrincipal();
    const intent = await this.loadIntent(input.paymentIntentId, principal.userId);
    const provider = this.providers.byCode(intent.provider);

    const authoritative = await provider.getPayment(input.providerPaymentId);

    if (authoritative.providerIntentId && intent.provider_intent_id) {
      // The payment must belong to THIS order. Without this check a customer could
      // present someone else's successful payment id to confirm their own order.
      if (authoritative.providerIntentId !== intent.provider_intent_id) {
        throw new AppError('PAYMENT_VERIFICATION_FAILED', 'Payment does not belong to this order');
      }
    }

    if (authoritative.amountPaise !== Number(intent.amount_paise)) {
      throw new AppError('PAYMENT_VERIFICATION_FAILED', 'Payment amount does not match the order');
    }

    // Record via a synthetic webhook event so the audit trail shows the client-verified
    // path, and so a later real webhook for the same payment is deduplicated.
    const syntheticEventId = `client-verify:${authoritative.providerPaymentId}`;

    const claimed = await this.db.critical<Array<{ id: string }>>`
      insert into payments.payment_webhook_events (
        provider, provider_event_id, event_type, provider_payment_id, provider_order_id,
        signature_verified, raw_payload, reported_amount_paise, processing_status,
        payment_intent_id, order_id, amount_matched
      ) values (
        ${intent.provider}, ${syntheticEventId}, 'client.verify',
        ${authoritative.providerPaymentId}, ${intent.provider_intent_id},
        true, ${this.db.critical.json(authoritative.raw as never)},
        ${authoritative.amountPaise}, 'RECEIVED', ${intent.id}, ${intent.order_id}, true
      )
      on conflict (provider, provider_event_id) do nothing
      returning id
    `;

    if (claimed.length > 0) {
      const webhookEventId = claimed[0]!.id;
      await this.db.transaction(this.systemContext(), async (tx) => {
        // SERVER_FETCH, not CLIENT_CALLBACK: the client only prompted us: the status
        // recorded here came from the provider's API a moment ago.
        if (authoritative.status === 'CAPTURED') {
          await this.recordSuccess(tx, intent, authoritative, webhookEventId, 'SERVER_FETCH');
        } else if (authoritative.status === 'FAILED') {
          await this.recordFailure(tx, intent, authoritative, webhookEventId, 'SERVER_FETCH');
        }
        await this.markWebhookTx(tx, webhookEventId, 'PROCESSED', null);
      });
    }

    return this.status(input.paymentIntentId);
  }

  async status(paymentIntentId: string): Promise<PaymentStatusDto> {
    const principal = RequestContext.requirePrincipal();
    const intent = await this.loadIntent(paymentIntentId, principal.userId);

    return {
      paymentIntentId: intent.id,
      orderId: intent.order_id,
      orderNumber: intent.order_number,
      status: intent.status,
      paymentStatus: intent.payment_status,
      orderStatus: intent.order_status as OrderStatus,
      amount: money(Number(intent.amount_paise)),
      capturedAmount: money(Number(intent.captured_paise)),
      failureCode: intent.failure_code,
      failureReason: intent.failure_reason,
      // True only when a server-side source confirmed it, never from a client claim.
      verified: intent.status === 'CAPTURED' || intent.status === 'FAILED',
    };
  }

  // -------------------------------------------------------------------------
  // Loaders
  // -------------------------------------------------------------------------

  private async loadIntent(paymentIntentId: string, userId: string): Promise<IntentRow> {
    const [row] = await this.db.sql<IntentRow[]>`
      select pi.id, pi.order_id, pi.user_id, pi.provider, pi.provider_intent_id,
             pi.amount_paise::text as amount_paise,
             pi.captured_paise::text as captured_paise,
             pi.refunded_paise::text as refunded_paise,
             pi.payment_method, pi.status, pi.failure_code, pi.failure_reason,
             pi.client_session, pi.expires_at,
             o.order_number, o.status as order_status, o.payment_status
        from payments.payment_intents pi
        join commerce.orders o on o.id = pi.order_id
       where pi.id = ${paymentIntentId} and pi.user_id = ${userId}
    `;
    if (!row) throw AppError.notFound('Payment');
    return row;
  }

  private async loadIntentByOrder(orderId: string, userId: string): Promise<IntentRow> {
    const [row] = await this.db.sql<IntentRow[]>`
      select pi.id, pi.order_id, pi.user_id, pi.provider, pi.provider_intent_id,
             pi.amount_paise::text as amount_paise,
             pi.captured_paise::text as captured_paise,
             pi.refunded_paise::text as refunded_paise,
             pi.payment_method, pi.status, pi.failure_code, pi.failure_reason,
             pi.client_session, pi.expires_at,
             o.order_number, o.status as order_status, o.payment_status
        from payments.payment_intents pi
        join commerce.orders o on o.id = pi.order_id
       where pi.order_id = ${orderId} and pi.user_id = ${userId}
       order by pi.created_at desc
       limit 1
    `;
    if (!row) throw AppError.notFound('Payment');
    return row;
  }

  /**
   * Finds the intent a payment belongs to. Matches on the provider order id first,
   * because that is the value we generated and stored; the payment id is a fallback for
   * providers that only echo it.
   */
  private async findIntentForPayment(
    providerCode: string,
    providerIntentId: string | null,
    providerPaymentId: string,
  ): Promise<IntentRow | null> {
    if (providerIntentId) {
      const [row] = await this.db.critical<IntentRow[]>`
        select pi.id, pi.order_id, pi.user_id, pi.provider, pi.provider_intent_id,
               pi.amount_paise::text as amount_paise,
               pi.captured_paise::text as captured_paise,
               pi.refunded_paise::text as refunded_paise,
               pi.payment_method, pi.status, pi.failure_code, pi.failure_reason,
               pi.client_session, pi.expires_at,
               o.order_number, o.status as order_status, o.payment_status
          from payments.payment_intents pi
          join commerce.orders o on o.id = pi.order_id
         where pi.provider = ${providerCode} and pi.provider_intent_id = ${providerIntentId}
      `;
      if (row) return row;
    }

    const [viaAttempt] = await this.db.critical<IntentRow[]>`
      select pi.id, pi.order_id, pi.user_id, pi.provider, pi.provider_intent_id,
             pi.amount_paise::text as amount_paise,
             pi.captured_paise::text as captured_paise,
             pi.refunded_paise::text as refunded_paise,
             pi.payment_method, pi.status, pi.failure_code, pi.failure_reason,
             pi.client_session, pi.expires_at,
             o.order_number, o.status as order_status, o.payment_status
        from payments.payment_attempts pa
        join payments.payment_intents pi on pi.id = pa.payment_intent_id
        join commerce.orders o on o.id = pi.order_id
       where pa.provider = ${providerCode} and pa.provider_payment_id = ${providerPaymentId}
       order by pa.attempt_number desc
       limit 1
    `;

    return viaAttempt ?? null;
  }

  private async markWebhook(
    webhookEventId: string,
    status: string,
    error: string | null,
  ): Promise<void> {
    await this.db.critical`
      update payments.payment_webhook_events
         set processing_status = ${status},
             processing_error  = ${error},
             processed_at      = now(),
             processing_attempts = processing_attempts + 1
       where id = ${webhookEventId}
    `;
  }

  private async markWebhookTx(
    tx: Tx,
    webhookEventId: string,
    status: string,
    error: string | null,
  ): Promise<void> {
    await tx`
      update payments.payment_webhook_events
         set processing_status = ${status},
             processing_error  = ${error},
             processed_at      = now(),
             processing_attempts = processing_attempts + 1
       where id = ${webhookEventId}
    `;
  }

  private toSessionDto(
    intent: IntentRow,
    clientSession: Record<string, unknown>,
    expiresAt?: Date | null,
  ): PaymentSessionDto {
    return {
      paymentIntentId: intent.id,
      orderId: intent.order_id,
      orderNumber: intent.order_number,
      provider: intent.provider,
      amount: money(Number(intent.amount_paise)),
      paymentMethod: intent.payment_method as PaymentMethod,
      providerSession: clientSession,
      expiresAt: (expiresAt ?? (intent.expires_at ? new Date(intent.expires_at) : null))?.toISOString() ?? null,
      requiresProviderFlow: true,
    };
  }
}
