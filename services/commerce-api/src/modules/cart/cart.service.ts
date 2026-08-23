import { Injectable } from '@nestjs/common';
import { money } from '@novamart/domain';
import type { CartDto, CartIssueDto, CartItemDto, CartSellerGroupDto } from '@novamart/types';
import { AppError } from '../../common/errors/app-error';
import { RequestContext } from '../../common/context/request-context';
import { DatabaseService } from '../../infrastructure/database/database.service';

/**
 * A cart line joined to the live sellable-listing view. Everything prefixed `live_`
 * is current truth; `displayed_*` is what the customer was last shown.
 */
interface CartLineRow {
  id: string;
  listing_id: string;
  sku_id: string;
  quantity: number;
  displayed_price_paise: string;
  displayed_mrp_paise: string;
  product_id: string | null;
  product_slug: string | null;
  product_title: string | null;
  variant_label: string | null;
  seller_id: string | null;
  seller_name: string | null;
  live_price_paise: string | null;
  live_mrp_paise: string | null;
  available_quantity: number | null;
  min_order_quantity: number | null;
  max_order_quantity: number | null;
  image_url: string | null;
  /** Null when the listing is no longer sellable at all. */
  is_sellable: boolean;
}

type Availability = CartItemDto['availabilityStatus'];

/**
 * The cart.
 *
 * Cart prices are advisory (brief §26). Every read re-derives availability and price
 * from catalog.v_sellable_listings and reports drift as an issue rather than silently
 * repricing, so the customer is never surprised at checkout — and checkout revalidates
 * again regardless.
 */
@Injectable()
export class CartService {
  constructor(private readonly db: DatabaseService) { }

  /** Resolves the caller's active cart, creating one on first use. */
  async ensureCart(): Promise<string> {
    const principal = RequestContext.requirePrincipal();

    const [existing] = await this.db.sql<Array<{ id: string }>>`
      select id from commerce.carts
       where user_id = ${principal.userId} and status = 'ACTIVE'
    `;
    if (existing) return existing.id;

    // The partial unique index on (user_id) WHERE status='ACTIVE' is what actually
    // prevents two carts under concurrency; DO NOTHING lets the loser re-read.
    const created = await this.db.sql<Array<{ id: string }>>`
      insert into commerce.carts (user_id, status)
      values (${principal.userId}, 'ACTIVE')
      on conflict (user_id) where (user_id is not null and status = 'ACTIVE') do nothing
      returning id
    `;
    if (created[0]) return created[0].id;

    const [raced] = await this.db.sql<Array<{ id: string }>>`
      select id from commerce.carts
       where user_id = ${principal.userId} and status = 'ACTIVE'
    `;
    if (!raced) throw new AppError('INTERNAL_ERROR', 'Could not open a cart');
    return raced.id;
  }

  async getCart(): Promise<CartDto> {
    const principal = RequestContext.requirePrincipal();
    const cartId = await this.ensureCart();

    const [cart] = await this.db.sql<
      Array<{
        id: string;
        delivery_pincode: string | null;
        applied_coupon_code: string | null;
      }>
    >`
      select id, delivery_pincode, applied_coupon_code
        from commerce.carts where id = ${cartId}
    `;
    if (!cart) throw AppError.notFound('Cart');

    const lines = await this.loadLines(cartId);
    const saved = await this.loadSavedForLater(principal.userId);

    const issues: CartIssueDto[] = [];
    const items: CartItemDto[] = [];

    for (const line of lines) {
      const { item, issue } = this.project(line);
      items.push(item);
      if (issue) issues.push(issue);
    }

    // Group by seller: this is how the order will actually split and ship.
    const groups = new Map<string, CartSellerGroupDto>();
    for (const item of items) {
      const key = item.sellerId;
      if (!groups.has(key)) {
        groups.set(key, {
          sellerId: item.sellerId,
          sellerName: item.sellerName,
          items: [],
          subtotal: money(0),
        });
      }
      groups.get(key)!.items.push(item);
    }
    for (const group of groups.values()) {
      const subtotal = group.items
        .filter((i) => i.availabilityStatus !== 'OUT_OF_STOCK')
        .reduce((acc, i) => acc + i.lineTotal.paise, 0);
      group.subtotal = money(subtotal);
    }

    const subtotal = items
      .filter((i) => i.availabilityStatus !== 'OUT_OF_STOCK')
      .reduce((acc, i) => acc + i.lineTotal.paise, 0);

    return {
      id: cart.id,
      itemsCount: items.length,
      subtotal: money(subtotal),
      deliveryPincode: cart.delivery_pincode,
      appliedCouponCode: cart.applied_coupon_code,
      sellerGroups: [...groups.values()],
      savedForLater: saved,
      issues,
    };
  }

