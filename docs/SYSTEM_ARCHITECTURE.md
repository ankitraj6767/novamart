# NovaMart — System Architecture

Status: Living document
Owners: Principal Architect, Staff Backend, SRE
Last reviewed: 2026-08-23

---

## 1. What NovaMart is

NovaMart is a multi-vendor, PAN-India e-commerce marketplace. Multiple independent sellers list
against a shared, admin-curated product catalog. NovaMart owns the buyer relationship, the money
flow, the fulfilment promise and the trust layer (returns, refunds, reviews, fraud).

The platform is built for progressive scale: it must be operable at 10K users and must not require
a rewrite at 10M users. That constraint drives three decisions that appear everywhere in this
document:

1. **PostgreSQL is the single source of truth for money, stock and orders.** Caches and search
   indexes are derived, disposable projections.
2. **All state changes emit domain events through a transactional outbox.** Read models, search,
   notifications and analytics are consumers. Swapping the transport (Supabase Queues → Kafka)
   must not require domain rewrites.
3. **The backend is a modular monolith with hard domain boundaries.** Services are extracted only
   when scale, ownership or deploy cadence demands it — not upfront.

## 2. Architecture at a glance

```
                    ┌──────────────────────── Cloudflare (CDN + WAF + Bot) ───────────────────────┐
                    │                                                                             │
   ┌────────────────┴─────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
   │ Flutter apps                 │   │ Next.js apps             │   │ Partner / webhook edges  │
   │  customer-mobile             │   │  customer-web (SSR/ISR)  │   │  Razorpay webhooks       │
   │  seller-mobile               │   │  seller-web              │   │  Courier webhooks        │
   │  delivery-mobile             │   │  admin-web               │   │  KYC / bank verification │
   │  warehouse-mobile            │   │  operations-web          │   │                          │
   │                              │   │  support-web             │   │                          │
   └────────────┬─────────────────┘   └───────────┬──────────────┘   └────────────┬─────────────┘
                │  Supabase Auth JWT (access token) │                             │ HMAC-signed
                │  publishable key only             │  Server Components use       │ raw body
                ▼                                   ▼  server-side session        ▼
   ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
   │                        commerce-api  (NestJS 11 on Fastify, TypeScript)                      │
   │                                                                                              │
   │  Edge concerns: request-id/trace-id, JWT verification, RBAC guard, Zod validation,            │
   │                 idempotency, rate limiting, problem+json error model, audit interceptor       │
   │                                                                                              │
   │  Domain modules (hard boundaries, no cross-module DB reads):                                  │
   │  identity · customer · seller · catalog · inventory · cart · pricing · promotion · checkout    │
   │  orders · payments · fulfillment · returns · finance · reviews · support · notifications       │
   │  search · risk · cms · platform · admin                                                       │
   └───────┬──────────────────────┬───────────────────┬──────────────────┬────────────────────────┘
           │                      │                   │                  │
           ▼                      ▼                   ▼                  ▼
   ┌───────────────┐     ┌────────────────┐   ┌───────────────┐  ┌──────────────────────────┐
   │ Supabase      │     │ Redis          │   │ Typesense     │  │ Provider adapters        │
   │ PostgreSQL    │     │ cache · locks  │   │ search index  │  │ PaymentProvider          │
   │ (source of    │     │ rate limits    │   │ (derived)     │  │ ShippingProvider         │
   │  truth)       │     │ counters       │   │               │  │ NotificationProvider     │
   │ + Storage     │     │ (derived)      │   │               │  │ KycProvider              │
   │ + Realtime    │     └────────────────┘   └───────────────┘  └──────────────────────────┘
   │ + Queues/Cron │
   └───────┬───────┘
           │  outbox rows (same transaction as domain writes)
           ▼
   ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
   │  worker-service (outbox dispatcher + domain consumers, idempotent, at-least-once)             │
   │  search-indexer · notification-worker · analytics-worker · scheduled-jobs                     │
   └──────────────────────────────────────────────────────────────────────────────────────────────┘
```

## 3. Component responsibilities

| Component | Responsibility | Explicitly NOT responsible for |
| --- | --- | --- |
| Flutter apps | Presentation, local UX state, optimistic UI, device concerns (camera, scanner, push, biometrics) | Pricing, stock, order state, payment confirmation |
| Next.js apps | SSR/SEO for storefront, rich operator consoles, form UX | Any authoritative commerce computation |
| commerce-api | All commerce logic, authorization, money, stock, state machines, provider orchestration | Long-running batch analytics |
| Supabase Postgres | Durable truth, constraints, transactions, row locks, RLS | Search relevance, BI workloads |
| Redis | Cache, rate limits, hot counters, short-lived checkout scratch, advisory coordination | Anything financial or inventory-authoritative |
| Typesense | Discovery: autocomplete, facets, ranking, synonyms | Truth about price/stock at checkout time |
| Workers | Event consumption, projections, index sync, notifications, reconciliation, sweeps | Synchronous request-path logic |
| Edge Functions | Thin, latency-sensitive or Supabase-native glue (e.g. storage transform triggers) | Core commerce flows |

## 4. Client trust model

Clients are untrusted. The contract is deliberately narrow:

- Clients may **read** public catalog data (directly via Supabase where RLS makes it safe, or via
  the API/CDN for cached projections).
