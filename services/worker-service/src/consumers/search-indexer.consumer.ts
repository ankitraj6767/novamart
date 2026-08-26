import { EVENT_TYPES, type EventType } from '@novamart/events';
import { loadServerEnv } from '@novamart/config';
import type { Consumer, OutboxEvent } from '../outbox/consumer';
import type { Tx, WorkerContext } from '../runtime/context';

/** Projects catalog facts into the Typesense read model asynchronously. */
export class SearchIndexerConsumer implements Consumer {
  readonly name = 'typesense-indexer';
  readonly eventTypes: readonly EventType[] = [
    EVENT_TYPES.PRODUCT_CREATED,
    EVENT_TYPES.PRODUCT_UPDATED,
    EVENT_TYPES.LISTING_CREATED,
    EVENT_TYPES.LISTING_UPDATED,
    EVENT_TYPES.LISTING_PRICE_CHANGED,
    EVENT_TYPES.INVENTORY_UPDATED,
    EVENT_TYPES.REVIEW_PUBLISHED,
    EVENT_TYPES.SELLER_SUSPENDED,
  ];
  private readonly env = loadServerEnv();
  private schemaReady = false;

  async handle(event: OutboxEvent, tx: Tx, ctx: WorkerContext): Promise<void> {
    if (!this.env.TYPESENSE_ADMIN_API_KEY) {
      ctx.logger.debug(
        { eventType: event.event_type },
        'Typesense admin key is not configured; index projection skipped',
      );
      return;
    }

    await this.ensureSchema();

    const productIds = await this.productIds(event, tx);
    for (const productId of productIds) {
      const [row] = await tx<Array<Record<string, unknown>>>`
        select c.product_id, c.public_id, c.slug, c.title, c.brand_name, c.category_path,
               c.primary_image_url as image_url, c.selling_price_paise, c.mrp_paise,
               c.discount_percentage, c.available_quantity, c.average_rating,
               c.rating_count, c.popularity_score, c.fulfillment_model,
               c.seller_id, c.seller_name
          from catalog.v_product_cards c
         where c.product_id = ${productId} and c.listing_id is not null
         order by c.is_buy_box_winner desc nulls last limit 1
      `;
      if (!row) continue;
      await this.upsert(row);
    }
  }

  private async productIds(event: OutboxEvent, tx: Tx): Promise<string[]> {
    const payload = event.payload;
    if (event.event_type === EVENT_TYPES.SELLER_SUSPENDED) {
      const rows = await tx<Array<{ product_id: string }>>`
        select distinct product_id from catalog.seller_listings where seller_id = ${String(payload['sellerId'])}
      `;
      return rows.map((row) => row.product_id);
    }
    if (typeof payload['productId'] === 'string') return [payload['productId']];
    if (typeof payload['skuId'] === 'string') {
      const rows = await tx<
        Array<{ product_id: string }>
      >`select product_id from catalog.skus where id = ${payload['skuId']}`;
      return rows.map((row) => row.product_id);
    }
    return [];
  }

  private async upsert(document: Record<string, unknown>): Promise<void> {
    const endpoint = `${this.env.TYPESENSE_PROTOCOL}://${this.env.TYPESENSE_HOST}:${this.env.TYPESENSE_PORT}/collections/products/documents?action=upsert`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'X-TYPESENSE-API-KEY': this.env.TYPESENSE_ADMIN_API_KEY ?? '',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        id: String(document['product_id']),
        product_id: document['product_id'],
        public_id: document['public_id'],
        slug: document['slug'],
        title: document['title'],
        brand_name: document['brand_name'],
        category_path: document['category_path'],
        image_url: document['image_url'],
        selling_price_paise: Number(document['selling_price_paise'] ?? 0),
        mrp_paise: Number(document['mrp_paise'] ?? 0),
        discount_percentage: Number(document['discount_percentage'] ?? 0),
        available_quantity: Number(document['available_quantity'] ?? 0),
        average_rating: Number(document['average_rating'] ?? 0),
        rating_count: Number(document['rating_count'] ?? 0),
        popularity_score: Number(document['popularity_score'] ?? 0),
        fulfillment_model: document['fulfillment_model'],
        seller_id: document['seller_id'],
        seller_name: document['seller_name'],
      }),
    });
    if (!response.ok) throw new Error(`Typesense index request failed with ${response.status}`);
  }

  private async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    const endpoint = `${this.env.TYPESENSE_PROTOCOL}://${this.env.TYPESENSE_HOST}:${this.env.TYPESENSE_PORT}/collections`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'X-TYPESENSE-API-KEY': this.env.TYPESENSE_ADMIN_API_KEY ?? '',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'products',
        fields: [
          { name: 'product_id', type: 'string' },
          { name: 'public_id', type: 'string', optional: true },
          { name: 'slug', type: 'string' },
          { name: 'title', type: 'string' },
          { name: 'brand_name', type: 'string', facet: true, optional: true },
          { name: 'category_path', type: 'string', facet: true, optional: true },
          { name: 'image_url', type: 'string', optional: true },
          { name: 'selling_price_paise', type: 'int64', facet: true },
          { name: 'mrp_paise', type: 'int64', optional: true },
          { name: 'discount_percentage', type: 'float', facet: true },
          { name: 'available_quantity', type: 'int32', facet: true },
          { name: 'average_rating', type: 'float', facet: true },
          { name: 'rating_count', type: 'int32' },
          { name: 'popularity_score', type: 'float', sort: true },
          { name: 'fulfillment_model', type: 'string', facet: true, optional: true },
          { name: 'seller_id', type: 'string', facet: true, optional: true },
          { name: 'seller_name', type: 'string', optional: true },
        ],
        default_sorting_field: 'popularity_score',
      }),
    });
    // 409 means another worker created the collection concurrently.
    if (!response.ok && response.status !== 409)
      throw new Error(`Typesense schema request failed with ${response.status}`);
    this.schemaReady = true;
  }
}