  async addItem(input: {
    listingId: string;
    quantity: number;
    flashSaleItemId?: string;
  }): Promise<CartDto> {
    const cartId = await this.ensureCart();

    // Read the listing through the sellable view: this rejects suppressed listings,
    // suspended sellers and archived products in one predicate.
    const [listing] = await this.db.sql<
      Array<{
        listing_id: string;
        sku_id: string;
        seller_id: string;
        mrp_paise: string;
        selling_price_paise: string;
        available_quantity: number;
        min_order_quantity: number;
        max_order_quantity: number;
      }>
    >`
      select listing_id, sku_id, seller_id, mrp_paise, selling_price_paise,
             available_quantity, min_order_quantity, max_order_quantity
        from catalog.v_sellable_listings
       where listing_id = ${input.listingId}
    `;

    if (!listing) throw new AppError('LISTING_NOT_SELLABLE');

    const existing = await this.db.sql<Array<{ quantity: number }>>`
      select quantity from commerce.cart_items
       where cart_id = ${cartId} and listing_id = ${input.listingId}
    `;

    const desired = (existing[0]?.quantity ?? 0) + input.quantity;

    if (desired > listing.max_order_quantity) {
      throw AppError.validation([
        {
          field: 'quantity',
          issue: `You can order at most ${listing.max_order_quantity} of this item`,
        },
      ]);
    }
    if (desired > listing.available_quantity) {
      throw new AppError('INVENTORY_UNAVAILABLE', `Only ${listing.available_quantity} left in stock`);
    }

    // Capture the price the customer is being shown, so drift is detectable later.
    await this.db.sql`
      insert into commerce.cart_items (
        cart_id, listing_id, sku_id, seller_id, quantity,
        displayed_price_paise, displayed_mrp_paise, available_quantity, flash_sale_item_id
      ) values (
        ${cartId}, ${listing.listing_id}, ${listing.sku_id}, ${listing.seller_id},
        ${input.quantity}, ${listing.selling_price_paise}, ${listing.mrp_paise},
        ${listing.available_quantity}, ${input.flashSaleItemId ?? null}
      )
      on conflict (cart_id, listing_id) do update
        set quantity              = commerce.cart_items.quantity + excluded.quantity,
            displayed_price_paise = excluded.displayed_price_paise,
            displayed_mrp_paise   = excluded.displayed_mrp_paise,
            available_quantity    = excluded.available_quantity,
            price_captured_at     = now()
    `;

    await this.touch(cartId);
    return this.getCart();
  }

