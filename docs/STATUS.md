# NovaMart — Build Status

Honest accounting of what exists and is verified, versus what is designed but not yet
implemented. Updated: 2026-08-25.

---

## The checkout vertical is now working end to end

A customer can sign in, browse, add to cart, be quoted authoritatively, place an order,
pay, and cancel with a refund raised — against the real database, with the real state
machine and the real inventory engine.

**Verified by `tests/e2e-api/checkout-vertical.mjs`: 50 assertions, 0 failures**, run
against a freshly reset database. It asserts the invariants that matter rather than the
happy path alone:

| Invariant                                                                         | Brief |
| --------------------------------------------------------------------------------- | ----- |
| Server prices the order; a client-supplied total is rejected with `PRICE_CHANGED` | §100  |
| Order placement without an `Idempotency-Key` is refused                           | §61   |
| Placing twice with one key yields ONE order, not two                              | §61   |
| A webhook with a bad signature is refused and not recorded                        | §54   |
| A redelivered webhook is a no-op; order status and total unchanged                | §34   |
| Payment is only `verified` from a server-side source, never a client claim        | §33   |
| Stock is reserved at checkout and released on cancellation                        | §25   |
| An order the caller does not own returns 404, not 403                             | IDOR  |

Alongside the pre-existing SQL-level proof, re-run on the current schema:

```
tests/concurrency/run-oversell-test.sh 300 30
→ 100 units, 300 concurrent attempts, 30 connections
→ exactly 100 reservations; ledger and balances reconcile
→ RESULT: PASS
```

Full verification state: `pnpm typecheck` clean (15 tasks), `pnpm test` 70 tests passing,
`supabase db reset` exits 0 applying **29 migrations** with **zero tables missing RLS**.

### Bugs this exercise found and fixed

Building the vertical was what proved these; none were visible from the schema alone.

- **`fulfillment.calculate_shipping_charge` was unusable by any caller.** It returned
  `bigint` where its signature declared `public.paise` (arithmetic over a domain yields
  the base type), so `RETURN QUERY` failed with SQLSTATE 42804. Every basket would have
  500'd at the shipping step. Fixed in migration `20260823002900`.
- **No seeded user could sign in.** `auth.users` rows were inserted with NULL token
  columns; GoTrue scans those into non-nullable Go strings and fails the whole request
  with "Database error querying schema". Fixed in `seed/08_customers.sql`.
- **`analytics.events` partitions had RLS disabled**, and `ensure_event_partition()`
  created every future partition unpoliced. Not reachable today (only `service_role` holds
  grants) but a single future grant would have exposed unpoliced copies of the rows, since
  a query naming a partition directly bypasses the parent's policies. Fixed in
  `20260823002800`.
- **`splitGst` produced invalid tax invoices.** It gave the odd paisa to CGST, so
  CGST ≠ SGST on an intra-state supply — which no auditor accepts, and which
  `breakdown_cgst_equals_sgst` rejects. Now splits into exact halves and reports the
  adjusted total.
- **`tsx` cannot run this API.** esbuild does not emit `emitDecoratorMetadata`, so Nest's
  DI injected `undefined` for every constructor parameter and _every_ endpoint returned 500. Dev now compiles with `tsc`.
- **The error filter logged nothing useful** — `Error` objects JSON-serialise to `{}`, so
  every 500 was opaque. It now lifts out name, message, stack and the Postgres
  SQLSTATE/constraint/detail fields. This is what made the rest of the list findable.
- Payment confirmation ran with the **customer's** actor type, but
  `PENDING_PAYMENT → PAYMENT_CONFIRMED` is SYSTEM-only. Payment outcomes now run under a
  SYSTEM context while still recording who prompted them.

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

| Metric                       | Value                    |
| ---------------------------- | ------------------------ |
| Migrations                   | 27                       |
| Tables                       | 172                      |
| Tables missing RLS           | **0**                    |
| RLS policies                 | 186                      |
| Indexes                      | ~800                     |
| Functions                    | 111                      |
| Permissions / roles / grants | 106 / 22 / 464           |
| Storage buckets              | 10 (4 public, 6 private) |

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

