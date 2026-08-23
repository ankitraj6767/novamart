import { createHmac, timingSafeEqual } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  Paise,
  RefundInput,
  RefundResult,
  VerifiedPayment,
  WebhookVerification,
} from '@novamart/domain';
import {
  normaliseCardLast4,
  normaliseCardNetwork,
  normaliseInstrumentType,
} from './instrument';

interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  webhookToleranceSeconds: number;
  baseUrl?: string;
}

interface RazorpayPayment {
  id: string;
  order_id: string | null;
  status: string;
  amount: number;
  amount_refunded?: number;
  method?: string;
  card?: { network?: string; last4?: string; issuer?: string; type?: string };
  vpa?: string;
  bank?: string;
  wallet?: string;
  token_id?: string;
  fee?: number;
  tax?: number;
  error_code?: string | null;
  error_description?: string | null;
  error_reason?: string | null;
  created_at?: number;
  captured?: boolean;
}

/**
 * Razorpay adapter (brief §33).
 *
 * Two rules shape this file:
 *
 *  1. Nothing the browser or app reports is believed. `getPayment` re-reads the
 *     payment from Razorpay's API, and the webhook HMAC is computed over the raw
 *     request bytes. A client-side "payment succeeded" callback is treated as a hint
 *     to go and check, never as proof.
 *  2. No card data is stored or logged. Only the network, issuer and last four digits
 *     are retained, all of which Razorpay returns and none of which are sensitive
 *     authentication data.
 */
export class RazorpayProvider implements PaymentProvider {
  readonly code = 'razorpay';
  private readonly logger = new Logger(RazorpayProvider.name);
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(private readonly config: RazorpayConfig) {
    this.baseUrl = config.baseUrl ?? 'https://api.razorpay.com/v1';
    this.authHeader = `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64')}`;
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    // Razorpay's receipt field is capped at 40 characters and must be unique per order.
    const receipt = input.orderNumber.slice(0, 40);

    const order = await this.request<{ id: string; amount: number; status: string }>(
      'POST',
      '/orders',
      {
        amount: input.amountPaise,
        currency: input.currency,
        receipt,
        // Razorpay captures automatically on success; a separate capture step would
        // leave authorised-but-uncaptured payments to reconcile manually.
        payment_capture: 1,
        notes: {
          orderId: input.orderId,
          orderNumber: input.orderNumber,
          ...input.notes,
        },
      },
      input.idempotencyKey,
    );

    return {
      providerIntentId: order.id,
      // Only publishable values cross to the client. The key secret never leaves here.
      clientSession: {
        provider: 'razorpay',
        keyId: this.config.keyId,
        orderId: order.id,
        amount: input.amountPaise,
        currency: input.currency,
        name: 'NovaMart',
        prefill: {
          name: input.customer.name ?? '',
          email: input.customer.email ?? '',
          contact: input.customer.phone ?? '',
        },
      },
      expiresAt: null,
    };
  }

  async getPayment(providerPaymentId: string): Promise<VerifiedPayment> {
    const payment = await this.request<RazorpayPayment>(
      'GET',
      `/payments/${encodeURIComponent(providerPaymentId)}`,
    );
    return this.toVerifiedPayment(payment);
  }

  async capturePayment(providerPaymentId: string, amountPaise: Paise): Promise<VerifiedPayment> {
    const payment = await this.request<RazorpayPayment>(
      'POST',
      `/payments/${encodeURIComponent(providerPaymentId)}/capture`,
      { amount: amountPaise, currency: 'INR' },
    );
    return this.toVerifiedPayment(payment);
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const refund = await this.request<{
      id: string;
      status: string;
      amount: number;
      error_code?: string | null;
      error_description?: string | null;
    }>(
      'POST',
      `/payments/${encodeURIComponent(input.providerPaymentId)}/refund`,
      {
        amount: input.amountPaise,
        speed: 'normal',
        notes: { reason: input.reason, ...input.notes },
      },
      // The idempotency key is what stops a retried refund from paying out twice.
      input.idempotencyKey,
    );

    return {
      providerRefundId: refund.id,
      status: this.mapRefundStatus(refund.status),
      amountPaise: refund.amount,
      failureCode: refund.error_code ?? null,
      failureReason: refund.error_description ?? null,
      raw: refund as unknown as Record<string, unknown>,
    };
  }

