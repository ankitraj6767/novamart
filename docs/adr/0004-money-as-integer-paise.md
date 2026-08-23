# ADR 0004 — Money stored as integer paise

Status: Accepted · Date: 2026-08-23

## Context

Marketplace money flows through many multiplicative steps: percentage discounts, GST at 5/12/18/28%,
commission percentages, TCS, shipping, rounding on invoices, then splitting a single payment across
multiple sellers and multiple items. Floating point produces amounts that fail to reconcile with the
payment gateway, and different languages round differently. A reconciliation break of one paisa
across a million orders is a real finance incident.

## Decision

All monetary values are **integers counting paise** (1 INR = 100 paise), stored as `INTEGER` for
line-level values and `BIGINT` for aggregates (GMV, settlements, ledger sums).

- Column and field names carry the unit: `unit_price_paise`, `discount_paise`,
  `total_payable_paise`, `commission_paise`.
- No `NUMERIC`, no `FLOAT`, no `DECIMAL` for money anywhere.
- Percentages are stored as `NUMERIC(6,3)` basis-point-friendly values (e.g. `18.000`) and are only
  ever used as multipliers producing an integer result.
- Rounding is explicit and centralised in `packages/domain/money`: half-up to the nearest paisa,
  applied once per computation step in a fixed order defined by the pricing engine.
- Allocation of an order-level amount (e.g. an order-level coupon) across items uses the
  **largest-remainder method** so the parts always sum exactly to the whole.
- APIs return both the integer and a server-formatted display string so every client renders
  identically.

## Consequences

Positive: exact arithmetic; reconciliation to the paisa; matches Razorpay's own paise-based API,
removing a conversion boundary; no locale rounding drift between Dart, TypeScript and SQL.

Negative: developers must remember the unit (mitigated by the mandatory `_paise` suffix and a lint
rule flagging money-like names without it); display formatting must be deliberate; a `Money` value
object is needed to avoid raw integer arithmetic scattered around.

## Alternatives rejected

**`NUMERIC(12,2)`** — exact in Postgres but becomes a JS `number` or a string at the boundary, and
JS has no decimal type; reintroduces the problem in application code.

**Floating point** — never acceptable for money.