  /** Quantity 0 removes the line, which is what a stepper control expects. */
  async updateItem(cartItemId: string, quantity: number): Promise<CartDto> {
    const cartId = await this.ensureCart();

    if (quantity === 0) return this.removeItem(cartItemId);

    const [line] = await this.db.sql<Array<{ listing_id: string }>>`
      select listing_id from commerce.cart_items
       where id = ${cartItemId} and cart_id = ${cartId}
    `;
    if (!line) throw AppError.notFound('Cart item');

    const [listing] = await this.db.sql<
      Array<{ available_quantity: number; max_order_quantity: number }>
    >`
      select available_quantity, max_order_quantity
        from catalog.v_sellable_listings where listing_id = ${line.listing_id}
    `;
    if (!listing) throw new AppError('LISTING_NOT_SELLABLE');

    if (quantity > listing.max_order_quantity) {
      throw AppError.validation([
        {
          field: 'quantity',
          issue: `You can order at most ${listing.max_order_quantity} of this item`,
        },
      ]);
    }
    if (quantity > listing.available_quantity) {
      throw new AppError('INVENTORY_UNAVAILABLE', `Only ${listing.available_quantity} left in stock`);
    }

    await this.db.sql`
      update commerce.cart_items
         set quantity = ${quantity}, available_quantity = ${listing.available_quantity}
       where id = ${cartItemId} and cart_id = ${cartId}
    `;

    await this.touch(cartId);
    return this.getCart();
  }

  async removeItem(cartItemId: string): Promise<CartDto> {
    const cartId = await this.ensureCart();

    const removed = await this.db.sql`
      delete from commerce.cart_items
       where id = ${cartItemId} and cart_id = ${cartId}
      returning id
    `;
    if (removed.length === 0) throw AppError.notFound('Cart item');

    await this.touch(cartId);
    return this.getCart();
  }

  /**
   * Validates and records a coupon on the cart. The discount is NOT computed here:
   * the cart only remembers the intent, and checkout is the single place that prices
   * it. Two implementations of coupon maths is how the displayed total and the charged
   * total drift apart.
   */
  async applyCoupon(code: string): Promise<CartDto> {
    const principal = RequestContext.requirePrincipal();
    const cartId = await this.ensureCart();

    const [coupon] = await this.db.sql<
      Array<{
        id: string;
        code: string;
        min_cart_value_paise: string;
        total_usage_limit: number | null;
        usage_count: number;
        per_user_limit: number;
        first_order_only: boolean;
        issued_to_user_id: string | null;
      }>
    >`
      select id, code, min_cart_value_paise, total_usage_limit, usage_count,
             per_user_limit, first_order_only, issued_to_user_id
        from pricing.coupons
       where code = ${code}
         and is_active
         and starts_at <= now()
         and ends_at   >= now()
    `;

    if (!coupon) throw new AppError('COUPON_INVALID');

    // A personally issued coupon must not be usable by anyone else.
    if (coupon.issued_to_user_id && coupon.issued_to_user_id !== principal.userId) {
      throw new AppError('COUPON_INVALID');
    }

    if (coupon.total_usage_limit !== null && coupon.usage_count >= coupon.total_usage_limit) {
      throw new AppError('COUPON_LIMIT_REACHED');
    }

    const [redemptions] = await this.db.sql<Array<{ count: string }>>`
      select count(*)::text as count
        from pricing.coupon_redemptions
       where coupon_id = ${coupon.id}
         and user_id = ${principal.userId}
         and status <> 'REVERSED'
    `;
    if (Number(redemptions?.count ?? 0) >= coupon.per_user_limit) {
      throw new AppError('COUPON_LIMIT_REACHED');
    }

    if (coupon.first_order_only) {
      const [profile] = await this.db.sql<Array<{ lifetime_order_count: number }>>`
        select lifetime_order_count from identity.profiles where id = ${principal.userId}
      `;
      if ((profile?.lifetime_order_count ?? 0) > 0) {
        throw new AppError('PROMOTION_NOT_APPLICABLE', 'This coupon is for first orders only');
      }
    }

    const [totals] = await this.db.sql<Array<{ subtotal_paise: string }>>`
      select coalesce(sum(quantity * displayed_price_paise), 0)::text as subtotal_paise
        from commerce.cart_items where cart_id = ${cartId}
    `;
    if (Number(totals?.subtotal_paise ?? 0) < Number(coupon.min_cart_value_paise)) {
      throw new AppError(
        'PROMOTION_NOT_APPLICABLE',
        `Add more items to use ${coupon.code}`,
      );
    }

    await this.db.sql`
      update commerce.carts set applied_coupon_code = ${coupon.code} where id = ${cartId}
    `;

    return this.getCart();
  }