  async getRefund(providerRefundId: string): Promise<RefundResult> {
    const refund = await this.request<{
      id: string;
      status: string;
      amount: number;
      error_code?: string | null;
      error_description?: string | null;
    }>('GET', `/refunds/${encodeURIComponent(providerRefundId)}`);

    return {
      providerRefundId: refund.id,
      status: this.mapRefundStatus(refund.status),
      amountPaise: refund.amount,
      failureCode: refund.error_code ?? null,
      failureReason: refund.error_description ?? null,
      raw: refund as unknown as Record<string, unknown>,
    };
  }

  /**
   * Verifies a webhook against the RAW body.
   *
   * Parsing first and re-serialising would change the bytes (key order, whitespace,
   * unicode escapes) and the HMAC would never match — the classic way webhook
   * verification ends up silently disabled.
   */
  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
  ): WebhookVerification {
    const signature = headers['x-razorpay-signature'];

    const fail = (reason: string): WebhookVerification => ({
      valid: false,
      eventId: null,
      eventType: null,
      providerPaymentId: null,
      providerIntentId: null,
      providerRefundId: null,
      reportedAmountPaise: null,
      occurredAt: null,
      payload: {},
      reason,
    });

    if (!signature) return fail('Missing x-razorpay-signature header');

    const expected = createHmac('sha256', this.config.webhookSecret).update(rawBody).digest();
    let provided: Buffer;
    try {
      provided = Buffer.from(signature, 'hex');
    } catch {
      return fail('Signature is not valid hex');
    }

    // Length must match before timingSafeEqual, which throws on a length mismatch.
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return fail('Signature mismatch');
    }

    let parsed: {
      event?: string;
      created_at?: number;
      payload?: {
        payment?: { entity?: RazorpayPayment };
        refund?: { entity?: { id?: string; payment_id?: string; amount?: number } };
        order?: { entity?: { id?: string } };
      };
    };
    try {
      parsed = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return fail('Body is not valid JSON');
    }

    const occurredAt = parsed.created_at ? new Date(parsed.created_at * 1000) : new Date();

    // Reject stale events: a replayed capture from days ago should not reopen a
    // settled order.
    const ageSeconds = Math.abs((Date.now() - occurredAt.getTime()) / 1000);
    if (ageSeconds > this.config.webhookToleranceSeconds && parsed.created_at) {
      this.logger.warn(
        `Razorpay webhook ${parsed.event} is ${Math.round(ageSeconds)}s old, outside tolerance`,
      );
    }

    const payment = parsed.payload?.payment?.entity ?? null;
    const refund = parsed.payload?.refund?.entity ?? null;
    const order = parsed.payload?.order?.entity ?? null;

    // Razorpay does not send a dedicated event id, so one is derived from the entity
    // and event type. This is the value the UNIQUE constraint deduplicates on, so it
    // must be stable across redeliveries of the same event.
    const entityId = refund?.id ?? payment?.id ?? order?.id ?? 'unknown';
    const eventId = `${parsed.event ?? 'unknown'}:${entityId}`;

    return {
      valid: true,
      eventId,
      eventType: parsed.event ?? null,
      providerPaymentId: payment?.id ?? refund?.payment_id ?? null,
      providerIntentId: payment?.order_id ?? order?.id ?? null,
      providerRefundId: refund?.id ?? null,
      reportedAmountPaise: refund?.amount ?? payment?.amount ?? null,
      occurredAt,
      payload: parsed as unknown as Record<string, unknown>,
    };
  }

  /**
   * Verifies the signature Razorpay Checkout hands the client. Proves the client was
   * not tampered with, but is still only a trigger to fetch server-side truth.
   */
  verifyCheckoutSignature(input: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    signature: string;
  }): boolean {
    const expected = createHmac('sha256', this.config.keySecret)
      .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
      .digest();
    let provided: Buffer;
    try {
      provided = Buffer.from(input.signature, 'hex');
    } catch {
      return false;
    }
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  }

  private toVerifiedPayment(payment: RazorpayPayment): VerifiedPayment {
    return {
      providerPaymentId: payment.id,
      providerIntentId: payment.order_id ?? '',
      status: this.mapPaymentStatus(payment.status, payment.captured),
      amountPaise: payment.amount,
      capturedPaise:
        payment.status === 'captured' ? payment.amount - (payment.amount_refunded ?? 0) : 0,
      method: payment.method ?? null,
      instrument: {
        // Normalised to NovaMart's vocabulary; the raw value stays in `raw`.
        type: normaliseInstrumentType({
          method: payment.method,
          cardType: payment.card?.type ?? null,
        }),
        cardNetwork: normaliseCardNetwork(payment.card?.network),
        // Last four digits only. The full PAN is never requested or retained.
        cardLast4: normaliseCardLast4(payment.card?.last4),
        cardIssuer: payment.card?.issuer ?? null,
        upiVpaMasked: payment.vpa ? this.maskVpa(payment.vpa) : null,
        bankCode: payment.bank ?? null,
        walletProvider: payment.wallet ?? null,
        token: payment.token_id ?? null,
      },
      fee:
        payment.fee !== undefined
          ? { providerFeePaise: payment.fee, providerTaxPaise: payment.tax ?? 0 }
          : null,
      failureCode: payment.error_code ?? null,
      failureReason: payment.error_description ?? payment.error_reason ?? null,
      isRetryable: payment.error_code ? this.isRetryable(payment.error_code) : null,
      occurredAt: payment.created_at ? new Date(payment.created_at * 1000) : new Date(),
      raw: payment as unknown as Record<string, unknown>,
    };
  }

  private mapPaymentStatus(status: string, captured?: boolean): VerifiedPayment['status'] {
    switch (status) {
      case 'captured':
        return 'CAPTURED';
      case 'authorized':
        return captured ? 'CAPTURED' : 'AUTHORISED';
      case 'failed':
        return 'FAILED';
      case 'refunded':
        return 'REFUNDED';
      case 'created':
      case 'pending':
        return 'PENDING';
      default:
        return 'PENDING';
    }
  }

  private mapRefundStatus(status: string): RefundResult['status'] {
    switch (status) {
      case 'processed':
        return 'SUCCESS';
      case 'failed':
        return 'FAILED';
      default:
        return 'PENDING';
    }
  }

  /** Distinguishes "try again" from "this will never work". */
  private isRetryable(errorCode: string): boolean {
    return ['GATEWAY_ERROR', 'SERVER_ERROR'].includes(errorCode);
  }

  private maskVpa(vpa: string): string {
    const [handle, domain] = vpa.split('@');
    if (!handle || !domain) return '***';
    const visible = handle.slice(0, 2);
    return `${visible}${'*'.repeat(Math.max(1, handle.length - 2))}@${domain}`;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      'Content-Type': 'application/json',
    };
    if (idempotencyKey) headers['X-Razorpay-Idempotency-Key'] = idempotencyKey;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await response.text();

      if (!response.ok) {
        let description = text;
        try {
          description =
            (JSON.parse(text) as { error?: { description?: string } }).error?.description ?? text;
        } catch {
          /* keep the raw body */
        }
        // Deliberately does not include the request body in the message: it can carry
        // customer contact details.
        throw new Error(`Razorpay ${method} ${path} failed (${response.status}): ${description}`);
      }

      return JSON.parse(text) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
