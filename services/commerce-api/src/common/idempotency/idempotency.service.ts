import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AppError } from '../errors/app-error';
import { DatabaseService } from '../../infrastructure/database/database.service';

export interface IdempotentOutcome<T> {
  replayed: boolean;
  status: number;
  body: T;
}

/**
 * Request idempotency (docs/API_CONVENTIONS.md §7).
 *
 * The guarantee is the UNIQUE (scope, idempotency_key) constraint in
 * platform.idempotency_keys. This service is the fast path around it, not the
 * guarantee itself.
 *
 * Three outcomes for a repeat key:
 *   same body, completed   → return the stored response verbatim
 *   same body, in flight   → 409, tell the client to retry shortly
 *   different body         → 409, this is a client bug
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly db: DatabaseService) {}

  fingerprint(body: unknown): string {
    return createHash('sha256').update(JSON.stringify(body ?? {})).digest('hex');
  }

  async execute<T>(params: {
    scope: string;
    key: string;
    actorId: string | null;
    body: unknown;
    handler: () => Promise<{ status: number; body: T }>;
  }): Promise<IdempotentOutcome<T>> {
    const fingerprint = this.fingerprint(params.body);

    // Claim the key. ON CONFLICT DO NOTHING means the constraint decides the winner
    // under concurrency, not application logic.
    const claimed = await this.db.critical<Array<{ id: string }>>`
      insert into platform.idempotency_keys (scope, idempotency_key, actor_id, request_fingerprint, status)
      values (${params.scope}, ${params.key}, ${params.actorId}, ${fingerprint}, 'IN_PROGRESS')
      on conflict (scope, idempotency_key) do nothing
      returning id
    `;

    if (claimed.length === 0) {
      const [existing] = await this.db.critical<
        Array<{
          request_fingerprint: string;
          status: string;
          response_status: number | null;
          response_body: T | null;
          locked_at: string;
        }>
      >`
        select request_fingerprint, status, response_status, response_body, locked_at
          from platform.idempotency_keys
         where scope = ${params.scope} and idempotency_key = ${params.key}
      `;

      if (!existing) {
        // Vanishingly rare: the row was expired between the insert and the select.
        throw new AppError('CONFLICT', 'Idempotency record disappeared; retry the request');
      }

      if (existing.request_fingerprint !== fingerprint) {
        throw new AppError('IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD');
      }

      if (existing.status === 'COMPLETED' && existing.response_body !== null) {
        return {
          replayed: true,
          status: existing.response_status ?? 200,
          body: existing.response_body,
        };
      }

      if (existing.status === 'IN_PROGRESS') {
        // A stale lock (crashed worker) is reclaimable after the visibility window;
        // otherwise the original request is genuinely still running.
        const lockedFor = Date.now() - new Date(existing.locked_at).getTime();
        if (lockedFor < 60_000) {
          throw new AppError('IDEMPOTENCY_REQUEST_IN_PROGRESS');
        }
        await this.db.critical`
          update platform.idempotency_keys
             set status = 'IN_PROGRESS', locked_at = now()
           where scope = ${params.scope} and idempotency_key = ${params.key}
        `;
      }
    }

    try {
      const result = await params.handler();

      await this.db.critical`
        update platform.idempotency_keys
           set status = 'COMPLETED',
               response_status = ${result.status},
               response_body = ${this.db.critical.json(result.body as never)},
               completed_at = now()
         where scope = ${params.scope} and idempotency_key = ${params.key}
      `;

      return { replayed: false, status: result.status, body: result.body };
    } catch (error) {
      // Mark failed so a retry with the same key is allowed to try again. A failed
      // attempt must not permanently burn the key.
      await this.db.critical`
        update platform.idempotency_keys
           set status = 'FAILED', completed_at = now()
         where scope = ${params.scope} and idempotency_key = ${params.key}
      `.catch(() => undefined);
      throw error;
    }
  }
}
