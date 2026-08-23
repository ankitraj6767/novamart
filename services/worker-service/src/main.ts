import { AnalyticsConsumer } from './consumers/analytics.consumer';
import { FinanceConsumer } from './consumers/finance.consumer';
import { NotificationConsumer } from './consumers/notification.consumer';
import { allJobs } from './jobs';
import { JobScheduler } from './jobs/scheduler';
import { OutboxDispatcher } from './outbox/dispatcher';
import { WorkerContext } from './runtime/context';

/**
 * NovaMart worker service.
 *
 * Two responsibilities:
 *   1. Drain platform.outbox_events into consumers (the delivery half of ADR 0005)
 *   2. Run scheduled maintenance — reservation expiry, reconciliation, rollups
 *
 * Both are independently switchable so a deployment can run dispatcher-only replicas for
 * throughput while a single replica owns the scheduled jobs.
 */
async function bootstrap(): Promise<void> {
  const ctx = WorkerContext.create();

  ctx.logger.info(
    {
      workerId: ctx.workerId,
      dispatcher: ctx.env.WORKER_RUN_OUTBOX_DISPATCHER,
      scheduledJobs: ctx.env.WORKER_RUN_SCHEDULED_JOBS,
    },
    'Worker service starting',
  );

  // Fail fast on a bad connection rather than looping on errors from the first tick.
  await ctx.sql`select 1`;

  const dispatcher = new OutboxDispatcher(ctx, [
    new AnalyticsConsumer(),
    new NotificationConsumer(),
    new FinanceConsumer(),
  ]);

  const scheduler = new JobScheduler(ctx, allJobs);

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    ctx.logger.info({ signal }, 'Worker shutting down');

    dispatcher.stop();
    await scheduler.stop();

    // The dispatcher finishes its current event before noticing the stop flag; give it
    // room so a rolling deploy does not abandon a half-processed batch.
    await new Promise((resolve) => setTimeout(resolve, 500));
    await ctx.close();

    ctx.logger.info('Worker stopped');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // An unhandled rejection has already escaped its intended handler, so the safe move is
  // to log loudly and let the orchestrator restart a known-good process.
  process.on('unhandledRejection', (reason) => {
    ctx.logger.error(
      { err: reason instanceof Error ? reason.message : String(reason) },
      'Unhandled rejection in worker',
    );
    void shutdown('unhandledRejection');
  });

  if (ctx.env.WORKER_RUN_SCHEDULED_JOBS) scheduler.start();

  if (ctx.env.WORKER_RUN_OUTBOX_DISPATCHER) {
    // Blocks until stop() is called.
    await dispatcher.start();
  } else {
    ctx.logger.info('Outbox dispatcher disabled; running scheduled jobs only');
    await new Promise(() => {
      /* keep the process alive for the scheduler */
    });
  }
}

void bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error during worker bootstrap', error);
  process.exit(1);
});