- Clients may **read their own** rows (cart, orders, addresses, tickets) enforced by RLS.
- Clients may **never write** to `inventory.*`, `commerce.*`, `payments.*`, `finance.*`,
  `pricing.*` or any `*_ledger` table. Those tables have no client-writable policy at all.
- Every mutation that touches money, stock or order state goes through `commerce-api` with an
  authenticated principal, an authorization check, server-side recomputation and an audit record.

Client requests carry a Supabase-issued JWT. `commerce-api` verifies the signature against the
project JWKS, then resolves authorization from `identity.user_roles` + `identity.role_permissions`
(application-managed tables), never from user-editable `user_metadata`.

## 5. Data flow: authoritative checkout

```
client POST /api/v1/checkout/orders  (Idempotency-Key: uuid)
  ├─ verify JWT → principal
  ├─ rate limit (Redis, per-user + per-IP)
  ├─ idempotency lookup (commerce.idempotency_keys, unique on (scope, key))
  │     └─ replay → return stored response, do not re-execute
  └─ BEGIN  (READ COMMITTED, explicit row locks)
       ├─ load cart + items                     (cart module)
       ├─ validate listings live & sellable     (catalog module)
       ├─ recompute price per item from DB      (pricing module)
       ├─ evaluate promotions/coupons/bank offers (promotion module)
       ├─ validate address + pincode serviceability (fulfillment module)
       ├─ compute shipping + delivery promise   (fulfillment module)
       ├─ compute GST split (CGST/SGST/IGST)    (pricing/tax)
       ├─ evaluate COD eligibility if COD       (risk + fulfillment)
       ├─ choose fulfilment nodes               (inventory module)
       ├─ SELECT ... FOR UPDATE on warehouse_inventory rows, ordered by sku_id
       ├─ assert available >= requested, reserve, write inventory_ledger + reservations
       ├─ create order + order_items + order_addresses + price snapshots
       ├─ create payment_intent (PENDING)
       ├─ insert outbox rows: ORDER_CREATED, INVENTORY_RESERVED, CHECKOUT_COMPLETED
       └─ COMMIT
  └─ store idempotent response, return authoritative payable amount + payment session
```

Nothing in that sequence accepts a price, discount or total from the client. The client sends
cart/address/payment-method selections only.

## 6. Consistency rules

- **Money and stock:** synchronous, transactional, single primary. No eventual consistency.
- **Search, recommendations, analytics, notifications:** asynchronous, at-least-once, idempotent.
- **Reservations:** expire (`expires_at`) and are swept by `scheduled-jobs`. A crashed client can
  never permanently hold stock.
- **Outbox:** `platform.outbox_events` is written in the same transaction as the domain change. A
  dispatcher claims rows with `FOR UPDATE SKIP LOCKED`, publishes, marks published, retries with
  exponential backoff, and parks poison messages in a dead-letter state.
- **Idempotency:** every financial or stock-moving entry point requires an idempotency key backed
  by a unique constraint. Webhooks are deduplicated on `provider_event_id`.

## 7. Scale path

| Dimension | Launch | 100K users | 1M users | 10M+ users |
| --- | --- | --- | --- | --- |
| API | 2 containers | HPA 4–10 | Split read/write pools, dedicated checkout pool | Extract checkout/payments/search as services |
| DB | Supabase primary | + read replicas for reporting | Partition `orders`, `order_items`, `tracking_events`, `inventory_ledger` by month | Shard analytics off-platform; CQRS read models |
| Cache | Redis single | Redis HA | Redis cluster + local LRU | Multi-tier + edge KV |
| Search | Typesense single | Typesense HA cluster | Typesense sharded | OpenSearch behind the same `SearchEngine` port |
| Events | Supabase Queues | Queues + more workers | Kafka/Redpanda behind the same `EventBus` port | Streaming + CDC to warehouse |
| Analytics | SQL on replica | Nightly export | ClickHouse/BigQuery | Full warehouse + dbt |

Because every one of those swaps sits behind a port defined in `packages/domain` (`EventBus`,
`SearchEngine`, `CacheStore`, `PaymentProvider`, `ShippingProvider`, `ObjectStore`), migration is a
adapter change plus a backfill, not a domain rewrite.

## 8. Environments

`local` → `development` → `staging` → `production`. Separate Supabase projects, Redis instances,
Typesense clusters and provider accounts per environment. Production credentials never exist in a
lower environment. See `docs/DEPLOYMENT.md`.

## 9. Observability

Every request gets `request_id` and `trace_id`, propagated to workers through outbox metadata so a
single trace spans HTTP → DB → queue → worker → provider. Domain identifiers (`user_id`,
`seller_id`, `order_id`, `payment_id`, `shipment_id`) are attached as structured log fields and
OpenTelemetry attributes. Sentry captures exceptions with the same correlation IDs. SLOs, alerts
and dashboards are defined in `docs/RUNBOOK.md`.

## 10. Related documents

- `docs/DOMAIN_MODEL.md` — bounded contexts, aggregates, invariants
- `docs/ER_DIAGRAM.md` — schemas and relationships
- `docs/API_CONVENTIONS.md` — envelope, errors, pagination, idempotency
- `docs/SECURITY_MODEL.md` — authn, RBAC, RLS, secrets
- `docs/ROADMAP.md` — phase-by-phase delivery plan
- `docs/adr/` — architecture decision records
