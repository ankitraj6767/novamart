import { Injectable, Logger } from '@nestjs/common';
import {
  computePricing,
  money,
  type BankOfferInput,
  type CouponInput,
  type PricingLineInput,
  type PricingResult,
  type PromotionInput,
} from '@novamart/domain';
import type {
  CheckoutItemDto,
  CheckoutQuoteDto,
  CheckoutSellerGroupDto,
  CodDecision,
  PaymentMethod,
  PriceBreakdownDto,
} from '@novamart/types';
import type { z } from 'zod';
import type { startCheckoutSchema, updateCheckoutSchema } from '@novamart/validation';
import { AppError } from '../../common/errors/app-error';
import { RequestContext } from '../../common/context/request-context';
import { DatabaseService, type Tx } from '../../infrastructure/database/database.service';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';
import { PaymentProviderRegistry } from '../../infrastructure/providers/payment/payment-provider.registry';
import { SettingsService } from '../platform/settings.service';

type StartInput = z.infer<typeof startCheckoutSchema>;
type UpdateInput = z.infer<typeof updateCheckoutSchema>;

/** A line resolved to a concrete listing, warehouse and reservation. */
interface ResolvedLine {
  lineKey: string;
  listingId: string;
  skuId: string;
  productId: string;
  sellerId: string;
  sellerName: string;
  quantity: number;
  unitMrpPaise: number;
  unitSellingPricePaise: number;
  hsnCode: string | null;
  gstRate: number;
  cessRate: number;
  productTitle: string;
  variantLabel: string | null;
  skuCode: string;
  brandName: string | null;
  imageUrl: string | null;
  categoryId: string;
  brandId: string | null;
  fulfillmentModel: string;
  handlingTimeDays: number;
  weightGrams: number;
  returnWindowDays: number;
  returnType: string;
  isReplacementAllowed: boolean;
  codAllowed: boolean;
  warehouseId: string;
  warehouseStateCode: string;
  reservationId: string | null;
  promisedDeliveryDate: string | null;
  carrierId: string | null;
  zoneCode: string | null;
  validationStatus: string;
  validationMessage: string | null;
}

interface AddressRow {
  id: string;
  recipient_name: string;
  recipient_phone: string;
  alternate_phone: string | null;
  address_line1: string;
  address_line2: string | null;
  landmark: string | null;
  locality: string | null;
  city: string;
  district: string | null;
  state_code: string;
  pincode: string;
  delivery_instructions: string | null;
}

