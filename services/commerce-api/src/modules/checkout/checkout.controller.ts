import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import {
  idempotencyKeySchema,
  placeOrderSchema,
  startCheckoutSchema,
  updateCheckoutSchema,
  uuidSchema,
} from '@novamart/validation';
import { AppError } from '../../common/errors/app-error';
import { RateLimit } from '../../common/decorators';
import { RequestContext } from '../../common/context/request-context';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { parse } from '../../common/validation';
import { CheckoutService } from './checkout.service';

@Controller({ path: 'checkout', version: '1' })
export class CheckoutController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /** Opens a session and reserves stock. Rate limited: each call holds inventory. */
  @RateLimit(20, 60)
  @Post()
  async start(@Body() body: unknown) {
    return this.checkout.start(parse(startCheckoutSchema, body));
  }

  @Get(':sessionId')
  async quote(@Param('sessionId') sessionId: string) {
    return this.checkout.quote(parse(uuidSchema, sessionId));
  }

  @Patch(':sessionId')
  async update(@Param('sessionId') sessionId: string, @Body() body: unknown) {
    return this.checkout.update(parse(uuidSchema, sessionId), parse(updateCheckoutSchema, body));
  }

  /**
   * Places the order. Requires an Idempotency-Key: this is the request that takes
   * money, and a retry after a network timeout must return the original order rather
   * than create a second one (brief §61).
   */
  @RateLimit(10, 60)
  @Post(':sessionId/place-order')
  async placeOrder(
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) throw new AppError('IDEMPOTENCY_KEY_REQUIRED');

    const key = parse(idempotencyKeySchema, idempotencyKey);
    const input = parse(placeOrderSchema, {
      ...(body as Record<string, unknown>),
      checkoutSessionId: parse(uuidSchema, sessionId),
    });

    const outcome = await this.idempotency.execute({
      scope: 'checkout.place-order',
      key,
      actorId: RequestContext.userId(),
      body: input,
      handler: async () => ({
        status: 201,
        body: await this.checkout.placeOrder(input),
      }),
    });

    return outcome.body;
  }
}
