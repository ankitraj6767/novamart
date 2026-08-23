import { Injectable } from '@nestjs/common';
import { money } from '@novamart/domain';
import type {
  AddressDto,
  OrderDetailDto,
  OrderItemDto,
  OrderStatus,
  OrderSummaryDto,
  OrderTimelineEntryDto,
  PaymentMethod,
  PriceBreakdownDto,
} from '@novamart/types';
import { AppError } from '../../common/errors/app-error';
import { RequestContext } from '../../common/context/request-context';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';

/** Statuses at which a customer may still cancel. Past PACKED it is in the network. */
const CUSTOMER_CANCELLABLE: ReadonlySet<string> = new Set([
  'CREATED',
  'PENDING_PAYMENT',
  'PAYMENT_CONFIRMED',
  'CONFIRMED',
  'ALLOCATED',
  'PROCESSING',
]);

@Injectable()
export class OrdersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: OutboxService,
  ) { }

  /**
   * The customer's order list, keyset paginated on (placed_at, id).
   *
   * OFFSET would degrade for a customer with years of history, and worse, would skip or
   * repeat rows when a new order lands mid-scroll.
   */
  async list(query: {
    limit: number;
    cursor?: string;
    status?: string;
    from?: string;
    to?: string;
    search?: string;
  }): Promise<{ items: OrderSummaryDto[]; nextCursor: string | null }> {
    const principal = RequestContext.requirePrincipal();
    const sql = this.db.sql;

    const cursor = this.decodeCursor(query.cursor);

    const rows = await sql<
      Array<{
        id: string;
        order_number: string;
        placed_at: string;
        status: string;
        fulfillment_summary: string;
        payment_method: string;
        payment_status: string;
        items_count: number;
        total_payable_paise: string;
        preview_images: string[] | null;
        primary_title: string | null;
      }>
    >`
      select o.id, o.order_number, o.placed_at, o.status, o.fulfillment_summary,
             o.payment_method, o.payment_status, o.items_count,
             o.total_payable_paise::text as total_payable_paise,
             (select array_agg(i.primary_image_url) filter (where i.primary_image_url is not null)
                from (select primary_image_url from commerce.order_items
                       where order_id = o.id order by line_number limit 4) i
             ) as preview_images,
             (select product_title from commerce.order_items
               where order_id = o.id order by line_number limit 1) as primary_title
        from commerce.orders o
       where o.user_id = ${principal.userId}
         ${query.status ? sql`and o.status = ${query.status}` : sql``}
         ${query.from ? sql`and o.placed_at >= ${query.from}::date` : sql``}
         ${query.to ? sql`and o.placed_at < (${query.to}::date + 1)` : sql``}
         ${query.search
        ? sql`and (o.order_number ilike ${'%' + query.search + '%'}
                        or exists (select 1 from commerce.order_items oi
                                    where oi.order_id = o.id
                                      and oi.product_title ilike ${'%' + query.search + '%'}))`
        : sql``
      }
         ${cursor
        ? sql`and (o.placed_at, o.id) < (${cursor.placedAt}::timestamptz, ${cursor.id}::uuid)`
        : sql``
      }
       order by o.placed_at desc, o.id desc
       limit ${query.limit + 1}
    `;

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);

    return {
      items: page.map((row) => ({
        id: row.id,
        orderNumber: row.order_number,
        placedAt: row.placed_at,
        status: row.status as OrderStatus,
        fulfillmentSummary: row.fulfillment_summary,
        paymentMethod: row.payment_method as PaymentMethod,
        paymentStatus: row.payment_status,
        itemsCount: row.items_count,
        totalPayable: money(Number(row.total_payable_paise)),
        previewImages: row.preview_images ?? [],
        primaryTitle: row.primary_title ?? '',
      })),
      nextCursor: hasMore && last ? this.encodeCursor(last.placed_at, last.id) : null,
    };
  }

  async detail(orderId: string): Promise<OrderDetailDto> {
    const principal = RequestContext.requirePrincipal();

    const [order] = await this.db.sql<
      Array<{
        id: string;
        order_number: string;
        placed_at: string;
        status: string;
        fulfillment_summary: string;
        payment_method: string;
        payment_status: string;
        items_count: number;
        total_payable_paise: string;
        is_cod: boolean;
        promised_delivery_date: string | null;
      }>
    >`
      select id, order_number, placed_at, status, fulfillment_summary, payment_method,
             payment_status, items_count, total_payable_paise::text as total_payable_paise,
             is_cod, promised_delivery_date
        from commerce.orders
       where id = ${orderId} and user_id = ${principal.userId}
    `;

    if (!order) throw AppError.notFound('Order');

    const [breakdown, addresses, items, timeline] = await Promise.all([
      this.db.sql<
        Array<Record<string, string>>
      >`
        select items_gross_paise::text, seller_discount_paise::text,
               platform_discount_paise::text, coupon_discount_paise::text,
               promotion_discount_paise::text, bank_offer_discount_paise::text,
               total_discount_paise::text, shipping_paise::text, cod_fee_paise::text,
               gift_wrap_paise::text, total_tax_paise::text, total_payable_paise::text,
               applied_rules::text
          from commerce.order_price_breakdowns where order_id = ${orderId}
      `,
      this.db.sql<
        Array<{
          address_type: string;
          recipient_name: string;
          recipient_phone: string;
          alternate_phone: string | null;
          address_line1: string;
          address_line2: string | null;
          landmark: string | null;
          locality: string | null;
          city: string;
          state_code: string;
          pincode: string;
          delivery_instructions: string | null;
        }>
      >`
        select address_type, recipient_name, recipient_phone, alternate_phone,
               address_line1, address_line2, landmark, locality, city, state_code,
               pincode, delivery_instructions
          from commerce.order_addresses where order_id = ${orderId}
      `,
      this.loadItems(orderId),
      this.db.sql<
        Array<{
          occurred_at: string;
          title_key: string;
          description_key: string | null;
          params: Record<string, unknown>;
          icon: string | null;
        }>
      >`
        select occurred_at, title_key, description_key, params, icon
          from commerce.order_events
         where order_id = ${orderId} and is_customer_visible
         order by occurred_at desc
      `,
    ]);

    const shipping = addresses.find((a) => a.address_type === 'SHIPPING');
    const billing = addresses.find((a) => a.address_type === 'BILLING');

    return {
      id: order.id,
      orderNumber: order.order_number,
      placedAt: order.placed_at,
      status: order.status as OrderStatus,
      fulfillmentSummary: order.fulfillment_summary,
      paymentMethod: order.payment_method as PaymentMethod,
      paymentStatus: order.payment_status,
      itemsCount: order.items_count,
      totalPayable: money(Number(order.total_payable_paise)),
      previewImages: items.map((i) => i.imageUrl).filter((u): u is string => u !== null).slice(0, 4),
      primaryTitle: items[0]?.title ?? '',
      breakdown: this.toBreakdown(breakdown[0]),
      shippingAddress: shipping
        ? this.toAddressDto(shipping)
        : (null as unknown as AddressDto),
      billingAddress: billing ? this.toAddressDto(billing) : null,
      items,
      timeline: timeline.map<OrderTimelineEntryDto>((t) => ({
        at: t.occurred_at,
        titleKey: t.title_key,
        descriptionKey: t.description_key,
        params: t.params ?? {},
        icon: t.icon,
      })),
      // An invoice only exists once something has actually shipped.
      invoiceAvailable: ['SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(order.status),
      cancellable: CUSTOMER_CANCELLABLE.has(order.status),
      isCod: order.is_cod,
      promisedDeliveryDate: order.promised_delivery_date,
    };
  }

  /**
   * Customer cancellation.
   *
   * Releases the inventory hold and creates a refund record for anything already
   * captured. The refund is only *requested* here; the provider call happens in the
   * worker so a gateway outage cannot block the cancellation the customer asked for.
   */
  async cancel(
    orderId: string,
    input: { reason: string; orderItemIds?: string[] },
  ): Promise<{ cancelled: true; refundInitiated: boolean }> {
    const principal = RequestContext.requirePrincipal();

    return this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [order] = await tx<
        Array<{
          id: string;
          order_number: string;
          status: string;
          is_cod: boolean;
          amount_paid_paise: string;
          amount_refunded_paise: string;
          total_payable_paise: string;
        }>
      >`
        select id, order_number, status, is_cod,
               amount_paid_paise::text as amount_paid_paise,
               amount_refunded_paise::text as amount_refunded_paise,
               total_payable_paise::text as total_payable_paise
          from commerce.orders
         where id = ${orderId} and user_id = ${principal.userId}
           for update
      `;

      if (!order) throw AppError.notFound('Order');
      if (!CUSTOMER_CANCELLABLE.has(order.status)) {
        throw new AppError('ORDER_NOT_CANCELLABLE', 'This order can no longer be cancelled');
      }

      const items = await tx<
        Array<{ id: string; status: string; reservation_id: string | null }>
      >`
        select id, status, reservation_id
          from commerce.order_items
         where order_id = ${orderId}
           ${input.orderItemIds?.length ? tx`and id = any(${input.orderItemIds}::uuid[])` : tx``}
           and status not in ('CANCELLED', 'DELIVERED', 'RETURN_RECEIVED')
      `;

      if (items.length === 0) {
        throw new AppError('ORDER_NOT_CANCELLABLE', 'There is nothing left to cancel');
      }

      // Per-item breakdown drives the refundable amount, so a partial cancellation
      // refunds exactly that item's share of discounts, shipping and tax.
      const [refundable] = await tx<Array<{ total: string }>>`
        select coalesce(sum(total_payable_paise), 0)::text as total
          from commerce.order_item_price_breakdowns
         where order_item_id = any(${items.map((i) => i.id)}::uuid[])
      `;

      // The state machine only lets a customer cancel outright from CREATED or
      // PENDING_PAYMENT. From CONFIRMED onwards the customer may REQUEST cancellation,
      // and the platform completes it. Both steps happen here, in one transaction, with
      // the correct actor recorded against each.
      const directlyCancellable = new Set(['CREATED', 'PENDING_PAYMENT']);
      const needsRequestStep = items.filter((i) => !directlyCancellable.has(i.status));

      for (const item of needsRequestStep) {
        await tx`
          update commerce.order_items
             set status = 'CANCELLATION_REQUESTED', status_reason = ${input.reason}
           where id = ${item.id}
        `;
      }

      if (!directlyCancellable.has(order.status)) {
        await tx`
          update commerce.orders
             set status = 'CANCELLATION_REQUESTED', cancellation_reason = ${input.reason}
           where id = ${orderId}
        `;
      }

      // Nothing has been dispatched at any of these statuses, so there is no reason to
      // hold the customer in a pending state: the platform approves immediately.
      await this.db.switchActor(tx, {
        actorId: null,
        actorType: 'SYSTEM',
        requestId: RequestContext.requestId(),
        traceId: RequestContext.traceId(),
      });

      for (const item of items) {
        await tx`
          update commerce.order_items
             set status = 'CANCELLED', status_reason = ${input.reason}
           where id = ${item.id}
        `;
      }

      // Give the stock back.
      await tx`
        select inventory.release_reservation(r.id, 'ORDER_CANCELLED')
          from inventory.inventory_reservations r
         where r.order_id = ${orderId}
           ${input.orderItemIds?.length ? tx`and r.order_item_id = any(${input.orderItemIds}::uuid[])` : tx``}
           and r.status in ('ACTIVE', 'CONFIRMED')
      `;

      const [remaining] = await tx<Array<{ count: string }>>`
        select count(*)::text as count from commerce.order_items
         where order_id = ${orderId} and status <> 'CANCELLED'
      `;
      const fullyCancelled = Number(remaining?.count ?? 0) === 0;

      if (fullyCancelled) {
        // cancelled_by / cancellation_actor still record the CUSTOMER: they are who
        // asked. The SYSTEM actor above governs the state transition only.
        await tx`
          update commerce.orders
             set status = 'CANCELLED', cancelled_at = now(),
                 cancelled_by = ${principal.userId}, cancellation_actor = 'CUSTOMER',
                 cancellation_reason = ${input.reason}
           where id = ${orderId}
        `;
      }

      // Reverse the coupon redemption so a cancelled order does not consume the
      // customer's one allowed use.
      if (fullyCancelled) {
        await tx`
          update pricing.coupon_redemptions
             set status = 'REVERSED', reversed_at = now(),
                 reversal_reason = 'ORDER_CANCELLED'
           where order_id = ${orderId} and status <> 'REVERSED'
        `;
      }

      const captured = Number(order.amount_paid_paise) - Number(order.amount_refunded_paise);
      const refundAmount = Math.min(Number(refundable?.total ?? 0), captured);
      let refundInitiated = false;

      if (!order.is_cod && refundAmount > 0) {
        const [intent] = await tx<Array<{ id: string }>>`
          select id from payments.payment_intents
           where order_id = ${orderId} and status = 'CAPTURED'
           order by created_at desc limit 1
        `;

        if (intent) {
          await tx`
            insert into payments.refunds (
              payment_intent_id, order_id, user_id, refund_type, reason_code,
              reason_notes, amount_paise, item_amount_paise, refund_mode, status,
              borne_by, initiated_by, initiated_by_type, idempotency_key
            ) values (
              ${intent.id}, ${orderId}, ${principal.userId},
              ${input.orderItemIds?.length ? 'PARTIAL' : 'FULL'},
              'ORDER_CANCELLED', ${input.reason}, ${refundAmount}, ${refundAmount},
              'ORIGINAL_INSTRUMENT', 'PENDING', 'SELLER', ${principal.userId}, 'CUSTOMER',
              ${`cancel:${orderId}:${input.orderItemIds?.join(',') ?? 'all'}`}
            )
            -- refunds_idempotency_idx is a PARTIAL unique index, so the predicate has to
            -- be restated for Postgres to infer it. Without the WHERE clause this fails
            -- with "no unique or exclusion constraint matching the ON CONFLICT
            -- specification" rather than silently allowing a duplicate refund.
            on conflict (idempotency_key) where (idempotency_key is not null) do nothing
          `;
          refundInitiated = true;
        }
      }

      await this.outbox.emit(tx, 'ORDER_CANCELLED', {
        orderId,
        orderNumber: order.order_number,
        userId: principal.userId,
        cancelledBy: principal.userId,
        actor: 'CUSTOMER',
        reason: input.reason,
        orderItemIds: items.map((i) => i.id),
        refundablePaise: refundAmount,
      });

      return { cancelled: true as const, refundInitiated };
    });
  }

  private async loadItems(orderId: string): Promise<OrderItemDto[]> {
    const rows = await this.db.sql<
      Array<{
        id: string;
        item_number: string;
        product_id: string;
        product_slug: string | null;
        product_title: string;
        variant_label: string | null;
        primary_image_url: string | null;
        sku_code: string;
        seller_id: string;
        seller_name: string | null;
        quantity: number;
        status: string;
        unit_selling_price_paise: string | null;
        total_payable_paise: string | null;
        promised_delivery_date: string | null;
        delivered_at: string | null;
        return_eligible_until: string | null;
        return_type: string;
        shipment_id: string | null;
        shipment_reference: string | null;
        shipment_status: string | null;
        carrier_name: string | null;
        awb_number: string | null;
        estimated_delivery_date: string | null;
        refund_status: string | null;
      }>
    >`
      select oi.id, oi.item_number, oi.product_id, p.slug as product_slug,
             oi.product_title, oi.variant_label, oi.primary_image_url, oi.sku_code,
             oi.seller_id, s.display_name as seller_name, oi.quantity, oi.status,
             b.unit_selling_price_paise::text as unit_selling_price_paise,
             b.total_payable_paise::text as total_payable_paise,
             oi.promised_delivery_date, oi.delivered_at, oi.return_eligible_until,
             oi.return_type,
             sh.id as shipment_id, sh.shipment_reference, sh.status as shipment_status,
             c.name as carrier_name, sh.awb_number, sh.estimated_delivery_date,
             r.status as refund_status
        from commerce.order_items oi
        left join catalog.products p on p.id = oi.product_id
        left join seller.sellers s on s.id = oi.seller_id
        left join commerce.order_item_price_breakdowns b on b.order_item_id = oi.id
        left join fulfillment.shipment_items si on si.order_item_id = oi.id
        left join fulfillment.shipments sh on sh.id = si.shipment_id
        left join fulfillment.carriers c on c.id = sh.carrier_id
        left join lateral (
          select status from payments.refunds
           where order_item_id = oi.id order by created_at desc limit 1
        ) r on true
       where oi.order_id = ${orderId}
       order by oi.line_number
    `;

    // Tracking events are only fetched for items that actually have a shipment.
    const shipmentIds = [...new Set(rows.map((r) => r.shipment_id).filter((id): id is string => id !== null))];

    const events = shipmentIds.length
      ? await this.db.sql<
        Array<{
          shipment_id: string;
          occurred_at: string;
          normalised_status: string;
          description: string;
          location: string | null;
        }>
      >`
          select shipment_id, occurred_at, normalised_status, description, location
            from fulfillment.tracking_events
           where shipment_id = any(${shipmentIds}::uuid[])
           order by occurred_at desc
        `
      : [];

    return rows.map((row) => ({
      id: row.id,
      itemNumber: row.item_number,
      productId: row.product_id,
      productSlug: row.product_slug ?? '',
      title: row.product_title,
      variantLabel: row.variant_label,
      imageUrl: row.primary_image_url,
      skuCode: row.sku_code,
      sellerId: row.seller_id,
      sellerName: row.seller_name ?? '',
      quantity: row.quantity,
      status: row.status as OrderStatus,
      unitPrice: money(Number(row.unit_selling_price_paise ?? 0)),
      lineTotal: money(Number(row.total_payable_paise ?? 0)),
      promisedDeliveryDate: row.promised_delivery_date,
      deliveredAt: row.delivered_at,
      returnEligibleUntil: row.return_eligible_until,
      returnable:
        row.status === 'DELIVERED' &&
        row.return_type !== 'NON_RETURNABLE' &&
        row.return_eligible_until !== null &&
        new Date(row.return_eligible_until).getTime() >= Date.now(),
      cancellable: CUSTOMER_CANCELLABLE.has(row.status),
      shipment: row.shipment_id
        ? {
          id: row.shipment_id,
          reference: row.shipment_reference ?? '',
          status: row.shipment_status ?? '',
          carrierName: row.carrier_name,
          awbNumber: row.awb_number,
          trackingUrl: null,
          estimatedDeliveryDate: row.estimated_delivery_date,
          events: events
            .filter((e) => e.shipment_id === row.shipment_id)
            .map((e) => ({
              at: e.occurred_at,
              status: e.normalised_status,
              description: e.description,
              location: e.location,
            })),
        }
        : null,
      refundStatus: row.refund_status,
    }));
  }

  private toBreakdown(row: Record<string, string> | undefined): PriceBreakdownDto {
    const n = (key: string): number => Number(row?.[key] ?? 0);
    let appliedRules: PriceBreakdownDto['appliedRules'] = [];
    try {
      appliedRules = row?.['applied_rules'] ? JSON.parse(row['applied_rules']) : [];
    } catch {
      appliedRules = [];
    }

    return {
      itemsSubtotal: money(n('items_gross_paise')),
      sellerDiscount: money(n('seller_discount_paise')),
      platformDiscount: money(n('platform_discount_paise')),
      couponDiscount: money(n('coupon_discount_paise')),
      promotionDiscount: money(n('promotion_discount_paise')),
      bankOfferDiscount: money(n('bank_offer_discount_paise')),
      totalDiscount: money(n('total_discount_paise')),
      shipping: money(n('shipping_paise')),
      codFee: money(n('cod_fee_paise')),
      giftWrap: money(n('gift_wrap_paise')),
      tax: money(n('total_tax_paise')),
      totalPayable: money(n('total_payable_paise')),
      appliedRules,
    };
  }

  private toAddressDto(row: {
    recipient_name: string;
    recipient_phone: string;
    alternate_phone: string | null;
    address_line1: string;
    address_line2: string | null;
    landmark: string | null;
    locality: string | null;
    city: string;
    state_code: string;
    pincode: string;
    delivery_instructions: string | null;
  }): AddressDto {
    return {
      id: '',
      label: 'HOME',
      recipientName: row.recipient_name,
      recipientPhone: row.recipient_phone,
      alternatePhone: row.alternate_phone,
      addressLine1: row.address_line1,
      addressLine2: row.address_line2,
      landmark: row.landmark,
      locality: row.locality,
      city: row.city,
      stateCode: row.state_code,
      pincode: row.pincode,
      countryCode: 'IN',
      isDefault: false,
      deliveryInstructions: row.delivery_instructions,
    };
  }

  private encodeCursor(placedAt: string, id: string): string {
    return Buffer.from(JSON.stringify({ placedAt, id }), 'utf8').toString('base64url');
  }

  private decodeCursor(cursor?: string): { placedAt: string; id: string } | null {
    if (!cursor) return null;
    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      return typeof parsed?.placedAt === 'string' && typeof parsed?.id === 'string' ? parsed : null;
    } catch {
      // A malformed cursor restarts from the top rather than 500ing.
      return null;
    }
  }
}