  async removeCoupon(): Promise<CartDto> {
    const cartId = await this.ensureCart();
    await this.db.sql`
      update commerce.carts set applied_coupon_code = null where id = ${cartId}
    `;
    return this.getCart();
  }

  async setPincode(pincode: string): Promise<CartDto> {
    const cartId = await this.ensureCart();
    await this.db.sql`
      update commerce.carts set delivery_pincode = ${pincode} where id = ${cartId}
    `;
    return this.getCart();
  }

  async saveForLater(cartItemId: string): Promise<CartDto> {
    const principal = RequestContext.requirePrincipal();
    const cartId = await this.ensureCart();

    await this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [line] = await tx<
        Array<{ listing_id: string; sku_id: string; quantity: number }>
      >`
        delete from commerce.cart_items
         where id = ${cartItemId} and cart_id = ${cartId}
        returning listing_id, sku_id, quantity
      `;
      if (!line) throw AppError.notFound('Cart item');

      await tx`
        insert into commerce.saved_for_later (user_id, listing_id, sku_id, quantity)
        values (${principal.userId}, ${line.listing_id}, ${line.sku_id}, ${line.quantity})
        on conflict (user_id, listing_id) do update set quantity = excluded.quantity
      `;
    });

    return this.getCart();
  }

  async moveToCart(savedItemId: string): Promise<CartDto> {
    const principal = RequestContext.requirePrincipal();

    const [saved] = await this.db.sql<Array<{ listing_id: string; quantity: number }>>`
      select listing_id, quantity from commerce.saved_for_later
       where id = ${savedItemId} and user_id = ${principal.userId}
    `;
    if (!saved) throw AppError.notFound('Saved item');

    // Route through addItem so stock and quantity ceilings are enforced identically.
    const result = await this.addItem({
      listingId: saved.listing_id,
      quantity: saved.quantity,
    });

    await this.db.sql`
      delete from commerce.saved_for_later
       where id = ${savedItemId} and user_id = ${principal.userId}
    `;

    return result;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async loadLines(cartId: string): Promise<CartLineRow[]> {
    return this.db.sql<CartLineRow[]>`
      select ci.id, ci.listing_id, ci.sku_id, ci.quantity,
             ci.displayed_price_paise::text as displayed_price_paise,
             ci.displayed_mrp_paise::text   as displayed_mrp_paise,
             vl.product_id, vl.product_slug, vl.product_title, vl.variant_label,
             coalesce(vl.seller_id, ci.seller_id) as seller_id,
             coalesce(vl.seller_name, s.display_name) as seller_name,
             vl.selling_price_paise::text as live_price_paise,
             vl.mrp_paise::text           as live_mrp_paise,
             vl.available_quantity, vl.min_order_quantity, vl.max_order_quantity,
             pm.public_url as image_url,
             (vl.listing_id is not null) as is_sellable
        from commerce.cart_items ci
        left join catalog.v_sellable_listings vl on vl.listing_id = ci.listing_id
        left join seller.sellers s on s.id = ci.seller_id
        left join lateral (
          select public_url
            from catalog.product_media m
           where m.product_id = vl.product_id
             and m.moderation_status = 'APPROVED'
           order by m.is_primary desc, m.display_order
           limit 1
        ) pm on true
       where ci.cart_id = ${cartId}
       order by ci.added_at
    `;
  }

  private async loadSavedForLater(userId: string): Promise<CartItemDto[]> {
    const rows = await this.db.sql<CartLineRow[]>`
      select sfl.id, sfl.listing_id, sfl.sku_id, sfl.quantity,
             coalesce(vl.selling_price_paise, 0)::text as displayed_price_paise,
             coalesce(vl.mrp_paise, 0)::text           as displayed_mrp_paise,
             vl.product_id, vl.product_slug, vl.product_title, vl.variant_label,
             vl.seller_id, vl.seller_name,
             vl.selling_price_paise::text as live_price_paise,
             vl.mrp_paise::text           as live_mrp_paise,
             vl.available_quantity, vl.min_order_quantity, vl.max_order_quantity,
             pm.public_url as image_url,
             (vl.listing_id is not null) as is_sellable
        from commerce.saved_for_later sfl
        left join catalog.v_sellable_listings vl on vl.listing_id = sfl.listing_id
        left join lateral (
          select public_url
            from catalog.product_media m
           where m.product_id = vl.product_id
             and m.moderation_status = 'APPROVED'
           order by m.is_primary desc, m.display_order
           limit 1
        ) pm on true
       where sfl.user_id = ${userId}
       order by sfl.saved_at desc
       limit 50
    `;
    return rows.map((row) => this.project(row).item);
  }

  /**
   * Projects a line to its DTO and, where current truth differs from what the customer
   * was shown, the issue explaining it. `blocking` marks issues that must be resolved
   * before checkout can proceed.
   */
  private project(row: CartLineRow): { item: CartItemDto; issue: CartIssueDto | null } {
    const displayedPrice = Number(row.displayed_price_paise);
    const displayedMrp = Number(row.displayed_mrp_paise);
    const livePrice = row.live_price_paise === null ? null : Number(row.live_price_paise);
    const liveMrp = row.live_mrp_paise === null ? null : Number(row.live_mrp_paise);
    const available = row.available_quantity ?? 0;

    let status: Availability = 'AVAILABLE';
    let issue: CartIssueDto | null = null;

    if (!row.is_sellable) {
      status = 'LISTING_INACTIVE';
      issue = {
        cartItemId: row.id,
        code: 'LISTING_INACTIVE',
        message: 'This item is no longer available',
        blocking: true,
      };
    } else if (available <= 0) {
      status = 'OUT_OF_STOCK';
      issue = {
        cartItemId: row.id,
        code: 'OUT_OF_STOCK',
        message: 'This item is out of stock',
        blocking: true,
      };
    } else if (available < row.quantity) {
      status = 'QUANTITY_LIMITED';
      issue = {
        cartItemId: row.id,
        code: 'QUANTITY_LIMITED',
        message: `Only ${available} left; reduce the quantity to continue`,
        blocking: true,
      };
    } else if (livePrice !== null && livePrice !== displayedPrice) {
      // Price drift is surfaced but never blocking: the customer simply sees the new
      // price, and checkout will charge it.
      status = 'PRICE_CHANGED';
      issue = {
        cartItemId: row.id,
        code: 'PRICE_CHANGED',
        message:
          livePrice > displayedPrice
            ? 'The price of this item has increased'
            : 'Good news — the price of this item has dropped',
        blocking: false,
      };
    } else if (available <= 5) {
      status = 'LOW_STOCK';
    }

    // Always show current truth where we have it.
    const price = livePrice ?? displayedPrice;
    const mrp = liveMrp ?? displayedMrp;

    return {
      item: {
        id: row.id,
        listingId: row.listing_id,
        skuId: row.sku_id,
        productId: row.product_id ?? '',
        productSlug: row.product_slug ?? '',
        title: row.product_title ?? 'Unavailable item',
        variantLabel: row.variant_label,
        imageUrl: row.image_url,
        sellerId: row.seller_id ?? '',
        sellerName: row.seller_name ?? 'Unknown seller',
        quantity: row.quantity,
        maxQuantity: row.max_order_quantity ?? row.quantity,
        mrp: money(mrp),
        price: money(price),
        lineTotal: money(price * row.quantity),
        availabilityStatus: status,
        availableQuantity: row.available_quantity,
        estimatedDeliveryDate: null,
      },
      issue,
    };
  }

  private async touch(cartId: string): Promise<void> {
    await this.db.sql`
      update commerce.carts set last_activity_at = now() where id = ${cartId}
    `;
  }
}
