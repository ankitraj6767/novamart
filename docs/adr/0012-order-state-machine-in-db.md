# ADR 0012 — Order state machine enforced in the database

Status: Accepted · Date: 2026-08-23

## Context

Order status is mutated from many places: the checkout engine, payment webhooks, warehouse app
actions, courier tracking webhooks, support agent overrides, cancellation flows, return flows and
scheduled sweepers. Each of those is a chance to write an impossible transition —
`DELIVERED → PACKED`, `CANCELLED → SHIPPED`, or a double refund on an already-refunded item.

Application-level validation covers the paths that remember to call it. Webhooks arriving out of
order (courier "delivered" before "out for delivery") and concurrent writers are exactly the cases
that get missed.

## Decision

Enforce valid transitions in the database as the last line of defence.

- `commerce.order_status_transitions(from_status, to_status, allowed_actor_types, requires_reason)`
  is a **data table**, so adding a legitimate transition is a migration/config change, not a code
  deploy across five clients.
- A `BEFORE UPDATE` trigger on `commerce.order_items` (and `commerce.orders`) rejects any status
  change that has no matching row, raising a `check_violation` that the API maps to
  `409 INVALID_STATE_TRANSITION`.
- The trigger also appends to `commerce.order_item_status_history` with actor, reason, previous
  status and `occurred_at`, so history cannot be forgotten by a caller.
- Terminal statuses (`DELIVERED` after the return window, `CANCELLED`, `REFUNDED`) have no outgoing
  transitions except those explicitly listed.
- Out-of-order webhook events are handled by comparing the provider event timestamp against the
  current status's rank; a late "shipped" after "delivered" is recorded as a tracking event but does
  not regress the status.
- The same transition table is exported to `packages/domain` so the API, the Flutter apps and the
  admin UI can present only legal actions — one definition, three consumers.

## Consequences

Positive: an impossible order state is unreachable regardless of which code path writes; history is
guaranteed complete; new transitions are configurable; clients can render legal actions from data
instead of hardcoded switch statements; support overrides are constrained and audited.

Negative: transition logic lives partly in SQL, so debugging spans two languages; the trigger adds
a small write cost; a legitimate new transition needs a migration (accepted — this is a deliberate
control point); bulk status updates must respect the trigger, so bulk paths are written per-row or
with explicit set-based transition validation.

## Alternatives rejected

**Application-only validation** — relies on every writer remembering; the webhook and sweeper paths
are precisely where it fails.

**Full event sourcing of orders** — strongest audit story, but a large complexity increase for the
whole platform; append-only history plus a guarded transition table gives most of the benefit.

**Status as a free-text column with no validation** — how marketplaces end up with `"Deliverd"` in
production data.
