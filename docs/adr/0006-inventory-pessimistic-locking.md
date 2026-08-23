# ADR 0006 — Pessimistic row locking for inventory reservation

Status: Accepted · Date: 2026-08-23

## Context

The defining correctness requirement: with 100 units in stock and 10,000 concurrent checkout
attempts, exactly 100 reservations may succeed. Never 101. Overselling on a flash sale produces
cancellations, refunds, seller disputes and reputational damage.

Read-then-write without locking is a textbook lost update: two transactions both read
`available = 1`, both decrement, and stock goes negative or a unit is sold twice.

## Decision

Reserve inventory using **pessimistic row-level locking inside the checkout transaction**.

```sql
-- rows locked in a deterministic order (sku_id, warehouse_id) to prevent deadlocks
SELECT id, available_quantity, reserved_quantity, version
FROM inventory.warehouse_inventory
WHERE sku_id = ANY($1) AND warehouse_id = ANY($2) AND seller_id = $3
ORDER BY sku_id, warehouse_id
FOR UPDATE;

-- assert, then move quantity
UPDATE inventory.warehouse_inventory
SET available_quantity = available_quantity - $qty,
    reserved_quantity  = reserved_quantity  + $qty,
    version = version + 1,
    updated_at = now()
WHERE id = $id AND available_quantity >= $qty;   -- second guard: 0 rows ⇒ abort
```

Defence in depth, all four layers required:

1. `FOR UPDATE` serialises concurrent access to the same stock row.
2. The `WHERE available_quantity >= $qty` predicate makes the update a no-op if state changed.
3. `CHECK (available_quantity >= 0 AND reserved_quantity >= 0)` makes negative stock impossible at
   the storage layer regardless of application bugs.
4. Every movement writes an immutable `inventory_ledger` row; a reconciliation job asserts
   `SUM(ledger delta) = materialised balance` and alerts on drift.

Locks are held only for the reservation portion of the transaction. Provider calls (payment,
shipping) happen **outside** the lock window. Reservations carry `expires_at` (15 minutes default,
configurable) and are released by a sweeper, so an abandoned checkout cannot hold stock forever.

Deadlock avoidance: all inventory rows in a transaction are locked in a single statement with a
deterministic `ORDER BY`. `lock_timeout` and `statement_timeout` are set so a pathological case
fails fast with `INVENTORY_UNAVAILABLE` rather than hanging.

## Consequences

Positive: correctness is guaranteed by the database, not by hope; simple to reason about; the
constraint layer catches bugs the application layer misses; ledger makes every discrepancy
explainable.

Negative: hot SKUs serialise — a single flash-sale SKU is limited by lock throughput on one row.
Mitigations, applied only when measured: reduce the lock window, shard hot stock into N sub-rows
per SKU, or move flash-sale allocation to a Redis-fronted token issuer that still settles into
Postgres. Also: high contention increases p99 checkout latency; contention and lock-wait metrics
are alerted on.

## Alternatives rejected

**Optimistic concurrency with a version column and retries** — correct, but under 10,000-way
contention the retry storm is worse than waiting on a lock, and tail latency becomes unpredictable.
The `version` column is still maintained for auditing and for optimistic paths elsewhere.

**Redis as the reservation authority** — fast, but Redis is not durable enough to be the source of
truth for stock; a failover losing seconds of writes means overselling.

**`SERIALIZABLE` isolation** — pushes the problem to serialisation failures and forces the same
retry logic with less control.
