import { Injectable, Logger } from '@nestjs/common';
import type { z } from 'zod';
import type { createShipmentSchema, trackingUpdateSchema } from '@novamart/validation';
import { AppError } from '../../common/errors/app-error';
import { RequestContext } from '../../common/context/request-context';
import { DatabaseService, type Tx } from '../../infrastructure/database/database.service';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';
import { ShippingProviderRegistry } from '../../infrastructure/providers/shipping/shipping-provider.registry';

type CreateShipmentInput = z.infer<typeof createShipmentSchema>;
type TrackingInput = z.infer<typeof trackingUpdateSchema>;

interface ShipmentItemRow {
  id: string;
  seller_id: string;
  sku_id: string;
  product_title: string;
  sku_code: string;
  quantity: number;
  unit_selling_price_paise: string;
  hsn_code: string | null;
}

@Injectable()
export class FulfillmentService {
  private readonly logger = new Logger(FulfillmentService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: OutboxService,
    private readonly providers: ShippingProviderRegistry,
  ) {}

  async listForOrder(orderId: string): Promise<Array<Record<string, unknown>>> {
    const userId = RequestContext.requirePrincipal().userId;
    const rows = await this.db.sql<Array<Record<string, unknown>>>`
      select sh.id, sh.shipment_reference, sh.order_id, sh.seller_id, s.display_name as seller_name,
             sh.warehouse_id, sh.carrier_id, c.code as carrier_code, c.name as carrier_name,
             sh.awb_number, sh.status, sh.is_cod, sh.cod_amount_paise::text,
             sh.estimated_delivery_date, sh.promised_delivery_date, sh.created_at,
             coalesce(jsonb_agg(jsonb_build_object(
               'orderItemId', si.order_item_id, 'quantity', si.quantity
             ) order by si.created_at) filter (where si.id is not null), '[]'::jsonb) as items
        from fulfillment.shipments sh
        join commerce.orders o on o.id = sh.order_id and o.user_id = ${userId}
        join seller.sellers s on s.id = sh.seller_id
        left join fulfillment.carriers c on c.id = sh.carrier_id
        left join fulfillment.shipment_items si on si.shipment_id = sh.id
       where sh.order_id = ${orderId}
       group by sh.id, s.display_name, c.code, c.name
       order by sh.created_at desc
    `;
    return rows;
  }

  async detail(shipmentId: string): Promise<Record<string, unknown>> {
    const principal = RequestContext.requirePrincipal();
    const [shipment] = await this.db.sql<Array<Record<string, unknown>>>`
      select sh.id, sh.shipment_reference, sh.order_id, o.order_number, sh.seller_id,
             sh.warehouse_id, sh.awb_number, sh.provider_shipment_id, sh.status,
             sh.is_cod, sh.cod_amount_paise::text, sh.estimated_delivery_date,
             sh.promised_delivery_date, sh.delivery_address, sh.created_at, sh.updated_at
        from fulfillment.shipments sh
        join commerce.orders o on o.id = sh.order_id
       where sh.id = ${shipmentId}
         and (o.user_id = ${principal.userId} or sh.seller_id = any(${principal.sellerIds}::uuid[])
              or ${principal.roles.some((role) => ['ADMIN', 'SUPER_ADMIN', 'OPERATIONS_MANAGER'].includes(role))})
    `;
    if (!shipment) throw AppError.notFound('Shipment');
    const items = await this.db.sql<Array<Record<string, unknown>>>`
      select si.order_item_id, si.sku_id, si.quantity, oi.item_number, oi.product_title
        from fulfillment.shipment_items si join commerce.order_items oi on oi.id = si.order_item_id
       where si.shipment_id = ${shipmentId}
    `;
    const events = await this.db.sql<Array<Record<string, unknown>>>`
      select provider_event_id, carrier_status_code, normalised_status, description,
             location, location_pincode, occurred_at, was_applied
        from fulfillment.tracking_events where shipment_id = ${shipmentId}
       order by occurred_at desc
    `;
    return { ...shipment, items, tracking: events };
  }

