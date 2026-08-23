import { validateEventPayload, type EventType } from '@novamart/events';
import type { WorkerContext } from '../runtime/context';
import { handles, type Consumer, type OutboxEvent } from './consumer';

/**
 * The outbox dispatcher (ADR 0005).
 *
 * Completes the transactional outbox: domain code writes an event in the same
 * transaction as the state change, and this loop is what actually delivers it. Without
 * it, events accumulate in platform.outbox_events and nothing downstream ever happens —
 * no search index update, no notification, no seller earnings posted.
 *
 * Claiming uses platform.claim_outbox_batch, which is FOR UPDATE SKIP LOCKED. That is
 * what lets several replicas run this loop concurrently without processing the same
 * event twice or blocking each other.
 *
 * Per event, per consumer, in ONE transaction:
 *   insert the offset row (loses on conflict -> already done, skip)
 *   run the consumer
 *
 * So a consumer's writes and the record of having run commit together. A crash between
 * them is impossible; a crash after them means the event is redelivered and every
 * consumer correctly reports "already done".
 */
export class OutboxDispatcher {
  private running = false;
  private stopping = false;
  private idleSince: number | null = null;

  constructor(
    private readonly ctx: WorkerContext,
    private readonly consumers: Consumer[],
  ) {}

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.ctx.logger.info(
      {
        workerId: this.ctx.workerId,
        consumers: this.consumers.map((c) => c.name),
        batchSize: this.ctx.env.OUTBOX_BATCH_SIZE,
      },
      'Outbox dispatcher started',
    );

    while (!this.stopping) {
      let processed = 0;
      try {
        processed = await this.tick();
      } catch (error) {
        // A failure here is infrastructure-level (connection lost, claim failed), not a
        // single bad event. Back off rather than spinning hot against a sick database.
        this.ctx.logger.error(
          { err: error instanceof Error ? error.message : String(error) },
          'Outbox dispatch tick failed',
        );
        await this.sleep(Math.min(this.ctx.env.OUTBOX_POLL_INTERVAL_MS * 20, 10_000));
        continue;
      }

      if (processed === 0) {
        // Nothing to do: poll at the configured interval. A full batch means there is
        // probably more waiting, so go straight round again.
        if (this.idleSince === null) this.idleSince = Date.now();
        await this.sleep(this.ctx.env.OUTBOX_POLL_INTERVAL_MS);
      } else {
        this.idleSince = null;
        if (processed < this.ctx.env.OUTBOX_BATCH_SIZE) {
          await this.sleep(this.ctx.env.OUTBOX_POLL_INTERVAL_MS);
        }
      }
    }

    this.running = false;
    this.ctx.logger.info('Outbox dispatcher stopped');
  }

  /** Claims and processes one batch. Returns how many events were handled. */
  async tick(): Promise<number> {
    const events = await this.ctx.sql<OutboxEvent[]>`
      select id, event_type, event_version, aggregate_type, aggregate_id, partition_key,
             payload, metadata, actor_id, request_id, trace_id, attempts, occurred_at
        from platform.claim_outbox_batch(${this.ctx.workerId}, ${this.ctx.env.OUTBOX_BATCH_SIZE})
    `;

    if (events.length === 0) return 0;

    for (const event of events) {
      await this.dispatch(event);
    }

    return events.length;
  }

  private async dispatch(event: OutboxEvent): Promise<void> {
    const interested = this.consumers.filter((c) => handles(c, event.event_type));

    // No consumer wants it. That is a normal state — plenty of events exist for audit and
    // for future consumers — so it completes rather than retrying forever.
    if (interested.length === 0) {
      await this.complete(event);
      return;
    }

    // Validate once, before any consumer sees it. A malformed payload is a publisher bug
    // and will never succeed, so it goes straight to the dead letter rather than
    // consuming the retry budget.
    try {
      validateEventPayload(event.event_type as EventType, event.payload);
    } catch (error) {
      const message = `Payload failed its contract: ${
        error instanceof Error ? error.message : String(error)
      }`;
      this.ctx.logger.error(
        { eventId: event.id, eventType: event.event_type },
        message,
      );
      await this.deadLetter(event, message);
      return;
    }

    const failures: string[] = [];

    for (const consumer of interested) {
      try {
        await this.runConsumer(consumer, event);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${consumer.name}: ${message}`);
        this.ctx.logger.error(
          {
            eventId: event.id,
            eventType: event.event_type,
            consumer: consumer.name,
            attempts: event.attempts,
            err: message,
          },
          'Consumer failed',
        );
      }
    }

    if (failures.length > 0) {
      // fail_outbox_event applies exponential backoff and dead-letters once max_attempts
      // is reached. Consumers that already succeeded have their offset recorded, so a
      // retry only re-runs the ones that failed.
      await this.fail(event, failures.join(' | '));
      return;
    }

    await this.complete(event);
  }

  /**
   * Runs one consumer inside a transaction that also claims the offset.
   *
   * The insert goes first: if it conflicts, this consumer has already handled this event
   * and the work is skipped entirely. That is the at-least-once guard.
   */
  private async runConsumer(consumer: Consumer, event: OutboxEvent): Promise<void> {
    const startedAt = Date.now();

    await this.ctx.transaction(
      async (tx) => {
        const claimed = await tx<Array<{ consumer_name: string }>>`
          insert into platform.consumer_offsets (consumer_name, event_id, outcome)
          values (${consumer.name}, ${event.id}, 'SUCCESS')
          on conflict (consumer_name, event_id) do nothing
          returning consumer_name
        `;

        if (claimed.length === 0) {
          this.ctx.logger.debug(
            { eventId: event.id, consumer: consumer.name },
            'Consumer already processed this event; skipping',
          );
          return;
        }

        await consumer.handle(event, tx, this.ctx);

        await tx`
          update platform.consumer_offsets
             set duration_ms = ${Date.now() - startedAt}
           where consumer_name = ${consumer.name} and event_id = ${event.id}
        `;
      },
      {
        // Events are replayed by the platform, not by the original actor. The actor that
        // caused the event is preserved on the event row itself.
        actorType: 'WORKER',
        requestId: event.request_id,
        traceId: event.trace_id,
      },
    );
  }

  private async complete(event: OutboxEvent): Promise<void> {
    await this.ctx.sql`select platform.complete_outbox_event(${event.id})`;
  }

  private async fail(event: OutboxEvent, error: string): Promise<void> {
    await this.ctx.sql`select platform.fail_outbox_event(${event.id}, ${error.slice(0, 2000)})`;
  }

  /**
   * Sends an event straight to the dead letter, skipping the retry budget. Used only for
   * failures that are certain not to resolve on retry.
   */
  private async deadLetter(event: OutboxEvent, error: string): Promise<void> {
    await this.ctx.sql`
      update platform.outbox_events
         set status = 'DEAD_LETTER', last_error = ${error.slice(0, 2000)}, locked_by = null
       where id = ${event.id}
    `;
  }

  stop(): void {
    this.stopping = true;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
