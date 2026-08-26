import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AppError } from '../../common/errors/app-error';
import { RequestContext } from '../../common/context/request-context';
import { DatabaseService } from '../../infrastructure/database/database.service';

@Injectable()
export class CustomerExperienceService {
  constructor(private readonly db: DatabaseService) {}

  async wishlist(): Promise<Record<string, unknown>> {
    const userId = RequestContext.requirePrincipal().userId;
    const [list] = await this.db.sql<Array<Record<string, unknown>>>`
      insert into commerce.wishlists (user_id, name, is_default)
      values (${userId}, 'My Wishlist', true)
      on conflict (user_id) where is_default do update set updated_at = now()
      returning id, name, is_public, share_token, items_count, updated_at
    `;
    const items = await this.db.sql<Array<Record<string, unknown>>>`
      select wi.id, wi.product_id, p.slug, p.title, wi.variant_id, wi.listing_id,
             wi.price_when_added_paise::text, wi.notify_on_price_drop, wi.notify_on_back_in_stock,
             wi.note, wi.added_at, pm.public_url as image_url
        from commerce.wishlist_items wi
        join commerce.wishlists w on w.id = wi.wishlist_id and w.user_id = ${userId} and w.is_default
        join catalog.products p on p.id = wi.product_id
        left join lateral (select public_url from catalog.product_media where product_id = p.id and is_primary and moderation_status = 'APPROVED' limit 1) pm on true
       order by wi.added_at desc
    `;
    return { wishlist: list ?? {}, items };
  }

  async addWishlist(input: {
    productId: string;
    variantId?: string;
    listingId?: string;
    note?: string;
  }): Promise<Record<string, unknown>> {
    const userId = RequestContext.requirePrincipal().userId;
    const [row] = await this.db.sql<Array<Record<string, unknown>>>`
      with wishlist as (
        insert into commerce.wishlists (user_id, name, is_default)
        values (${userId}, 'My Wishlist', true)
        on conflict (user_id) where is_default do update set updated_at = now()
        returning id
      )
      insert into commerce.wishlist_items (wishlist_id, product_id, variant_id, listing_id, price_when_added_paise, note)
      select wishlist.id, ${input.productId}, ${input.variantId ?? null}, ${input.listingId ?? null},
             (select lp.selling_price_paise from pricing.listing_prices lp where lp.listing_id = ${input.listingId ?? null} limit 1),
             ${input.note ?? null}
        from wishlist
      on conflict (wishlist_id, product_id, variant_id) do update set note = excluded.note
      returning id, wishlist_id, product_id, variant_id, listing_id, price_when_added_paise, note
    `;
    if (!row) throw new AppError('CONFLICT', 'Product is already in the wishlist');
    return row;
  }

  async removeWishlist(itemId: string): Promise<{ deleted: true }> {
    const userId = RequestContext.requirePrincipal().userId;
    const result = await this.db.sql`
      delete from commerce.wishlist_items wi using commerce.wishlists w
       where wi.id = ${itemId} and wi.wishlist_id = w.id and w.user_id = ${userId}
    `;
    if (result.count === 0) throw AppError.notFound('Wishlist item');
    return { deleted: true };
  }

  async recent(): Promise<Array<Record<string, unknown>>> {
    const userId = RequestContext.requirePrincipal().userId;
    return this.db.sql<Array<Record<string, unknown>>>`
      select rv.product_id, p.slug, p.title, rv.variant_id, rv.view_count,
             rv.last_viewed_at, pm.public_url as image_url
        from commerce.recently_viewed rv
        join catalog.products p on p.id = rv.product_id
        left join lateral (select public_url from catalog.product_media where product_id = p.id and is_primary and moderation_status = 'APPROVED' limit 1) pm on true
       where rv.user_id = ${userId}
       order by rv.last_viewed_at desc limit 50
    `;
  }

  async shareWishlist(): Promise<{ token: string }> {
    const userId = RequestContext.requirePrincipal().userId;
    const token = randomBytes(24).toString('base64url');
    const [row] = await this.db.sql<Array<{ share_token: string }>>`
      update commerce.wishlists set share_token = ${token}, is_public = true, updated_at = now()
       where user_id = ${userId} and is_default returning share_token
    `;
    if (!row) throw AppError.notFound('Wishlist');
    return { token: row.share_token };
  }

  async publicWishlist(token: string): Promise<Array<Record<string, unknown>>> {
    return this.db.sql<Array<Record<string, unknown>>>`
      select wi.product_id, p.slug, p.title, wi.variant_id, wi.price_when_added_paise::text,
             pm.public_url as image_url
        from commerce.wishlist_items wi
        join commerce.wishlists w on w.id = wi.wishlist_id and w.share_token = ${token} and w.is_public
        join catalog.products p on p.id = wi.product_id
        left join lateral (select public_url from catalog.product_media where product_id = p.id and is_primary and moderation_status = 'APPROVED' limit 1) pm on true
       order by wi.added_at desc
    `;
  }
}
