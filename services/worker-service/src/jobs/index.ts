import type { Tx, WorkerContext } from '../runtime/context';
import type { JobResult, ScheduledJob } from './job';

/**
 * Scheduled jobs.
 *
 * Each one leans on a database function that already implements the hard part. The job is
 * the schedule and the bookkeeping, not the logic — reservation expiry, reconciliation and
 * stuck-event recovery all need to hold locks correctly, and that belongs next to the data.
 */

/**
 * Releases reservations whose hold expired.
 *
 * The single most operationally important job here. Every abandoned checkout holds real
 * stock; without this sweep a flash sale sells out to people who never paid, and the
 * inventory only frees up when someone notices.
 */
export const reservationSweepJob: ScheduledJob = {
  name: 'inventory.reservation-sweep',
  intervalMs: 60_000,
  exclusive: true,
  async run(_ctx: WorkerContext, tx: Tx): Promise<JobResult> {
    const [result] = await tx<Array<{ released: number }>>`
      select inventory.release_expired_reservations(500) as released
    `;
    const released = result?.released ?? 0;
    return { itemsScanned: released, itemsAffected: released };
  },
};

/**
 * Recovers outbox events left PROCESSING by a worker that died mid-batch.
 *
 * claim_outbox_batch marks rows PROCESSING and stamps locked_by. If the process holding
 * them never completes or fails them, they are invisible to every other replica forever.
 * This returns them to PENDING once the visibility timeout passes.
 */
export const outboxRequeueJob: ScheduledJob = {
  name: 'platform.outbox-requeue-stuck',
  intervalMs: 60_000,
  exclusive: true,
  async run(ctx: WorkerContext, tx: Tx): Promise<JobResult> {
    const timeout = `${ctx.env.OUTBOX_VISIBILITY_TIMEOUT_SECONDS} seconds`;
    const [result] = await tx<Array<{ requeued: number }>>`
      select platform.requeue_stuck_outbox_events(${timeout}::interval) as requeued
    `;
    const requeued = result?.requeued ?? 0;
    return {
      itemsScanned: requeued,
      itemsAffected: requeued,
      ...(requeued > 0 ? { details: { visibilityTimeout: timeout } } : {}),
    };
  },
};

/**
 * Compares inventory balances against the immutable ledger.
 *
 * The balance columns are a cache of the ledger; they must agree. Any drift means a code
 * path mutated stock without writing a movement, which is exactly the class of bug that
 * silently oversells. Drift is logged at error level because it warrants a human.
 */
export const inventoryReconcileJob: ScheduledJob = {
  name: 'inventory.reconcile-balances',
  intervalMs: 15 * 60_000,
  exclusive: true,
  async run(ctx: WorkerContext, tx: Tx): Promise<JobResult> {
    const drifts = await tx<
      Array<{
        warehouse_id: string;
        sku_id: string;
        seller_id: string;
        available_drift: number;
        reserved_drift: number;
      }>
    >`
      select warehouse_id, sku_id, seller_id, available_drift, reserved_drift
        from inventory.reconcile_balances(null)
    `;

    if (drifts.length > 0) {
      ctx.logger.error(
        {
          driftCount: drifts.length,
          // Bounded: a systemic bug would otherwise produce a log line per SKU.
          sample: drifts.slice(0, 10),
        },
        'Inventory balances do not match the ledger',
      );
    }

    return {
      itemsScanned: drifts.length,
      itemsAffected: 0,
      details: { driftCount: drifts.length },
    };
  },
};

/**
 * Creates next month's analytics.events partition ahead of time.
 *
 * Runs daily rather than monthly so a missed run has 30 chances to self-correct. Without
 * the partition, every analytics insert on the 1st fails and takes its outbox event with
 * it. The function also enables and forces RLS on what it creates.
 */
