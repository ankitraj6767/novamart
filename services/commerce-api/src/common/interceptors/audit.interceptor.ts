import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { from, mergeMap, type Observable } from 'rxjs';
import { AUDIT_KEY } from '../decorators';
import { RequestContext } from '../context/request-context';
import { DatabaseService } from '../../infrastructure/database/database.service';

interface AuditMetadata {
  action: string;
  resourceType: string;
}

/**
 * Persists the audit contract declared by @Audit at the API boundary.
 *
 * The database also audits invariants such as role grants and status transitions. This
 * interceptor covers the user-facing command itself, including request/trace identity,
 * actor metadata, and a deliberately small before/after projection. It runs before the
 * response is released so a sensitive command cannot report success when its audit row
 * failed to persist.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: DatabaseService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.getAllAndOverride<AuditMetadata>(AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!metadata) return next.handle();

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    return next.handle().pipe(
      mergeMap((result) =>
        from(this.writeAudit(metadata, request, result)).pipe(
          mergeMap(() => from(Promise.resolve(result))),
        ),
      ),
    );
  }

  private async writeAudit(
    metadata: AuditMetadata,
    request: FastifyRequest,
    result: unknown,
  ): Promise<void> {
    const ctx = RequestContext.get();
    const principal = ctx?.principal;
    const actorType = this.auditActorType(ctx?.actorType ?? 'SYSTEM');
    const resourceId = this.resourceId(request);
    const body = this.safeBody(request.body);
    const resultProjection = this.safeResult(result);

    await this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      await tx`
        insert into audit.audit_logs (
          actor_id, actor_type, actor_roles, action, resource_type, resource_id,
          new_value, reason, severity, ip_address, user_agent, device_id,
          request_id, trace_id, context
        ) values (
          ${principal?.userId ?? null}, ${actorType}, ${principal?.roles ?? []},
          ${metadata.action}, ${metadata.resourceType}, ${resourceId},
          ${tx.json(resultProjection as never)}, ${this.reason(body)}, 'NOTICE',
          ${ctx?.ip ?? null}::inet, ${ctx?.userAgent ?? null}, ${ctx?.deviceId ?? null},
          ${ctx?.requestId ?? null}, ${ctx?.traceId ?? null},
          ${tx.json({ method: request.method, path: request.url, request: body } as never)}
        )
      `;
    });
  }

  private resourceId(request: FastifyRequest): string | null {
    const params = (request.params ?? {}) as Record<string, unknown>;
    const body = (request.body ?? {}) as Record<string, unknown>;
    const candidate =
      params.id ??
      params[`${String(params.resourceType ?? '')}Id`] ??
      Object.entries(params).find(([key]) => key.endsWith('Id'))?.[1] ??
      body.id;
    return typeof candidate === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
      ? candidate
      : null;
  }

  private safeBody(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const body = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(body).filter(([key]) =>
        /^(status|reason|notes|decision|resolution|roleCode|scopeType|scopeId|expiresAt|quantityDelta|targetBucket|adjustmentType|refundType|amountPaise|outcome)$/i.test(key),
      ),
    );
  }

  private safeResult(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const result = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(result).filter(([key]) =>
        /^(id|status|reference|refundReference|transferReference|sellerId|orderId|count|updatedAt|createdAt)$/i.test(key),
      ),
    );
  }

  private reason(body: Record<string, unknown>): string | null {
    const value = body.reason ?? body.notes;
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }

  private auditActorType(actorType: string): string {
    switch (actorType) {
      case 'SELLER':
        return 'SELLER_USER';
      case 'SUPPORT':
        return 'SUPPORT_AGENT';
      case 'STAFF':
      case 'SYSTEM':
      case 'WORKER':
      case 'PROVIDER_WEBHOOK':
        return actorType;
      default:
        return 'USER';
    }
  }
}