  async listQueue(query: {
    status?: string;
    limit: number;
    offset: number;
  }): Promise<Array<Record<string, unknown>>> {
    const sql = this.db.sql;
    return sql<Array<Record<string, unknown>>>`
      select sh.id, sh.shipment_reference, sh.order_id, o.order_number, sh.seller_id,
             s.display_name as seller_name, sh.warehouse_id, w.name as warehouse_name,
             sh.awb_number, sh.status, sh.is_cod, sh.cod_amount_paise::text,
             sh.delivery_pincode, sh.promised_delivery_date, sh.created_at
        from fulfillment.shipments sh
        join commerce.orders o on o.id = sh.order_id
        join seller.sellers s on s.id = sh.seller_id
        join inventory.warehouses w on w.id = sh.warehouse_id
       where (${query.status ?? null}::text is null or sh.status = ${query.status ?? null})
       order by sh.created_at desc
       limit ${query.limit} offset ${query.offset}
    `;
  }

  async create(input: CreateShipmentInput): Promise<Record<string, unknown>> {
    const principal = RequestContext.requirePrincipal();
    const existing = await this.db.sql<Array<Record<string, unknown>>>`
      select sh.id, sh.shipment_reference, sh.status, sh.awb_number
        from fulfillment.shipments sh
        join fulfillment.shipment_items si on si.shipment_id = sh.id
       where sh.order_id = ${input.orderId}
         and si.order_item_id = any(${input.orderItemIds}::uuid[])
       group by sh.id
       having count(distinct si.order_item_id) = ${input.orderItemIds.length}
       order by sh.created_at desc limit 1
    `;
    if (existing[0]) return existing[0];

    const [order] = await this.db.sql<
      Array<{
        id: string;
        order_number: string;
        user_id: string;
        delivery_pincode: string;
        is_cod: boolean;
        total_payable_paise: string;
        delivery_address: Record<string, unknown>;
      }>
    >`
      select o.id, o.order_number, o.user_id, o.delivery_pincode, o.is_cod,
             o.total_payable_paise::text as total_payable_paise,
             to_jsonb(oa) - 'id' - 'order_id' as delivery_address
        from commerce.orders o
        join commerce.order_addresses oa on oa.order_id = o.id and oa.address_type = 'SHIPPING'
       where o.id = ${input.orderId}
       for update
    `;
    if (!order) throw AppError.notFound('Order');

    const items = await this.db.sql<ShipmentItemRow[]>`
      select oi.id, oi.seller_id, oi.sku_id, oi.product_title, oi.sku_code, oi.quantity,
             b.unit_selling_price_paise::text, oi.hsn_code
        from commerce.order_items oi
        join commerce.order_item_price_breakdowns b on b.order_item_id = oi.id
       where oi.order_id = ${input.orderId}
         and oi.id = any(${input.orderItemIds}::uuid[])
         and oi.status in ('PACKED', 'READY_TO_SHIP')
       order by oi.line_number
    `;
    if (items.length !== input.orderItemIds.length) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        'All selected items must be packed before shipment creation',
      );
    }
    const authoritativeDeclaredValue = items.reduce(
      (sum, item) => sum + Number(item.unit_selling_price_paise) * item.quantity,
      0,
    );
    const authoritativeCod = order.is_cod ? Number(order.total_payable_paise) : 0;
    const sellerId = items[0]?.seller_id;
    if (!sellerId || items.some((item) => item.seller_id !== sellerId)) {
      throw AppError.validation([
        { field: 'orderItemIds', issue: 'A shipment may contain items from one seller only' },
      ]);
    }

    const [warehouse] = await this.db.sql<Array<Record<string, unknown>>>`
      select id, seller_id, pincode, address_line1, address_line2, city, state_code,
             contact_name, contact_phone
        from inventory.warehouses
       where id = ${input.warehouseId} and is_active and accepts_new_orders
    `;
    if (!warehouse || warehouse['seller_id'] !== sellerId) throw AppError.notFound('Warehouse');

    const [carrier] = await this.db.sql<Array<{ id: string; code: string; name: string }>>`
      select id, code, name from fulfillment.carriers
       where is_active and (${input.carrierCode ?? null}::text is null or code = ${input.carrierCode ?? null})
       order by selection_priority limit 1
    `;
    if (!carrier) throw new AppError('SHIPPING_UNAVAILABLE', 'No active carrier is configured');

    const provider = this.providers.active();
    const providerShipment = await provider.createShipment({
      shipmentReference: `NM-${input.orderId.slice(0, 8)}-${sellerId.slice(0, 8)}`,
      orderNumber: order.order_number,
      carrierCode: carrier.code,
      isCod: order.is_cod,
      codAmountPaise: authoritativeCod,
      declaredValuePaise: authoritativeDeclaredValue,
      weightGrams: input.actualWeightGrams,
      dimensions: input.dimensions ?? null,
      pickup: {
        name: String(warehouse['contact_name'] ?? 'NovaMart Warehouse'),
        phone: String(warehouse['contact_phone'] ?? ''),
        addressLine1: String(warehouse['address_line1']),
        addressLine2: (warehouse['address_line2'] as string | null) ?? null,
        city: String(warehouse['city']),
        stateCode: String(warehouse['state_code']),
        pincode: String(warehouse['pincode']),
        countryCode: 'IN',
      },
      delivery: this.addressFromSnapshot(order.delivery_address),
      items: items.map((item) => ({
        name: item.product_title,
        sku: item.sku_code,
        quantity: item.quantity,
        unitPricePaise: Number(item.unit_selling_price_paise),
        hsn: item.hsn_code,
      })),
      idempotencyKey: `shipment:${input.orderId}:${input.orderItemIds.slice().sort().join(',')}`,
    });

    return this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [shipment] = await tx<
        Array<{ id: string; shipment_reference: string; status: string }>
      >`
        insert into fulfillment.shipments (
          order_id, seller_id, warehouse_id, carrier_id, shipment_mode,
          provider_shipment_id, awb_number, status, is_cod, cod_amount_paise,
          declared_value_paise, actual_weight_grams, volumetric_weight_grams,
          pickup_pincode, delivery_pincode, delivery_address, pickup_address,
          estimated_delivery_date, promised_delivery_date
        ) values (
          ${input.orderId}, ${sellerId}, ${input.warehouseId}, ${carrier.id}, ${input.shipmentMode},
          ${providerShipment.providerShipmentId}, ${providerShipment.awbNumber}, 'CREATED',
          ${order.is_cod}, ${authoritativeCod}, ${authoritativeDeclaredValue},
          ${input.actualWeightGrams}, ${input.dimensions ? Math.ceil((input.dimensions.lengthMm * input.dimensions.widthMm * input.dimensions.heightMm) / 5000) : null},
          ${String(warehouse['pincode'])}, ${order.delivery_pincode},
          ${tx.json(order.delivery_address as never)}, ${tx.json(warehouse as never)},
          ${providerShipment.estimatedDeliveryDate?.toISOString().slice(0, 10) ?? null},
          ${providerShipment.estimatedDeliveryDate?.toISOString().slice(0, 10) ?? null}
        ) returning id, shipment_reference, status
      `;
      if (!shipment) throw new AppError('INTERNAL_ERROR', 'Shipment creation returned no row');

      for (const item of items) {
        await tx`
          insert into fulfillment.shipment_items (shipment_id, order_item_id, sku_id, quantity)
          values (${shipment.id}, ${item.id}, ${item.sku_id}, ${item.quantity})
        `;
        await tx`
          update commerce.order_items
             set status = case when status = 'PACKED' then 'READY_TO_SHIP' else status end,
                 dispatched_at = null
           where id = ${item.id}
        `;
      }

      await this.outbox.emit(tx, 'SHIPMENT_CREATED', {
        shipmentId: shipment.id,
        shipmentReference: shipment.shipment_reference,
        orderId: order.id,
        orderNumber: order.order_number,
        userId: order.user_id,
        sellerId,
        carrierCode: carrier.code,
        awbNumber: providerShipment.awbNumber,
        status: shipment.status,
        orderItemIds: items.map((item) => item.id),
        estimatedDeliveryDate:
          providerShipment.estimatedDeliveryDate?.toISOString().slice(0, 10) ?? null,
      });

      this.logger.log({ shipmentId: shipment.id, actorId: principal.userId }, 'Shipment created');
      return {
        ...shipment,
        awbNumber: providerShipment.awbNumber,
        carrierCode: carrier.code,
        estimatedDeliveryDate: providerShipment.estimatedDeliveryDate,
      };
    });
  }

  async generateLabel(shipmentId: string): Promise<Record<string, unknown>> {
    const [shipment] = await this.db.sql<
      Array<{ id: string; provider_shipment_id: string | null; awb_number: string | null }>
    >`
      select id, provider_shipment_id, awb_number from fulfillment.shipments where id = ${shipmentId}
    `;
    if (!shipment) throw AppError.notFound('Shipment');
    if (!shipment.provider_shipment_id)
      throw new AppError('PROVIDER_UNAVAILABLE', 'Shipment is not registered with a carrier');
    const label = await this.providers.active().generateLabel(shipment.provider_shipment_id);
    return this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      await tx`update fulfillment.shipping_labels set is_current = false, voided_at = now(), void_reason = 'REPLACED' where shipment_id = ${shipmentId} and is_current`;
      const [row] = await tx<Array<Record<string, unknown>>>`
        insert into fulfillment.shipping_labels (shipment_id, label_format, storage_path, awb_number)
        values (${shipmentId}, ${label.format}, ${label.url}, ${shipment.awb_number})
        returning id, shipment_id, label_format, storage_path, generated_at
      `;
      await tx`update fulfillment.shipments set status = 'LABEL_GENERATED' where id = ${shipmentId} and status = 'CREATED'`;
      return row ?? {};
    });
  }

  async applyTracking(input: TrackingInput): Promise<Record<string, unknown>> {
    const [shipment] = await this.db.sql<
      Array<{
        id: string;
        order_id: string;
        order_number: string;
        user_id: string;
        seller_id: string;
        shipment_reference: string;
        awb_number: string | null;
        status: string;
      }>
    >`
      select sh.id, sh.order_id, o.order_number, o.user_id, sh.seller_id,
             sh.shipment_reference, sh.awb_number, sh.status
        from fulfillment.shipments sh join commerce.orders o on o.id = sh.order_id
       where (${input.shipmentId ?? null}::uuid is not null and sh.id = ${input.shipmentId ?? null})
          or (${input.awbNumber ?? null}::text is not null and sh.awb_number = ${input.awbNumber ?? null})
       limit 1
    `;
    if (!shipment) throw AppError.notFound('Shipment');

    const orderStatus = this.orderStatusForTracking(input.normalisedStatus);
    const terminal = new Set(['DELIVERED', 'RTO_DELIVERED', 'LOST', 'DAMAGED', 'CANCELLED']);
    const shouldApply =
      !terminal.has(shipment.status) &&
      this.trackingRank(input.normalisedStatus) >= this.trackingRank(shipment.status);
    return this.db.transaction(
      {
        actorType: 'SYSTEM',
        requestId: RequestContext.requestId(),
        traceId: RequestContext.traceId(),
      },
      async (tx) => {
        const [event] = await tx<Array<{ id: string }>>`
        insert into fulfillment.tracking_events (
          shipment_id, provider_event_id, carrier_status_code, normalised_status,
          description, location, location_pincode, occurred_at, raw_payload, was_applied
        ) values (
          ${shipment.id}, ${input.providerEventId ?? null}, ${input.carrierStatusCode ?? null},
          ${input.normalisedStatus}, ${input.description}, ${input.location ?? null},
          ${input.locationPincode ?? null}, ${input.occurredAt ?? new Date().toISOString()},
          ${tx.json(input.rawPayload as never)}, ${shouldApply}
        ) on conflict (shipment_id, provider_event_id) where provider_event_id is not null do nothing
        returning id
      `;
        if (!event) return { duplicate: true, shipmentId: shipment.id, status: shipment.status };
        if (!shouldApply) {
          return {
            duplicate: false,
            shipmentId: shipment.id,
            status: shipment.status,
            trackingEventId: event.id,
            applied: false,
          };
        }

        const timestamp = input.normalisedStatus === 'DELIVERED' ? new Date().toISOString() : null;
        await tx`
        update fulfillment.shipments
           set status = ${input.normalisedStatus},
               picked_up_at = case when ${input.normalisedStatus} in ('PICKED_UP', 'IN_TRANSIT') then coalesce(picked_up_at, now()) else picked_up_at end,
               delivered_at = case when ${input.normalisedStatus} = 'DELIVERED' then coalesce(delivered_at, ${timestamp}) else delivered_at end,
               delivery_attempt_count = case when ${input.normalisedStatus} = 'DELIVERY_FAILED' then delivery_attempt_count + 1 else delivery_attempt_count end
         where id = ${shipment.id}
      `;
        if (orderStatus) {
          await tx`
          update commerce.order_items
             set status = ${orderStatus},
                 dispatched_at = case when ${orderStatus} = 'SHIPPED' then coalesce(dispatched_at, now()) else dispatched_at end,
                 delivered_at = case when ${orderStatus} = 'DELIVERED' then coalesce(delivered_at, now()) else delivered_at end
           where id in (select order_item_id from fulfillment.shipment_items where shipment_id = ${shipment.id})
             and status <> 'DELIVERED'
        `;
        }

        const eventType =
          input.normalisedStatus === 'DELIVERED'
            ? 'ORDER_DELIVERED'
            : input.normalisedStatus === 'OUT_FOR_DELIVERY'
              ? 'OUT_FOR_DELIVERY'
              : ['PICKED_UP', 'IN_TRANSIT', 'REACHED_DESTINATION_HUB'].includes(
                    input.normalisedStatus,
                  )
                ? 'ORDER_SHIPPED'
                : null;
        if (eventType) {
          await this.outbox.emit(tx, eventType, {
            shipmentId: shipment.id,
            shipmentReference: shipment.shipment_reference,
            orderId: shipment.order_id,
            orderNumber: shipment.order_number,
            userId: shipment.user_id,
            sellerId: shipment.seller_id,
            carrierCode: null,
            awbNumber: shipment.awb_number,
            status: input.normalisedStatus,
            orderItemIds: await this.itemIds(tx, shipment.id),
            estimatedDeliveryDate: null,
          });
        }
        return {
          duplicate: false,
          shipmentId: shipment.id,
          status: input.normalisedStatus,
          trackingEventId: event.id,
        };
      },
    );
  }

  async handleWebhook(
    providerCode: string,
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
  ): Promise<Record<string, unknown>> {
    const verification = this.providers.verifyWebhook(providerCode, rawBody, headers);
    if (!verification.valid)
      throw new AppError(
        'PAYMENT_VERIFICATION_FAILED',
        verification.reason ?? 'Invalid shipping webhook signature',
      );
    if (verification.updates.length === 0) {
      return {
        accepted: true,
        provider: providerCode,
        awbNumber: verification.awbNumber,
        updatesApplied: 0,
      };
    }
    const results = [];
    for (const update of verification.updates) {
      results.push(
        await this.applyTracking({
          shipmentId: undefined,
          awbNumber: verification.awbNumber ?? undefined,
          providerEventId: update.providerEventId,
          carrierStatusCode: update.carrierStatusCode,
          normalisedStatus: update.normalisedStatus as TrackingInput['normalisedStatus'],
          description: update.description,
          location: update.location,
          locationPincode: update.locationPincode,
          occurredAt: update.occurredAt.toISOString(),
          rawPayload: update.raw,
        }),
      );
    }
    return {
      accepted: true,
      provider: providerCode,
      awbNumber: verification.awbNumber,
      updatesApplied: results.length,
      results,
    };
  }

  private async itemIds(tx: Tx, shipmentId: string): Promise<string[]> {
    const rows = await tx<
      Array<{ order_item_id: string }>
    >`select order_item_id from fulfillment.shipment_items where shipment_id = ${shipmentId}`;
    return rows.map((row) => row.order_item_id);
  }

  private orderStatusForTracking(
    status: string,
  ): 'SHIPPED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'RTO_INITIATED' | null {
    if (status === 'PICKED_UP' || status === 'IN_TRANSIT' || status === 'REACHED_DESTINATION_HUB')
      return 'SHIPPED';
    if (status === 'OUT_FOR_DELIVERY') return 'OUT_FOR_DELIVERY';
    if (status === 'DELIVERED') return 'DELIVERED';
    if (status === 'RTO_INITIATED') return 'RTO_INITIATED';
    return null;
  }

  private trackingRank(status: string): number {
    const ranks: Record<string, number> = {
      CREATED: 10,
      LABEL_GENERATED: 20,
      PICKUP_SCHEDULED: 30,
      PICKED_UP: 40,
      IN_TRANSIT: 50,
      REACHED_DESTINATION_HUB: 60,
      OUT_FOR_DELIVERY: 70,
      DELIVERED: 100,
      DELIVERY_FAILED: 65,
      RTO_INITIATED: 80,
      RTO_IN_TRANSIT: 90,
      RTO_DELIVERED: 100,
      LOST: 100,
      DAMAGED: 100,
      CANCELLED: 100,
    };
    return ranks[status] ?? 0;
  }

  private addressFromSnapshot(snapshot: Record<string, unknown>) {
    return {
      name: String(snapshot['recipient_name'] ?? snapshot['recipientName'] ?? ''),
      phone: String(snapshot['recipient_phone'] ?? snapshot['recipientPhone'] ?? ''),
      addressLine1: String(snapshot['address_line1'] ?? snapshot['addressLine1'] ?? ''),
      addressLine2: (snapshot['address_line2'] ?? snapshot['addressLine2'] ?? null) as
        | string
        | null,
      city: String(snapshot['city'] ?? ''),
      stateCode: String(snapshot['state_code'] ?? snapshot['stateCode'] ?? ''),
      pincode: String(snapshot['pincode'] ?? ''),
      countryCode: 'IN' as const,
    };
  }
}
