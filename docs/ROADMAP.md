# NovaMart — Delivery Roadmap

Each phase ends with a verification gate. A phase is not complete until every gate item passes.
The gate is identical for all phases:

```
migrations applied cleanly on a fresh database   RLS policies + negative tests pass
typecheck clean                                  lint clean
unit + integration tests pass                    API documented in OpenAPI
security checkpoint signed (SECURITY_MODEL §15)  DB checkpoint signed (DATABASE.md)
UX checkpoint signed for shipped screens         docs updated
```

---

## Phase 0 — Architecture  ✅ complete

`SYSTEM_ARCHITECTURE.md`, `DOMAIN_MODEL.md`, `ER_DIAGRAM.md`, `API_CONVENTIONS.md`,
`SECURITY_MODEL.md`, ADRs 0001–0012.

## Phase 1 — Foundation

Monorepo, shared packages (`types`, `validation`, `domain`, `events`, `permissions`, `logger`,
`config`, `api-client`, `ui`, `testing`), Supabase project + schema bootstrap, identity schema,
RBAC seed, RLS helpers, NestJS app skeleton with the full edge stack (request context, auth guard,
permission guard, Zod validation pipe, idempotency, rate limiting, error model, audit interceptor),
Next.js app skeletons with the design system, Flutter app skeletons with router/theme/API client,
CI pipeline, environment configuration.

## Phase 2 — Catalog

Categories + closure tree, brands, attribute definitions/options, category attribute binding,
products, variants, SKUs, media pipeline, specifications, seller listings, moderation workflow.
Admin catalog UI, seller catalog UI, public catalog API.

## Phase 3 — Seller Platform

Seller registration, KYC document workflow, bank/tax profiles, admin approval console, warehouses,
seller users + scoped roles, listing management, inventory management, bulk upload.

## Phase 4 — Customer Shopping

Dynamic homepage (CMS-driven), category browse, PLP with facets, PDP with Buy Box, wishlist,
recently viewed, cart, addresses. Storefront web (SSR/SEO) and customer mobile.

## Phase 5 — Pricing

Price engine, promotion rule engine, coupons, bank offers, flash sales, Buy Box scoring,
commission rules, tax rules.

## Phase 6 — Checkout & Inventory

Reservation engine with row locking, checkout orchestration, price snapshots, serviceability,
delivery promise engine, idempotency, concurrency test suite (100 units vs 10,000 concurrent
requests → exactly 100 reservations).

## Phase 7 — Payments

Payment provider port + Razorpay adapter, payment intents/attempts, webhook ingestion with
signature verification and dedupe, server-side verification, COD engine, refunds, reconciliation.

## Phase 8 — Orders

Order creation with multi-seller split, order item state machine with DB-level transition guard,
history, events, cancellation, notifications.

## Phase 9 — Fulfillment

Shipment creation, warehouse workflows (inbound, pick, pack, QC, dispatch, cycle count), labels,
shipping provider port + adapter, tracking ingestion, delivery proof, NDR/RTO, COD remittance.

## Phase 10 — Post Purchase

Cancellations, returns with policy snapshot, reverse pickup, QC inspection, refund/replacement,
reviews, Q&A, support tickets.

## Phase 11 — Seller Finance

Immutable ledger, commission/fee posting, settlement batches, payouts, adjustments, seller reports,
invoices and credit notes.

## Phase 12 — Admin

Complete control centre: every item in "fully dynamic" configurable without a deploy.

## Phase 13 — Search

Typesense collections, async indexer from outbox events, autocomplete, facets, synonyms, ranking,
sponsored slots, `SearchEngine` port for later OpenSearch migration.

## Phase 14 — Recommendations

Event tracking, trending, recently viewed, similar products, frequently bought together, top
selling, personalisation foundation.

## Phase 15 — Fraud & Risk

Rules engine, COD scoring, return abuse, coupon abuse, seller risk, fraud case management.

## Phase 16 — Scale

Redis tiering, read replicas, dedicated workers, partitioning, event streaming, warehouse,
OpenSearch, selective service extraction. Undertaken only when metrics justify it.

## Deferred (post-core, explicitly sequenced last)

Nova AI shopping assistant — grounded strictly in catalog, price, inventory, reviews and
serviceability data. Built only after core commerce is stable, per §46 of the product brief.
