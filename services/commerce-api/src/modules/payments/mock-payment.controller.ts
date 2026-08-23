import { Controller, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { loadServerEnv } from '@novamart/config';
import { Public } from '../../common/decorators';
import { AppError } from '../../common/errors/app-error';
import { PaymentProviderRegistry } from '../../infrastructure/providers/payment/payment-provider.registry';
import { PaymentsService } from './payments.service';

/**
 * Local payment simulator.
 *
 * Stands in for the customer completing or abandoning a payment sheet so the full
 * webhook path — HMAC verification, unique-event claim, provider re-read, order
 * transition — can be exercised without a real gateway. It does NOT shortcut that path:
 * it signs a webhook body and feeds it through the same handler a real provider hits.
 *
 * Registered only outside production, and every route additionally refuses to run if
 * the active provider is not the mock. Two independent guards, because an endpoint that
 * can confirm a payment must not be one config mistake away from being reachable.
 */
@Controller({ path: 'payments/mock', version: '1' })
export class MockPaymentController {
  private readonly env = loadServerEnv();

  constructor(
    private readonly providers: PaymentProviderRegistry,
    private readonly payments: PaymentsService,
  ) {}

  @Public()
  @Post(':providerIntentId/succeed')
  async succeed(
    @Param('providerIntentId') providerIntentId: string,
    @Query('amountPaise') amountPaise?: string,
  ) {
    const mock = this.assertAvailable();

    const payment = mock.simulateSuccess(providerIntentId, {
      // Allows a deliberate amount mismatch, to prove the guard rejects it.
      ...(amountPaise ? { amountPaise: Number(amountPaise) } : {}),
    });

    const signed = mock.signWebhook({
      event: 'payment.captured',
      eventId: `payment.captured:${payment.providerPaymentId}`,
      payment: {
        id: payment.providerPaymentId,
        orderId: providerIntentId,
        amountPaise: payment.amountPaise,
      },
    });

    const result = await this.payments.handleWebhook('mock', signed.rawBody, {
      'x-mock-signature': signed.signature,
    });

    return { simulated: 'SUCCESS', providerPaymentId: payment.providerPaymentId, ...result };
  }

  @Public()
  @Post(':providerIntentId/fail')
  async fail(
    @Param('providerIntentId') providerIntentId: string,
    @Query('code') code?: string,
  ) {
    const mock = this.assertAvailable();
    const payment = mock.simulateFailure(providerIntentId, code ?? 'BAD_REQUEST_ERROR');

    const signed = mock.signWebhook({
      event: 'payment.failed',
      eventId: `payment.failed:${payment.providerPaymentId}`,
      payment: {
        id: payment.providerPaymentId,
        orderId: providerIntentId,
        amountPaise: payment.amountPaise,
      },
    });

    const result = await this.payments.handleWebhook('mock', signed.rawBody, {
      'x-mock-signature': signed.signature,
    });

    return { simulated: 'FAILURE', providerPaymentId: payment.providerPaymentId, ...result };
  }

  /**
   * Replays an already-delivered webhook verbatim. Proves the idempotency claim:
   * the second delivery must be reported as a duplicate and change nothing
   * (brief §34).
   */
  @Public()
  @Post(':providerIntentId/replay/:providerPaymentId')
  async replay(
    @Param('providerIntentId') providerIntentId: string,
    @Param('providerPaymentId') providerPaymentId: string,
  ) {
    const mock = this.assertAvailable();

    const payment = await mock.getPayment(providerPaymentId);
    const signed = mock.signWebhook({
      event: 'payment.captured',
      eventId: `payment.captured:${providerPaymentId}`,
      payment: {
        id: providerPaymentId,
        orderId: providerIntentId,
        amountPaise: payment.amountPaise,
      },
    });

    const result = await this.payments.handleWebhook('mock', signed.rawBody, {
      'x-mock-signature': signed.signature,
    });

    return { replayed: true, ...result };
  }

  /** Posts a body with a deliberately wrong signature; must be rejected. */
  @Public()
  @Post(':providerIntentId/forged')
  async forged(@Param('providerIntentId') providerIntentId: string) {
    this.assertAvailable();

    const rawBody = Buffer.from(
      JSON.stringify({
        event: 'payment.captured',
        eventId: `forged:${providerIntentId}`,
        payment: { id: 'pay_forged', orderId: providerIntentId, amountPaise: 1 },
      }),
      'utf8',
    );

    return this.payments.handleWebhook('mock', rawBody, {
      'x-mock-signature': 'de'.repeat(32),
    });
  }

  private assertAvailable() {
    if (this.env.APP_ENV === 'production') {
      // Should be unreachable: the controller is not registered in production.
      throw new NotFoundException();
    }
    const mock = this.providers.mock();
    if (!mock || this.providers.activeCodeName() !== 'mock') {
      throw new AppError(
        'PROVIDER_UNAVAILABLE',
        'The payment simulator is only available when the mock provider is active',
      );
    }
    return mock;
  }
}