export const partitionMaintenanceJob: ScheduledJob = {
  name: 'analytics.ensure-partitions',
  intervalMs: 24 * 60 * 60_000,
  initialDelayMs: 10_000,
  exclusive: true,
  async run(_ctx: WorkerContext, tx: Tx): Promise<JobResult> {
    const created: string[] = [];

    // Current month plus the next two: enough runway that a few failed runs are harmless.
    for (const offset of [0, 1, 2]) {
      const [row] = await tx<Array<{ name: string }>>`
        select analytics.ensure_event_partition(
          (date_trunc('month', current_date) + (${offset} || ' months')::interval)::date
        ) as name
      `;
      if (row?.name) created.push(row.name);
    }

    return {
      itemsScanned: created.length,
      itemsAffected: created.length,
      details: { partitions: created },
    };
  },
};

/**
 * Expires checkout sessions that were abandoned, releasing their stock.
 *
 * inventory.release_expired_reservations frees the stock on its own schedule, but the
 * session rows would otherwise sit in an open state forever and be counted as live
 * checkouts in the funnel.
 */
export const checkoutExpiryJob: ScheduledJob = {
  name: 'commerce.expire-checkout-sessions',
  intervalMs: 5 * 60_000,
  exclusive: true,
  async run(_ctx: WorkerContext, tx: Tx): Promise<JobResult> {
    const expired = await tx<Array<{ id: string }>>`
      update commerce.checkout_sessions
         set status = 'EXPIRED'
       where status in ('INITIATED', 'ADDRESS_SELECTED', 'DELIVERY_SELECTED', 'OFFERS_APPLIED')
         and order_id is null
         and expires_at < now()
      returning id
    `;

    // Belt and braces: release anything still held against those sessions rather than
    // waiting for the reservation TTL, which may be longer than the session's.
    let released = 0;
    if (expired.length > 0) {
      const [result] = await tx<Array<{ count: number }>>`
        select count(*)::int as count
          from inventory.inventory_reservations r,
               lateral inventory.release_reservation(r.id, 'CHECKOUT_ABANDONED')
         where r.checkout_session_id = any(${expired.map((s) => s.id)}::uuid[])
           and r.status = 'ACTIVE'
      `;
      released = result?.count ?? 0;
    }

    return {
      itemsScanned: expired.length,
      itemsAffected: expired.length,
      ...(expired.length > 0 ? { details: { reservationsReleased: released } } : {}),
    };
  },
};

/**
 * Prunes expired idempotency keys.
 *
 * The table is a replay cache, not a record. Retaining it forever would grow without
 * bound and slow the insert that every write request depends on.
 */
export const idempotencyCleanupJob: ScheduledJob = {
  name: 'platform.prune-idempotency-keys',
  intervalMs: 6 * 60 * 60_000,
  exclusive: true,
  async run(ctx: WorkerContext, tx: Tx): Promise<JobResult> {
    const days = ctx.env.IDEMPOTENCY_RETENTION_DAYS;
    const deleted = await tx<Array<{ id: string }>>`
      delete from platform.idempotency_keys
       where created_at < now() - (${days} || ' days')::interval
      returning id
    `;
    return {
      itemsScanned: deleted.length,
      itemsAffected: deleted.length,
      ...(deleted.length > 0 ? { details: { retentionDays: days } } : {}),
    };
  },
};

/**
 * Rolls up yesterday's platform metrics.
 *
 * Computed from the transactional tables into analytics.daily_metrics so dashboards read
 * one small row per day instead of aggregating orders live — brief §57's rule that BI
 * must not run against the transactional path.
 */
