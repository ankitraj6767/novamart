import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
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

/**
 * In-process payment provider for local development and automated tests.
 *
 * It is a real implementation of the port, not a stub that always succeeds: it signs
 * its webhooks with the same HMAC scheme as Razorpay, and it can be told to fail,
 * time out or return a mismatched amount. Tests for the failure paths in brief §67 need
 * a provider that misbehaves on demand.
 *
 * loadServerEnv() refuses PAYMENT_PROVIDER=mock when APP_ENV=production, so this cannot
 * reach real customers.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly code = 'mock';

  private readonly payments = new Map<string, VerifiedPayment>();
  private readonly refunds = new Map<string, RefundResult>();
  private readonly intents = new Map<string, { orderId: string; amountPaise: number }>();

  constructor(private readonly webhookSecret: string = 'mock-webhook-secret') { }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const providerIntentId = `mock_order_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    this.intents.set(providerIntentId, {
      orderId: input.orderId,
      amountPaise: input.amountPaise,
    });

    return {
      providerIntentId,
      clientSession: {
        provider: 'mock',
        orderId: providerIntentId,
        amount: input.amountPaise,
        currency: input.currency,
        // The local UI shows these so a developer can drive either outcome.
        testActions: {
          succeed: `/api/v1/payments/mock/${providerIntentId}/succeed`,
          fail: `/api/v1/payments/mock/${providerIntentId}/fail`,
        },
      },
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    };
  }

  async getPayment(providerPaymentId: string): Promise<VerifiedPayment> {
    const payment = this.payments.get(providerPaymentId);
    if (!payment) throw new Error(`Mock payment ${providerPaymentId} not found`);
    return payment;
  }

  async capturePayment(providerPaymentId: string, amountPaise: Paise): Promise<VerifiedPayment> {
    const payment = await this.getPayment(providerPaymentId);
    const captured: VerifiedPayment = {
      ...payment,
      status: 'CAPTURED',
      capturedPaise: amountPaise,
    };
    this.payments.set(providerPaymentId, captured);
    return captured;
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const existing = this.refunds.get(input.idempotencyKey);
    // Same idempotency key returns the same refund, mirroring the real provider.
    if (existing) return existing;

    const result: RefundResult = {
      providerRefundId: `mock_rfnd_${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      status: 'SUCCESS',
      amountPaise: input.amountPaise,
      failureCode: null,
      failureReason: null,
      raw: { mock: true, reason: input.reason },
    };
    this.refunds.set(input.idempotencyKey, result);
    return result;
  }

  async getRefund(providerRefundId: string): Promise<RefundResult> {
    for (const refund of this.refunds.values()) {
      if (refund.providerRefundId === providerRefundId) return refund;
    }
    throw new Error(`Mock refund ${providerRefundId} not found`);
  }

  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
  ): WebhookVerification {
    const signature = headers['x-mock-signature'] ?? headers['x-razorpay-signature'];

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

    if (!signature) return fail('Missing signature header');

    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest();
    let provided: Buffer;
    try {
      provided = Buffer.from(signature, 'hex');
    } catch {
      return fail('Signature is not valid hex');
    }
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return fail('Signature mismatch');
    }

    const parsed = JSON.parse(rawBody.toString('utf8')) as {
      event: string;
      eventId?: string;
      payment?: { id: string; orderId: string; amountPaise: number };
      refund?: { id: string; paymentId: string; amountPaise: number };
    };

    return {
      valid: true,
      eventId: parsed.eventId ?? `${parsed.event}:${parsed.payment?.id ?? parsed.refund?.id}`,
      eventType: parsed.event,
      providerPaymentId: parsed.payment?.id ?? parsed.refund?.paymentId ?? null,
      providerIntentId: parsed.payment?.orderId ?? null,
      providerRefundId: parsed.refund?.id ?? null,
      reportedAmountPaise: parsed.payment?.amountPaise ?? parsed.refund?.amountPaise ?? null,
      occurredAt: new Date(),
      payload: parsed as unknown as Record<string, unknown>,
    };
  }

  // -------------------------------------------------------------------------
  // Test controls
  // -------------------------------------------------------------------------

  /** Drives a success outcome, as if the customer completed the flow. */
  simulateSuccess(providerIntentId: string, options: { amountPaise?: number } = {}): VerifiedPayment {
    const intent = this.intents.get(providerIntentId);
    if (!intent) throw new Error(`Mock intent ${providerIntentId} not found`);

    const paymentId = `mock_pay_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const amount = options.amountPaise ?? intent.amountPaise;

    const payment: VerifiedPayment = {
      providerPaymentId: paymentId,
      providerIntentId,
      status: 'CAPTURED',
      amountPaise: amount,
      capturedPaise: amount,
      method: 'upi',
      instrument: {
        // Canonical value, as a real adapter would emit after normalisation.
        type: 'UPI_INTENT',
        cardNetwork: null,
        cardLast4: null,
        cardIssuer: null,
        upiVpaMasked: 'te**@mockbank',
        bankCode: null,
        walletProvider: null,
        token: null,
      },
      fee: { providerFeePaise: Math.round(amount * 0.02), providerTaxPaise: 0 },
      failureCode: null,
      failureReason: null,
      isRetryable: null,
      occurredAt: new Date(),
      raw: { mock: true },
    };

    this.payments.set(paymentId, payment);
    return payment;
  }

  simulateFailure(providerIntentId: string, code = 'BAD_REQUEST_ERROR'): VerifiedPayment {
    const intent = this.intents.get(providerIntentId);
    if (!intent) throw new Error(`Mock intent ${providerIntentId} not found`);

    const paymentId = `mock_pay_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const payment: VerifiedPayment = {
      providerPaymentId: paymentId,
      providerIntentId,
      status: 'FAILED',
      amountPaise: intent.amountPaise,
      capturedPaise: 0,
      method: 'card',
      instrument: null,
      fee: null,
      failureCode: code,
      failureReason: 'Simulated failure',
      isRetryable: code === 'GATEWAY_ERROR',
      occurredAt: new Date(),
      raw: { mock: true },
    };

    this.payments.set(paymentId, payment);
    return payment;
  }

  /** Signs a webhook body the way the provider would, for webhook tests. */
  signWebhook(body: unknown): { rawBody: Buffer; signature: string } {
    const rawBody = Buffer.from(JSON.stringify(body), 'utf8');
    const signature = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    return { rawBody, signature };
  }
}
