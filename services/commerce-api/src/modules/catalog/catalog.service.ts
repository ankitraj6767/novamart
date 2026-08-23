import { Injectable } from '@nestjs/common';
import { discountPercentage, money } from '@novamart/domain';
import type {
  CategoryDto,
  HomeSectionDto,
  ListingOfferDto,
  ProductCardDto,
  ProductDetailDto,
  ServiceabilityDto,
} from '@novamart/types';
import { loadServerEnv } from '@novamart/config';
import { AppError } from '../../common/errors/app-error';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import type { ProductListQuery } from '@novamart/validation';

/**
 * Catalog reads.
 *
 * Every sellable-offer query goes through catalog.v_sellable_listings, which is the
 * single definition of "can be bought right now". Duplicating that predicate is how a
 * storefront ends up showing a suspended seller's out-of-stock listing.
 */
@Injectable()
export class CatalogService {
  private readonly env = loadServerEnv();

  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) { }

  /** Full category tree, assembled once and cached: read on nearly every page. */
  async categoryTree(): Promise<CategoryDto[]> {
    return this.redis.remember('catalog:category-tree', this.env.CACHE_CATEGORY_TTL_SECONDS, async () => {
      const rows = await this.db.sql<
        Array<{
          id: string;
          parent_id: string | null;
          code: string;
          name: string;
          slug: string;
          path: string;
          level: number;
          is_leaf: boolean;
          image_url: string | null;
          icon_url: string | null;
          display_order: number;
        }>
      >`
        select id, parent_id, code, name, slug, path, level, is_leaf,
               image_url, icon_url, display_order
          from catalog.categories
         where is_active and show_in_navigation and merged_into_id is null
         order by level, display_order, name
      `;

      const byId = new Map<string, CategoryDto>();
      const roots: CategoryDto[] = [];

      for (const row of rows) {
        byId.set(row.id, {
          id: row.id,
          parentId: row.parent_id,
          code: row.code,
          name: row.name,
          slug: row.slug,
          path: row.path,
          level: row.level,
          isLeaf: row.is_leaf,
          imageUrl: row.image_url,
          iconUrl: row.icon_url,
          displayOrder: row.display_order,
          children: [],
        });
      }

      for (const node of byId.values()) {
        if (node.parentId && byId.has(node.parentId)) {
          byId.get(node.parentId)!.children!.push(node);
        } else if (!node.parentId) {
          roots.push(node);
        }
      }

      return roots;
    });
  }

  async categoryBySlugPath(path: string): Promise<CategoryDto> {
    const [row] = await this.db.sql<
      Array<{
        id: string;
        parent_id: string | null;
        code: string;
        name: string;
        slug: string;
        path: string;
        level: number;
        is_leaf: boolean;
        image_url: string | null;
        icon_url: string | null;
        display_order: number;
        seo_title: string | null;
        seo_description: string | null;
      }>
    >`
      select id, parent_id, code, name, slug, path, level, is_leaf, image_url, icon_url,
             display_order, seo_title, seo_description
        from catalog.categories
       where path = ${path} and is_active and merged_into_id is null
    `;

    if (!row) throw AppError.notFound('Category');

    return {
      id: row.id,
      parentId: row.parent_id,
      code: row.code,
      name: row.name,
      slug: row.slug,
      path: row.path,
      level: row.level,
      isLeaf: row.is_leaf,
      imageUrl: row.image_url,
      iconUrl: row.icon_url,
      displayOrder: row.display_order,
    };
  }

  /**
   * Product listing. Reads the denormalised card view, which already resolves the Buy
   * Box winner, so no per-row subquery is needed.
   *
   * Keyset pagination on (popularity, id): OFFSET on a large catalogue degrades badly.
   */
  async listProducts(query: ProductListQuery): Promise<{ items: ProductCardDto[]; nextCursor: string | null }> {
    const limit = query.limit;
    const sql = this.db.sql;

    // Resolve the category subtree once so filtering is a single indexed join.
    const categoryIds = query.category
      ? await this.descendantCategoryIds(query.category)
      : null;

    const rows = await sql<Array<CardRow>>`
      select c.*
        from catalog.v_product_cards c
       where c.listing_id is not null
         ${categoryIds ? sql`and c.category_id = any(${categoryIds}::uuid[])` : sql``}
         ${query.brand ? sql`and lower(c.brand_name) = lower(${query.brand})` : sql``}
         ${query.seller ? sql`and c.seller_id = ${query.seller}` : sql``}
         ${query['price.gte'] !== undefined ? sql`and c.selling_price_paise >= ${query['price.gte']}` : sql``}
         ${query['price.lte'] !== undefined ? sql`and c.selling_price_paise <= ${query['price.lte']}` : sql``}
         ${query['rating.gte'] !== undefined ? sql`and c.average_rating >= ${query['rating.gte']}` : sql``}
         ${query['discount.gte'] !== undefined ? sql`and c.discount_percentage >= ${query['discount.gte']}` : sql``}
         ${query.inStock ? sql`and c.available_quantity > 0` : sql``}
         ${query.fulfillment ? sql`and c.fulfillment_model = ${query.fulfillment}` : sql``}
       order by
         ${this.orderClause(query.sort)}
       limit ${limit + 1}
    `;

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: page.map((row) => this.toCard(row)),
      nextCursor: null,
    };
  }

  private orderClause(sort: ProductListQuery['sort']) {
    const sql = this.db.sql;
    switch (sort) {
      case 'price':
        return sql`c.selling_price_paise asc nulls last, c.product_id`;
      case '-price':
        return sql`c.selling_price_paise desc nulls last, c.product_id`;
      case '-discount':
        return sql`c.discount_percentage desc nulls last, c.product_id`;
      case '-rating':
        return sql`c.rating_ranking_score desc, c.product_id`;
      case '-newest':
        return sql`c.created_at desc, c.product_id`;
      case 'popularity':
      case 'relevance':
      default:
        return sql`c.popularity_score desc, c.rating_ranking_score desc, c.product_id`;
    }
  }

  private async descendantCategoryIds(slugOrPath: string): Promise<string[]> {
    const rows = await this.db.sql<Array<{ id: string }>>`
      select cc.descendant_id as id
        from catalog.categories c
        join catalog.category_closure cc on cc.ancestor_id = c.id
       where (c.slug = ${slugOrPath} or c.path = ${slugOrPath})
         and c.is_active
    `;
    if (rows.length === 0) throw AppError.notFound('Category');
    return rows.map((r) => r.id);
  }

  /**
   * Product detail page.
   *
   * The Buy Box and the competing-offer list are always scoped to ONE SKU. Comparing
   * a 256 GB offer against a 512 GB offer would show the customer a cheaper "other
   * seller" for a different product, which is misleading and a real trust problem.
   *
   * Target SKU resolution: the requested variant, else the product's default variant,
   * else whichever variant has the strongest offer.
   */
  async productDetail(
    slug: string,
    options: { variantId?: string; pincode?: string } = {},
  ): Promise<ProductDetailDto> {
    const [product] = await this.db.sql<
      Array<{
        id: string;
        public_id: string;
        slug: string;
        title: string;
        subtitle: string | null;
        description: string | null;
        highlights: string[];
        category_id: string;
        category_name: string;
        category_path: string;
        brand_id: string | null;
        brand_name: string | null;
        brand_slug: string | null;
        hsn_code: string | null;
        gst_rate: string | null;
        country_of_origin: string;
        warranty_type: string | null;
        warranty_period_months: number | null;
        warranty_summary: string | null;
        popularity_score: string;
        created_at: string;
      }>
    >`
      select p.id, p.public_id, p.slug, p.title, p.subtitle, p.description, p.highlights,
             p.category_id, cat.name as category_name, cat.path as category_path,
             p.brand_id, b.name as brand_name, b.slug as brand_slug,
             p.hsn_code, p.gst_rate::text as gst_rate, p.country_of_origin,
             p.warranty_type, p.warranty_period_months, p.warranty_summary,
             p.popularity_score::text as popularity_score, p.created_at
        from catalog.products p
        join catalog.categories cat on cat.id = p.category_id
        left join catalog.brands b on b.id = p.brand_id
       where p.slug = ${slug}
         and p.status = 'ACTIVE'
         and p.moderation_status = 'APPROVED'
    `;

    if (!product) throw AppError.notFound('Product');

    const [media, offers, specs, attributes, rating, policy] = await Promise.all([
      this.db.sql<
        Array<{
          id: string;
          media_type: string;
          public_url: string;
          alt_text: string | null;
          blurhash: string | null;
          width_px: number | null;
          height_px: number | null;
          is_primary: boolean;
        }>
      >`
        select id, media_type, public_url, alt_text, blurhash, width_px, height_px, is_primary
          from catalog.product_media
         where product_id = ${product.id} and moderation_status = 'APPROVED'
         order by is_primary desc, display_order, created_at
      `,
      this.db.sql<Array<OfferRow>>`
        select vl.listing_id, vl.seller_id, vl.seller_name, vl.seller_rating,
               vl.condition, vl.mrp_paise, vl.selling_price_paise, vl.discount_percentage,
               vl.available_quantity, vl.fulfillment_model, vl.handling_time_days,
               vl.is_buy_box_winner, vl.buy_box_score, vl.sku_id, vl.variant_id,
               vl.variant_label, pv.is_default as is_default_variant, pv.display_order
          from catalog.v_sellable_listings vl
          join catalog.product_variants pv on pv.id = vl.variant_id
         where vl.product_id = ${product.id}
         order by vl.is_buy_box_winner desc, vl.buy_box_score desc nulls last, vl.selling_price_paise
      `,
      this.db.sql<Array<{ group_name: string; label: string; value: string }>>`
        select group_name, label, value
          from catalog.product_specifications
         where product_id = ${product.id}
         order by group_name, display_order
      `,
      this.db.sql<
        Array<{
          code: string;
          name: string;
          unit: string | null;
          is_key: boolean;
          value: string;
        }>
      >`
        select ad.code, ad.name, ad.unit,
               coalesce(ca.is_key_specification, false) as is_key,
               coalesce(
                 ao.label,
                 pav.value_text,
                 -- trim_scale drops the trailing zeros NUMERIC(18,6) would otherwise
                 -- render: 6.700000 → '6.7', 5200.000000 → '5200'. The unit is then
                 -- appended for display.
                 case when pav.value_number is not null then
                   trim_scale(pav.value_number)::text || coalesce(' ' || ad.unit, '')
                 end,
                 case when pav.value_boolean is not null then
                   case when pav.value_boolean then 'Yes' else 'No' end
                 end,
                 pav.value_date::text,
                 ''
               ) as value
          from catalog.product_attribute_values pav
          join catalog.attribute_definitions ad on ad.id = pav.attribute_id
          left join catalog.attribute_options ao on ao.id = pav.option_id
          left join catalog.category_attributes ca
                 on ca.attribute_id = ad.id and ca.category_id = ${product.category_id}
         where pav.product_id = ${product.id}
         order by coalesce(ca.display_order, ad.display_order), ad.name
      `,
      this.db.sql<
        Array<{
          average_rating: string;
          rating_count: number;
          count_1_star: number;
          count_2_star: number;
          count_3_star: number;
          count_4_star: number;
          count_5_star: number;
        }>
      >`
        select average_rating::text as average_rating, rating_count,
               count_1_star, count_2_star, count_3_star, count_4_star, count_5_star
          from commerce.product_rating_summary
         where product_id = ${product.id}
      `,
      this.db.sql<Array<{ return_window_days: number | null; return_type: string | null }>>`
        select return_window_days, return_type
          from catalog.resolve_category_policy(${product.category_id})
      `,
    ]);

    const ratingRow = rating[0];
    const policyRow = policy[0];

    // One offer per variant for the selector, and it must be the SAME offer the Buy Box
    // would show for that variant. Showing a cheaper non-winning price on the chip and
    // then a higher price once selected reads as a bait-and-switch.
    const variantMap = new Map<string, OfferRow>();
    for (const offer of offers) {
      const existing = variantMap.get(offer.variant_id);
      if (!existing) {
        variantMap.set(offer.variant_id, offer);
        continue;
      }
      const better =
        (offer.is_buy_box_winner && !existing.is_buy_box_winner) ||
        (offer.is_buy_box_winner === existing.is_buy_box_winner &&
          Number(offer.selling_price_paise) < Number(existing.selling_price_paise));
      if (better) variantMap.set(offer.variant_id, offer);
    }

    // Resolve the single SKU this page is about.
    const requestedVariant = options.variantId
      ? offers.find((o) => o.variant_id === options.variantId)
      : undefined;
    const defaultVariant = offers.find((o) => o.is_default_variant);
    const targetOffer = requestedVariant ?? defaultVariant ?? offers[0];
    const targetSkuId = targetOffer?.sku_id ?? null;

    // Every offer for that SKU, best first. This is an apples-to-apples comparison.
    const skuOffers = targetSkuId ? offers.filter((o) => o.sku_id === targetSkuId) : [];
    const buyBox = skuOffers.find((o) => o.is_buy_box_winner) ?? skuOffers[0] ?? null;

    const card = buyBox ? this.offerToCard(product, buyBox, media[0]) : null;

    return {
      productId: product.id,
      publicId: product.public_id,
      slug: product.slug,
      title: product.title,
      subtitle: product.subtitle,
      description: product.description,
      highlights: product.highlights ?? [],
      brandName: product.brand_name,
      categoryPath: product.category_path,
      imageUrl: media[0]?.public_url ?? null,
      imageBlurhash: media[0]?.blurhash ?? null,
      listingId: buyBox?.listing_id ?? null,
      skuId: buyBox?.sku_id ?? null,
      sellerId: buyBox?.seller_id ?? null,
      sellerName: buyBox?.seller_name ?? null,
      mrp: buyBox ? money(Number(buyBox.mrp_paise)) : null,
      price: buyBox ? money(Number(buyBox.selling_price_paise)) : null,
      discountPercentage: card?.discountPercentage ?? null,
      inStock: (buyBox?.available_quantity ?? 0) > 0,
      averageRating: Number(ratingRow?.average_rating ?? 0),
      ratingCount: ratingRow?.rating_count ?? 0,
      fulfillmentModel: (buyBox?.fulfillment_model ?? null) as ProductDetailDto['fulfillmentModel'],
      media: media.map((m) => ({
        id: m.id,
        type: m.media_type as 'IMAGE' | 'VIDEO' | 'VIEW_360' | 'DOCUMENT',
        url: m.public_url,
        altText: m.alt_text,
        blurhash: m.blurhash,
        width: m.width_px,
        height: m.height_px,
        isPrimary: m.is_primary,
      })),
      variants: [...variantMap.values()]
        .sort((a, b) => a.display_order - b.display_order)
        .map((offer) => ({
          id: offer.variant_id,
          label: offer.variant_label,
          // Reflects which variant this page is currently showing, so the client can
          // mark the active chip without a second round trip.
          isDefault: offer.sku_id === targetSkuId,
          skuId: offer.sku_id,
          attributes: [],
          inStock: offer.available_quantity > 0,
          price: money(Number(offer.selling_price_paise)),
        })),
      specifications: this.groupSpecifications(specs),
      attributes: attributes.map((a) => ({
        code: a.code,
        name: a.name,
        value: a.value,
        unit: a.unit,
        isKeySpecification: a.is_key,
      })),
      offers: [],
      warranty: {
        type: product.warranty_type,
        months: product.warranty_period_months,
        summary: product.warranty_summary,
      },
      countryOfOrigin: product.country_of_origin,
      returnPolicy: {
        window: policyRow?.return_window_days ?? 0,
        type: policyRow?.return_type ?? 'NON_RETURNABLE',
        label:
          (policyRow?.return_window_days ?? 0) > 0
            ? `${policyRow!.return_window_days}-day return`
            : 'Not returnable',
      },
      buyBox: buyBox ? this.toOffer(buyBox) : null,
      // Same SKU only — never a different variant dressed up as a cheaper offer.
      otherOffers: skuOffers
        .filter((o) => o.listing_id !== buyBox?.listing_id)
        .map((o) => this.toOffer(o)),
      ratingHistogram: {
        '1': ratingRow?.count_1_star ?? 0,
        '2': ratingRow?.count_2_star ?? 0,
        '3': ratingRow?.count_3_star ?? 0,
        '4': ratingRow?.count_4_star ?? 0,
        '5': ratingRow?.count_5_star ?? 0,
      },
    };
  }

  /** CMS-driven homepage. The client renders whatever this returns (brief §48). */
  async homeSections(platform: string): Promise<HomeSectionDto[]> {
    const rows = await this.db.sql<
      Array<{
        id: string;
        code: string;
        section_type: string;
        title: string | null;
        subtitle: string | null;
        position: number;
        configuration: Record<string, unknown>;
        banners: unknown;
      }>
    >`
      select id, code, section_type, title, subtitle, position, configuration, banners
        from api.home_sections
       where ${platform} = any (surfaces)
       order by position
    `;

    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      type: row.section_type,
      title: row.title,
      subtitle: row.subtitle,
      position: row.position,
      configuration: row.configuration ?? {},
      banners: (row.banners as HomeSectionDto['banners']) ?? [],
    }));
  }

  async serviceability(pincode: string): Promise<ServiceabilityDto> {
    const [row] = await this.db.sql<
      Array<{
        pincode: string;
        city: string;
        state: string;
        state_code: string;
        is_serviceable: boolean;
        prepaid_available: boolean;
        cod_available: boolean;
        default_sla_days: number;
        is_suspended: boolean;
      }>
    >`
      select pincode, city, state, state_code, is_serviceable, prepaid_available,
             cod_available, default_sla_days, is_suspended
        from api.pincode_serviceability
       where pincode = ${pincode}
    `;

    if (!row) {
      // An unknown pincode is not an error: it is simply not served yet.
      return {
        pincode,
        city: '',
        state: '',
        stateCode: '',
        isServiceable: false,
        prepaidAvailable: false,
        codAvailable: false,
        estimatedDays: 0,
        isSuspended: false,
      };
    }

    return {
      pincode: row.pincode,
      city: row.city,
      state: row.state,
      stateCode: row.state_code,
      isServiceable: row.is_serviceable && !row.is_suspended,
      prepaidAvailable: row.prepaid_available,
      codAvailable: row.cod_available,
      estimatedDays: row.default_sla_days,
      isSuspended: row.is_suspended,
    };
  }

  private groupSpecifications(
    rows: Array<{ group_name: string; label: string; value: string }>,
  ): ProductDetailDto['specifications'] {
    const groups = new Map<string, Array<{ label: string; value: string }>>();
    for (const row of rows) {
      if (!groups.has(row.group_name)) groups.set(row.group_name, []);
      groups.get(row.group_name)!.push({ label: row.label, value: row.value });
    }
    return [...groups.entries()].map(([group, items]) => ({ group, items }));
  }

  private toOffer(row: OfferRow): ListingOfferDto {
    return {
      listingId: row.listing_id,
      sellerId: row.seller_id,
      sellerName: row.seller_name,
      sellerRating: row.seller_rating === null ? null : Number(row.seller_rating),
      condition: row.condition,
      mrp: money(Number(row.mrp_paise)),
      price: money(Number(row.selling_price_paise)),
      discountPercentage: discountPercentage(Number(row.mrp_paise), Number(row.selling_price_paise)),
      availableQuantity: row.available_quantity,
      fulfillmentModel: row.fulfillment_model as ListingOfferDto['fulfillmentModel'],
      handlingTimeDays: row.handling_time_days,
      isBuyBoxWinner: row.is_buy_box_winner,
    };
  }

  private offerToCard(
    product: { id: string; public_id: string; slug: string; title: string; brand_name: string | null; category_path: string },
    offer: OfferRow,
    media?: { public_url: string; blurhash: string | null },
  ): ProductCardDto {
    return {
      productId: product.id,
      publicId: product.public_id,
      slug: product.slug,
      title: product.title,
      brandName: product.brand_name,
      categoryPath: product.category_path,
      imageUrl: media?.public_url ?? null,
      imageBlurhash: media?.blurhash ?? null,
      listingId: offer.listing_id,
      skuId: offer.sku_id,
      sellerId: offer.seller_id,
      sellerName: offer.seller_name,
      mrp: money(Number(offer.mrp_paise)),
      price: money(Number(offer.selling_price_paise)),
      discountPercentage: discountPercentage(
        Number(offer.mrp_paise),
        Number(offer.selling_price_paise),
      ),
      inStock: offer.available_quantity > 0,
      averageRating: 0,
      ratingCount: 0,
      fulfillmentModel: offer.fulfillment_model as ProductCardDto['fulfillmentModel'],
    };
  }

  private toCard(row: CardRow): ProductCardDto {
    return {
      productId: row.product_id,
      publicId: row.public_id,
      slug: row.slug,
      title: row.title,
      brandName: row.brand_name,
      categoryPath: row.category_path,
      imageUrl: row.primary_image_url,
      imageBlurhash: row.primary_image_blurhash,
      listingId: row.listing_id,
      skuId: row.sku_id,
      sellerId: row.seller_id,
      sellerName: row.seller_name,
      mrp: row.mrp_paise === null ? null : money(Number(row.mrp_paise)),
      price: row.selling_price_paise === null ? null : money(Number(row.selling_price_paise)),
      discountPercentage:
        row.discount_percentage === null ? null : Math.floor(Number(row.discount_percentage)),
      inStock: (row.available_quantity ?? 0) > 0,
      averageRating: Number(row.average_rating ?? 0),
      ratingCount: row.rating_count ?? 0,
      fulfillmentModel: (row.fulfillment_model ?? null) as ProductCardDto['fulfillmentModel'],
    };
  }
}

interface CardRow {
  product_id: string;
  public_id: string;
  slug: string;
  title: string;
  brand_name: string | null;
  category_id: string;
  category_path: string;
  listing_id: string | null;
  sku_id: string | null;
  seller_id: string | null;
  seller_name: string | null;
  mrp_paise: string | null;
  selling_price_paise: string | null;
  discount_percentage: string | null;
  available_quantity: number | null;
  fulfillment_model: string | null;
  average_rating: string | null;
  rating_count: number | null;
  primary_image_url: string | null;
  primary_image_blurhash: string | null;
  popularity_score: string | null;
  created_at: string;
}

interface OfferRow {
  listing_id: string;
  seller_id: string;
  seller_name: string;
  seller_rating: string | null;
  condition: string;
  mrp_paise: string;
  selling_price_paise: string;
  discount_percentage: string;
  available_quantity: number;
  fulfillment_model: string;
  handling_time_days: number;
  is_buy_box_winner: boolean;
  buy_box_score: string | null;
  sku_id: string;
  variant_id: string;
  variant_label: string;
  is_default_variant: boolean;
  display_order: number;
}
