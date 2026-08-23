import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { requiresMfa } from '@novamart/permissions';
import { AppError } from '../errors/app-error';
import { AuthService } from '../auth/auth.service';
import { PERMISSIONS_KEY, PUBLIC_KEY, SCOPE_KEY } from '../decorators';
import { RequestContext, deriveActorType } from '../context/request-context';

interface ScopeMeta {
  scopeType: 'seller' | 'warehouse';
  source: string;
}

/**
 * One guard for authentication and authorization, in that order.
 *
 * Public routes still resolve a principal when a token is present, so a signed-in
 * customer browsing the catalog gets personalisation without a second code path.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(execution: ExecutionContext): Promise<boolean> {
    const handler = execution.getHandler();
    const controller = execution.getClass();
    const request = execution.switchToHttp().getRequest<FastifyRequest>();

    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [handler, controller]);
    const required =
      this.reflector.getAllAndMerge<string[]>(PERMISSIONS_KEY, [handler, controller]) ?? [];

    const token = this.extractBearer(request);
    const ctx = RequestContext.get();

    if (!token) {
      if (isPublic && required.length === 0) return true;
      throw new AppError('AUTH_REQUIRED');
    }

    const payload = await this.auth.verifyToken(token);
    const userId = payload.sub;
    if (!userId) throw new AppError('AUTH_INVALID_TOKEN', 'Token has no subject');

    // Supabase records the assurance level of the session; anything above aal1 means an
    // MFA challenge was completed.
    const mfaVerified = payload['aal'] === 'aal2';

    const principal = await this.auth.resolvePrincipal(userId, mfaVerified);

    if (ctx) {
      ctx.principal = principal;
      ctx.actorType = deriveActorType(principal.roles);
    }

    if (isPublic && required.length === 0) return true;

    // A suspended account keeps read access to its own history but cannot transact.
    if (principal.accountStatus !== 'ACTIVE') {
      const method = request.method.toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        throw new AppError('ACCOUNT_SUSPENDED');
      }
    }

    for (const permission of required) {
      if (!principal.permissions.includes(permission)) {
        throw new AppError('PERMISSION_DENIED', `Missing permission: ${permission}`);
      }
      if (requiresMfa(permission) && !principal.mfaVerified) {
        throw new AppError('AUTH_MFA_REQUIRED', `${permission} requires re-authentication`);
      }
    }

    const scope = this.reflector.getAllAndOverride<ScopeMeta>(SCOPE_KEY, [handler, controller]);
    if (scope) {
      const scopeId = this.resolveScopeId(request, scope.source);
      if (!scopeId) {
        throw AppError.validation([{ field: scope.source, issue: 'Scope identifier is required' }]);
      }
      const held = scope.scopeType === 'seller' ? principal.sellerIds : principal.warehouseIds;
      // A global grant (staff) satisfies any scope; otherwise the id must be held.
      const hasGlobal = principal.roles.includes('ADMIN') || principal.roles.includes('SUPER_ADMIN');
      if (!hasGlobal && !held.includes(scopeId)) {
        // 404 rather than 403: confirming existence would leak another tenant's ids.
        throw AppError.notFound(scope.scopeType === 'seller' ? 'Seller' : 'Warehouse');
      }
    }

    return true;
  }

  private extractBearer(request: FastifyRequest): string | null {
    const header = request.headers.authorization;
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value : null;
  }

  private resolveScopeId(request: FastifyRequest, source: string): string | null {
    const [kind, field] = source.includes(':') ? source.split(':') : ['param', source];
    const bag =
      kind === 'body'
        ? (request.body as Record<string, unknown> | undefined)
        : kind === 'query'
          ? (request.query as Record<string, unknown> | undefined)
          : (request.params as Record<string, unknown> | undefined);
    const value = bag?.[field as string];
    return typeof value === 'string' && value.length > 0 ? value : null;
  }
}
