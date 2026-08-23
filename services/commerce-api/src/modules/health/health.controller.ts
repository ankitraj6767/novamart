import { Controller, Get } from '@nestjs/common';
import { loadServerEnv } from '@novamart/config';
import { Public } from '../../common/decorators';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { RedisService } from '../../infrastructure/redis/redis.service';

@Controller({ path: 'health', version: '1' })
export class HealthController {
  private readonly env = loadServerEnv();
  private readonly startedAt = Date.now();

  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  /** Liveness: is the process up. Must not touch dependencies. */
  @Public()
  @Get()
  live() {
    return {
      status: 'ok',
      service: 'commerce-api',
      env: this.env.APP_ENV,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }

  /**
   * Readiness: can this instance serve traffic.
   *
   * Postgres is required. Redis is not: a cache outage degrades performance but the API
   * still functions, so it is reported without failing readiness.
   */
  @Public()
  @Get('ready')
  async ready() {
    const [database, cache] = await Promise.all([this.db.healthy(), this.redis.healthy()]);
    return {
      status: database ? 'ready' : 'degraded',
      checks: {
        database: database ? 'up' : 'down',
        cache: cache ? 'up' : 'degraded',
      },
    };
  }
}
