# NovaMart — Database Guide

Authoritative DDL lives in `supabase/migrations/`. The schema is the contract: it is
hand-authored and reviewed, never generated from application code (ADR 0008).

Current state: **27 migrations, 172 tables, 186 RLS policies, ~800 indexes, 111 functions**,
all verified to apply cleanly on a fresh database.

---

## 1. Schema ownership

| Schema | Owns | Client reachable |
| --- | --- | --- |
| `api` | Client-facing views and RPCs | Yes (only schema exposed via PostgREST) |
| `identity` | Principals, RBAC, devices, addresses | Own rows only |
| `catalog` | Categories, brands, attributes, products, variants, SKUs, listings | Public read of active rows |
| `seller` | Seller businesses, users, KYC, bank, tax | Scoped |
| `pricing` | Prices, promotions, coupons, tax rules, commission rules | Prices public; rules restricted |
| `inventory` | Stock balances, ledger, reservations, transfers | Read-only, scoped |
| `commerce` | Cart, checkout, orders, reviews, Q&A | Own rows |
| `payments` | Intents, attempts, transactions, webhooks, refunds | Status only |
| `fulfillment` | Geography, serviceability, carriers, shipments, tracking | Geography public; shipments scoped |
| `returns` | Returns, evidence, QC, replacements | Own rows / scoped |
| `finance` | Seller ledger, settlements, payouts, invoices | Own seller only |
| `marketing` | Campaigns, CMS, notifications, segments, search vocabulary | Public content; own notifications |
| `support` | Tickets, messages, attachments, SLA, help centre | Own tickets |
| `analytics` | Event stream, metrics, risk, fraud | No client access |
| `audit` | Audit logs, security events, data access logs | No client access |
| `platform` | Flags, settings, integrations, outbox, idempotency | No client access |
| `private` | Internal helpers | No access |

## 2. Conventions

**Naming.** `snake_case` throughout. Tables are plural. Booleans read as assertions
(`is_active`, `has_gst`). Timestamps end in `_at`, dates in `_date`, durations carry
their unit (`_days`, `_hours`, `_minutes`, `_ms`).

**Money.** Always an integer count of paise, column name suffixed `_paise` (ADR 0004).
`INTEGER` for line-level values, `BIGINT` for aggregates. No `NUMERIC`, no floats.
Percentages are `public.percentage` (`NUMERIC(6,3)`) used only as multipliers.

**Keys.** `uuid` primary keys. `private.uuid_generate_v7()` for append-heavy tables
(orders, events, ledger, audit) so index inserts stay local; `gen_random_uuid()`
elsewhere. Human-facing references are separate and prefixed:
`NM…` order, `RT…` return, `SH…` shipment, `ST…` settlement, `PO…` payout,
`RF…` refund, `TK…` ticket, `SL…` seller, `FC…` fraud case, `TR…` transfer.

**Domain types** (in `public`, universally accessible): `paise`, `percentage`,
`email_address`, `phone_e164`, `indian_pincode`, `pan_number`, `gstin`, `ifsc_code`,
`hsn_code`, `url_slug`, `currency_code`, `locale_code`, `non_negative_int`,
`positive_int`. These make malformed data unrepresentable rather than merely
discouraged.

**Timestamps.** Every table has `created_at`; mutable tables have `updated_at`
maintained by a `BEFORE UPDATE` trigger (`private.set_updated_at`), never by
application code.

**Soft delete.** `deleted_at` where history must survive (addresses, bank accounts,
media). Hard delete only where nothing references the row.

## 3. Append-only tables

These are immutable by trigger, for every role including `service_role`:

```
inventory.inventory_ledger              finance.seller_ledger (except settlement bookkeeping)
commerce.order_item_price_breakdowns    commerce.order_price_breakdowns
commerce.order_addresses                commerce.order_status_history
commerce.order_item_status_history       commerce.order_events
payments.payment_transactions            payments.payment_webhook_events (except processing state)
payments.cod_eligibility_decisions       fulfillment.tracking_events
seller.seller_status_history             catalog.listing_status_history
catalog.product_moderation_events        returns.return_status_history
support.ticket_status_history            pricing.listing_price_history
analytics.events                         analytics.risk_events
audit.audit_logs                         audit.security_events
audit.data_access_logs                   platform.outbox_events (except dispatch state)
```

Corrections are compensating entries, never edits. `finance.invoices` is
immutable once `GENERATED`; corrections are credit notes.

## 4. Custom SQLSTATEs

Raised by database functions, mapped by the API to the error codes in
`docs/API_CONVENTIONS.md §4`:

| SQLSTATE | API error code | Raised by |
| --- | --- | --- |
| `NM001` | `INVENTORY_UNAVAILABLE` | `inventory.reserve_stock`, `release_reservation`, `apply_adjustment` |
| `NM002` | `INVALID_STATE_TRANSITION` | order/item transition guards, `consume_reservation` |
| `NM003` | `IDEMPOTENCY_CONFLICT` | idempotency handling |
| `NM004` | `RESERVATION_EXPIRED` | `inventory.confirm_reservations` |
| `NM005` | `ADJUSTMENT_NOT_APPROVED` | `inventory.apply_adjustment` |
| `NM006` | `REFUND_AMOUNT_EXCEEDS_CAPTURED` | `payments.assert_refund_within_capture` |
| `NM007` | `SETTLEMENT_NOT_READY` | `finance.mark_ledger_settled` |

