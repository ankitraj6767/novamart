import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { loadServerEnv } from '@novamart/config';
import type { PaymentProvider } from '@novamart/domain';
import { MockPaymentProvider } from './mock.provider';
import { RazorpayProvider } from './razorpay.provider';

/**
 * Resolves the active payment provider (ADR: provider behind a port).
 *
 * Selection comes from configuration, not from a request parameter — a client must
 * never be able to choose which gateway processes its payment, or which one verifies a
 * webhook.
 *
 * Providers are held by code as well as "active", because a webhook for a payment taken
 * before a provider switch must still be verifiable by the provider that signed it.
 */
@Injectable()
export class PaymentProviderRegistry implements OnModuleInit {
  private readonly logger = new Logger(PaymentProviderRegistry.name);
  private readonly env = loadServerEnv();
  private readonly providers = new Map<string, PaymentProvider>();
  private activeCode = 'mock';

  onModuleInit(): void {
    // The mock is always registered so historical mock payments in a development
    // database stay verifiable, but it is only ACTIVE when configured.
    const mock = new MockPaymentProvider(this.env.RAZORPAY_WEBHOOK_SECRET ?? 'mock-webhook-secret');
    this.providers.set(mock.code, mock);

    if (
      this.env.PAYMENT_PROVIDER === 'razorpay' &&
      this.env.RAZORPAY_KEY_ID &&
      this.env.RAZORPAY_KEY_SECRET &&
      this.env.RAZORPAY_WEBHOOK_SECRET
    ) {
      const razorpay = new RazorpayProvider({
        keyId: this.env.RAZORPAY_KEY_ID,
        keySecret: this.env.RAZORPAY_KEY_SECRET,
        webhookSecret: this.env.RAZORPAY_WEBHOOK_SECRET,
        webhookToleranceSeconds: this.env.PAYMENT_WEBHOOK_TOLERANCE_SECONDS,
      });
      this.providers.set(razorpay.code, razorpay);
      this.activeCode = razorpay.code;
    } else {
      this.activeCode = 'mock';
      if (this.env.PAYMENT_PROVIDER === 'razorpay') {
        // Reaching here means credentials are missing; loadServerEnv already refuses
        // this in production, so it can only happen in a lower environment.
        this.logger.warn(
          'PAYMENT_PROVIDER=razorpay but credentials are incomplete; falling back to the mock provider',
        );
      }
    }

    this.logger.log(
      `Payment providers ready (active=${this.activeCode}, registered=${[...this.providers.keys()].join(', ')})`,
    );
  }

  /** The provider new payments are created with. */
  active(): PaymentProvider {
    const provider = this.providers.get(this.activeCode);
    if (!provider) throw new Error(`Active payment provider ${this.activeCode} is not registered`);
    return provider;
  }

  activeCodeName(): string {
    return this.activeCode;
  }

  /**
   * Looks up by code, for webhooks and for refunding an older payment.
   *
   * Case-insensitive on purpose: adapters use lowercase codes (and so do the webhook
   * URLs), while payments.payment_intents stores the provider uppercased to satisfy
   * payment_intents_provider_check. Both spellings must resolve to the same adapter.
   */
  byCode(code: string): PaymentProvider {
    const provider = this.providers.get(code.toLowerCase());
    if (!provider) throw new Error(`Payment provider ${code} is not registered`);
    return provider;
  }

  /**
   * The provider value as stored in payments.payment_intents, which constrains it to
   * RAZORPAY | CASHFREE | COD | MOCK.
   */
  activeDbCode(): string {
    return this.activeCode.toUpperCase();
  }

  /** Normalises any adapter code to the database's spelling. */
  static toDbCode(code: string): string {
    return code.toUpperCase();
  }

  /** Exposes the mock for tests and the local payment simulator endpoints. */
  mock(): MockPaymentProvider | null {
    const provider = this.providers.get('mock');
    return provider instanceof MockPaymentProvider ? provider : null;
  }
}
