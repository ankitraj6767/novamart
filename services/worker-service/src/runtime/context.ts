import postgres, { type Sql, type TransactionSql } from 'postgres';
import { loadServerEnv, type ServerEnv } from '@novamart/config';
import { createLogger, type Logger } from '@novamart/logger';

export type Db = Sql<Record<string, unknown>>;
export type Tx = TransactionSql<Record<string, unknown>>;

export interface SessionContext {
  actorId?: string | null;
  actorType?: string;
  requestId?: string | null;
  traceId?: string | null;
}

/**
 * Worker runtime.
 *
 * Deliberately plain: no DI container and no HTTP framework. A worker's job is to hold a
 * database connection and a loop, and the less machinery sits between the two the easier
 * it is to reason about what happens when it dies mid-batch.
 *
 * One pool, sized small. Workers are throughput-bound on the database, and a large pool
 * per worker replica just moves contention into Postgres.
 */
export class WorkerContext {
  readonly env: ServerEnv;
  readonly logger: Logger;
  readonly sql: Db;
  /** Stable identity for outbox claims, so a crashed worker's rows can be recovered. */
  readonly workerId: string;

  private constructor(env: ServerEnv, logger: Logger, sql: Db, workerId: string) {
    this.env = env;
    this.logger = logger;
    this.sql = sql;
    this.workerId = workerId;
  }

  static create(): WorkerContext {
    const env = loadServerEnv();
    const workerId = `${process.env['HOSTNAME'] ?? 'worker'}-${process.pid}`;

    const logger = createLogger(
      { service: 'worker-service', env: env.APP_ENV },
      env.LOG_LEVEL,
    );

    const sql = postgres(env.DATABASE_URL, {
      max: env.DATABASE_POOL_MAX,
      idle_timeout: env.DATABASE_IDLE_TIMEOUT_SECONDS,
      connect_timeout: env.DATABASE_CONNECT_TIMEOUT_SECONDS,
      prepare: env.DATABASE_PREPARE,
      onnotice: () => {
        /* Expected from idempotent DDL in jobs; not worth logging. */
      },
      connection: {
        application_name: `novamart-worker:${workerId}`,
        options: [
          // Jobs are allowed to run longer than an API request, but not forever: a
          // wedged job holding a connection is how a worker fleet stops consuming.
          `-c statement_timeout=${env.WORKER_STATEMENT_TIMEOUT_MS}`,
          `-c lock_timeout=${env.DATABASE_LOCK_TIMEOUT_MS}`,
          '-c idle_in_transaction_session_timeout=60000',
        ].join(' '),
      },
    });

    return new WorkerContext(env, logger, sql, workerId);
  }

  /**
   * Runs work in a transaction with the session context the database triggers read to
   * write history and audit rows. Workers act as SYSTEM: no human is behind the change,
   * and the state machine grants SYSTEM the automated transitions.
   */
  async transaction<T>(work: (tx: Tx) => Promise<T>, context: SessionContext = {}): Promise<T> {
    return this.sql.begin(async (tx) => {
      await tx`
        select
          set_config('novamart.actor_id',   ${context.actorId ?? ''},        true),
          set_config('novamart.actor_type', ${context.actorType ?? 'SYSTEM'}, true),
          set_config('novamart.request_id', ${context.requestId ?? ''},      true),
          set_config('novamart.trace_id',   ${context.traceId ?? ''},        true)
      `;
      return work(tx);
    }) as Promise<T>;
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 10 });
  }
}
