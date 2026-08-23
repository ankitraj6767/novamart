import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { DatabaseService } from './infrastructure/database/database.service';
import { RedisService } from './infrastructure/redis/redis.service';
import { OutboxService } from './infrastructure/outbox/outbox.service';
import { AuthService } from './common/auth/auth.service';
import { AuthGuard } from './common/guards/auth.guard';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { ErrorFilter } from './common/filters/error.filter';
import { EnvelopeInterceptor } from './common/interceptors/envelope.interceptor';
import { IdempotencyService } from './common/idempotency/idempotency.service';
import { contextMiddleware } from './common/middleware/context.middleware';
import { HealthController } from './modules/health/health.controller';
import { CatalogController } from './modules/catalog/catalog.controller';
import { CatalogService } from './modules/catalog/catalog.service';

/**
 * The modular monolith root (ADR 0001).
 *
 * Infrastructure and cross-cutting concerns are global; each domain is a module with
 * its own service boundary. Guard order matters: rate limiting runs before
 * authentication so an unauthenticated flood is cheap to reject.
 */
@Module({
  controllers: [HealthController, CatalogController],
  providers: [
    DatabaseService,
    RedisService,
    OutboxService,
    AuthService,
    IdempotencyService,
    CatalogService,
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: ErrorFilter },
    { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(contextMiddleware).forRoutes('*');
  }
}