/**
 * The checkout engine (brief §30).
 *
 * This is the only place an order comes into existence, and it is deliberately the
 * most conservative code in the platform:
 *
 *  - nothing priced by the client is trusted; every amount is re-derived here
 *  - inventory is reserved under a row lock by inventory.reserve_stock before an
 *    order exists, so two concurrent checkouts cannot both win the last unit
 *  - the price the customer acknowledged is compared against the recomputed total, and
 *    a mismatch aborts rather than silently charging a different amount
 *  - the order, its items, the price snapshot, the reservation confirmation and the
 *    domain events all commit in ONE transaction with the outbox (ADR 0005)
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: OutboxService,
    private readonly settings: SettingsService,
    private readonly providers: PaymentProviderRegistry,
  ) { }

  /**
   * Opens a checkout session: validates the cart, picks fulfillment nodes, reserves
   * stock and returns the authoritative quote.
   */
  async start(input: StartInput): Promise<CheckoutQuoteDto> {
    const principal = RequestContext.requirePrincipal();
    const ctx = RequestContext.get();

    const requestedLines = input.listingId
      ? [{ listingId: input.listingId, quantity: input.quantity ?? 1 }]
      : await this.loadCartLines(input.cartId);

    if (requestedLines.length === 0) throw new AppError('CART_EMPTY');

    const address = await this.resolveAddress(
      input.shippingAddressId,
      input.deliveryPincode ?? null,
    );
    const pincode = address?.pincode ?? input.deliveryPincode ?? null;
    if (!pincode) {
      throw AppError.validation([
        { field: 'shippingAddressId', issue: 'A delivery address or pincode is required' },
      ]);
    }

    await this.assertServiceable(pincode);

    const cartId = input.listingId ? null : (input.cartId ?? (await this.activeCartId()));
    const couponCode = cartId ? await this.cartCouponCode(cartId) : null;

    const sessionId = await this.db.transaction(
      RequestContext.sessionContext(),
      async (tx) => {
        // Abandon any prior open session for this user and give its stock back
        // immediately, rather than leaving it held until the sweeper runs.
        await this.abandonOpenSessions(tx, principal.userId);

        const [session] = await tx<Array<{ id: string }>>`
          insert into commerce.checkout_sessions (
            user_id, cart_id, status, shipping_address_id, billing_address_id,
            shipping_address_snapshot, delivery_pincode,
            client_platform, client_version, ip_address, request_id, trace_id
          ) values (
            ${principal.userId}, ${cartId}, 'INITIATED', ${address?.id ?? null},
            ${address?.id ?? null},
            ${address ? tx.json(this.addressSnapshot(address) as never) : null},
            ${pincode}, ${ctx?.platform ?? null}, ${ctx?.appVersion ?? null},
            ${ctx?.ip ?? null}::inet, ${ctx?.requestId ?? null}, ${ctx?.traceId ?? null}
          )
          returning id
        `;
        return session!.id;
      },
    );

    await this.rebuild(sessionId, {
      requestedLines,
      couponCode,
      paymentMethod: null,
      reserve: true,
    });

    return this.quote(sessionId);
  }

  /**
   * Applies a change (address, payment method, coupon) and reprices. Reservations are
   * kept: the items did not change, only how they are paid for or where they go.
   */
  async update(sessionId: string, input: UpdateInput): Promise<CheckoutQuoteDto> {
    const principal = RequestContext.requirePrincipal();
    const session = await this.loadSession(sessionId, principal.userId);

    // Anything before PAYMENT_PENDING is still editable. Once payment is in flight or
    // the session is closed, repricing it would move the amount under the customer.
    const editable = new Set([
      'INITIATED',
      'ADDRESS_SELECTED',
      'DELIVERY_SELECTED',
      'OFFERS_APPLIED',
    ]);
    if (!editable.has(session.status)) {
      throw new AppError('CHECKOUT_SESSION_EXPIRED', 'This checkout can no longer be changed');
    }

    let address: AddressRow | null = null;
    if (input.shippingAddressId) {
      address = await this.resolveAddress(input.shippingAddressId, null);
      if (!address) throw AppError.notFound('Address');
      await this.assertServiceable(address.pincode);
    }

    await this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      await tx`
        update commerce.checkout_sessions
           set shipping_address_id       = coalesce(${address?.id ?? null}, shipping_address_id),
               billing_address_id        = coalesce(${input.billingAddressId ?? null}, billing_address_id),
               shipping_address_snapshot = coalesce(
                 ${address ? tx.json(this.addressSnapshot(address) as never) : null},
                 shipping_address_snapshot),
               delivery_pincode          = coalesce(${address?.pincode ?? null}, delivery_pincode),
               payment_method            = coalesce(${input.paymentMethod ?? null}, payment_method),
               is_gift                   = coalesce(${input.isGift ?? null}, is_gift),
               gift_message              = coalesce(${input.giftMessage ?? null}, gift_message)
         where id = ${sessionId}
      `;
    });

    // A coupon explicitly set to null clears it; undefined leaves it alone.
    const couponCode =
      input.couponCode === undefined
        ? await this.sessionCouponCode(sessionId)
        : input.couponCode;

    const existing = await this.loadSessionItems(sessionId);

    await this.rebuild(sessionId, {
      requestedLines: existing.map((i) => ({ listingId: i.listing_id, quantity: i.quantity })),
      couponCode,
      paymentMethod: input.paymentMethod ?? session.payment_method ?? null,
      // Address changes can move the fulfillment node, so stock must be re-held.
      reserve: address !== null,
    });

    return this.quote(sessionId);
  }

  /**
   * Reads back the stored quote. Cheap: everything was computed and persisted by
   * rebuild(), so this never reprices and never disagrees with what was reserved.
   */
  async quote(sessionId: string): Promise<CheckoutQuoteDto> {
    const principal = RequestContext.requirePrincipal();
    const session = await this.loadSession(sessionId, principal.userId);
    const items = await this.loadSessionItems(sessionId);

    const [snapshot] = await this.db.sql<
      Array<{ breakdown: PricingResult; total_payable_paise: string }>
    >`
      select breakdown, total_payable_paise::text as total_payable_paise
        from commerce.checkout_price_snapshots
       where checkout_session_id = ${sessionId}
       order by revision desc
       limit 1
    `;

    const promise = (session.delivery_promise ?? {}) as Record<
      string,
      { promisedDeliveryDate: string | null; warehouseId: string | null; shippingPaise: number }
    >;

    const groups = new Map<string, CheckoutSellerGroupDto>();
    for (const item of items) {
      if (!groups.has(item.seller_id)) {
        const perSeller = promise[item.seller_id];
        groups.set(item.seller_id, {
          sellerId: item.seller_id,
          sellerName: item.seller_name ?? 'Seller',
          items: [],
          subtotal: money(0),
          shipping: money(perSeller?.shippingPaise ?? 0),
          promisedDeliveryDate: perSeller?.promisedDeliveryDate ?? null,
          warehouseId: item.warehouse_id,
        });
      }
      const group = groups.get(item.seller_id)!;
      group.items.push(this.toCheckoutItem(item));
      group.subtotal = money(group.subtotal.paise + Number(item.line_total_paise));
    }

    const issues = items
      .filter((i) => i.validation_status !== 'VALID')
      .map((i) => ({
        cartItemId: i.listing_id,
        code: i.validation_status,
        message: i.validation_message ?? 'This item cannot be ordered',
        blocking: true,
      }));

    return {
      checkoutSessionId: session.id,
      expiresAt: session.expires_at,
      status: session.status,
      shippingAddressId: session.shipping_address_id,
      deliveryPincode: session.delivery_pincode,
      paymentMethod: session.payment_method as PaymentMethod | null,
      breakdown: this.toBreakdownDto(session, snapshot?.breakdown ?? null),
      sellerGroups: [...groups.values()],
      cod: session.cod_decision
        ? {
          decision: session.cod_decision as CodDecision,
          prepayAmount:
            session.cod_prepay_paise === null ? null : money(Number(session.cod_prepay_paise)),
          reasons: session.cod_decision_reasons ?? [],
        }
        : null,
      appliedCoupon:
        session.applied_coupon_id && Number(session.coupon_discount_paise) > 0
          ? {
            code: (await this.sessionCouponCode(sessionId)) ?? '',
            discount: money(Number(session.coupon_discount_paise)),
          }
          : null,
      availableOffers: [],
      issues,
      payable: issues.length === 0 && Number(session.total_payable_paise) > 0,
    };
  }

  /**
   * Converts a priced session into an order (brief §30 steps 13-17).
   *
   * Everything here commits together: the order, its items, both price snapshots, the
   * reservation confirmation, the coupon redemption, the payment intent and the domain
   * events. A partial commit is the one outcome that must be impossible — an order with
   * unconfirmed stock, or stock consumed with no order, both require manual repair.
   */
  async placeOrder(input: {
    checkoutSessionId: string;
    acknowledgedTotalPaise: number;
    paymentMethod: PaymentMethod;
    upiVpa?: string;
    emiTenureMonths?: number;
    savedInstrumentId?: string;
  }): Promise<{ orderId: string; orderNumber: string; paymentIntentId: string | null; isCod: boolean }> {
    const principal = RequestContext.requirePrincipal();
    const ctx = RequestContext.get();

    const tolerance =
      (await this.settings.number('checkout.price_change_tolerance_paise', 0)) ?? 0;

    return this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      // Lock the session row: two taps on "Pay" must not both create an order.
      const [session] = await tx<SessionRow[]>`
        select id, user_id, cart_id, status, shipping_address_id, billing_address_id,
               shipping_address_snapshot, delivery_pincode, payment_method,
               items_subtotal_paise::text      as items_subtotal_paise,
               seller_discount_paise::text     as seller_discount_paise,
               platform_discount_paise::text   as platform_discount_paise,
               coupon_discount_paise::text     as coupon_discount_paise,
               promotion_discount_paise::text  as promotion_discount_paise,
               bank_offer_discount_paise::text as bank_offer_discount_paise,
               shipping_paise::text            as shipping_paise,
               cod_fee_paise::text             as cod_fee_paise,
               gift_wrap_paise::text           as gift_wrap_paise,
               tax_paise::text                 as tax_paise,
               total_payable_paise::text       as total_payable_paise,
               applied_coupon_id, applied_rules, cod_decision,
               cod_prepay_paise::text as cod_prepay_paise,
               cod_decision_reasons, delivery_promise, order_id, is_gift, gift_message,
               expires_at, completed_at
          from commerce.checkout_sessions
         where id = ${input.checkoutSessionId} and user_id = ${principal.userId}
           for update
      `;

      if (!session) throw AppError.notFound('Checkout session');

      // Idempotent by state: a retry after a successful placement returns the order
      // rather than creating a second one.
      if (session.order_id) {
        const [existing] = await tx<Array<{ order_number: string }>>`
          select order_number from commerce.orders where id = ${session.order_id}
        `;
        const [intent] = await tx<Array<{ id: string }>>`
          select id from payments.payment_intents where order_id = ${session.order_id}
          order by created_at desc limit 1
        `;
        return {
          orderId: session.order_id,
          orderNumber: existing?.order_number ?? '',
          paymentIntentId: intent?.id ?? null,
          isCod: session.payment_method === 'COD',
        };
      }

      if (new Date(session.expires_at).getTime() < Date.now()) {
        throw new AppError('CHECKOUT_SESSION_EXPIRED');
      }
      // OFFERS_APPLIED is the state rebuild() leaves a fully priced, unblocked session
      // in. Placing from any other state would mean pricing the order from something
      // other than the quote the customer confirmed.
      if (session.status !== 'OFFERS_APPLIED') {
        throw new AppError(
          'VALIDATION_FAILED',
          'This checkout is not ready to be placed; refresh the quote',
        );
      }
      if (!session.delivery_pincode || !session.shipping_address_snapshot) {
        throw new AppError('ADDRESS_INVALID', 'A delivery address is required');
      }

      // The client echoes the amount it displayed. A mismatch means the price moved
      // between quote and confirmation, and the customer must see the new total rather
      // than be charged silently (brief §100).
      const authoritative = Number(session.total_payable_paise);
      if (Math.abs(authoritative - input.acknowledgedTotalPaise) > tolerance) {
        throw new AppError(
          'PRICE_CHANGED',
          'The total has changed since you reviewed it. Please check the new amount.',
          { context: { acknowledged: input.acknowledgedTotalPaise, authoritative } },
        );
      }

      if (input.paymentMethod !== session.payment_method) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Payment method does not match the priced quote; refresh the quote',
        );
      }

      const isCod = input.paymentMethod === 'COD';
      if (isCod && session.cod_decision === 'COD_BLOCKED') {
        throw new AppError('COD_NOT_AVAILABLE');
      }

      const items = await this.loadSessionItems(input.checkoutSessionId);
      if (items.length === 0) throw new AppError('CART_EMPTY');

      const blocked = items.filter((i) => i.validation_status !== 'VALID');
      if (blocked.length > 0) {
        throw new AppError('CART_ITEM_UNAVAILABLE', 'Some items are no longer available');
      }

      // Reservations must still be held. If the sweeper reclaimed them while the
      // customer was on the payment page, the stock is genuinely gone.
      const reservationIds = items
        .map((i) => i.reservation_id)
        .filter((id): id is string => id !== null);

      if (reservationIds.length !== items.length) {
        throw new AppError('INVENTORY_UNAVAILABLE', 'Stock is no longer held for this order');
      }

      const [held] = await tx<Array<{ count: string }>>`
        select count(*)::text as count
          from inventory.inventory_reservations
         where id = any(${reservationIds}::uuid[])
           and status = 'ACTIVE'
           and expires_at > now()
      `;
      if (Number(held?.count ?? 0) !== reservationIds.length) {
        throw new AppError('RESERVATION_EXPIRED', 'Your reservation expired; please try again');
      }

      const snapshot = (await tx<Array<{ breakdown: PricingResult }>>`
        select breakdown from commerce.checkout_price_snapshots
         where checkout_session_id = ${input.checkoutSessionId}
         order by revision desc limit 1
      `)[0]?.breakdown;

      if (!snapshot) throw new AppError('INTERNAL_ERROR', 'Price snapshot missing');

      const promise = (session.delivery_promise ?? {}) as Record<
        string,
        { promisedDeliveryDate: string | null }
      >;
      const promisedDates = Object.values(promise)
        .map((p) => p.promisedDeliveryDate)
        .filter((d): d is string => d !== null)
        .sort();

      // 1. The order.
      const [order] = await tx<Array<{ id: string; order_number: string }>>`
        insert into commerce.orders (
          user_id, checkout_session_id, status, currency,
          items_count, units_count, sellers_count,
          items_subtotal_paise, total_discount_paise, shipping_paise, cod_fee_paise,
          tax_paise, total_payable_paise, payment_method, payment_status, is_cod,
          applied_coupon_id, applied_coupon_code, delivery_pincode, promised_delivery_date,
          is_gift, gift_message, client_platform, client_version, placed_from_ip,
          request_id, trace_id
        ) values (
          ${principal.userId}, ${input.checkoutSessionId},
          ${isCod ? 'CONFIRMED' : 'PENDING_PAYMENT'}, 'INR',
          ${items.length},
          ${items.reduce((a, i) => a + i.quantity, 0)},
          ${new Set(items.map((i) => i.seller_id)).size},
          ${session.items_subtotal_paise},
          ${snapshot.totalDiscountPaise},
          ${session.shipping_paise}, ${session.cod_fee_paise}, ${session.tax_paise},
          ${session.total_payable_paise}, ${input.paymentMethod},
          ${isCod ? 'COD_PENDING' : 'PENDING'}, ${isCod},
          ${session.applied_coupon_id},
          ${await this.sessionCouponCode(input.checkoutSessionId)},
          ${session.delivery_pincode}, ${promisedDates.at(-1) ?? null},
          ${session.is_gift}, ${session.gift_message},
          ${ctx?.platform ?? null}, ${ctx?.appVersion ?? null}, ${ctx?.ip ?? null}::inet,
          ${ctx?.requestId ?? null}, ${ctx?.traceId ?? null}
        )
        returning id, order_number
      `;

      const orderId = order!.id;

      // 2. Address snapshot. The order must never re-read identity.addresses: the
      //    customer may edit or delete it, and delivery history has to stay truthful.
      const addr = session.shipping_address_snapshot as Record<string, string | null>;
      await tx`
        insert into commerce.order_addresses (
          order_id, address_type, source_address_id, recipient_name, recipient_phone,
          alternate_phone, address_line1, address_line2, landmark, locality, city,
          district, state_code, pincode, delivery_instructions
        ) values (
          ${orderId}, 'SHIPPING', ${addr['sourceAddressId']}, ${addr['recipientName']},
          ${addr['recipientPhone']}, ${addr['alternatePhone']}, ${addr['addressLine1']},
          ${addr['addressLine2']}, ${addr['landmark']}, ${addr['locality']},
          ${addr['city']}, ${addr['district']}, ${addr['stateCode']}, ${addr['pincode']},
          ${addr['deliveryInstructions']}
        )
      `;

      // 3. Order items and their per-item price + commission snapshot.
      const orderItemIds: Array<{ id: string; reservationId: string; sellerId: string; skuId: string; warehouseId: string | null }> = [];

      for (const [index, item] of items.entries()) {
        const priced = snapshot.lines.find((l) => l.listingId === item.listing_id);
        if (!priced) throw new AppError('INTERNAL_ERROR', 'Priced line missing from snapshot');

        const policy = await tx<
          Array<{ return_window_days: number | null; return_type: string | null }>
        >`
          select return_window_days, return_type
            from catalog.resolve_category_policy(${item.category_id})
        `;

        const sellerPromise = promise[item.seller_id];

        const [orderItem] = await tx<Array<{ id: string }>>`
          insert into commerce.order_items (
            order_id, line_number, listing_id, sku_id, product_id, seller_id,
            warehouse_id, reservation_id, product_title, variant_label, sku_code,
            brand_name, primary_image_url, hsn_code, quantity, status,
            fulfillment_model, return_window_days, return_type, is_replacement_allowed,
            promised_delivery_date
          ) values (
            ${orderId}, ${index + 1}, ${item.listing_id}, ${item.sku_id},
            ${item.product_id}, ${item.seller_id}, ${item.warehouse_id},
            ${item.reservation_id}, ${item.product_title}, ${item.variant_label},
            ${item.sku_code}, ${item.brand_name}, ${item.image_url}, ${item.hsn_code},
            ${item.quantity}, ${isCod ? 'CONFIRMED' : 'CREATED'},
            ${item.fulfillment_model ?? 'SELLER_FULFILLED'},
            ${policy[0]?.return_window_days ?? 0},
            ${policy[0]?.return_type ?? 'NON_RETURNABLE'},
            ${(policy[0]?.return_type ?? '') === 'REPLACEMENT_ONLY'},
            ${sellerPromise?.promisedDeliveryDate ?? null}
          )
          returning id
        `;

        // Commission is resolved and frozen at order time. Recomputing it later from
        // current rules would rewrite what the seller was told they would earn.
        const [commission] = await tx<
          Array<{
            rule_id: string | null;
            commission_paise: string;
            commission_percentage: string;
            closing_fee_paise: string;
            fulfillment_fee_paise: string;
            payment_gateway_fee_percentage: string;
            commission_gst_rate: string;
          }>
        >`
          select rule_id,
                 commission_paise::text               as commission_paise,
                 commission_percentage::text          as commission_percentage,
                 closing_fee_paise::text              as closing_fee_paise,
                 fulfillment_fee_paise::text          as fulfillment_fee_paise,
                 payment_gateway_fee_percentage::text as payment_gateway_fee_percentage,
                 commission_gst_rate::text            as commission_gst_rate
            from pricing.resolve_commission(
              ${item.seller_id}, ${item.category_id}, ${item.product_id},
              ${item.brand_id}, ${priced.totalPayablePaise},
              ${item.fulfillment_model ?? 'SELLER_FULFILLED'}, current_date
            )
        `;

        const commissionPaise = Number(commission?.commission_paise ?? 0);
        const commissionGstRate = Number(commission?.commission_gst_rate ?? 0);
        const commissionGst = Math.round((commissionPaise * commissionGstRate) / 100);
        const closingFee = Number(commission?.closing_fee_paise ?? 0);
        const fulfillmentFee = Number(commission?.fulfillment_fee_paise ?? 0);
        const pgFeePct = Number(commission?.payment_gateway_fee_percentage ?? 0);
        const pgFee = Math.round((priced.totalPayablePaise * pgFeePct) / 100);
        const sellerPayable =
          priced.totalPayablePaise -
          commissionPaise -
          commissionGst -
          closingFee -
          fulfillmentFee -
          pgFee;

        await tx`
          insert into commerce.order_item_price_breakdowns (
            order_item_id, order_id, quantity, unit_mrp_paise, unit_selling_price_paise,
            gross_paise, seller_discount_paise, platform_discount_paise,
            coupon_discount_paise, promotion_discount_paise, bank_offer_discount_paise,
            total_discount_paise, shipping_paise, cod_fee_paise, gift_wrap_paise,
            taxable_value_paise, gst_rate, cgst_paise, sgst_paise, igst_paise, cess_paise,
            total_tax_paise, is_intra_state, place_of_supply_state_code,
            total_payable_paise, commission_rule_id, commission_rate, commission_paise,
            commission_gst_paise, payment_gateway_fee_paise, fulfillment_fee_paise,
            platform_fee_paise, seller_payable_paise, applied_rules
          ) values (
            ${orderItem!.id}, ${orderId}, ${priced.quantity}, ${priced.unitMrpPaise},
            ${priced.unitSellingPricePaise}, ${priced.grossPaise},
            -- seller_discount_paise is 0 by construction: gross_paise is the selling
            -- price x quantity, so the MRP gap is already applied. The gap remains
            -- derivable from unit_mrp_paise - unit_selling_price_paise, and including it
            -- here would break breakdown_total_closes by discounting twice.
            0, ${priced.platformDiscountPaise},
            ${priced.couponDiscountPaise}, ${priced.promotionDiscountPaise},
            ${priced.bankOfferDiscountPaise}, ${priced.totalDiscountPaise},
            ${priced.shippingPaise}, ${priced.codFeePaise}, ${priced.giftWrapPaise},
            ${priced.taxableValuePaise}, ${priced.gstRate}, ${priced.cgstPaise},
            ${priced.sgstPaise}, ${priced.igstPaise}, ${priced.cessPaise},
            ${priced.totalTaxPaise}, ${priced.isIntraState},
            ${priced.placeOfSupplyStateCode}, ${priced.totalPayablePaise},
            ${commission?.rule_id ?? null}, ${commission?.commission_percentage ?? null},
            ${commissionPaise}, ${commissionGst}, ${pgFee}, ${fulfillmentFee},
            ${closingFee}, ${sellerPayable},
            ${tx.json(snapshot.appliedRules as never)}
          )
        `;

        orderItemIds.push({
          id: orderItem!.id,
          reservationId: item.reservation_id!,
          sellerId: item.seller_id,
          skuId: item.sku_id,
          warehouseId: item.warehouse_id,
        });
      }

      // 4. Order-level breakdown.
      await tx`
        insert into commerce.order_price_breakdowns (
          order_id, items_gross_paise, seller_discount_paise, platform_discount_paise,
          coupon_discount_paise, promotion_discount_paise, bank_offer_discount_paise,
          total_discount_paise, shipping_paise, cod_fee_paise, gift_wrap_paise,
          taxable_value_paise, cgst_paise, sgst_paise, igst_paise, cess_paise,
          total_tax_paise, total_payable_paise, rounding_adjustment_paise, applied_rules
        ) values (
          ${orderId}, ${snapshot.itemsGrossPaise},
          -- Same reasoning as the per-item breakdown: the MRP gap is not a discount off
          -- the gross, because the gross is built from the selling price.
          0,
          ${snapshot.platformDiscountPaise}, ${snapshot.couponDiscountPaise},
          ${snapshot.promotionDiscountPaise}, ${snapshot.bankOfferDiscountPaise},
          ${snapshot.totalDiscountPaise}, ${snapshot.shippingPaise},
          ${snapshot.codFeePaise}, ${snapshot.giftWrapPaise},
          ${snapshot.taxableValuePaise}, ${snapshot.cgstPaise}, ${snapshot.sgstPaise},
          ${snapshot.igstPaise}, ${snapshot.cessPaise}, ${snapshot.totalTaxPaise},
          ${snapshot.totalPayablePaise}, ${snapshot.roundingAdjustmentPaise},
          ${tx.json(snapshot.appliedRules as never)}
        )
      `;

      // 5. Bind the holds to the order and point each item at its own reservation.
      await tx`
        select inventory.confirm_reservations(${reservationIds}::uuid[], ${orderId})
      `;
      for (const item of orderItemIds) {
        await tx`
          update inventory.inventory_reservations
             set order_item_id = ${item.id}
           where id = ${item.reservationId}
        `;
      }

      // 6. Coupon redemption. The UNIQUE (coupon_id, order_id) constraint is what makes
      //    double-counting impossible under a retry.
      if (session.applied_coupon_id && Number(session.coupon_discount_paise) > 0) {
        await tx`
          insert into pricing.coupon_redemptions (coupon_id, user_id, order_id, discount_paise)
          values (${session.applied_coupon_id}, ${principal.userId}, ${orderId},
                  ${session.coupon_discount_paise})
          on conflict (coupon_id, order_id) do nothing
        `;
        await tx`
          update pricing.coupons set usage_count = usage_count + 1
           where id = ${session.applied_coupon_id}
        `;
      }

      // 7. Payment intent. COD has no provider handoff, but still gets an intent so
      //    collection and remittance reconcile through the same ledger.
      const [intent] = await tx<Array<{ id: string }>>`
        insert into payments.payment_intents (
          order_id, user_id, checkout_session_id, provider, currency, amount_paise,
          payment_method, status, idempotency_key, request_id, trace_id
        ) values (
          ${orderId}, ${principal.userId}, ${input.checkoutSessionId},
          -- payment_intents_cod_provider requires provider='COD' exactly when the method
          -- is COD. For prepaid, record the provider that is actually active rather than
          -- assuming one, so a webhook is verified by the adapter that signed it.
          ${isCod ? 'COD' : this.providers.activeDbCode()}, 'INR',
          ${session.total_payable_paise},
          ${input.paymentMethod}, ${isCod ? 'AUTHORISED' : 'CREATED'},
          ${`order:${orderId}`}, ${ctx?.requestId ?? null}, ${ctx?.traceId ?? null}
        )
        returning id
      `;

      // 8. Close the session and the cart.
      await tx`
        update commerce.checkout_sessions
           set status = 'COMPLETED', order_id = ${orderId}, completed_at = now()
         where id = ${input.checkoutSessionId}
      `;

      if (session.cart_id) {
        await tx`
          update commerce.carts
             set status = 'CONVERTED', converted_order_id = ${orderId}
           where id = ${session.cart_id}
        `;
        await tx`delete from commerce.cart_items where cart_id = ${session.cart_id}`;
      }

      // 9. Events, in the same transaction as everything above.
      await this.outbox.emit(tx, 'ORDER_CREATED', {
        orderId,
        orderNumber: order!.order_number,
        userId: principal.userId,
        totalPayablePaise: Number(session.total_payable_paise),
        paymentMethod: input.paymentMethod,
        isCod,
        itemCount: items.length,
        sellerIds: [...new Set(items.map((i) => i.seller_id))],
        deliveryPincode: session.delivery_pincode,
      });

      // A cash order is confirmed the moment it is placed; a prepaid one waits for the
      // provider's verified webhook.
      if (isCod) {
        await this.outbox.emit(tx, 'ORDER_CONFIRMED', {
          orderId,
          orderNumber: order!.order_number,
          userId: principal.userId,
          paymentIntentId: intent!.id,
          totalPayablePaise: Number(session.total_payable_paise),
          items: orderItemIds.map((i) => ({
            orderItemId: i.id,
            sellerId: i.sellerId,
            skuId: i.skuId,
            warehouseId: i.warehouseId,
            quantity: items.find((x) => x.reservation_id === i.reservationId)?.quantity ?? 1,
            reservationId: i.reservationId,
          })),
        });
      }

      return {
        orderId,
        orderNumber: order!.order_number,
        paymentIntentId: intent!.id,
        isCod,
      };
    });
  }

  // -------------------------------------------------------------------------
  // The repricing core
  // -------------------------------------------------------------------------

  /**
   * Re-derives everything for a session: listing validity, fulfillment node, delivery
   * promise, shipping, tax, discounts and the COD decision. Persists the session
   * totals, the items and an immutable price snapshot revision.
   */
  private async rebuild(
    sessionId: string,
    options: {
      requestedLines: Array<{ listingId: string; quantity: number }>;
      couponCode: string | null;
      paymentMethod: string | null;
      reserve: boolean;
    },
  ): Promise<void> {
    const principal = RequestContext.requirePrincipal();
    const session = await this.loadSession(sessionId, principal.userId);
    const pincode = session.delivery_pincode;
    if (!pincode) throw new AppError('ADDRESS_INVALID', 'Delivery pincode is not set');

    const destination = await this.pincodeInfo(pincode);
    const isCod = (options.paymentMethod ?? session.payment_method) === 'COD';

    // 1. Resolve each requested line against live, sellable truth.
    const resolved = await this.resolveLines(options.requestedLines, pincode, isCod);
    if (resolved.length === 0) throw new AppError('CART_EMPTY');

    const blocking = resolved.filter((l) => l.validationStatus !== 'VALID');

    // 2. Reserve stock for the valid lines. Under the row lock in reserve_stock, only
    //    one of two concurrent checkouts for the last unit can succeed.
    const reservable = resolved.filter((l) => l.validationStatus === 'VALID');

    await this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      // Repricing rewrites commerce.checkout_items, so any hold already taken for this
      // session has to be carried across. Changing the payment method must not silently
      // drop the stock the customer is holding — that surfaced as "stock is no longer
      // held" at place-order time, after a perfectly good quote.
      const existingHolds = new Map<string, string>();
      if (!options.reserve) {
        const rows = await tx<Array<{ listing_id: string; reservation_id: string | null }>>`
          select ci.listing_id, ci.reservation_id
            from commerce.checkout_items ci
            join inventory.inventory_reservations r on r.id = ci.reservation_id
           where ci.checkout_session_id = ${sessionId}
             and r.status = 'ACTIVE'
             and r.expires_at > now()
        `;
        for (const row of rows) {
          if (row.reservation_id) existingHolds.set(row.listing_id, row.reservation_id);
        }
      }

      if (options.reserve && reservable.length > 0) {
        await this.releaseSessionReservations(tx, sessionId, 'REPLACED');

        const reservations = await tx<Array<{ id: string; sku_id: string; warehouse_id: string }>>`
          select id, sku_id, warehouse_id
            from inventory.reserve_stock(
              ${tx.json(
          reservable.map((l) => ({
            sku_id: l.skuId,
            warehouse_id: l.warehouseId,
            seller_id: l.sellerId,
            listing_id: l.listingId,
            quantity: l.quantity,
          })) as never,
        )},
              ${sessionId},
              null,
              ${principal.userId},
              ${await this.reservationTtl()}::interval,
              ${`checkout:${sessionId}`}
            )
        `;

        for (const line of reservable) {
          const match = reservations.find(
            (r) => r.sku_id === line.skuId && r.warehouse_id === line.warehouseId,
          );
          line.reservationId = match?.id ?? null;
        }
      } else {
        for (const line of resolved) {
          line.reservationId = existingHolds.get(line.listingId) ?? null;
        }
      }

      // 3. Shipping per seller, from the resolved warehouse and carrier.
      const shippingBySeller = await this.computeShipping(tx, reservable, destination, isCod);

      // 4. Discounts. Loaded here, applied by the pure pricing engine.
      const promotions = await this.loadPromotions(tx, reservable);
      const coupon = options.couponCode
        ? await this.loadCoupon(tx, options.couponCode, principal.userId, reservable)
        : null;
      const bankOffer = null as BankOfferInput | null;

      const freeShippingThreshold = await this.settings.number(
        'commerce.free_shipping_threshold_paise',
        null,
      );

      const codFee = isCod ? await this.settings.number('payment.cod_fee_paise', 0) : 0;

      const pricing = computePricing({
        lines: reservable.map<PricingLineInput>((l) => ({
          lineKey: l.lineKey,
          listingId: l.listingId,
          skuId: l.skuId,
          sellerId: l.sellerId,
          quantity: l.quantity,
          unitMrpPaise: l.unitMrpPaise,
          unitSellingPricePaise: l.unitSellingPricePaise,
          hsnCode: l.hsnCode,
          gstRate: l.gstRate,
          cessRate: l.cessRate,
          supplyStateCode: l.warehouseStateCode,
        })),
        customerStateCode: destination.state_code,
        promotions,
        coupon,
        bankOffer,
        shippingBySeller,
        freeShippingThresholdPaise: freeShippingThreshold,
        codFeePaise: codFee ?? 0,
        giftWrapPaise: 0,
        roundToWholeRupee: isCod,
      });

      // 5. COD eligibility, decided against the real payable amount.
      const cod = isCod
        ? await this.assessCod(tx, {
          sessionId,
          userId: principal.userId,
          pincode,
          destination,
          amountPaise: pricing.totalPayablePaise,
          lines: reservable,
        })
        : null;

      // 6. Persist items, session totals and the snapshot.
      await tx`delete from commerce.checkout_items where checkout_session_id = ${sessionId}`;

      for (const line of resolved) {
        const priced = pricing.lines.find((p) => p.lineKey === line.lineKey);
        await tx`
          insert into commerce.checkout_items (
            checkout_session_id, listing_id, sku_id, seller_id, warehouse_id,
            reservation_id, quantity, mrp_paise, selling_price_paise, line_total_paise,
            validation_status, validation_message
          ) values (
            ${sessionId}, ${line.listingId}, ${line.skuId}, ${line.sellerId},
            ${line.warehouseId || null}, ${line.reservationId},
            ${line.quantity}, ${line.unitMrpPaise}, ${line.unitSellingPricePaise},
            ${priced?.totalPayablePaise ?? line.unitSellingPricePaise * line.quantity},
            ${line.validationStatus}, ${line.validationMessage}
          )
        `;
      }

      const deliveryPromise = Object.fromEntries(
        [...new Set(reservable.map((l) => l.sellerId))].map((sellerId) => {
          const lines = reservable.filter((l) => l.sellerId === sellerId);
          // The seller's promise is the latest across their items: the parcel is only
          // complete when the slowest item is ready.
          const dates = lines
            .map((l) => l.promisedDeliveryDate)
            .filter((d): d is string => d !== null)
            .sort();
          return [
            sellerId,
            {
              promisedDeliveryDate: dates.at(-1) ?? null,
              warehouseId: lines[0]?.warehouseId ?? null,
              shippingPaise: shippingBySeller[sellerId] ?? 0,
              carrierId: lines[0]?.carrierId ?? null,
              zoneCode: lines[0]?.zoneCode ?? null,
            },
          ];
        }),
      );

      await tx`
        update commerce.checkout_sessions
           set status                    = ${blocking.length > 0 ? 'INITIATED' : 'OFFERS_APPLIED'},
               items_subtotal_paise      = ${pricing.itemsGrossPaise},
               seller_discount_paise     = ${pricing.sellerDiscountPaise},
               platform_discount_paise   = ${pricing.platformDiscountPaise},
               coupon_discount_paise     = ${pricing.couponDiscountPaise},
               promotion_discount_paise  = ${pricing.promotionDiscountPaise},
               bank_offer_discount_paise = ${pricing.bankOfferDiscountPaise},
               shipping_paise            = ${pricing.shippingPaise},
               cod_fee_paise             = ${pricing.codFeePaise},
               gift_wrap_paise           = ${pricing.giftWrapPaise},
               tax_paise                 = ${pricing.totalTaxPaise},
               total_payable_paise       = ${pricing.totalPayablePaise},
               applied_coupon_id         = ${coupon?.id ?? null},
               applied_rules             = ${tx.json(pricing.appliedRules as never)},
               payment_method            = ${options.paymentMethod ?? session.payment_method},
               cod_decision              = ${cod?.decision ?? null},
               cod_prepay_paise          = ${cod?.prepayAmountPaise ?? null},
               cod_decision_reasons      = ${cod?.reasons ?? []},
               delivery_promise          = ${tx.json(deliveryPromise as never)}
         where id = ${sessionId}
      `;

      // Snapshot revisions are append-only, so a dispute can be answered with exactly
      // what the customer was quoted at each step.
      await tx`
        insert into commerce.checkout_price_snapshots (
          checkout_session_id, revision, breakdown, total_payable_paise
        )
        select ${sessionId},
               coalesce(max(revision), 0) + 1,
               ${tx.json(pricing as never)},
               ${pricing.totalPayablePaise}
          from commerce.checkout_price_snapshots
         where checkout_session_id = ${sessionId}
      `;

      if (blocking.length === 0) {
        await this.outbox.emit(tx, 'CHECKOUT_STARTED', {
          checkoutSessionId: sessionId,
          userId: principal.userId,
          cartId: session.cart_id,
          itemCount: reservable.length,
          subtotalPaise: pricing.itemsGrossPaise,
        });
      }
    });
  }

  /**
   * Resolves requested lines against live truth and picks a fulfillment node for each.
   * A line that cannot be satisfied is kept with a validation status rather than
   * dropped, so the UI can explain precisely what went wrong.
   */
  private async resolveLines(
    requested: Array<{ listingId: string; quantity: number }>,
    pincode: string,
    isCod: boolean,
  ): Promise<ResolvedLine[]> {
    const listingIds = requested.map((r) => r.listingId);

    const rows = await this.db.sql<
      Array<{
        listing_id: string;
        sku_id: string;
        product_id: string;
        seller_id: string;
        seller_name: string;
        mrp_paise: string;
        selling_price_paise: string;
        available_quantity: number;
        min_order_quantity: number;
        max_order_quantity: number;
        fulfillment_model: string;
        handling_time_days: number;
        product_title: string;
        variant_label: string | null;
        sku_code: string;
        category_id: string;
        brand_id: string | null;
        brand_name: string | null;
        hsn_code: string | null;
        gst_rate: string | null;
        weight_grams: number | null;
        volumetric_weight_grams: number | null;
        image_url: string | null;
        cod_allowed: boolean | null;
        return_window_days: number | null;
        is_replacement_allowed: boolean | null;
      }>
    >`
      select vl.listing_id, vl.sku_id, vl.product_id, vl.seller_id, vl.seller_name,
             vl.mrp_paise::text as mrp_paise,
             vl.selling_price_paise::text as selling_price_paise,
             vl.available_quantity, vl.min_order_quantity, vl.max_order_quantity,
             vl.fulfillment_model, vl.handling_time_days,
             vl.product_title, vl.variant_label, vl.sku_code,
             vl.category_id, vl.brand_id, b.name as brand_name,
             vl.hsn_code, vl.gst_rate::text as gst_rate,
             vl.weight_grams, vl.volumetric_weight_grams,
             pm.public_url as image_url,
             sl.cod_allowed, sl.return_window_days, sl.is_replacement_allowed
        from catalog.v_sellable_listings vl
        join catalog.seller_listings sl on sl.id = vl.listing_id
        left join catalog.brands b on b.id = vl.brand_id
        left join lateral (
          select public_url from catalog.product_media m
           where m.product_id = vl.product_id and m.moderation_status = 'APPROVED'
           order by m.is_primary desc, m.display_order limit 1
        ) pm on true
       where vl.listing_id = any(${listingIds}::uuid[])
    `;

    const byListing = new Map(rows.map((r) => [r.listing_id, r]));
    const resolved: ResolvedLine[] = [];

    for (const [index, request] of requested.entries()) {
      const row = byListing.get(request.listingId);

      if (!row) {
        // Keep a placeholder so the quote can report which item died.
        resolved.push(this.unavailableLine(index, request, 'LISTING_INACTIVE', 'This item is no longer available'));
        continue;
      }

      const gstRate = Number(row.gst_rate ?? 0);
      const resolvedGst = await this.resolveGst(row.hsn_code, Number(row.selling_price_paise), gstRate);

      const base: ResolvedLine = {
        lineKey: `L${index}`,
        listingId: row.listing_id,
        skuId: row.sku_id,
        productId: row.product_id,
        sellerId: row.seller_id,
        sellerName: row.seller_name,
        quantity: request.quantity,
        unitMrpPaise: Number(row.mrp_paise),
        unitSellingPricePaise: Number(row.selling_price_paise),
        hsnCode: row.hsn_code,
        gstRate: resolvedGst.gstRate,
        cessRate: resolvedGst.cessRate,
        productTitle: row.product_title,
        variantLabel: row.variant_label,
        skuCode: row.sku_code,
        brandName: row.brand_name,
        imageUrl: row.image_url,
        categoryId: row.category_id,
        brandId: row.brand_id,
        fulfillmentModel: row.fulfillment_model,
        handlingTimeDays: row.handling_time_days,
        weightGrams: Math.max(row.weight_grams ?? 0, row.volumetric_weight_grams ?? 0) || 500,
        returnWindowDays: row.return_window_days ?? 0,
        returnType: 'REFUND',
        isReplacementAllowed: row.is_replacement_allowed ?? false,
        codAllowed: row.cod_allowed ?? true,
        warehouseId: '',
        warehouseStateCode: '',
        reservationId: null,
        promisedDeliveryDate: null,
        carrierId: null,
        zoneCode: null,
        validationStatus: 'VALID',
        validationMessage: null,
      };

      if (request.quantity > row.max_order_quantity) {
        resolved.push({
          ...base,
          validationStatus: 'QUANTITY_LIMITED',
          validationMessage: `At most ${row.max_order_quantity} per order`,
        });
        continue;
      }

      if (row.available_quantity < request.quantity) {
        resolved.push({
          ...base,
          validationStatus: 'OUT_OF_STOCK',
          validationMessage:
            row.available_quantity <= 0
              ? 'Out of stock'
              : `Only ${row.available_quantity} left`,
        });
        continue;
      }

      if (isCod && row.cod_allowed === false) {
        resolved.push({
          ...base,
          validationStatus: 'COD_NOT_AVAILABLE',
          validationMessage: 'Cash on delivery is not available for this item',
        });
        continue;
      }

      // Pick the node that can actually ship it to this pincode.
      const node = await this.selectFulfillmentNode({
        skuId: row.sku_id,
        sellerId: row.seller_id,
        quantity: request.quantity,
        pincode,
        isCod,
        handlingDays: row.handling_time_days,
      });

      if (!node) {
        resolved.push({
          ...base,
          validationStatus: 'NOT_SERVICEABLE',
          validationMessage: 'We cannot deliver this item to your pincode',
        });
        continue;
      }

      resolved.push({
        ...base,
        warehouseId: node.warehouseId,
        warehouseStateCode: node.stateCode,
        promisedDeliveryDate: node.promisedDate,
        carrierId: node.carrierId,
        zoneCode: node.zoneCode,
      });
    }

    return resolved;
  }

  private unavailableLine(
    index: number,
    request: { listingId: string; quantity: number },
    status: string,
    message: string,
  ): ResolvedLine {
    return {
      lineKey: `L${index}`,
      listingId: request.listingId,
      skuId: '00000000-0000-0000-0000-000000000000',
      productId: '00000000-0000-0000-0000-000000000000',
      sellerId: '00000000-0000-0000-0000-000000000000',
      sellerName: 'Unavailable',
      quantity: request.quantity,
      unitMrpPaise: 0,
      unitSellingPricePaise: 0,
      hsnCode: null,
      gstRate: 0,
      cessRate: 0,
      productTitle: 'Unavailable item',
      variantLabel: null,
      skuCode: '',
      brandName: null,
      imageUrl: null,
      categoryId: '00000000-0000-0000-0000-000000000000',
      brandId: null,
      fulfillmentModel: 'SELLER_FULFILLED',
      handlingTimeDays: 1,
      weightGrams: 0,
      returnWindowDays: 0,
      returnType: 'NON_RETURNABLE',
      isReplacementAllowed: false,
      codAllowed: false,
      warehouseId: '',
      warehouseStateCode: '',
      reservationId: null,
      promisedDeliveryDate: null,
      carrierId: null,
      zoneCode: null,
      validationStatus: status,
      validationMessage: message,
    };
  }

  /**
   * Fulfillment node selection (brief §82). Candidate warehouses are those with enough
   * uncommitted stock, ordered by allocation priority; the first one the delivery
   * promise engine says is serviceable wins.
   */
  private async selectFulfillmentNode(input: {
    skuId: string;
    sellerId: string;
    quantity: number;
    pincode: string;
    isCod: boolean;
    handlingDays: number;
  }): Promise<{
    warehouseId: string;
    stateCode: string;
    promisedDate: string | null;
    carrierId: string | null;
    zoneCode: string | null;
  } | null> {
    const candidates = await this.db.sql<
      Array<{ warehouse_id: string; state_code: string }>
    >`
      select wi.warehouse_id, w.state_code
        from inventory.warehouse_inventory wi
        join inventory.warehouses w on w.id = wi.warehouse_id
       where wi.sku_id = ${input.skuId}
         and wi.seller_id = ${input.sellerId}
         and wi.available_quantity >= ${input.quantity}
         and w.is_active
         and w.accepts_new_orders
       order by w.allocation_priority, wi.available_quantity desc
       limit 5
    `;

    for (const candidate of candidates) {
      const [promise] = await this.db.sql<
        Array<{
          promised_date: string | null;
          carrier_id: string | null;
          zone_code: string | null;
          is_serviceable: boolean;
        }>
      >`
        select promised_date, carrier_id, zone_code, is_serviceable
          from fulfillment.calculate_delivery_promise(
            ${candidate.warehouse_id}, ${input.pincode}, ${input.isCod},
            ${input.handlingDays}::smallint, now()
          )
      `;

      if (promise?.is_serviceable) {
        return {
          warehouseId: candidate.warehouse_id,
          stateCode: candidate.state_code,
          promisedDate: promise.promised_date,
          carrierId: promise.carrier_id,
          zoneCode: promise.zone_code,
        };
      }
    }

    return null;
  }

  /** Shipping per seller: one parcel per seller, charged on total chargeable weight. */
  private async computeShipping(
    tx: Tx,
    lines: ResolvedLine[],
    destination: { zone_code: string; state_code: string },
    isCod: boolean,
  ): Promise<Record<string, number>> {
    const result: Record<string, number> = {};

    for (const sellerId of new Set(lines.map((l) => l.sellerId))) {
      const sellerLines = lines.filter((l) => l.sellerId === sellerId);
      const weight = sellerLines.reduce((acc, l) => acc + l.weightGrams * l.quantity, 0);
      const declaredValue = sellerLines.reduce(
        (acc, l) => acc + l.unitSellingPricePaise * l.quantity,
        0,
      );
      const carrierId = sellerLines.find((l) => l.carrierId)?.carrierId ?? null;

      if (!carrierId) {
        result[sellerId] = 0;
        continue;
      }

      const [card] = await tx<Array<{ id: string }>>`
        select id from fulfillment.carrier_rate_cards
         where carrier_id = ${carrierId}
           and direction = 'FORWARD'
           and is_active
           and effective_from <= current_date
           and (effective_to is null or effective_to >= current_date)
         order by effective_from desc
         limit 1
      `;

      if (!card) {
        result[sellerId] = 0;
        continue;
      }

      const [charge] = await tx<Array<{ total_paise: string }>>`
        select total_paise::text as total_paise
          from fulfillment.calculate_shipping_charge(
            ${card.id}, ${destination.zone_code}, ${weight}, ${declaredValue}, ${isCod}
          )
      `;

      result[sellerId] = Number(charge?.total_paise ?? 0);
    }

    return result;
  }

  /**
   * The COD engine (brief §36). Rules-based and explainable: every refusal records the
   * signals behind it so support can answer "why can't I pay cash?".
   */
  private async assessCod(
    tx: Tx,
    input: {
      sessionId: string;
      userId: string;
      pincode: string;
      destination: { cod_available: boolean; cod_limit_paise: string | null };
      amountPaise: number;
      lines: ResolvedLine[];
    },
  ): Promise<{ decision: CodDecision; prepayAmountPaise: number | null; reasons: string[] }> {
    const reasons: string[] = [];
    let decision: CodDecision = 'COD_ALLOWED';
    let prepay: number | null = null;

    const [profile] = await tx<
      Array<{ risk_tier: string; lifetime_order_count: number }>
    >`
      select risk_tier, lifetime_order_count from identity.profiles where id = ${input.userId}
    `;

    // COD is gated by a feature flag so it can be killed platform-wide in an incident
    // without a deployment, and by configured ceilings.
    const codEnabled = await this.settings.isEnabled('COD_ENABLED', input.userId);
    const codMax = await this.settings.number('payment.cod_max_order_value_paise', null);
    const prepayThreshold = await this.settings.number('payment.cod_prepay_threshold_paise', null);
    const prepayPercentage = await this.settings.number(
      'payment.cod_partial_prepay_percentage',
      20,
    );

    if (!codEnabled) {
      decision = 'COD_BLOCKED';
      reasons.push('COD_DISABLED_PLATFORM');
    }

    if (!input.destination.cod_available) {
      decision = 'COD_BLOCKED';
      reasons.push('PINCODE_NO_COD');
    }

    const pincodeLimit =
      input.destination.cod_limit_paise === null
        ? null
        : Number(input.destination.cod_limit_paise);
    if (pincodeLimit !== null && input.amountPaise > pincodeLimit) {
      decision = 'COD_BLOCKED';
      reasons.push('EXCEEDS_PINCODE_COD_LIMIT');
    }

    if (codMax !== null && input.amountPaise > codMax) {
      decision = 'COD_BLOCKED';
      reasons.push('EXCEEDS_PLATFORM_COD_LIMIT');
    }

    if (input.lines.some((l) => !l.codAllowed)) {
      decision = 'COD_BLOCKED';
      reasons.push('ITEM_NOT_COD_ELIGIBLE');
    }

    if (profile?.risk_tier === 'HIGH' || profile?.risk_tier === 'BLOCKED') {
      decision = 'COD_BLOCKED';
      reasons.push('CUSTOMER_RISK_TIER');
    }

    // A high-value cash order from an unproven customer is the classic RTO loss. Take
    // part of it up front rather than refusing the sale outright.
    if (
      decision === 'COD_ALLOWED' &&
      prepayThreshold !== null &&
      input.amountPaise > prepayThreshold &&
      (profile?.lifetime_order_count ?? 0) === 0
    ) {
      decision = 'COD_PARTIAL_PREPAY';
      prepay = Math.min(
        input.amountPaise,
        Math.round((input.amountPaise * (prepayPercentage ?? 20)) / 100),
      );
      reasons.push('FIRST_ORDER_HIGH_VALUE');
    }

    await tx`
      insert into payments.cod_eligibility_decisions (
        user_id, checkout_session_id, decision, prepay_amount_paise, signals,
        reason_codes, cart_value_paise, pincode
      ) values (
        ${input.userId}, ${input.sessionId}, ${decision}, ${prepay},
        ${tx.json({
      riskTier: profile?.risk_tier ?? null,
      lifetimeOrders: profile?.lifetime_order_count ?? 0,
      pincodeLimitPaise: pincodeLimit,
      platformLimitPaise: codMax,
    } as never)},
        ${reasons}, ${input.amountPaise}, ${input.pincode}
      )
    `;

    return { decision, prepayAmountPaise: prepay, reasons };
  }

  // -------------------------------------------------------------------------
  // Loaders
  // -------------------------------------------------------------------------

  private async resolveGst(
    hsnCode: string | null,
    amountPaise: number,
    fallbackRate: number,
  ): Promise<{ gstRate: number; cessRate: number }> {
    if (!hsnCode) return { gstRate: fallbackRate, cessRate: 0 };

    const [row] = await this.db.sql<
      Array<{ gst_rate: string; cess_rate: string; is_exempt: boolean }>
    >`
      select gst_rate::text as gst_rate, cess_rate::text as cess_rate, is_exempt
        from pricing.resolve_gst_rate(${hsnCode}, ${amountPaise}, current_date)
    `;

    if (!row) return { gstRate: fallbackRate, cessRate: 0 };
    return { gstRate: Number(row.gst_rate), cessRate: Number(row.cess_rate ?? 0) };
  }

  private async loadPromotions(tx: Tx, lines: ResolvedLine[]): Promise<PromotionInput[]> {
    if (lines.length === 0) return [];

    const rows = await tx<
      Array<{
        id: string;
        code: string;
        name: string;
        funded_by: string;
        promotion_type: string;
        discount_percentage: string | null;
        discount_paise: string | null;
        max_discount_paise: string | null;
        min_cart_value_paise: string | null;
        is_exclusive: boolean;
        stack_priority: number;
        target_listing_ids: string[] | null;
        target_product_ids: string[] | null;
        target_category_ids: string[] | null;
        target_seller_ids: string[] | null;
      }>
    >`
      select p.id, p.code, p.name, p.funded_by, p.promotion_type,
             p.discount_percentage::text as discount_percentage,
             p.discount_paise::text      as discount_paise,
             p.max_discount_paise::text  as max_discount_paise,
             p.min_cart_value_paise::text as min_cart_value_paise,
             p.is_exclusive, p.stack_priority,
             array_agg(distinct t.listing_id)  filter (where t.listing_id is not null and not t.is_exclusion)  as target_listing_ids,
             array_agg(distinct t.product_id)  filter (where t.product_id is not null and not t.is_exclusion)  as target_product_ids,
             array_agg(distinct t.category_id) filter (where t.category_id is not null and not t.is_exclusion) as target_category_ids,
             array_agg(distinct t.seller_id)   filter (where t.seller_id is not null and not t.is_exclusion)   as target_seller_ids
        from pricing.promotions p
        left join pricing.promotion_targets t on t.promotion_id = p.id
       where p.status = 'ACTIVE'
         and p.starts_at <= now()
         and p.ends_at   >= now()
         and p.promotion_type in ('PERCENTAGE_OFF', 'FLAT_OFF', 'FREE_SHIPPING')
       group by p.id
    `;

    const cartValue = lines.reduce((a, l) => a + l.unitSellingPricePaise * l.quantity, 0);
    const promotions: PromotionInput[] = [];

    for (const row of rows) {
      if (row.min_cart_value_paise && cartValue < Number(row.min_cart_value_paise)) continue;

      // Untargeted promotions apply cart-wide; targeted ones only to matching lines.
      const hasTargets =
        (row.target_listing_ids?.length ?? 0) > 0 ||
        (row.target_product_ids?.length ?? 0) > 0 ||
        (row.target_category_ids?.length ?? 0) > 0 ||
        (row.target_seller_ids?.length ?? 0) > 0;

      const matching = hasTargets
        ? lines.filter(
          (l) =>
            row.target_listing_ids?.includes(l.listingId) ||
            row.target_product_ids?.includes(l.productId) ||
            row.target_category_ids?.includes(l.categoryId) ||
            row.target_seller_ids?.includes(l.sellerId),
        )
        : lines;

      if (matching.length === 0) continue;

      promotions.push({
        id: row.id,
        code: row.code,
        label: row.name,
        fundedBy: row.funded_by as PromotionInput['fundedBy'],
        type: row.promotion_type as PromotionInput['type'],
        ...(row.discount_percentage ? { percentage: Number(row.discount_percentage) } : {}),
        ...(row.discount_paise ? { flatPaise: Number(row.discount_paise) } : {}),
        ...(row.max_discount_paise ? { maxDiscountPaise: Number(row.max_discount_paise) } : {}),
        appliesToLineKeys: hasTargets ? matching.map((l) => l.lineKey) : [],
        isExclusive: row.is_exclusive,
        stackPriority: row.stack_priority,
      });
    }

    return promotions;
  }

  private async loadCoupon(
    tx: Tx,
    code: string,
    userId: string,
    lines: ResolvedLine[],
  ): Promise<CouponInput | null> {
    const [row] = await tx<
      Array<{
        id: string;
        code: string;
        discount_type: string;
        discount_percentage: string | null;
        discount_paise: string | null;
        max_discount_paise: string | null;
        min_cart_value_paise: string;
        seller_id: string | null;
        total_usage_limit: number | null;
        usage_count: number;
        per_user_limit: number;
        issued_to_user_id: string | null;
      }>
    >`
      select id, code, discount_type,
             discount_percentage::text as discount_percentage,
             discount_paise::text      as discount_paise,
             max_discount_paise::text  as max_discount_paise,
             min_cart_value_paise::text as min_cart_value_paise,
             seller_id, total_usage_limit, usage_count, per_user_limit, issued_to_user_id
        from pricing.coupons
       where code = ${code} and is_active and starts_at <= now() and ends_at >= now()
    `;

    if (!row) return null;
    if (row.issued_to_user_id && row.issued_to_user_id !== userId) return null;
    if (row.total_usage_limit !== null && row.usage_count >= row.total_usage_limit) return null;

    const [used] = await tx<Array<{ count: string }>>`
      select count(*)::text as count from pricing.coupon_redemptions
       where coupon_id = ${row.id} and user_id = ${userId} and status <> 'REVERSED'
    `;
    if (Number(used?.count ?? 0) >= row.per_user_limit) return null;

    // A seller-funded coupon must only discount that seller's lines.
    const applicable = row.seller_id
      ? lines.filter((l) => l.sellerId === row.seller_id)
      : lines;
    if (applicable.length === 0) return null;

    return {
      id: row.id,
      code: row.code,
      discountType: row.discount_type as CouponInput['discountType'],
      ...(row.discount_percentage ? { percentage: Number(row.discount_percentage) } : {}),
      ...(row.discount_paise ? { flatPaise: Number(row.discount_paise) } : {}),
      ...(row.max_discount_paise ? { maxDiscountPaise: Number(row.max_discount_paise) } : {}),
      minCartValuePaise: Number(row.min_cart_value_paise),
      appliesToLineKeys: row.seller_id ? applicable.map((l) => l.lineKey) : [],
    };
  }

  private async loadCartLines(
    cartId?: string,
  ): Promise<Array<{ listingId: string; quantity: number }>> {
    const principal = RequestContext.requirePrincipal();

    const rows = await this.db.sql<Array<{ listing_id: string; quantity: number }>>`
      select ci.listing_id, ci.quantity
        from commerce.cart_items ci
        join commerce.carts c on c.id = ci.cart_id
       where c.user_id = ${principal.userId}
         and c.status = 'ACTIVE'
         ${cartId ? this.db.sql`and c.id = ${cartId}` : this.db.sql``}
       order by ci.added_at
    `;

    return rows.map((r) => ({ listingId: r.listing_id, quantity: r.quantity }));
  }

  private async activeCartId(): Promise<string | null> {
    const principal = RequestContext.requirePrincipal();
    const [row] = await this.db.sql<Array<{ id: string }>>`
      select id from commerce.carts
       where user_id = ${principal.userId} and status = 'ACTIVE'
    `;
    return row?.id ?? null;
  }

  private async cartCouponCode(cartId: string): Promise<string | null> {
    const [row] = await this.db.sql<Array<{ applied_coupon_code: string | null }>>`
      select applied_coupon_code from commerce.carts where id = ${cartId}
    `;
    return row?.applied_coupon_code ?? null;
  }

  private async sessionCouponCode(sessionId: string): Promise<string | null> {
    const [row] = await this.db.sql<Array<{ code: string | null }>>`
      select c.code
        from commerce.checkout_sessions s
        left join pricing.coupons c on c.id = s.applied_coupon_id
       where s.id = ${sessionId}
    `;
    return row?.code ?? null;
  }

  async loadSession(sessionId: string, userId: string): Promise<SessionRow> {
    const [row] = await this.db.sql<SessionRow[]>`
      select id, user_id, cart_id, status, shipping_address_id, billing_address_id,
             shipping_address_snapshot, delivery_pincode, payment_method,
             items_subtotal_paise::text      as items_subtotal_paise,
             seller_discount_paise::text     as seller_discount_paise,
             platform_discount_paise::text   as platform_discount_paise,
             coupon_discount_paise::text     as coupon_discount_paise,
             promotion_discount_paise::text  as promotion_discount_paise,
             bank_offer_discount_paise::text as bank_offer_discount_paise,
             shipping_paise::text            as shipping_paise,
             cod_fee_paise::text             as cod_fee_paise,
             gift_wrap_paise::text           as gift_wrap_paise,
             tax_paise::text                 as tax_paise,
             total_payable_paise::text       as total_payable_paise,
             applied_coupon_id, applied_rules, cod_decision,
             cod_prepay_paise::text as cod_prepay_paise,
             cod_decision_reasons, delivery_promise, order_id, is_gift, gift_message,
             expires_at, completed_at
        from commerce.checkout_sessions
       where id = ${sessionId} and user_id = ${userId}
    `;

    if (!row) throw AppError.notFound('Checkout session');
    if (new Date(row.expires_at).getTime() < Date.now() && row.status !== 'COMPLETED') {
      throw new AppError('CHECKOUT_SESSION_EXPIRED');
    }
    return row;
  }

  async loadSessionItems(sessionId: string): Promise<CheckoutItemRow[]> {
    return this.db.sql<CheckoutItemRow[]>`
      select ci.id, ci.listing_id, ci.sku_id, ci.seller_id, ci.warehouse_id,
             ci.reservation_id, ci.quantity,
             ci.mrp_paise::text as mrp_paise,
             ci.selling_price_paise::text as selling_price_paise,
             ci.line_total_paise::text as line_total_paise,
             ci.validation_status, ci.validation_message,
             s.display_name as seller_name,
             p.title as product_title, p.slug as product_slug, p.id as product_id,
             pv.variant_label, sk.sku_code, b.name as brand_name,
             p.hsn_code, p.category_id, p.brand_id,
             sl.fulfillment_model, sl.handling_time_days,
             pm.public_url as image_url
        from commerce.checkout_items ci
        left join seller.sellers s on s.id = ci.seller_id
        left join catalog.skus sk on sk.id = ci.sku_id
        left join catalog.product_variants pv on pv.id = sk.variant_id
        left join catalog.products p on p.id = sk.product_id
        left join catalog.brands b on b.id = p.brand_id
        left join catalog.seller_listings sl on sl.id = ci.listing_id
        left join lateral (
          select public_url from catalog.product_media m
           where m.product_id = p.id and m.moderation_status = 'APPROVED'
           order by m.is_primary desc, m.display_order limit 1
        ) pm on true
       where ci.checkout_session_id = ${sessionId}
       order by ci.created_at
    `;
  }

  private async resolveAddress(
    addressId: string | undefined,
    fallbackPincode: string | null,
  ): Promise<AddressRow | null> {
    const principal = RequestContext.requirePrincipal();

    if (addressId) {
      const [row] = await this.db.sql<AddressRow[]>`
        select id, recipient_name, recipient_phone, alternate_phone, address_line1,
               address_line2, landmark, locality, city, district, state_code, pincode,
               delivery_instructions
          from identity.addresses
         where id = ${addressId} and user_id = ${principal.userId} and deleted_at is null
      `;
      if (!row) throw AppError.notFound('Address');
      return row;
    }

    if (fallbackPincode) return null;

    // Fall back to the customer's default address so a one-tap checkout works.
    const [row] = await this.db.sql<AddressRow[]>`
      select id, recipient_name, recipient_phone, alternate_phone, address_line1,
             address_line2, landmark, locality, city, district, state_code, pincode,
             delivery_instructions
        from identity.addresses
       where user_id = ${principal.userId} and deleted_at is null
       order by is_default desc, updated_at desc
       limit 1
    `;
    return row ?? null;
  }

  private addressSnapshot(address: AddressRow): Record<string, unknown> {
    return {
      sourceAddressId: address.id,
      recipientName: address.recipient_name,
      recipientPhone: address.recipient_phone,
      alternatePhone: address.alternate_phone,
      addressLine1: address.address_line1,
      addressLine2: address.address_line2,
      landmark: address.landmark,
      locality: address.locality,
      city: address.city,
      district: address.district,
      stateCode: address.state_code,
      pincode: address.pincode,
      deliveryInstructions: address.delivery_instructions,
    };
  }

  private async pincodeInfo(pincode: string): Promise<{
    zone_code: string;
    state_code: string;
    cod_available: boolean;
    cod_limit_paise: string | null;
  }> {
    const [row] = await this.db.sql<
      Array<{
        zone_code: string;
        state_code: string;
        cod_available: boolean;
        cod_limit_paise: string | null;
      }>
    >`
      select zone_code, state_code, cod_available, cod_limit_paise::text as cod_limit_paise
        from fulfillment.pincodes where pincode = ${pincode}
    `;
    if (!row) throw new AppError('PINCODE_NOT_SERVICEABLE');
    return row;
  }

  private async assertServiceable(pincode: string): Promise<void> {
    const [row] = await this.db.sql<
      Array<{ is_serviceable: boolean; suspended_until: string | null }>
    >`
      select is_serviceable, suspended_until
        from fulfillment.pincodes where pincode = ${pincode}
    `;
    if (!row || !row.is_serviceable) throw new AppError('PINCODE_NOT_SERVICEABLE');
    if (row.suspended_until && new Date(row.suspended_until).getTime() > Date.now()) {
      throw new AppError('PINCODE_NOT_SERVICEABLE', 'Deliveries to this pincode are paused');
    }
  }

  /**
   * Releases every active hold for a session.
   *
   * The reason is constrained by inventory_reservations_release_reason_check, and it is
   * not cosmetic: operations reads it to tell an expiry sweep apart from an abandoned
   * basket apart from a failed payment.
   */
  async releaseSessionReservations(
    tx: Tx,
    sessionId: string,
    reason: 'REPLACED' | 'CHECKOUT_ABANDONED' | 'PAYMENT_FAILED' | 'ORDER_CANCELLED' = 'REPLACED',
  ): Promise<void> {
    await tx`
      select inventory.release_reservation(id, ${reason})
        from inventory.inventory_reservations
       where checkout_session_id = ${sessionId} and status = 'ACTIVE'
    `;
  }

  private async abandonOpenSessions(tx: Tx, userId: string): Promise<void> {
    const open = await tx<Array<{ id: string }>>`
      select id from commerce.checkout_sessions
       where user_id = ${userId}
         and status in ('INITIATED', 'ADDRESS_SELECTED', 'DELIVERY_SELECTED', 'OFFERS_APPLIED')
         and order_id is null
    `;

    for (const session of open) {
      await this.releaseSessionReservations(tx, session.id, 'CHECKOUT_ABANDONED');
    }

    if (open.length > 0) {
      await tx`
        update commerce.checkout_sessions
           set status = 'ABANDONED'
         where id = any(${open.map((s) => s.id)}::uuid[])
      `;
    }
  }

  /**
   * Reservation hold length, from configuration. Must outlast a realistic payment
   * attempt (UPI collect requests are slow) but not so long that a stalled checkout
   * starves other buyers of stock.
   */
  private async reservationTtl(): Promise<string> {
    const minutes = await this.settings.number('checkout.reservation_ttl_minutes', 20);
    return `${Math.max(5, Math.min(60, minutes ?? 20))} minutes`;
  }

  private toCheckoutItem(row: CheckoutItemRow): CheckoutItemDto {
    return {
      listingId: row.listing_id,
      skuId: row.sku_id,
      title: row.product_title ?? 'Item',
      variantLabel: row.variant_label,
      imageUrl: row.image_url,
      quantity: row.quantity,
      mrp: money(Number(row.mrp_paise)),
      price: money(Number(row.selling_price_paise)),
      lineTotal: money(Number(row.line_total_paise)),
      validationStatus: row.validation_status,
      validationMessage: row.validation_message,
    };
  }

  private toBreakdownDto(session: SessionRow, pricing: PricingResult | null): PriceBreakdownDto {
    return {
      itemsSubtotal: money(Number(session.items_subtotal_paise)),
      sellerDiscount: money(Number(session.seller_discount_paise)),
      platformDiscount: money(Number(session.platform_discount_paise)),
      couponDiscount: money(Number(session.coupon_discount_paise)),
      promotionDiscount: money(Number(session.promotion_discount_paise)),
      bankOfferDiscount: money(Number(session.bank_offer_discount_paise)),
      totalDiscount: money(
        Number(session.coupon_discount_paise) +
        Number(session.promotion_discount_paise) +
        Number(session.bank_offer_discount_paise),
      ),
      shipping: money(Number(session.shipping_paise)),
      codFee: money(Number(session.cod_fee_paise)),
      giftWrap: money(Number(session.gift_wrap_paise)),
      tax: money(Number(session.tax_paise)),
      totalPayable: money(Number(session.total_payable_paise)),
      appliedRules: (pricing?.appliedRules ?? []).map((r) => ({
        kind: r.kind as PriceBreakdownDto['appliedRules'][number]['kind'],
        id: r.id,
        code: r.code,
        label: r.label,
        amountPaise: r.amountPaise,
      })),
    };
  }
}