Implemented and exercised end to end:

- Edge stack: request context, JWKS/HS256 JWT verification, permission + scope + MFA
  guard, Zod validation, idempotency, rate limiting, error mapper with the `NM0xx`
  SQLSTATE map
- `catalog` — categories, PLP, PDP with SKU-scoped Buy Box, CMS home, serviceability
- `identity` — profile, addresses, devices, notification preferences
- `cart` — items, coupon intent, pincode, save-for-later, live revalidation
- `checkout` — the engine: listing validation, fulfillment-node selection, delivery
  promise, shipping, GST, promotions/coupons, COD decision, reservation, order creation
  with frozen price and commission snapshots
- `orders` — keyset-paginated list, detail with timeline and tracking, cancellation
- `payments` — provider session, idempotent webhooks, client-verify, refund outcomes
- `platform` — settings and feature flags with percentage rollout
- Adapters behind the ports: Razorpay, plus a mock provider that signs its webhooks with
  the same HMAC scheme so the failure paths in §67 are testable

The API/worker expansion now covers the remaining transactional backend verticals: seller
orders, fulfillment and tracking, returns/QC/refund initiation, reviews/Q&A, support/SLA
workflow, seller ledger/settlements/payouts, Typesense projection, search/recommendation
foundation, notifications, risk cases, wishlist/recently viewed, and dynamic platform/CMS
controls. These are wired to the existing migrations and transactional outbox.

### Workers

`worker-service` now includes the outbox dispatcher, analytics, notifications, finance earnings,
Typesense indexing, reservation/reconciliation/partition/checkout/idempotency/metrics jobs,
and queued notification delivery. Settlement generation and payout initiation are exposed as
permissioned API operations; external payout credentials are still a business dependency.

### Shared packages

`types`, `validation`, `domain` (Money, state machine, ports), `events`, `permissions`,
`logger`, `config`, `api-client`, `ui`, `testing`.

### Web — Next.js

The repository still has no `apps/` source tree. The API contracts are now documented in
`docs/API.md`, but the five Next.js applications remain a separate implementation milestone.

### Mobile — Flutter

The repository still has no Flutter source tree. Customer/seller/operations APIs now expose
the core workflows those clients need, but the four Flutter applications remain unimplemented.

### Integrations

Razorpay adapter behind `PaymentProvider`; Shiprocket/Delhivery behind
`ShippingProvider`; FCM/MSG91/email behind `NotificationProvider`; Typesense behind
`SearchEngine`. Mock adapters are already configured in
`platform.integration_settings` for the `local` environment so development and E2E
tests never touch a real provider.

### Remaining seed files

`03_catalog` through `08_customers` now carry real data (18 categories, 6 brands, 5
products with 13 SKUs and 15 competing listings, 4 sellers, 4 warehouses, 3 test
customers with addresses). `07_marketing` and `09_orders` are still placeholders —
marketing content is currently seeded from `06`. The catalogue is deliberately small; it
needs breadth before it resembles a marketplace.

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

## Local development notes

- `SUPABASE_JWKS_URL` must be set in `services/commerce-api/.env.local`. Supabase now
  signs access tokens asymmetrically (ES256 with a `kid`); the HS256 secret alone will
  reject every token. `.env.example` documents it.
- Seeded customers sign in with `NovaMart#Local1`
  (`ananya.iyer@example.novamart.in` and others in `seed/08_customers.sql`).
- With `PAYMENT_PROVIDER=mock`, `POST /api/v1/payments/mock/:providerIntentId/succeed`
  drives a real signed webhook through the real handler. Those routes are not registered
  when `APP_ENV=production`.
- Do not run `supabase db reset --linked` or `db push`: this working copy is linked to a
  remote project.

## Recommended next step

The storefront. `customer-web` against the working API is now the highest-value move: it
turns a verified purchase path into something a person can actually use, and it will
surface contract gaps in the same way building checkout surfaced the six bugs above.

After that, in order: the seller console (so a seller can list and fulfil without a
developer), the outbox dispatcher and workers (so events currently accumulating in
`platform.outbox_events` are consumed), then shipment creation, returns and settlement.
