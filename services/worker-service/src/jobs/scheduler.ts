import type { WorkerContext } from '../runtime/context';
import type { ScheduledJob } from './job';

/**
 * Scheduled job runner.
 *
 * Interval-based rather than cron-expression based: every job here is "run this every N
 * minutes", and a cron parser would be machinery without a purpose. Supabase Cron
 * handles anything that genuinely needs wall-clock scheduling.
 *
 * Two properties matter operationally:
 *
 *  - Every run is recorded in platform.scheduled_job_runs, including failures. A sweeper
 *    that silently stopped running is otherwise invisible until stock has been held for
 *    hours.
 *  - Exclusive jobs take a Postgres advisory lock, so running several worker replicas
 *    does not mean running the reconciliation five times concurrently. The lock is tied
 *    to the session and released even if the process is killed.
 */
export class JobScheduler {
  private readonly timers: NodeJS.Timeout[] = [];
  private stopping = false;
  private inFlight = 0;

  constructor(
    private readonly ctx: WorkerContext,
    private readonly jobs: ScheduledJob[],
  ) {}

  start(): void {
    for (const [index, job] of this.jobs.entries()) {
      // Stagger by default so a cold start does not fire everything at once.
      const initialDelay = job.initialDelayMs ?? 5_000 + index * 2_000;

      const timer = setTimeout(() => {
        void this.runAndReschedule(job);
      }, initialDelay);

      this.timers.push(timer);
    }

    this.ctx.logger.info(
      { jobs: this.jobs.map((j) => `${j.name}@${j.intervalMs}ms`) },
      'Job scheduler started',
    );
  }

  private async runAndReschedule(job: ScheduledJob): Promise<void> {
    if (this.stopping) return;

    await this.runOnce(job);

    if (this.stopping) return;
    const timer = setTimeout(() => {
      void this.runAndReschedule(job);
    }, job.intervalMs);
    this.timers.push(timer);
  }

  /** Runs a job once, recording the outcome. Exposed so tests can drive a single pass. */
  async runOnce(job: ScheduledJob): Promise<void> {
    this.inFlight += 1;
    const startedAt = Date.now();
    let runId: string | null = null;

    try {
      const [run] = await this.ctx.sql<Array<{ id: string }>>`
        insert into platform.scheduled_job_runs (job_name, status)
        values (${job.name}, 'RUNNING')
        returning id
      `;
      runId = run?.id ?? null;

      const result = await this.ctx.transaction(async (tx) => {
        if (job.exclusive) {
          // Transaction-scoped advisory lock keyed on the job name. try_advisory_xact
          // returns immediately rather than queueing, so a replica that loses the race
          // skips this tick instead of piling up.
          const [lock] = await tx<Array<{ acquired: boolean }>>`
            select pg_try_advisory_xact_lock(hashtext(${job.name})) as acquired
          `;
          if (!lock?.acquired) {
            return { itemsScanned: 0, itemsAffected: 0, skipped: true };
          }
        }
        return job.run(this.ctx, tx);
      });

      const durationMs = Date.now() - startedAt;

      if (runId) {
        await this.ctx.sql`
          update platform.scheduled_job_runs
             set status         = ${result.skipped ? 'SKIPPED' : 'SUCCEEDED'},
                 finished_at    = now(),
                 duration_ms    = ${durationMs},
                 items_scanned  = ${result.itemsScanned},
                 items_affected = ${result.itemsAffected},
                 details        = ${this.ctx.sql.json((result.details ?? {}) as never)}
           where id = ${runId}
        `;
      }

      // Only log runs that did something. A sweeper finding nothing every 60s would
      // otherwise bury everything else in the log.
      if (!result.skipped && (result.itemsAffected > 0 || result.itemsScanned > 0)) {
        this.ctx.logger.info(
          {
            job: job.name,
            durationMs,
            scanned: result.itemsScanned,
            affected: result.itemsAffected,
            ...(result.details ?? {}),
          },
          'Scheduled job completed',
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.ctx.logger.error({ job: job.name, err: message }, 'Scheduled job failed');

      if (runId) {
        await this.ctx.sql`
          update platform.scheduled_job_runs
             set status = 'FAILED', finished_at = now(),
                 duration_ms = ${Date.now() - startedAt},
                 error_message = ${message.slice(0, 2000)}
           where id = ${runId}
        `.catch(() => undefined);
      }
    } finally {
      this.inFlight -= 1;
    }
  }

  async stop(): Promise<void> {
    this.stopping = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.length = 0;

    // Let anything mid-flight finish rather than tearing down its transaction.
    const deadline = Date.now() + this.ctx.env.WORKER_SHUTDOWN_GRACE_MS;
    while (this.inFlight > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.ctx.logger.info({ abandoned: this.inFlight }, 'Job scheduler stopped');
  }
}
