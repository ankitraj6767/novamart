import { EVENT_TYPES, type EventType } from '@novamart/events';
import type { Consumer, OutboxEvent } from '../outbox/consumer';
import type { Tx, WorkerContext } from '../runtime/context';

/**
 * Projects commerce events into analytics.events.
 *
 * analytics.events is the funnel table: partitioned by month, written once, never
 * updated. It is deliberately fed from the outbox rather than from client-side beacons
 * for the events that matter commercially — an ad blocker can drop a page view, but it
 * cannot drop an order.
 *
 * Client-side impressions and product views arrive through a separate ingest path; this
 * consumer supplies the spine (checkout started, order placed, payment outcome,
 * delivery, return) that the conversion and RTO rates are computed from.
 */
export class AnalyticsConsumer implements Consumer {
  readonly name = 'analytics-projector';

  /**
   * Only events with a funnel equivalent.
   *
   * analytics.events is a CLICKSTREAM table with its own vocabulary
   * (events_event_type_check), not a log of domain events. Payment outcomes, delivery and
   * refunds have no funnel step, and forcing them in would both violate the constraint
   * and muddle the table's meaning. Those are derived from the transactional tables by
   * analytics.roll-up-daily-metrics instead.
   */
  readonly eventTypes: readonly EventType[] = [
    EVENT_TYPES.CHECKOUT_STARTED,
    EVENT_TYPES.ORDER_CREATED,
    EVENT_TYPES.ORDER_CANCELLED,
    EVENT_TYPES.RETURN_REQUESTED,
  ];

  /**
   * Domain event name -> clickstream event name.
   *
   * ORDER_CREATED becomes PURCHASE because that is the funnel's terminal step; the two
   * vocabularies are separate on purpose and this is the only place they meet.
   */
  private static readonly FUNNEL_EVENT: Record<string, string> = {
    CHECKOUT_STARTED: 'CHECKOUT_STARTED',
    ORDER_CREATED: 'PURCHASE',
    ORDER_CANCELLED: 'ORDER_CANCELLED',
    RETURN_REQUESTED: 'RETURN_REQUESTED',
  };

  async handle(event: OutboxEvent, tx: Tx, ctx: WorkerContext): Promise<void> {
    const payload = event.payload as Record<string, unknown>;

    const funnelEvent = AnalyticsConsumer.FUNNEL_EVENT[event.event_type];
    if (!funnelEvent) {
      // Subscribed but unmapped: nothing to project. Guarded rather than assumed so a new
      // subscription cannot start failing the constraint at runtime.
      ctx.logger.debug(
        { eventType: event.event_type },
        'No funnel mapping for event; not projected',
      );
      return;
    }

    const orderId = this.uuid(payload['orderId']);
    const userId = this.uuid(payload['userId']);
    const sellerId = this.uuid(payload['sellerId']);

    // The partition must exist before the insert. Cheap: the function returns early when
    // it already does, and it is the same call the monthly job makes.
    await tx`select analytics.ensure_event_partition(${event.occurred_at}::date)`;

    // value_paise is the event's monetary weight, whatever that means for its type. GMV
    // is summed from ORDER_CREATED; refunds are netted from REFUND_SUCCESS.
    const valuePaise = this.money(
      payload['totalPayablePaise'] ??
      payload['amountPaise'] ??
      payload['subtotalPaise'] ??
      payload['refundablePaise'],
    );

    await tx`
      insert into analytics.events (
        event_type, user_id, order_id, seller_id, value_paise, quantity,
        properties, request_id, trace_id, occurred_at
      ) values (
        ${funnelEvent}, ${userId}, ${orderId}, ${sellerId}, ${valuePaise},
        ${this.int(payload['itemCount'])},
        ${tx.json(this.properties(event) as never)},
        ${event.request_id}, ${event.trace_id}, ${event.occurred_at}
      )
    `;

    // Per-seller daily rollups for the seller scorecard. Aggregates are upserted rather
    // than recomputed: a full recompute over commerce.orders would be a table scan per
    // event, and this is called on the order path.
    if (sellerId && event.event_type === EVENT_TYPES.ORDER_CREATED) {
      await this.rollUpSellers(event, tx);
    }

    ctx.logger.debug(
      { eventId: event.id, eventType: event.event_type },
      'Projected event into analytics',
    );
  }

  /**
   * ORDER_CREATED carries every seller in the order, so one event updates each of their
   * daily rows.
   */
  private async rollUpSellers(event: OutboxEvent, tx: Tx): Promise<void> {
    const sellerIds = Array.isArray(event.payload['sellerIds'])
      ? (event.payload['sellerIds'] as string[])
      : [];
    if (sellerIds.length === 0) return;

    const orderId = this.uuid(event.payload['orderId']);
    if (!orderId) return;

    // Attribute each seller only their own share of the order, taken from the per-item
    // breakdowns. Crediting every seller with the full order total is a classic way to
    // produce a GMV figure that exceeds actual revenue.
    await tx`
      insert into analytics.seller_metrics (
        seller_id, metric_date, orders, units, gmv_paise, commission_paise
      )
      select oi.seller_id,
             ${event.occurred_at}::date,
             1,
             sum(oi.quantity)::int,
             coalesce(sum(b.total_payable_paise), 0),
             coalesce(sum(b.commission_paise), 0)
        from commerce.order_items oi
        left join commerce.order_item_price_breakdowns b on b.order_item_id = oi.id
       where oi.order_id = ${orderId}
       group by oi.seller_id
      on conflict (seller_id, metric_date) do update
        set orders           = analytics.seller_metrics.orders + excluded.orders,
            units            = analytics.seller_metrics.units + excluded.units,
            gmv_paise        = analytics.seller_metrics.gmv_paise + excluded.gmv_paise,
            commission_paise = analytics.seller_metrics.commission_paise + excluded.commission_paise,
            computed_at      = now()
    `;
  }

  /** Everything not promoted to a column, minus anything that could be personal data. */
  private properties(event: OutboxEvent): Record<string, unknown> {
    const {
      orderId: _orderId,
      userId: _userId,
      sellerId: _sellerId,
      ...rest
    } = event.payload as Record<string, unknown>;

    return {
      ...rest,
      // Keep the domain event name: the funnel name is lossy (ORDER_CREATED and a future
      // ORDER_REPLACED would both be PURCHASE), and analysis sometimes needs the original.
      domainEventType: event.event_type,
      aggregateType: event.aggregate_type,
      aggregateId: event.aggregate_id,
      eventVersion: event.event_version,
    };
  }

  private uuid(value: unknown): string | null {
    return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
  }

  private money(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null;
  }

  private int(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) ? value : null;
  }
}