export const dailyMetricsJob: ScheduledJob = {
  name: 'analytics.roll-up-daily-metrics',
  intervalMs: 60 * 60_000,
  exclusive: true,
  async run(_ctx: WorkerContext, tx: Tx): Promise<JobResult> {
    // Recomputed for the last two days, not just yesterday: late-arriving deliveries and
    // refunds change a day's numbers after midnight.
    const rows = await tx<Array<{ metric_date: string }>>`
      insert into analytics.daily_metrics (
        metric_date, orders_placed, gmv_paise, average_order_value_paise,
        commission_paise, new_users, active_sellers, cancellation_rate, cod_share
      )
      select d.day,
             count(distinct o.id)::int,
             coalesce(sum(o.total_payable_paise), 0),
             case when count(distinct o.id) > 0
                  then (coalesce(sum(o.total_payable_paise), 0) / count(distinct o.id))::bigint
                  else 0 end,
             -- Commission is per ITEM, not per order: order_price_breakdowns has no
             -- commission column because a multi-seller order has a different rate per
             -- line. Summing the item breakdowns is the only correct total.
             coalesce((select sum(ib.commission_paise)
                         from commerce.order_item_price_breakdowns ib
                         join commerce.orders o2 on o2.id = ib.order_id
                        where o2.placed_at::date = d.day), 0),
             (select count(*)::int from identity.profiles p where p.created_at::date = d.day),
             count(distinct oi.seller_id)::int,
             case when count(distinct o.id) > 0
                  then round(count(distinct o.id) filter (where o.status = 'CANCELLED')::numeric
                             / count(distinct o.id), 4)
                  else null end,
             case when count(distinct o.id) > 0
                  then round(count(distinct o.id) filter (where o.is_cod)::numeric
                             / count(distinct o.id), 4)
                  else null end
        from (select generate_series(current_date - 1, current_date, interval '1 day')::date as day) d
        left join commerce.orders o on o.placed_at::date = d.day
        left join commerce.order_items oi on oi.order_id = o.id
       group by d.day
      on conflict (metric_date) do update
        set orders_placed             = excluded.orders_placed,
            gmv_paise                 = excluded.gmv_paise,
            average_order_value_paise = excluded.average_order_value_paise,
            commission_paise          = excluded.commission_paise,
            new_users                 = excluded.new_users,
            active_sellers            = excluded.active_sellers,
            cancellation_rate         = excluded.cancellation_rate,
            cod_share                 = excluded.cod_share,
            computed_at               = now()
      returning metric_date
    `;

    return { itemsScanned: rows.length, itemsAffected: rows.length };
  },
};

/**
 * Delivers queued in-app notifications and local test notifications. External channels
 * remain behind provider integrations; a production deployment with no provider marks the
 * attempt failed instead of silently claiming delivery.
 */
export const notificationDispatchJob: ScheduledJob = {
  name: 'marketing.dispatch-notifications',
  intervalMs: 5_000,
  async run(ctx: WorkerContext, tx: Tx): Promise<JobResult> {
    const rows = await tx<Array<{ id: string; channel: string }>>`
      with claimed as (
        select n.id from marketing.notifications n
         where n.status = 'QUEUED' and n.scheduled_for <= now()
         order by case coalesce(
                    (select t.priority
                       from marketing.notification_templates t
                      where t.id = n.template_id),
                    'NORMAL'
                  )
                    when 'CRITICAL' then 0
                    when 'HIGH' then 1
                    else 2
                  end,
                  n.created_at
         for update skip locked limit 100
      )
      update marketing.notifications n
         set status = 'SENDING', attempts = attempts + 1
        from claimed c where n.id = c.id
      returning n.id, n.channel
    `;
    let sent = 0;
    for (const row of rows) {
      const localMock = ctx.env.APP_ENV !== 'production';
      const supported =
        row.channel === 'IN_APP' ||
        (localMock && ['SMS', 'EMAIL', 'PUSH', 'WHATSAPP'].includes(row.channel));
      if (supported) {
        await tx`
          update marketing.notifications
             set status = 'SENT', provider = ${row.channel === 'IN_APP' ? 'internal' : 'mock'}, sent_at = now()
           where id = ${row.id}
        `;
        sent += 1;
      } else {
        await tx`
          update marketing.notifications
             set status = 'FAILED', failure_code = 'PROVIDER_NOT_CONFIGURED', failure_reason = 'No notification provider is configured'
           where id = ${row.id}
        `;
      }
    }
    return {
      itemsScanned: rows.length,
      itemsAffected: sent,
      ...(rows.length ? { details: { failed: rows.length - sent } } : {}),
    };
  },
};

export const allJobs: ScheduledJob[] = [
  reservationSweepJob,
  outboxRequeueJob,
  inventoryReconcileJob,
  partitionMaintenanceJob,
  checkoutExpiryJob,
  idempotencyCleanupJob,
  dailyMetricsJob,
  notificationDispatchJob,
];
