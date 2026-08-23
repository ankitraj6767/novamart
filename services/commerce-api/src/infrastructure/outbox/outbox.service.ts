import { Injectable } from '@nestjs/common';
import {
  EVENT_AGGREGATE,
  resolvePartitionKey,
  validateEventPayload,
  type EventPayload,
  type EventType,
} from '@novamart/events';
import { RequestContext } from '../../common/context/request-context';
import type { Tx } from '../database/database.service';

/**
 * Transactional outbox writer (ADR 0005).
 *
 * Always takes the transaction handle, so the event and the state change it describes
 * commit or roll back together. There is deliberately no method that publishes without
 * a transaction: that would reintroduce the dual-write problem the outbox exists to
 * prevent.
 */
@Injectable()
export class OutboxService {
  async emit<T extends EventType>(
    tx: Tx,
    eventType: T,
    payload: EventPayload<T>,
    options: { aggregateId?: string; metadata?: Record<string, unknown> } = {},
  ): Promise<string> {
    // Validate on the way in. A malformed event is a bug worth failing the whole
    // transaction for, rather than a poison message discovered hours later.
    const validated = validateEventPayload(eventType, payload);
    const aggregate = EVENT_AGGREGATE[eventType];
    const partitionKey = resolvePartitionKey(eventType, validated);
    const aggregateId =
      options.aggregateId ??
      ((validated as Record<string, unknown>)[`${aggregate.aggregateType}Id`] as string | undefined) ??
      partitionKey;

    const ctx = RequestContext.get();

    const [row] = await tx<Array<{ id: string }>>`
      insert into platform.outbox_events (
        event_type, event_version, aggregate_type, aggregate_id, partition_key,
        payload, metadata, actor_id, request_id, trace_id
      ) values (
        ${eventType}, 1, ${aggregate.aggregateType}, ${aggregateId}, ${partitionKey},
        ${tx.json(validated as never)},
        ${tx.json((options.metadata ?? {}) as never)},
        ${ctx?.principal?.userId ?? null},
        ${ctx?.requestId ?? null},
        ${ctx?.traceId ?? null}
      )
      returning id
    `;

    return row!.id;
  }

  /** Emits several events in one statement. Ordering within a partition is preserved. */
  async emitMany(
    tx: Tx,
    events: Array<{ eventType: EventType; payload: unknown; aggregateId?: string }>,
  ): Promise<void> {
    for (const event of events) {
      await this.emit(tx, event.eventType, event.payload as never, {
        aggregateId: event.aggregateId,
      });
    }
  }
}
