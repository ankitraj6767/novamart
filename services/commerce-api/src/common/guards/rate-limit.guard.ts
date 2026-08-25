import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../errors/app-error';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { RATE_LIMIT_KEY } from '../decorators';
import { RequestContext } from '../context/request-context';

interface RateLimitMeta {
  limit: number;
  windowSeconds: number;
}

/**
 * Rate limiting in two stages (docs/API_CONVENTIONS.md §13).
 *
 * The staging is the important part, and it exists because of a real trade-off:
 *
 *   Guards run in registration order, and rate limiting must come BEFORE authentication so
 *   an unauthenticated flood is rejected without paying for JWT verification and a
 *   permission lookup. But that means the principal is not yet resolved, so a limiter in
 *   that position can only key on IP.
 *
 *   Keying authenticated traffic on IP is not acceptable here. Carrier-grade NAT is the
 *   norm on Indian mobile networks, so thousands of unrelated customers share one address.
 *   A single heavy user would throttle all of them, and the per-route budgets would be
 *   meaningless.
 *
 * So there are two guards:
 *
 *   IpRateLimitGuard         runs first, before auth. A generous per-IP ceiling whose only
 *                            job is to make a flood cheap to reject.
 *   PrincipalRateLimitGuard  runs after auth. Enforces the per-route @RateLimit budget,
 *                            keyed by user id once known, falling back to IP for genuinely
 *                            anonymous traffic.
 *
 * Both fail open. A Redis outage must not take the API down: losing rate limiting for a few
 * minutes is a smaller problem than refusing every request.
 */

/** Shared mechanics for both stages. */
abstract class BaseRateLimitGuard implements CanActivate {
  protected constructor(
    protected readonly reflector: Reflector,
    protected readonly redis: RedisService,
  ) { }

  protected async consume(
    execution: ExecutionContext,
    identity: string,
    config: RateLimitMeta,
    scope: string,
  ): Promise<void> {
    const http = execution.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();

    // The matched route pattern, not the raw URL: /orders/:id must share one bucket rather
    // than giving every order id its own.
    const route = `${request.method}:${request.routeOptions?.url ?? request.url.split('?')[0]}`;

    const result = await this.redis.consumeRateLimit(
      `${scope}:${route}:${identity}`,
      config.limit,
      config.windowSeconds,
    );

    // Only the authoritative per-principal stage advertises the budget; two sets of
    // headers for one request would be ambiguous.
    if (scope === 'principal') {
      void reply.header('X-RateLimit-Limit', String(config.limit));
      void reply.header('X-RateLimit-Remaining', String(result.remaining));
      void reply.header('X-RateLimit-Reset', String(result.resetSeconds));
    }

    if (!result.allowed) {
      void reply.header('Retry-After', String(result.resetSeconds));
      throw new AppError('RATE_LIMITED');
    }
  }

  protected explicitLimit(execution: ExecutionContext): RateLimitMeta | undefined {
    return this.reflector.getAllAndOverride<RateLimitMeta>(RATE_LIMIT_KEY, [
      execution.getHandler(),
      execution.getClass(),
    ]);
  }

  abstract canActivate(execution: ExecutionContext): Promise<boolean>;
}

/**
 * Stage one: per-IP flood protection, before authentication.
 *
 * The ceiling is deliberately high. It is not the per-route budget — it exists so that an
 * unauthenticated client cannot make the server do expensive work (JWT verification, a
 * permission query) thousands of times per second. Legitimate shared-NAT traffic must pass
 * comfortably, so this must not be tightened into a de facto per-user limit.
 */
@Injectable()
export class IpRateLimitGuard extends BaseRateLimitGuard {
  private static readonly CEILING: RateLimitMeta = { limit: 1_200, windowSeconds: 60 };

  constructor(reflector: Reflector, redis: RedisService) {
    super(reflector, redis);
  }

  async canActivate(execution: ExecutionContext): Promise<boolean> {
    const request = execution.switchToHttp().getRequest<FastifyRequest>();
    await this.consume(execution, `ip:${request.ip}`, IpRateLimitGuard.CEILING, 'ip');
    return true;
  }
}

/**
 * Stage two: the per-route budget, after authentication.
 *
 * Keyed by user id when there is one, so a customer's budget is theirs alone regardless of
 * how many others share their public address.
 */
@Injectable()
export class PrincipalRateLimitGuard extends BaseRateLimitGuard {
  /** Signed-in traffic is trusted further: there is an account to hold responsible. */
  private static readonly AUTHENTICATED: RateLimitMeta = { limit: 300, windowSeconds: 60 };
  /** Anonymous browsing still needs a per-address budget on top of the flood ceiling. */
  private static readonly ANONYMOUS: RateLimitMeta = { limit: 60, windowSeconds: 60 };

  constructor(reflector: Reflector, redis: RedisService) {
    super(reflector, redis);
  }

  async canActivate(execution: ExecutionContext): Promise<boolean> {
    const request = execution.switchToHttp().getRequest<FastifyRequest>();

    // AuthGuard has run by now, so the principal is resolved for both authenticated and
    // public-with-token requests.
    const userId = RequestContext.get()?.principal?.userId ?? null;

    const config =
      this.explicitLimit(execution) ??
      (userId ? PrincipalRateLimitGuard.AUTHENTICATED : PrincipalRateLimitGuard.ANONYMOUS);

    const identity = userId ? `u:${userId}` : `ip:${request.ip}`;
    await this.consume(execution, identity, config, 'principal');
    return true;
  }
}
