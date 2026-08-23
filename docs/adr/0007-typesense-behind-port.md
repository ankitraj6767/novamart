# ADR 0007 — Typesense behind a `SearchEngine` port

Status: Accepted · Date: 2026-08-23

## Context

Marketplace search needs typo tolerance, faceting over dynamic per-category attributes, synonyms,
autocomplete under 50 ms, and sponsored slot injection. Running that against normalised Postgres
tables (`products` ⋈ `variants` ⋈ `skus` ⋈ `listings` ⋈ `attribute_values` ⋈ `inventory`) for every
query does not survive contact with traffic. At 10M users the engine choice may need to change.

## Decision

Use **Typesense** at launch, accessed only through a `SearchEngine` port defined in
`packages/domain/ports/search-engine.ts`:

```ts
interface SearchEngine {
  upsertDocuments(collection: SearchCollection, docs: SearchDocument[]): Promise<void>;
  deleteDocument(collection: SearchCollection, id: string): Promise<void>;
  search(query: SearchQuery): Promise<SearchResult>;
  suggest(query: SuggestQuery): Promise<SuggestResult>;
  ensureSchema(): Promise<void>;
  swapAlias(collection: SearchCollection, target: string): Promise<void>;
}
```

Indexing is asynchronous, driven by outbox events (`PRODUCT_UPDATED`, `LISTING_UPDATED`,
`INVENTORY_UPDATED`, price changes) consumed by `services/search-indexer`. Documents are
denormalised: one document per SKU, carrying the Buy Box listing's price, availability, seller
quality signals, category path, brand, flattened attributes and popularity.

Reindexing uses an alias swap: build `products_v{n}`, verify document count and sample queries,
then repoint the alias. No downtime, instant rollback.

Search results are never trusted for price or stock at checkout. The checkout engine re-reads
Postgres. Search staleness is an acceptable display concern (target < 5 s p95), never a
correctness concern.

## Consequences

Positive: sub-50 ms faceted search; typo tolerance out of the box; simple operations compared with
Elasticsearch; the port makes the OpenSearch migration an adapter plus a backfill.

Negative: a second datastore to operate and keep consistent; eventual consistency means a
just-changed price can briefly show stale in listings (bounded and monitored); Typesense's
aggregation ability is weaker than Elasticsearch's, so analytics stays in SQL/warehouse.

## Alternatives rejected

**Postgres full-text search + trigram** — adequate for a few thousand products, not for millions
with dynamic faceting; and it puts discovery load on the transactional primary.

**OpenSearch/Elasticsearch at launch** — more powerful, materially more operational overhead than
launch justifies. Kept as the documented next step behind the same port.

**Algolia** — excellent DX, but per-operation pricing becomes hostile at marketplace catalogue size
and it is a hard vendor dependency for a core surface.
