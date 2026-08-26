import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type { adminBrandSchema, adminCategorySchema, adminProductSchema, moderationDecisionSchema } from '@novamart/validation';
import { AppError } from '../../common/errors/app-error';
import { RequestContext } from '../../common/context/request-context';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';

type CategoryInput = z.infer<typeof adminCategorySchema>;
type BrandInput = z.infer<typeof adminBrandSchema>;
type ProductInput = z.infer<typeof adminProductSchema>;
type DecisionInput = z.infer<typeof moderationDecisionSchema>;

@Injectable()
export class CatalogAdminService {
  constructor(private readonly db: DatabaseService, private readonly outbox: OutboxService) {}

  async categories(): Promise<Array<Record<string, unknown>>> {
    return this.db.sql<Array<Record<string, unknown>>>`select id, parent_id, code, name, name_hi, slug, path, level, is_leaf, image_url, display_order, is_active, show_in_navigation, show_in_home_grid from catalog.categories order by path`;
  }

  async upsertCategory(input: CategoryInput): Promise<Record<string, unknown>> {
    const [row] = await this.db.transaction(RequestContext.sessionContext(), async (tx) => tx<Array<Record<string, unknown>>>`
      insert into catalog.categories (parent_id, code, name, name_hi, slug, description, image_url, display_order, is_active, show_in_navigation, show_in_home_grid, created_by)
      values (${input.parentId ?? null}, ${input.code}, ${input.name}, ${input.nameHi ?? null}, ${input.slug}, ${input.description ?? null}, ${input.imageUrl ?? null}, ${input.displayOrder}, ${input.isActive}, ${input.showInNavigation}, ${input.showInHomeGrid}, ${RequestContext.requirePrincipal().userId})
      on conflict (code) do update set parent_id = excluded.parent_id, name = excluded.name, name_hi = excluded.name_hi, slug = excluded.slug, description = excluded.description, image_url = excluded.image_url, display_order = excluded.display_order, is_active = excluded.is_active, show_in_navigation = excluded.show_in_navigation, show_in_home_grid = excluded.show_in_home_grid
      returning id, parent_id, code, name, slug, path, level, is_leaf, is_active
    `);
    return row ?? {};
  }

  async brands(): Promise<Array<Record<string, unknown>>> {
    return this.db.sql<Array<Record<string, unknown>>>`select id, name, slug, logo_url, description, website_url, is_authorised_only, is_featured, is_active, display_order, product_count from catalog.brands order by display_order, name`;
  }

  async upsertBrand(input: BrandInput): Promise<Record<string, unknown>> {
    const [row] = await this.db.sql<Array<Record<string, unknown>>>`
      insert into catalog.brands (name, slug, description, logo_url, website_url, is_featured, is_active, display_order)
      values (${input.name}, ${input.slug}, ${input.description ?? null}, ${input.logoUrl ?? null}, ${input.websiteUrl ?? null}, ${input.isFeatured}, ${input.isActive}, ${input.displayOrder})
      on conflict (slug) do update set name = excluded.name, description = excluded.description, logo_url = excluded.logo_url, website_url = excluded.website_url, is_featured = excluded.is_featured, is_active = excluded.is_active, display_order = excluded.display_order
      returning id, name, slug, logo_url, is_featured, is_active, display_order
    `;
    return row ?? {};
  }

  async createProduct(input: ProductInput): Promise<Record<string, unknown>> {
    const principal = RequestContext.requirePrincipal();
    const [row] = await this.db.transaction(RequestContext.sessionContext(), async (tx) => tx<Array<Record<string, unknown>>>`
      insert into catalog.products (category_id, brand_id, title, slug, public_id, subtitle, description, highlights, search_keywords, hsn_code, gst_rate, status, moderation_status, created_by)
      values (${input.categoryId}, ${input.brandId ?? null}, ${input.title}, ${input.slug}, ${input.publicId}, ${input.subtitle ?? null}, ${input.description ?? null}, ${input.highlights}, ${input.searchKeywords}, ${input.hsnCode ?? null}, ${input.gstRate ?? null}, 'PENDING_APPROVAL', 'PENDING', ${principal.userId})
      returning id, public_id, slug, title, status, moderation_status, created_at
    `);
    return row ?? {};
  }

  async moderateProduct(productId: string, input: DecisionInput): Promise<Record<string, unknown>> {
    const principal = RequestContext.requirePrincipal();
    return this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [product] = await tx<Array<{ id: string; category_id: string; brand_id: string | null; status: string }>>`select id, category_id, brand_id, status from catalog.products where id = ${productId} for update`;
      if (!product) throw AppError.notFound('Product');
      const status = input.status === 'ACTIVE' ? 'ACTIVE' : input.status === 'BLOCKED' ? 'BLOCKED' : input.status === 'REJECTED' ? 'REJECTED' : 'INACTIVE';
      await tx`update catalog.products set status = ${status}, moderation_status = ${status === 'ACTIVE' ? 'APPROVED' : status === 'REJECTED' || status === 'BLOCKED' ? 'REJECTED' : 'FLAGGED'}, status_reason = ${input.reason ?? null}, moderated_by = ${principal.userId}, moderated_at = now(), moderation_notes = ${input.reason ?? null} where id = ${productId}`;
      await this.outbox.emit(tx, 'PRODUCT_UPDATED', { productId, categoryId: product.category_id, brandId: product.brand_id, status, changedFields: ['status', 'moderation_status'] });
      return { id: productId, status, moderationStatus: status === 'ACTIVE' ? 'APPROVED' : 'REJECTED' };
    });
  }

  async moderateListing(listingId: string, input: DecisionInput): Promise<Record<string, unknown>> {
    const principal = RequestContext.requirePrincipal();
    return this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [listing] = await tx<Array<{ id: string; seller_id: string; sku_id: string; product_id: string }>>`select l.id, l.seller_id, l.sku_id, sk.product_id from catalog.seller_listings l join catalog.skus sk on sk.id = l.sku_id where l.id = ${listingId} for update`;
      if (!listing) throw AppError.notFound('Listing');
      const status = input.status === 'ACTIVE' ? 'ACTIVE' : input.status === 'BLOCKED' ? 'BLOCKED' : input.status === 'SUPPRESSED' ? 'SUPPRESSED' : 'INACTIVE';
      if (['BLOCKED', 'SUPPRESSED', 'INACTIVE'].includes(status) && !input.reason) throw AppError.validation([{ field: 'reason', issue: 'A reason is required for an inactive listing' }]);
      await tx`update catalog.seller_listings set status = ${status}, status_reason = ${input.reason ?? null}, suppressed_reason = ${status === 'SUPPRESSED' ? 'POLICY_VIOLATION' : null} where id = ${listingId}`;
      await this.outbox.emit(tx, 'LISTING_UPDATED', { listingId, sellerId: listing.seller_id, skuId: listing.sku_id, productId: listing.product_id, status });
      return { id: listingId, status };
    });
  }
}
