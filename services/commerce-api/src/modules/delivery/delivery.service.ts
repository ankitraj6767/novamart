import { Injectable } from '@nestjs/common';
import { createHmac, randomInt } from 'node:crypto';
import { loadServerEnv } from '@novamart/config';
import type { z } from 'zod';
import type { deliveryAttemptSchema, deliveryAvailabilitySchema, deliveryCodCollectionSchema, deliveryProofSchema } from '@novamart/validation';
import { AppError } from '../../common/errors/app-error';
import { RequestContext } from '../../common/context/request-context';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';

type AvailabilityInput = z.infer<typeof deliveryAvailabilitySchema>;
type AttemptInput = z.infer<typeof deliveryAttemptSchema>;
type ProofInput = z.infer<typeof deliveryProofSchema>;
type CodInput = z.infer<typeof deliveryCodCollectionSchema>;

@Injectable()
export class DeliveryService {
  private readonly env = loadServerEnv();

  constructor(private readonly db: DatabaseService, private readonly outbox: OutboxService) {}

  async assignments(): Promise<Array<Record<string, unknown>>> {
    const agentId = this.requireAgent();
    return this.db.sql<Array<Record<string, unknown>>>`
      select sh.id, sh.shipment_reference, sh.order_id, o.order_number, sh.status,
             sh.awb_number, sh.delivery_pincode, sh.promised_delivery_date,
             sh.estimated_delivery_date, sh.is_cod, sh.cod_amount_paise::text,
             jsonb_build_object(
               'recipientName', sh.delivery_address->>'recipient_name',
               'city', sh.delivery_address->>'city',
               'pincode', sh.delivery_address->>'pincode'
             ) as delivery_address,
             sh.created_at, sh.updated_at
        from fulfillment.shipments sh
        join commerce.orders o on o.id = sh.order_id
       where sh.delivery_agent_id = ${agentId}
         and sh.status not in ('DELIVERED', 'CANCELLED', 'RTO_DELIVERED', 'LOST', 'DAMAGED')
       order by sh.promised_delivery_date nulls last, sh.created_at
    `;
  }

  async history(): Promise<Array<Record<string, unknown>>> {
    const agentId = this.requireAgent();
    return this.db.sql<Array<Record<string, unknown>>>`
      select da.id, da.shipment_id, sh.shipment_reference, da.attempt_number,
             da.outcome, da.failure_reason, da.attempted_at, da.next_attempt_date,
             dp.proof_type, dp.otp_verified_at
        from fulfillment.delivery_attempts da
        join fulfillment.shipments sh on sh.id = da.shipment_id
        left join fulfillment.delivery_proofs dp on dp.shipment_id = sh.id
       where da.delivery_agent_id = ${agentId}
       order by da.attempted_at desc
       limit 200
    `;
  }

