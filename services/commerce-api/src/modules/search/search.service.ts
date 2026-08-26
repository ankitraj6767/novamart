import { Injectable, Logger } from '@nestjs/common';
import type { z } from 'zod';
import type {
  analyticsEventSchema,
  productListQuerySchema,
  searchQuerySchema,
  suggestQuerySchema,
} from '@novamart/validation';
import { loadServerEnv } from '@novamart/config';
import { AppError } from '../../common/errors/app-error';
import { RequestContext } from '../../common/context/request-context';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { RedisService } from '../../infrastructure/redis/redis.service';

type SearchInput = z.infer<typeof searchQuerySchema>;
type SuggestInput = z.infer<typeof suggestQuerySchema>;
type EventInput = z.infer<typeof analyticsEventSchema>;
type ProductFilterInput = z.infer<typeof productListQuerySchema>;

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly env = loadServerEnv();

  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  async search(input: SearchInput): Promise<Record<string, unknown>> {
    const started = Date.now();
    const typesense = await this.typesenseSearch(input).catch((error: unknown) => {
      this.logger.warn(
        { err: error instanceof Error ? error.message : String(error) },
        'Typesense unavailable; using catalog read model',
      );
      return null;
    });
    const result = typesense ?? (await this.databaseSearch(input));
    await this.recordSearch(input.q, result.items.length === 0).catch(() => undefined);
    return {
      ...result,
      processingTimeMs: Date.now() - started,
      engine: typesense ? 'typesense' : 'catalog-read-model',
    };
  }

  async suggest(input: SuggestInput): Promise<Record<string, unknown>> {
    const cacheKey = `search:suggest:${input.q.toLowerCase()}:${input.limit}`;
    return this.redis.remember(cacheKey, 60, async () => {
      const typesense = await this.typesenseSuggest(input).catch(() => null);
      if (typesense) return typesense;
      const rows = await this.db.sql<Array<Record<string, unknown>>>`
        select * from (
          select p.id as target_id, p.title as text, 'PRODUCT' as type,
                 pm.public_url as image_url
            from catalog.products p
            left join lateral (select public_url from catalog.product_media where product_id = p.id and is_primary and moderation_status = 'APPROVED' limit 1) pm on true
           where p.status = 'ACTIVE' and p.moderation_status = 'APPROVED' and p.title ilike ${`%${input.q}%`}
           order by p.popularity_score desc limit ${input.limit}
        ) suggestions
      `;
      return {
        suggestions: rows.map((row) => ({
          text: row['text'],
          type: row['type'],
          targetId: row['target_id'],
          imageUrl: row['image_url'] ?? null,
        })),
      };
    });
  }

  async recommendations(productId?: string): Promise<Record<string, unknown>> {
    const userId = RequestContext.userId();
    if (userId) {
      const recent = await this.db.sql<Array<Record<string, unknown>>>`
        select c.* from commerce.recently_viewed rv
        join catalog.v_product_cards c on c.product_id = rv.product_id and c.listing_id is not null
       where rv.user_id = ${userId} ${productId ? this.db.sql`and rv.product_id <> ${productId}` : this.db.sql``}
       order by rv.last_viewed_at desc limit 12
      `;
      if (recent.length > 0) return { strategy: 'recently_viewed', items: recent };
    }
    const fallback = await this.db.sql<Array<Record<string, unknown>>>`
      select c.* from catalog.v_product_cards c
       where c.listing_id is not null
         ${productId ? this.db.sql`and c.product_id <> ${productId}` : this.db.sql``}
       order by c.popularity_score desc, c.rating_ranking_score desc, c.product_id
       limit 12
    `;
    return { strategy: productId ? 'similar_or_top_selling' : 'top_selling', items: fallback };
  }

  async track(input: EventInput): Promise<{ accepted: true }> {
    const userId = RequestContext.userId();
    await this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      await tx`select analytics.ensure_event_partition(current_date)`;
      await tx`
        insert into analytics.events (
          event_type, user_id, anonymous_id, session_id, product_id, sku_id, listing_id,
          seller_id, category_id, order_id, search_query, surface, position,
          is_sponsored, platform, app_version, quantity, value_paise, properties,
          request_id, trace_id
        ) values (
          ${input.eventType}, ${userId}, ${input.anonymousId ?? null}, ${input.sessionId ?? null},
          ${input.productId ?? null}, ${input.skuId ?? null}, ${input.listingId ?? null},
          ${input.sellerId ?? null}, ${input.categoryId ?? null}, ${input.orderId ?? null},
          ${input.searchQuery ?? null}, ${input.surface ?? null}, ${input.position ?? null},
          ${input.isSponsored}, ${RequestContext.get()?.platform ?? null},
          ${RequestContext.get()?.appVersion ?? null}, ${input.quantity ?? null},
          ${input.valuePaise ?? null}, ${tx.json(input.properties as never)},
          ${RequestContext.requestId()}, ${RequestContext.traceId()}
        )
      `;
      if (input.eventType === 'PRODUCT_VIEW' && userId && input.productId) {
        await tx`
          insert into commerce.recently_viewed (user_id, product_id, variant_id)
          select ${userId}, ${input.productId},
                 (select variant_id from catalog.skus where id = ${input.skuId ?? null})
          on conflict (user_id, product_id) do update set
            variant_id = excluded.variant_id, view_count = commerce.recently_viewed.view_count + 1,
            last_viewed_at = now()
        `;
      }
    });
    return { accepted: true };
  }

  async recordSearch(query: string, noResults: boolean): Promise<void> {
    await this.db.sql`
      insert into analytics.search_queries (normalised_query, metric_date, search_count, zero_result_count)
      values (lower(trim(${query})), current_date, 1, ${noResults ? 1 : 0})
      on conflict (normalised_query, metric_date) do update set
        search_count = analytics.search_queries.search_count + 1,
        zero_result_count = analytics.search_queries.zero_result_count + excluded.zero_result_count,
        computed_at = now()
    `;
  }

  private async databaseSearch(input: SearchInput): Promise<{
    items: Array<Record<string, unknown>>;
    facets: Array<Record<string, unknown>>;
    total: number;
    page: number;
  }> {
    const filter = input as ProductFilterInput;
    const search = `%${input.q}%`;
    const rows = await this.db.sql<Array<Record<string, unknown>>>`
      select c.* from catalog.v_product_cards c
       where c.listing_id is not null
         and (c.title ilike ${search} or coalesce(c.brand_name, '') ilike ${search} or c.category_path ilike ${search})
         ${filter['price.gte'] !== undefined ? this.db.sql`and c.selling_price_paise >= ${filter['price.gte']}` : this.db.sql``}
         ${filter['price.lte'] !== undefined ? this.db.sql`and c.selling_price_paise <= ${filter['price.lte']}` : this.db.sql``}
         ${filter.inStock ? this.db.sql`and c.available_quantity > 0` : this.db.sql``}
       order by c.popularity_score desc, c.rating_ranking_score desc, c.product_id
       limit ${input.limit}
    `;
    return { items: rows, facets: [], total: rows.length, page: 1 };
  }

  private async typesenseSearch(input: SearchInput): Promise<{
    items: Array<Record<string, unknown>>;
    facets: Array<Record<string, unknown>>;
    total: number;
    page: number;
  } | null> {
    if (!this.env.TYPESENSE_SEARCH_ONLY_API_KEY && !this.env.TYPESENSE_ADMIN_API_KEY) return null;
    const params = new URLSearchParams({
      q: input.q,
      query_by: 'title,brand_name,category_path',
      page: '1',
      per_page: String(input.limit),
      facet_by: 'brand_name,category_path',
    });
    const response = await fetch(
      `${this.env.TYPESENSE_PROTOCOL}://${this.env.TYPESENSE_HOST}:${this.env.TYPESENSE_PORT}/collections/products/documents/search?${params}`,
      {
        headers: {
          'X-TYPESENSE-API-KEY':
            this.env.TYPESENSE_SEARCH_ONLY_API_KEY ?? this.env.TYPESENSE_ADMIN_API_KEY ?? '',
        },
      },
    );
    if (!response.ok) throw new Error(`Typesense responded ${response.status}`);
    const body = (await response.json()) as {
      hits?: Array<{ document: Record<string, unknown> }>;
      found?: number;
      facet_counts?: Array<Record<string, unknown>>;
    };
    return {
      items: (body.hits ?? []).map((hit) => hit.document),
      facets: body.facet_counts ?? [],
      total: body.found ?? 0,
      page: 1,
    };
  }

  private async typesenseSuggest(input: SuggestInput): Promise<Record<string, unknown> | null> {
    if (!this.env.TYPESENSE_SEARCH_ONLY_API_KEY && !this.env.TYPESENSE_ADMIN_API_KEY) return null;
    const params = new URLSearchParams({
      q: input.q,
      query_by: 'title',
      per_page: String(input.limit),
    });
    const response = await fetch(
      `${this.env.TYPESENSE_PROTOCOL}://${this.env.TYPESENSE_HOST}:${this.env.TYPESENSE_PORT}/collections/products/documents/search?${params}`,
      {
        headers: {
          'X-TYPESENSE-API-KEY':
            this.env.TYPESENSE_SEARCH_ONLY_API_KEY ?? this.env.TYPESENSE_ADMIN_API_KEY ?? '',
        },
      },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { hits?: Array<{ document: Record<string, unknown> }> };
    return {
      suggestions: (body.hits ?? []).map((hit) => ({
        text: hit.document['title'],
        type: 'PRODUCT',
        targetId: hit.document['product_id'] ?? null,
        imageUrl: hit.document['image_url'] ?? null,
      })),
    };
  }
}
