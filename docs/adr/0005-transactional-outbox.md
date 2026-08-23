# ADR 0005 — Transactional outbox for all domain events

Status: Accepted · Date: 2026-08-23

## Context

Order confirmation must trigger: seller notification, customer notification, search index update,
analytics event, ledger posting and shipment planning. Publishing to a queue inside the request
handler creates a dual-write: the database transaction can commit while the publish fails (or the
reverse), leaving permanent inconsistency. At marketplace volume this happens daily, and the
symptom is "customer paid but seller never saw the order".

## Decision

Every domain event is written to `platform.outbox_events` **in the same transaction** as the state
change that produced it. No domain code publishes directly to a queue.

```sql
BEGIN;
  INSERT INTO commerce.orders ...;
  UPDATE inventory.warehouse_inventory ...;
  INSERT INTO inventory.inventory_ledger ...;
  INSERT INTO platform.outbox_events (event_type, aggregate_type, aggregate_id, payload, trace_id) ...;
COMMIT;
```

A dispatcher in `worker-service` polls:

```sql
UPDATE platform.outbox_events SET status='PROCESSING', attempts=attempts+1, locked_at=now()
WHERE id IN (
  SELECT id FROM platform.outbox_events
  WHERE status='PENDING' AND available_at <= now()
  ORDER BY created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 100
) RETURNING *;
```

Then publishes through the `EventBus` port, marks `PUBLISHED`, or on failure schedules a retry with
exponential backoff and jitter. After `max_attempts` the row becomes `DEAD_LETTER` and alerts.

Consumers are idempotent: `platform.consumer_offsets` has `UNIQUE (consumer_name, event_id)`, and
handlers are written so that reprocessing is harmless. Delivery is at-least-once, never
exactly-once.

`trace_id` travels in the outbox row, so a single trace spans HTTP request → transaction → worker →
provider call.

## Consequences

Positive: no lost events, ever; events survive queue outages because they are durable rows; replay
is trivial (reset status); ordering per aggregate is available via `ORDER BY created_at` within an
`aggregate_id`; transport is swappable (Supabase Queues → Kafka) without touching domain code.

Negative: added publish latency (poll interval, ~250 ms at launch — acceptable since nothing
user-facing waits on it); the outbox table needs archival/partitioning; `SKIP LOCKED` polling costs
a small amount of constant DB load; consumers must be genuinely idempotent, which requires
discipline and tests.

## Alternatives rejected

**Publish directly from the handler** — the dual-write problem this ADR exists to prevent.

**Postgres logical replication / CDC (Debezium)** — better at very large scale but heavier
infrastructure than launch justifies; the outbox table is compatible with a later CDC migration.

**`LISTEN/NOTIFY`** — not durable; a notification delivered while no listener is connected is lost.
