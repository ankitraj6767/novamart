import type { Tx, WorkerContext } from '../runtime/context';

export interface JobResult {
  itemsScanned: number;
  itemsAffected: number;
  /** Anything worth keeping for an operator reading scheduled_job_runs later. */
  details?: Record<string, unknown>;
  /** Set when the job decided there was nothing to do and did not run. */
  skipped?: boolean;
}

export interface ScheduledJob {
  readonly name: string;
  /** How often to run, in milliseconds. */
  readonly intervalMs: number;
  /**
   * Delay before the first run. Staggering avoids every job firing simultaneously on
   * boot and briefly starving the connection pool.
   */
  readonly initialDelayMs?: number;
  /**
   * True when only one replica may run this at a time. Anything that sweeps or
   * reconciles wants this; an idempotent no-op does not need it.
   */
  readonly exclusive?: boolean;
  run(ctx: WorkerContext, tx: Tx): Promise<JobResult>;
}