  async availability(input: AvailabilityInput): Promise<Record<string, unknown>> {
    const agentId = this.requireAgent();
    return this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [row] = await tx<Array<Record<string, unknown>>>`
        insert into fulfillment.delivery_agent_shifts (
          delivery_agent_id, warehouse_id, shift_date, status, started_at
        ) values (
          ${agentId}, ${input.warehouseId ?? null}, current_date, ${input.status},
          case when ${input.status} = 'ON_DUTY' then now() else null end
        )
        on conflict (delivery_agent_id, shift_date) do update set
          warehouse_id = excluded.warehouse_id,
          status = excluded.status,
          started_at = case when excluded.status = 'ON_DUTY' then coalesce(delivery_agent_shifts.started_at, now()) else delivery_agent_shifts.started_at end,
          ended_at = case when excluded.status = 'OFF_DUTY' then now() else null end
        returning id, delivery_agent_id, warehouse_id, shift_date, status, started_at, ended_at,
                  shipments_assigned, shipments_delivered, shipments_failed,
                  cod_collected_paise::text, cod_deposited_paise::text, earnings_paise::text
      `;
      return row ?? {};
    });
  }

  async requestOtp(shipmentId: string): Promise<{ sent: true; challengeId: string; expiresAt: string }> {
    const agentId = this.requireAgent();
    const otp = String(randomInt(1000, 10000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    return this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [shipment] = await tx<Array<{ id: string; order_id: string; order_number: string; user_id: string; seller_id: string; shipment_reference: string; awb_number: string | null; carrier_code: string | null; status: string }>>`
        select sh.id, sh.order_id, o.order_number, o.user_id, sh.seller_id,
               sh.shipment_reference, sh.awb_number, c.code as carrier_code, sh.status
          from fulfillment.shipments sh
          join commerce.orders o on o.id = sh.order_id
          left join fulfillment.carriers c on c.id = sh.carrier_id
         where sh.id = ${shipmentId} and sh.delivery_agent_id = ${agentId}
         for update of sh
      `;
      if (!shipment) throw AppError.notFound('Assigned shipment');
      if (['DELIVERED', 'CANCELLED', 'RTO_DELIVERED', 'LOST', 'DAMAGED'].includes(shipment.status)) throw new AppError('INVALID_STATE_TRANSITION', 'OTP cannot be requested for a terminal shipment');
      await tx`update fulfillment.delivery_otp_challenges set consumed_at = now() where shipment_id = ${shipmentId} and consumed_at is null`;
      const [challenge] = await tx<Array<{ id: string }>>`
        insert into fulfillment.delivery_otp_challenges (shipment_id, requested_by, otp_hash, expires_at)
        values (${shipmentId}, ${agentId}, ${this.hashOtp(otp)}, ${expiresAt.toISOString()})
        returning id
      `;
      if (!challenge) throw new AppError('INTERNAL_ERROR', 'Delivery OTP challenge was not created');
      await this.outbox.emit(tx, 'DELIVERY_OTP_REQUESTED', { shipmentId, orderId: shipment.order_id, challengeId: challenge.id });
      return { sent: true, challengeId: challenge.id, expiresAt: expiresAt.toISOString() };
    });
  }

  async recordAttempt(shipmentId: string, input: AttemptInput): Promise<Record<string, unknown>> {
    const agentId = this.requireAgent();
    return this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [shipment] = await tx<Array<{ id: string; status: string }>>`
        select id, status from fulfillment.shipments
         where id = ${shipmentId} and delivery_agent_id = ${agentId}
         for update of sh
      `;
      if (!shipment) throw AppError.notFound('Assigned shipment');
      const [next] = await tx<Array<{ attempt_number: number }>>`select coalesce(max(attempt_number), 0) + 1 as attempt_number from fulfillment.delivery_attempts where shipment_id = ${shipmentId}`;
      const [attempt] = await tx<Array<Record<string, unknown>>>`
        insert into fulfillment.delivery_attempts (
          shipment_id, attempt_number, outcome, failure_reason, delivery_agent_id,
          location_latitude, location_longitude, next_attempt_date
        ) values (
          ${shipmentId}, ${next?.attempt_number ?? 1}, ${input.outcome}, ${input.failureReason ?? null},
          ${agentId}, ${input.latitude ?? null}, ${input.longitude ?? null}, ${input.nextAttemptDate ?? null}
        ) returning id, shipment_id, attempt_number, outcome, attempted_at
      `;
      if (input.outcome !== 'DELIVERED') {
        await tx`update fulfillment.shipments set status = 'DELIVERY_FAILED', delivery_attempt_count = delivery_attempt_count + 1 where id = ${shipmentId}`;
      }
      return attempt ?? {};
    });
  }

  async recordProof(shipmentId: string, input: ProofInput): Promise<Record<string, unknown>> {
    const agentId = this.requireAgent();
    return this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [shipment] = await tx<Array<{ id: string; order_id: string; order_number: string; user_id: string; seller_id: string; shipment_reference: string; awb_number: string | null; carrier_code: string | null; status: string }>>`
        select sh.id, sh.order_id, o.order_number, o.user_id, sh.seller_id,
               sh.shipment_reference, sh.awb_number, c.code as carrier_code, sh.status
          from fulfillment.shipments sh
          join commerce.orders o on o.id = sh.order_id
          left join fulfillment.carriers c on c.id = sh.carrier_id
         where sh.id = ${shipmentId} and sh.delivery_agent_id = ${agentId}
         for update of sh
      `;
      if (!shipment) throw AppError.notFound('Assigned shipment');
      let otpVerifiedAt: string | null = null;
      if (input.proofType === 'OTP') {
        const [challenge] = await tx<Array<{ id: string; otp_hash: string; expires_at: string; attempt_count: number }>>`
          select id, otp_hash, expires_at, attempt_count
            from fulfillment.delivery_otp_challenges
           where shipment_id = ${shipmentId} and consumed_at is null
           order by created_at desc limit 1 for update
        `;
        if (!challenge || new Date(challenge.expires_at).getTime() <= Date.now()) throw new AppError('DELIVERY_OTP_INVALID', 'Delivery OTP has expired or was not requested');
        if (challenge.attempt_count >= 10) throw new AppError('DELIVERY_OTP_INVALID', 'Too many incorrect delivery OTP attempts');
        if (!this.secureEqual(this.hashOtp(input.otp!), challenge.otp_hash)) {
          await tx`update fulfillment.delivery_otp_challenges set attempt_count = attempt_count + 1 where id = ${challenge.id}`;
          throw new AppError('DELIVERY_OTP_INVALID', 'The delivery OTP is incorrect');
        }
        await tx`update fulfillment.delivery_otp_challenges set consumed_at = now() where id = ${challenge.id}`;
        otpVerifiedAt = new Date().toISOString();
      }
      const [proof] = await tx<Array<Record<string, unknown>>>`
        insert into fulfillment.delivery_proofs (
          shipment_id, proof_type, otp_hash, otp_verified_at, signature_storage_path,
          photo_storage_path, recipient_name, relationship, latitude, longitude, delivered_by
        ) values (
          ${shipmentId}, ${input.proofType}, ${input.proofType === 'OTP' ? this.hashOtp(input.otp!) : null},
          ${otpVerifiedAt}, ${input.signatureStoragePath ?? null}, ${input.photoStoragePath ?? null},
          ${input.recipientName ?? null}, ${input.relationship ?? null}, ${input.latitude ?? null},
          ${input.longitude ?? null}, ${agentId}
        )
        on conflict (shipment_id) do update set
          proof_type = excluded.proof_type, otp_hash = excluded.otp_hash,
          otp_verified_at = excluded.otp_verified_at,
          signature_storage_path = excluded.signature_storage_path,
          photo_storage_path = excluded.photo_storage_path,
          recipient_name = excluded.recipient_name, relationship = excluded.relationship,
          latitude = excluded.latitude, longitude = excluded.longitude,
          delivered_by = excluded.delivered_by, captured_at = now()
        returning id, shipment_id, proof_type, otp_verified_at, captured_at
      `;
      await this.db.switchActor(tx, { actorId: null, actorType: 'SYSTEM', requestId: RequestContext.requestId(), traceId: RequestContext.traceId() });
      await tx`update fulfillment.shipments set status = 'DELIVERED', delivered_at = coalesce(delivered_at, now()) where id = ${shipmentId}`;
      await tx`update commerce.order_items set status = 'DELIVERED', delivered_at = coalesce(delivered_at, now()) where id in (select order_item_id from fulfillment.shipment_items where shipment_id = ${shipmentId}) and status <> 'DELIVERED'`;
      const itemIds = await tx<Array<{ order_item_id: string }>>`
        select order_item_id from fulfillment.shipment_items where shipment_id = ${shipmentId}
      `;
      await this.outbox.emit(tx, 'ORDER_DELIVERED', {
        shipmentId,
        shipmentReference: shipment.shipment_reference,
        orderId: shipment.order_id,
        orderNumber: shipment.order_number,
        userId: shipment.user_id,
        sellerId: shipment.seller_id,
        carrierCode: shipment.carrier_code,
        awbNumber: shipment.awb_number,
        status: 'DELIVERED',
        orderItemIds: itemIds.map((item) => item.order_item_id),
        estimatedDeliveryDate: null,
      });
      return proof ?? {};
    });
  }

  async collectCod(shipmentId: string, input: CodInput): Promise<Record<string, unknown>> {
    const agentId = this.requireAgent();
    return this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [shipment] = await tx<Array<{ id: string; order_id: string; is_cod: boolean; cod_amount_paise: string }>>`
        select id, order_id, is_cod, cod_amount_paise::text from fulfillment.shipments
         where id = ${shipmentId} and delivery_agent_id = ${agentId} for update
      `;
      if (!shipment) throw AppError.notFound('Assigned shipment');
      const expectedPaise = Number(shipment.cod_amount_paise);
      if (!shipment.is_cod || expectedPaise <= 0) throw AppError.validation([{ field: 'shipmentId', issue: 'This shipment is not cash-on-delivery' }]);
      const [existing] = await tx<Array<{ id: string }>>`select cri.id from fulfillment.cod_remittance_items cri join fulfillment.cod_remittances cr on cr.id = cri.remittance_id where cri.shipment_id = ${shipmentId} and cr.delivery_agent_id = ${agentId} limit 1`;
      if (existing) return { id: existing.id, duplicate: true };
      const status = input.collectedPaise === expectedPaise ? 'RECONCILED' : input.collectedPaise < expectedPaise ? 'SHORT' : 'DISPUTED';
      const match = input.collectedPaise === expectedPaise ? 'MATCHED' : input.collectedPaise < expectedPaise ? 'SHORT' : 'EXCESS';
      const [remittance] = await tx<Array<{ id: string; remittance_reference: string }>>`
        insert into fulfillment.cod_remittances (
          source_type, delivery_agent_id, collection_date, expected_amount_paise,
          received_amount_paise, shipment_count, status, bank_reference, received_at, notes
        ) values ('DELIVERY_AGENT', ${agentId}, current_date, ${expectedPaise}, ${input.collectedPaise}, 1, ${status}, ${input.paymentReference ?? null}, now(), ${input.notes ?? null})
        returning id, remittance_reference
      `;
      await tx`insert into fulfillment.cod_remittance_items (remittance_id, shipment_id, order_id, expected_paise, received_paise, match_status, notes) values (${remittance!.id}, ${shipmentId}, ${shipment.order_id}, ${expectedPaise}, ${input.collectedPaise}, ${match}, ${input.notes ?? null})`;
      await tx`insert into fulfillment.delivery_agent_shifts (delivery_agent_id, shift_date, status, cod_collected_paise) values (${agentId}, current_date, 'ON_DUTY', ${input.collectedPaise}) on conflict (delivery_agent_id, shift_date) do update set cod_collected_paise = fulfillment.delivery_agent_shifts.cod_collected_paise + excluded.cod_collected_paise`;
      return { id: remittance!.id, remittanceReference: remittance!.remittance_reference, status, variancePaise: input.collectedPaise - expectedPaise };
    });
  }

  private requireAgent(): string {
    const principal = RequestContext.requirePrincipal();
    if (!principal.roles.includes('DELIVERY_AGENT')) throw AppError.forbidden('Delivery partner access is required');
    return principal.userId;
  }

  private hashOtp(otp: string): string {
    return createHmac('sha256', this.env.SUPABASE_JWT_SECRET ?? 'local-delivery-otp-secret').update(otp).digest('hex');
  }

  private secureEqual(left: string, right: string): boolean {
    return left.length === right.length && createHmac('sha256', left).update(right).digest('hex') === createHmac('sha256', right).update(left).digest('hex');
  }
}
