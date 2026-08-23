import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { uuidSchema } from '@novamart/validation';
import { AppError } from '../../common/errors/app-error';
import { Public, RateLimit } from '../../common/decorators';
import { parse } from '../../common/validation';
import { PaymentsService } from './payments.service';

const verifyPaymentSchema = z.object({
  paymentIntentId: uuidSchema,
  providerPaymentId: z.string().min(3).max(120),
});

@Controller({ path: 'payments', version: '1' })
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Creates the provider session for an order the caller owns. */
  @RateLimit(20, 60)
  @Post('orders/:orderId/session')
  async createSession(@Param('orderId') orderId: string) {
    return this.payments.createSession(parse(uuidSchema, orderId));
  }

  @Get(':paymentIntentId')
  async status(@Param('paymentIntentId') paymentIntentId: string) {
    return this.payments.status(parse(uuidSchema, paymentIntentId));
  }

  /**
   * The client reporting that it finished the payment sheet. Treated strictly as a
   * hint: the service re-reads the payment from the provider before changing anything.
   */
  @RateLimit(30, 60)
  @Post('verify')
  async verify(@Body() body: unknown) {
    return this.payments.verifyFromClient(parse(verifyPaymentSchema, body));
  }
}

/**
 * Provider webhooks.
 *
 * Public because the provider cannot present a NovaMart token; the HMAC over the raw
 * body is the authentication. Kept in a separate controller so the auth-exempt surface
 * is small and obvious in review.
 */
@Controller({ path: 'webhooks/payments', version: '1' })
export class PaymentWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  // Generous limit: a legitimate provider retrying a backlog must not be throttled into
  // giving up, but an unauthenticated endpoint still needs a ceiling.
  @RateLimit(600, 60)
  @Post(':provider')
  async receive(@Param('provider') provider: string, @Req() request: FastifyRequest) {
    const rawBody = (request as FastifyRequest & { rawBody?: Buffer | string }).rawBody;

    if (!rawBody) {
      // Without the raw bytes the HMAC cannot be verified, and accepting the event
      // anyway would defeat the whole mechanism.
      throw new AppError('PAYMENT_VERIFICATION_FAILED', 'Raw request body unavailable');
    }

    const buffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');

    const headers: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(request.headers)) {
      headers[key.toLowerCase()] = Array.isArray(value) ? value[0] : (value as string | undefined);
    }

    const allowed = new Set(['razorpay', 'mock', 'cashfree']);
    if (!allowed.has(provider)) throw AppError.notFound('Provider');

    return this.payments.handleWebhook(provider, buffer, headers);
  }
}
