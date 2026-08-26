import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createShipmentSchema, offsetPaginationSchema, uuidSchema } from '@novamart/validation';
import { PERMISSIONS } from '@novamart/permissions';
import { Audit, Permissions, Public, RateLimit } from '../../common/decorators';
import { AppError } from '../../common/errors/app-error';
import { parse } from '../../common/validation';
import { FulfillmentService } from './fulfillment.service';

const queueSchema = offsetPaginationSchema.extend({
  status: z.string().max(40).optional(),
});

@Controller({ path: 'shipping', version: '1' })
export class FulfillmentController {
  constructor(private readonly fulfillment: FulfillmentService) {}

  @Permissions(PERMISSIONS.SHIPMENT_READ)
  @Get('orders/:orderId/shipments')
  async orderShipments(@Param('orderId') orderId: string) {
    return this.fulfillment.listForOrder(parse(uuidSchema, orderId));
  }

  @Permissions(PERMISSIONS.SHIPMENT_READ)
  @Get('shipments')
  async queue(@Query() query: Record<string, unknown>) {
    return this.fulfillment.listQueue(parse(queueSchema, query));
  }

  @Permissions(PERMISSIONS.SHIPMENT_CREATE)
  @Audit('shipment.create', 'shipment')
  @RateLimit(60, 60)
  @Post('shipments')
  async create(@Body() body: unknown) {
    return this.fulfillment.create(parse(createShipmentSchema, body));
  }

  @Permissions(PERMISSIONS.SHIPMENT_CREATE)
  @Post('shipments/:shipmentId/label')
  async label(@Param('shipmentId') shipmentId: string) {
    return this.fulfillment.generateLabel(parse(uuidSchema, shipmentId));
  }

  /** Carrier callbacks are authenticated at the provider boundary and are not user sessions. */
  @Public()
  @Post('webhooks/:provider')
  async webhook(@Param('provider') provider: string, @Req() request: FastifyRequest) {
    const rawBody = (request as FastifyRequest & { rawBody?: Buffer | string }).rawBody;
    if (!rawBody) throw new AppError('PAYMENT_VERIFICATION_FAILED', 'Raw request body unavailable');
    const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
    const headers: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(request.headers)) {
      headers[key.toLowerCase()] = Array.isArray(value) ? value[0] : (value as string | undefined);
    }
    if (!['mock', 'shiprocket', 'delhivery'].includes(provider))
      throw AppError.notFound('Provider');
    return this.fulfillment.handleWebhook(provider, raw, headers);
  }

  @Permissions(PERMISSIONS.SHIPMENT_READ)
  @Get('shipments/:shipmentId')
  async detail(@Param('shipmentId') shipmentId: string) {
    return this.fulfillment.detail(parse(uuidSchema, shipmentId));
  }
}
