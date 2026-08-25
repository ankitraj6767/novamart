import { Module, type MiddlewareConsumer, type NestModule, type Type } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { loadServerEnv } from '@novamart/config';
import { DatabaseService } from './infrastructure/database/database.service';
import { RedisService } from './infrastructure/redis/redis.service';
import { OutboxService } from './infrastructure/outbox/outbox.service';
import { PaymentProviderRegistry } from './infrastructure/providers/payment/payment-provider.registry';
import { AuthService } from './common/auth/auth.service';
import { AuthGuard } from './common/guards/auth.guard';
import {
  IpRateLimitGuard,
  PrincipalRateLimitGuard,
} from './common/guards/rate-limit.guard';
import { ErrorFilter } from './common/filters/error.filter';
import { EnvelopeInterceptor } from './common/interceptors/envelope.interceptor';
import { IdempotencyService } from './common/idempotency/idempotency.service';
import { contextMiddleware } from './common/middleware/context.middleware';
import { HealthController } from './modules/health/health.controller';
import { CatalogController } from './modules/catalog/catalog.controller';
import { CatalogService } from './modules/catalog/catalog.service';
import { IdentityController } from './modules/identity/identity.controller';
import { IdentityService } from './modules/identity/identity.service';
import { CartController } from './modules/cart/cart.controller';
import { CartService } from './modules/cart/cart.service';
import { CheckoutController } from './modules/checkout/checkout.controller';
import { CheckoutService } from './modules/checkout/checkout.service';
import { OrdersController } from './modules/orders/orders.controller';
import { OrdersService } from './modules/orders/orders.service';
import {
  PaymentWebhookController,
  PaymentsController,
} from './modules/payments/payments.controller';
import { PaymentsService } from './modules/payments/payments.service';
import { MockPaymentController } from './modules/payments/mock-payment.controller';
import { SettingsService } from './modules/platform/settings.service';
import { FieldEncryptionService } from './common/crypto/field-encryption';
import { SellerController } from './modules/seller/seller.controller';
import { SellerService } from './modules/seller/seller.service';
import { InventoryController } from './modules/inventory/inventory.controller';
import { InventoryService } from './modules/inventory/inventory.service';
import { AdminSellerController } from './modules/admin/admin.controller';
import { AdminSellerService } from './modules/admin/admin-seller.service';

/**
 * The payment simulator is registered only outside production. Excluding the controller
 * entirely means the routes do not exist there, rather than existing and relying on a
 * runtime check to refuse them.
 */
const developmentOnlyControllers: Array<Type<unknown>> =
  loadServerEnv().APP_ENV === 'production' ? [] : [MockPaymentController];

/**
 * The modular monolith root (ADR 0001).
 *
 * Infrastructure and cross-cutting concerns are global; each domain is a module with
 * its own service boundary. Guard order matters: rate limiting runs before
 * authentication so an unauthenticated flood is cheap to reject.
 */
@Module({
  controllers: [
    HealthController,
    CatalogController,
    IdentityController,
    CartController,
    CheckoutController,
    OrdersController,
    PaymentsController,
    PaymentWebhookController,
    SellerController,
    InventoryController,
    AdminSellerController,
    ...developmentOnlyControllers,
  ],
  providers: [
    // Infrastructure
    DatabaseService,
    RedisService,
    OutboxService,
    PaymentProviderRegistry,
    // Cross-cutting
    AuthService,
    IdempotencyService,
    SettingsService,
    FieldEncryptionService,
    // Domains
    CatalogService,
    IdentityService,
    CartService,
    CheckoutService,
    OrdersService,
    PaymentsService,
    SellerService,
    InventoryService,
    AdminSellerService,
    /**
     * Guards run in registration order, and this order is load-bearing:
     *
     *   1. IpRateLimitGuard        cheap per-IP flood ceiling, before any expensive work
     *   2. AuthGuard               verifies the token and resolves permissions
     *   3. PrincipalRateLimitGuard the real per-route budget, keyed by user id
     *
     * Stage 3 must come after authentication, otherwise every authenticated request would
     * be bucketed by IP and users behind carrier NAT would share one budget.
     */
    { provide: APP_GUARD, useClass: IpRateLimitGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PrincipalRateLimitGuard },
    { provide: APP_FILTER, useClass: ErrorFilter },
    { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(contextMiddleware).forRoutes('*');
  }
}
