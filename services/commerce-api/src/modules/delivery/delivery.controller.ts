import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { deliveryAttemptSchema, deliveryAvailabilitySchema, deliveryCodCollectionSchema, deliveryProofSchema, uuidSchema } from '@novamart/validation';
import { Audit, Permissions } from '../../common/decorators';
import { PERMISSIONS } from '@novamart/permissions';
import { parse } from '../../common/validation';
import { DeliveryService } from './delivery.service';

@Controller({ path: 'delivery', version: '1' })
export class DeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  @Get('me/assignments')
  async assignments() { return this.delivery.assignments(); }

  @Get('me/history')
  async history() { return this.delivery.history(); }

  @Patch('me/availability')
  async availability(@Body() body: unknown) { return this.delivery.availability(parse(deliveryAvailabilitySchema, body)); }

  @Post('shipments/:shipmentId/otp')
  async requestOtp(@Param('shipmentId') shipmentId: string) { return this.delivery.requestOtp(parse(uuidSchema, shipmentId)); }

  @Post('shipments/:shipmentId/attempts')
  async attempt(@Param('shipmentId') shipmentId: string, @Body() body: unknown) { return this.delivery.recordAttempt(parse(uuidSchema, shipmentId), parse(deliveryAttemptSchema, body)); }

  @Audit('delivery.proof_capture', 'delivery_proof')
  @Post('shipments/:shipmentId/proof')
  async proof(@Param('shipmentId') shipmentId: string, @Body() body: unknown) { return this.delivery.recordProof(parse(uuidSchema, shipmentId), parse(deliveryProofSchema, body)); }

  @Permissions(PERMISSIONS.COD_RECONCILE)
  @Audit('delivery.cod_collect', 'cod_remittance')
  @Post('shipments/:shipmentId/cod')
  async cod(@Param('shipmentId') shipmentId: string, @Body() body: unknown) { return this.delivery.collectCod(parse(uuidSchema, shipmentId), parse(deliveryCodCollectionSchema, body)); }
}
