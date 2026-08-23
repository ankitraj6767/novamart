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
 * Token-bucket rate limiting (docs/API_CONVENTIONS.md §13).
 *
 * Keyed by user when authenticated and by IP otherwise, so one abusive client cannot
 * exhaust the budget of everyone behind the same NAT. Fails open if Redis is down.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private static readonly DEFAULT: RateLimitMeta = { limit: 300, windowSeconds: 60 };
  private static readonly ANONYMOUS: RateLimitMeta = { limit: 60, windowSeconds: 60 };

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(execution: ExecutionContext): Promise<boolean> {
    const http = execution.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();

    const explicit = this.reflector.getAllAndOverride<RateLimitMeta>(RATE_LIMIT_KEY, [
      execution.getHandler(),
      execution.getClass(),
    ]);

    const userId = RequestContext.get()?.principal?.userId ?? null;
    const config =
      explicit ?? (userId ? RateLimitGuard.DEFAULT : RateLimitGuard.ANONYMOUS);

    const identity = userId ? `u:${userId}` : `ip:${request.ip}`;
    const route = `${request.method}:${request.routeOptions?.url ?? request.url.split('?')[0]}`;

    const result = await this.redis.consumeRateLimit(
      `${route}:${identity}`,
      config.limit,
      config.windowSeconds,
    );

    void reply.header('X-RateLimit-Limit', String(config.limit));
    void reply.header('X-RateLimit-Remaining', String(result.remaining));
    void reply.header('X-RateLimit-Reset', String(result.resetSeconds));

    if (!result.allowed) {
      void reply.header('Retry-After', String(result.resetSeconds));
      throw new AppError('RATE_LIMITED');
    }

    return true;
  }
}
