# NovaMart — Build Status

Honest accounting of what exists and is verified, versus what is designed but not yet
implemented. Updated: 2026-08-23.

---

## Verified complete

### Phase 0 — Architecture
- `SYSTEM_ARCHITECTURE.md`, `DOMAIN_MODEL.md`, `ER_DIAGRAM.md`, `API_CONVENTIONS.md`,
  `SECURITY_MODEL.md`, `DATABASE.md`, `ROADMAP.md`
- ADRs 0001–0012 covering every load-bearing decision

### Monorepo foundation
- pnpm workspaces + Turborepo, strict TypeScript base config, Prettier, `.env.example`
  documenting every variable, Supabase `config.toml` (local Auth/Storage/Realtime/pooler)

### Database — the substantive deliverable
27 migrations covering all sixteen domains. **Verified by `supabase db reset` exiting 0
on a fresh database with zero errors:**

| Metric | Value |
| --- | --- |
| Migrations | 27 |
| Tables | 172 |
| Tables missing RLS | **0** |
| RLS policies | 186 |
| Indexes | ~800 |
| Functions | 111 |
| Permissions / roles / grants | 106 / 22 / 464 |
| Storage buckets | 10 (4 public, 6 private) |

Engines implemented in SQL and exercised:
- **Inventory reservation** — pessimistic locking, deterministic lock order, guarded
  update, CHECK constraints, immutable ledger, expiry sweeper, reconciliation
- **Order state machine** — transitions as data, trigger-enforced, history written by
  the database
- **Pricing** — commission resolution (most-specific-wins), GST resolution with
  effective dating and price-threshold slabs, Buy Box scoring with configurable weights
  and hard quality gates
- **Delivery promise** — warehouse cutoff, operating days, carrier SLA, ODA penalty →
  a concrete date
- **Shipping rates** — zone × weight slabs with COD, insurance, fuel, GST
- **Returns** — policy resolution and eligibility from the order-time snapshot
- **Finance** — immutable seller ledger, earnings posting, settlement with pinned
  ledger entries, gapless GST invoice numbering
- **Outbox** — `FOR UPDATE SKIP LOCKED` claim, exponential backoff, dead-letter,
  stuck-row recovery
- **Refund guard** — over-refund made impossible under the intent's row lock

### Seed data
Platform settings (34), feature flags (11), app version policies, provider
integrations, GST slabs (17 incl. apparel/footwear thresholds), global commission rule,
Buy Box profile, return reasons (11) and global policy, fraud rules (9, all in shadow
mode), SLA policies and ticket categories, full RBAC catalogue, all 36 states/UTs with
GST codes, 22 cities, 41 pincodes, 6 carriers with serviceability and 70 rate slabs.

### Verified test
```
tests/concurrency/run-oversell-test.sh 300 30
→ 100 units, 300 attempts, 30 parallel connections
→ exactly 100 reservations; available=0, reserved=100, physical=100
→ ledger sums equal balances; reconcile_balances() returns zero rows
→ RESULT: PASS
```
This is requirement §66 of the brief, proven rather than asserted.

---

## Designed, not yet implemented

Everything below has a settled contract (schema, API conventions, security model) but no
code yet. The database is deliberately ahead because it is the hardest part to change
later.

### Backend — `services/commerce-api`
NestJS on Fastify. The edge stack (request context, JWT verification, permission guard,
Zod validation pipe, idempotency middleware, rate limiting, problem-detail error mapper
including the `NM0xx` SQLSTATE map, audit interceptor) and the domain modules listed in
`docs/SYSTEM_ARCHITECTURE.md §2`. The SQL engines they orchestrate already exist, so
these modules are thin coordinators rather than reimplementations.

### Workers
`worker-service` (outbox dispatcher + consumers), `search-indexer`,
`notification-worker`, `analytics-worker`, `scheduled-jobs` (reservation sweep,
reconciliation, settlement generation, partition creation).

### Shared packages
`types`, `validation`, `domain` (Money, state machine, ports), `events`, `permissions`,
`logger`, `config`, `api-client`, `ui`, `testing`.

### Web — Next.js
`customer-web`, `seller-web`, `admin-web`, `operations-web`, `support-web`.

### Mobile — Flutter
`customer-mobile`, `seller-mobile`, `delivery-mobile`, `warehouse-mobile`.

### Integrations
Razorpay adapter behind `PaymentProvider`; Shiprocket/Delhivery behind
`ShippingProvider`; FCM/MSG91/email behind `NotificationProvider`; Typesense behind
`SearchEngine`. Mock adapters are already configured in
`platform.integration_settings` for the `local` environment so development and E2E
tests never touch a real provider.

### Remaining seed files
`03_catalog` through `09_orders` exist as placeholders. Realistic categories, brands,
attributes, products, variants, SKUs, sellers, warehouses, inventory, customers and
orders are still to be written.

### Testing and CI
Vitest unit/integration suites, RLS allow/deny matrix (`tests/rls`), Playwright E2E,
Flutter widget/integration tests, GitHub Actions pipeline.

---

## What is needed from the business

These cannot be inferred and block the corresponding integration:

- Razorpay account: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- RazorpayX (or equivalent) credentials for seller payouts
- Logistics account: Shiprocket or Delhivery credentials and pickup registration
- SMS: MSG91 auth key plus DLT entity and template registration (mandatory in India)
- FCM service account JSON; Apple/Google signing credentials for store builds
- Supabase production DB password and secret key (for `db push` and the backend)
- Company legal details, GSTIN, PAN and bank account for platform invoicing
- Approved legal copy: terms of use, privacy policy, seller agreement, return policy
- Production domains and Cloudflare zone

## Recommended next step

Build `services/commerce-api` foundation plus the checkout vertical end to end
(cart → pricing → reservation → order → payment intent → webhook confirmation),
because it exercises every hard invariant already in the database and turns the
verified SQL engines into a working purchase. Then the customer storefront against
that API, then the seller and admin consoles.