export interface SessionRow {
  id: string;
  user_id: string;
  cart_id: string | null;
  status: string;
  shipping_address_id: string | null;
  billing_address_id: string | null;
  shipping_address_snapshot: Record<string, unknown> | null;
  delivery_pincode: string | null;
  payment_method: string | null;
  items_subtotal_paise: string;
  seller_discount_paise: string;
  platform_discount_paise: string;
  coupon_discount_paise: string;
  promotion_discount_paise: string;
  bank_offer_discount_paise: string;
  shipping_paise: string;
  cod_fee_paise: string;
  gift_wrap_paise: string;
  tax_paise: string;
  total_payable_paise: string;
  applied_coupon_id: string | null;
  applied_rules: unknown;
  cod_decision: string | null;
  cod_prepay_paise: string | null;
  cod_decision_reasons: string[] | null;
  delivery_promise: Record<string, unknown> | null;
  order_id: string | null;
  is_gift: boolean;
  gift_message: string | null;
  expires_at: string;
  completed_at: string | null;
}

export interface CheckoutItemRow {
  id: string;
  listing_id: string;
  sku_id: string;
  seller_id: string;
  warehouse_id: string | null;
  reservation_id: string | null;
  quantity: number;
  mrp_paise: string;
  selling_price_paise: string;
  line_total_paise: string;
  validation_status: string;
  validation_message: string | null;
  seller_name: string | null;
  product_title: string | null;
  product_slug: string | null;
  product_id: string | null;
  variant_label: string | null;
  sku_code: string | null;
  brand_name: string | null;
  hsn_code: string | null;
  category_id: string | null;
  brand_id: string | null;
  fulfillment_model: string | null;
  handling_time_days: number | null;
  image_url: string | null;
}
