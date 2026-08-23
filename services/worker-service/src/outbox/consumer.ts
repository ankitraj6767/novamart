import type { EventType } from '@novamart/events';
import type { Tx, WorkerContext } from '../runtime/context';

/** An outbox event as stored, with its payload already parsed by postgres.js. */
export interface OutboxEvent {
  id: string;
  event_type: string;
  event_version: number;
  aggregate_type: string;
  aggregate_id: string;
  partition_key: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  actor_id: string | null;
  request_id: string | null;
  trace_id: string | null;
  attempts: number;
  occurred_at: string;
}

/**
 * A consumer of domain events.
 *
 * Two rules, both load-bearing:
 *
 *  1. `handle` must be idempotent. Delivery is at-least-once — the dispatcher can die
 *     between doing the work and marking the event complete, and the event will be
 *     redelivered. The dispatcher records (consumer_name, event_id) in
 *     platform.consumer_offsets and skips what it has already done, but that record is
 *     written in the SAME transaction as the work, so the guarantee holds even on a
 *     hard kill. A consumer that also happens to be idempotent in its own right is
 *     better still.
 *
 *  2. `handle` receives the transaction. Anything it writes commits with the offset
 *     record, so "did the work" and "recorded that I did the work" cannot diverge.
 */
export interface Consumer {
  readonly name: string;
  /** Event types this consumer wants. Checked before any work is attempted. */
  readonly eventTypes: readonly EventType[];
  handle(event: OutboxEvent, tx: Tx, ctx: WorkerContext): Promise<void>;
}

export function handles(consumer: Consumer, eventType: string): boolean {
  return (consumer.eventTypes as readonly string[]).includes(eventType);
}
