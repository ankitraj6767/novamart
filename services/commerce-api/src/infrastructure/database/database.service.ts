import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import postgres, { type Sql, type TransactionSql } from 'postgres';
import { loadServerEnv } from '@novamart/config';

export type Db = Sql<Record<string, unknown>>;
export type Tx = TransactionSql<Record<string, unknown>>;

export interface SessionContext {
  actorId?: string | null;
  actorType?: string;
  requestId?: string | null;
  traceId?: string | null;
}

/**
 * postgres.js connection management (ADR 0008).
 *
 * Two pools by design: a general pool, and a smaller dedicated pool for checkout and
 * payments. Discovery traffic spiking must not starve the paths that take money.
 *
 * `prepare: false` is mandatory against the Supabase transaction pooler.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly env = loadServerEnv();

  /** General queries: catalog, cart, profile reads. */
  public sql!: Db;
  /** Checkout, orders, payments, settlements. Bulkheaded from discovery traffic. */
  public critical!: Db;
  /** Optional read replica for reporting. Falls back to the primary. */
  public replica!: Db;

  onModuleInit(): void {
    const common = {
      max_lifetime: 60 * 30,
      idle_timeout: this.env.DATABASE_IDLE_TIMEOUT_SECONDS,
      connect_timeout: this.env.DATABASE_CONNECT_TIMEOUT_SECONDS,
      prepare: this.env.DATABASE_PREPARE,
      onnotice: () => {
        /* Notices are expected (idempotent DDL); do not pollute logs. */
      },
      connection: {
        application_name: 'novamart-commerce-api',
        // Timeouts are set as startup options so every connection in the pool inherits
        // them. A runaway query or a lock wait fails fast instead of holding a
        // connection and cascading into a pool exhaustion incident.
        options: [
          `-c statement_timeout=${this.env.DATABASE_STATEMENT_TIMEOUT_MS}`,
          `-c lock_timeout=${this.env.DATABASE_LOCK_TIMEOUT_MS}`,
          '-c idle_in_transaction_session_timeout=30000',
        ].join(' '),
      },
    };
    // BIGINT (int8) is deliberately left as a string by postgres.js. Money aggregates
    // are BIGINT, and silently coercing them risks precision loss on a settlement
    // total, so callers convert explicitly at the point of use.

    this.sql = postgres(this.env.DATABASE_URL, { ...common, max: this.env.DATABASE_POOL_MAX });
    this.critical = postgres(this.env.DATABASE_URL, {
      ...common,
      max: this.env.DATABASE_CRITICAL_POOL_MAX,
    });
    this.replica = this.env.DATABASE_REPLICA_URL
      ? postgres(this.env.DATABASE_REPLICA_URL, { ...common, max: this.env.DATABASE_POOL_MAX })
      : this.sql;

    this.logger.log(
      `Database pools ready (general=${this.env.DATABASE_POOL_MAX}, critical=${this.env.DATABASE_CRITICAL_POOL_MAX}, prepare=${this.env.DATABASE_PREPARE})`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([
      this.sql?.end({ timeout: 5 }),
      this.critical?.end({ timeout: 5 }),
      this.env.DATABASE_REPLICA_URL ? this.replica?.end({ timeout: 5 }) : Promise.resolve(),
    ]);
  }

  /**
   * Runs work inside a transaction on the critical pool, with the request context
   * published as session settings.
   *
   * Database triggers read novamart.actor_id / actor_type / request_id / trace_id to
   * write history and audit rows, so no caller has to remember to pass an actor.
   */
  async transaction<T>(context: SessionContext, work: (tx: Tx) => Promise<T>): Promise<T> {
    return this.critical.begin(async (tx) => {
      await this.applySessionContext(tx, context);
      return work(tx);
    }) as Promise<T>;
  }

  /** Read-only work with context applied, on the general pool. */
  async withContext<T>(context: SessionContext, work: (sql: Db) => Promise<T>): Promise<T> {
    if (!context.actorId && !context.requestId) return work(this.sql);
    return this.sql.begin(async (tx) => {
      await this.applySessionContext(tx, context);
      return work(tx as unknown as Db);
    }) as Promise<T>;
  }

  /**
   * Re-stamps the session context inside an open transaction.
   *
   * Needed where one atomic operation is legitimately performed by two actors — a
   * customer requesting a cancellation and the platform then completing it, for
   * instance. The state machine restricts those two transitions to different actor
   * types, and splitting the work across two transactions to satisfy that would risk
   * leaving an order stuck in CANCELLATION_REQUESTED with its stock already released.
   *
   * The resulting history shows both steps with their true actor, which is the point.
   */
  async switchActor(tx: Tx, context: SessionContext): Promise<void> {
    await this.applySessionContext(tx, context);
  }

  private async applySessionContext(tx: Tx, context: SessionContext): Promise<void> {
    // set_config with is_local = true scopes these to the transaction, so a pooled
    // connection cannot leak one request's identity into the next.
    await tx`
      select
        set_config('novamart.actor_id',   ${context.actorId ?? ''},   true),
        set_config('novamart.actor_type', ${context.actorType ?? 'SYSTEM'}, true),
        set_config('novamart.request_id', ${context.requestId ?? ''}, true),
        set_config('novamart.trace_id',   ${context.traceId ?? ''},   true)
    `;
  }

  async healthy(): Promise<boolean> {
    try {
      const rows = await this.sql`select 1 as ok`;
      return rows[0]?.ok === 1;
    } catch {
      return false;
    }
  }
}