Standard codes also carry meaning: `restrict_violation` from an append-only guard,
`insufficient_privilege` from the role-grant guard, `check_violation` from validation
triggers.

## 5. Key functions

**Inventory (service role only)**
`reserve_stock`, `release_reservation`, `confirm_reservations`, `consume_reservation`,
`release_expired_reservations`, `receive_stock`, `apply_adjustment`,
`reconcile_balances`, `available_for_sku`.

**Pricing** `resolve_commission`, `resolve_gst_rate`, `compute_buy_box_score`,
`recompute_buy_box`.

**Fulfillment** `resolve_zone`, `is_intra_state_supply`, `calculate_shipping_charge`,
`calculate_delivery_promise`.

**Returns** `resolve_policy`, `check_eligibility`.

**Finance** `seller_balance`, `post_order_item_earnings`, `mark_ledger_settled`,
`next_invoice_number`.

**Catalog** `resolve_category_policy`, `rebuild_subtree_paths`.

**RBAC** `has_permission`, `has_scoped_permission`, `has_seller_scope`,
`has_warehouse_scope`, `my_seller_ids`, `my_warehouse_ids`, `is_staff`,
`is_account_active`, `effective_permissions`, `max_role_rank`.

**Platform** `claim_outbox_batch`, `complete_outbox_event`, `fail_outbox_event`,
`requeue_stuck_outbox_events`, `analytics.ensure_event_partition`.

## 6. Concurrency

Inventory reservation uses pessimistic row locking with deterministic lock ordering
(ADR 0006). Verified empirically:

```
tests/concurrency/run-oversell-test.sh 300 30
→ 300 attempts, 30 parallel connections, 100 units in stock
→ exactly 100 reservations, available=0, reserved=100, physical unchanged
→ ledger sums equal materialised balance, reconcile_balances() returns zero rows
```

Other concurrency guards:
- `finance.settlement_items` has `UNIQUE (ledger_entry_id)` — a ledger entry can be
  settled exactly once, so double payout is impossible.
- `pricing.coupon_redemptions` has `UNIQUE (coupon_id, order_id)`.
- `payments.payment_webhook_events` has `UNIQUE (provider, provider_event_id)`.
- `finance.next_invoice_number` serialises on a sequence row for gapless GST numbering.
- `platform.claim_outbox_batch` uses `FOR UPDATE SKIP LOCKED`.

## 7. Partitioning

`analytics.events` is `RANGE` partitioned monthly from day one, with a `DEFAULT`
partition so a missing future partition degrades to a slow write rather than an error.
`analytics.ensure_event_partition()` is run monthly by `scheduled-jobs`.

Planned when volume justifies it (documented in `docs/ER_DIAGRAM.md`):
`commerce.orders`, `commerce.order_items`, `inventory.inventory_ledger`,
`fulfillment.tracking_events`, `audit.audit_logs`,
`payments.payment_webhook_events`.

## 8. Migration safety

- One concern per migration; timestamp-prefixed and never edited after merge.
- Additive first: add nullable column → backfill → add constraint `NOT VALID` →
  `VALIDATE CONSTRAINT`. Never a blocking rewrite on a large table.
- New indexes on large tables use `CREATE INDEX CONCURRENTLY` in a standalone
  migration (it cannot run in a transaction).
- Destructive changes (drop column, drop table, narrow a type) require an ADR and an
  explicit human approval step in CI. `supabase db push` is never run automatically
  against production.
- Every migration is validated by `supabase db reset` on a fresh database in CI, so
  ordering and dependency errors surface before review.

## 9. Review checklist

Before database work is considered complete:

```
[ ] Foreign keys on every relationship, with a considered ON DELETE action
[ ] Indexes match actual access patterns; partial indexes where the predicate is selective
[ ] Unique constraints express real business rules (not just PKs)
[ ] CHECK constraints make invalid states unrepresentable
[ ] Nullability is deliberate on every column
[ ] created_at / updated_at present; updated_at trigger attached
[ ] Soft-delete strategy chosen and consistent
[ ] Append-only guard on anything financial or historical
[ ] RLS enabled, with allow AND deny tests
[ ] Grants explicit; nothing relies on default privileges
[ ] EXPLAIN ANALYZE reviewed for the hot queries this change affects
[ ] Migration is reversible or the forward fix is documented
```

## 10. Local workflow

```bash
pnpm db:start     # supabase start
pnpm db:reset     # migrations + seed on a fresh database (the CI check)
pnpm db:diff      # generate a migration from local schema edits
pnpm db:lint      # Supabase/Postgres linting
pnpm db:types     # regenerate TypeScript types into packages/types

tests/concurrency/run-oversell-test.sh 300 30    # inventory correctness
```

Remote `supabase db push` requires `SUPABASE_DB_PASSWORD` and a linked project
(`supabase link --project-ref qeayqpxyhbcybmttdrgp`). Production pushes go through
the CI approval gate described in `docs/DEPLOYMENT.md`.
