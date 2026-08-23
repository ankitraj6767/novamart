# ADR 0010 — Immutable price snapshots on orders

Status: Accepted · Date: 2026-08-23

## Context

Prices, discounts, coupons, commission rates and GST rates all change over time. If an invoice,
refund, settlement or dispute is recomputed from *current* configuration, the numbers will not match
what the customer paid. That is a legal problem (tax invoices must be immutable), a finance problem
(settlements stop reconciling) and a support problem (refunds differ from charges).

## Decision

At order creation, persist a complete, immutable snapshot of every input to the price computation.

- `commerce.order_item_price_breakdowns` — per item: `mrp_paise`, `selling_price_paise`,
  `seller_discount_paise`, `platform_discount_paise`, `coupon_discount_paise`,
  `offer_discount_paise`, `bank_offer_discount_paise`, `shipping_paise`, `handling_paise`,
  `taxable_value_paise`, `gst_rate`, `cgst_paise`, `sgst_paise`, `igst_paise`, `cess_paise`,
  `total_payable_paise`, `commission_rate`, `commission_paise`, `platform_fee_paise`,
  plus `applied_rules` (jsonb: which promotion/coupon/commission/tax rule ids and versions fired).
- `commerce.order_price_breakdowns` — order-level totals with the same rigour.
- `commerce.order_addresses` — snapshot of the shipping/billing address as it was, because the
  customer may later edit or delete the address row.
- Return policy, seller terms and the applicable GST rate are snapshotted too: return eligibility is
  judged against the policy captured at order time.

These rows are append-only (no `UPDATE`/`DELETE` grant; trigger-enforced). Corrections are made by
posting an adjusting entry (credit note, `financial_adjustments`), never by editing history.

Refunds, invoices, credit notes, commissions and settlements read **only** from snapshots.

## Consequences

Positive: invoices are reproducible years later; settlements reconcile exactly; refund amounts always
match charges; disputes are answerable with data; `applied_rules` makes "why was I charged this?"
answerable by support without engineering.

Negative: storage cost (small relative to value, and partitioned by month); denormalisation must be
written correctly at creation time because it cannot be repaired later; changing the breakdown shape
requires a migration that preserves historical rows, so the jsonb `applied_rules` field carries a
schema version.

## Alternatives rejected

**Recompute from current prices** — produces wrong historical numbers; disqualifying.

**Snapshot only the final total** — insufficient: partial refunds, item-level returns, per-seller
commission and GST splits all need the components.

**Event sourcing the whole order** — full audit fidelity, but rebuilding state for every read is
complexity we do not need when append-only snapshots plus a status history achieve the same
guarantees.
