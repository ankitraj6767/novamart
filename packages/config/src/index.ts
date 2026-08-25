/**
 * Environment configuration.
 *
 * Parsed once at boot and validated with Zod. A missing or malformed variable fails
 * startup loudly instead of surfacing as an undefined at 2 a.m. Production adds
 * stricter rules: mock providers and missing secrets are rejected outright.
 */

import { z } from 'zod';

const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

const intFromString = (def: number) =>
  z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : Number(v)))
    .pipe(z.number().int());

export const appEnvSchema = z.enum(['local', 'development', 'staging', 'production']);
export type AppEnv = z.infer<typeof appEnvSchema>;

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_ENV: appEnvSchema.default('local'),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

    // API
    API_PORT: intFromString(4000),
    API_HOST: z.string().default('0.0.0.0'),
    API_BASE_PATH: z.string().default('/api'),
    API_CORS_ORIGINS: z.string().default(''),
    API_BODY_LIMIT_BYTES: intFromString(2_097_152),
    API_REQUEST_TIMEOUT_MS: intFromString(30_000),
    API_TRUST_PROXY: booleanish.default(true),
    INTERNAL_SERVICE_TOKEN_SECRET: z.string().min(32).optional(),

    // Supabase
    SUPABASE_URL: z.string().url(),
    SUPABASE_SECRET_KEY: z.string().min(20).optional(),
    SUPABASE_PROJECT_REF: z.string().optional(),
    SUPABASE_JWT_ISSUER: z.string().url().optional(),
    SUPABASE_JWKS_URL: z.string().url().optional(),
    /**
     * Local/self-hosted Supabase signs access tokens with a shared HS256 secret.
     * Hosted projects use asymmetric keys served from JWKS. The auth service prefers
     * JWKS and falls back to this, so both work without a code change.
     */
    SUPABASE_JWT_SECRET: z.string().min(32).optional(),
    SUPABASE_JWT_AUDIENCE: z.string().default('authenticated'),

    // Database
    DATABASE_URL: z.string().min(1),
    DATABASE_POOL_MAX: intFromString(20),
    DATABASE_CRITICAL_POOL_MAX: intFromString(10),
    DATABASE_IDLE_TIMEOUT_SECONDS: intFromString(30),
    DATABASE_CONNECT_TIMEOUT_SECONDS: intFromString(10),
    DATABASE_STATEMENT_TIMEOUT_MS: intFromString(15_000),
    DATABASE_LOCK_TIMEOUT_MS: intFromString(5_000),
    /** Must be false against the Supabase transaction pooler (ADR 0008). */
    DATABASE_PREPARE: booleanish.default(false),
    DATABASE_REPLICA_URL: z.string().optional(),

    // Redis
    REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
    REDIS_KEY_PREFIX: z.string().default('novamart:local:'),
    REDIS_TLS: booleanish.default(false),
    CACHE_DEFAULT_TTL_SECONDS: intFromString(300),
    CACHE_PRODUCT_TTL_SECONDS: intFromString(600),
    CACHE_CATEGORY_TTL_SECONDS: intFromString(3600),
    CACHE_PERMISSION_TTL_SECONDS: intFromString(60),

    // Search
    TYPESENSE_HOST: z.string().default('127.0.0.1'),
    TYPESENSE_PORT: intFromString(8108),
    TYPESENSE_PROTOCOL: z.enum(['http', 'https']).default('http'),
    TYPESENSE_ADMIN_API_KEY: z.string().optional(),
    TYPESENSE_SEARCH_ONLY_API_KEY: z.string().optional(),

    // Payments
    PAYMENT_PROVIDER: z.enum(['razorpay', 'cashfree', 'mock']).default('mock'),
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
    PAYMENT_WEBHOOK_TOLERANCE_SECONDS: intFromString(300),

    // Shipping
    SHIPPING_PROVIDER: z.enum(['shiprocket', 'delhivery', 'mock']).default('mock'),
    SHIPROCKET_EMAIL: z.string().optional(),
    SHIPROCKET_PASSWORD: z.string().optional(),
    DELHIVERY_API_TOKEN: z.string().optional(),
    SHIPPING_WEBHOOK_SECRET: z.string().optional(),

    // Notifications
    SMS_PROVIDER: z.enum(['msg91', 'mock']).default('mock'),
    MSG91_AUTH_KEY: z.string().optional(),
    EMAIL_PROVIDER: z.enum(['ses', 'resend', 'mock']).default('mock'),
    EMAIL_FROM: z.string().default('NovaMart <no-reply@novamart.in>'),
    RESEND_API_KEY: z.string().optional(),
    FCM_PROJECT_ID: z.string().optional(),
    FCM_SERVICE_ACCOUNT_JSON_BASE64: z.string().optional(),

    // Observability
    OTEL_ENABLED: booleanish.default(false),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
    OTEL_SERVICE_NAME: z.string().default('commerce-api'),
    SENTRY_DSN: z.string().optional(),
    SENTRY_ENVIRONMENT: z.string().optional(),
    SENTRY_TRACES_SAMPLE_RATE: z
      .union([z.number(), z.string()])
      .optional()
      .transform((v) => (v === undefined || v === '' ? 0.1 : Number(v))),

    // Business defaults (authoritative values live in platform.platform_settings)
    RESERVATION_TTL_MINUTES: intFromString(15),
    CHECKOUT_SESSION_TTL_MINUTES: intFromString(30),
    IDEMPOTENCY_RETENTION_DAYS: intFromString(30),
    OUTBOX_POLL_INTERVAL_MS: intFromString(250),
    OUTBOX_BATCH_SIZE: intFromString(100),
    OUTBOX_MAX_ATTEMPTS: intFromString(8),

    /**
     * Key for application-level encryption of sensitive columns (seller bank account
     * numbers, KYC document numbers). 32 bytes, base64-encoded.
     *
     * Encryption happens in the application rather than via pgcrypto in SQL so the key
     * never travels as a query parameter, where it could surface in a slow-query log or a
     * statement sample. Rotating it requires re-encrypting the affected rows, so the
     * ciphertext carries a key version.
     */
    FIELD_ENCRYPTION_KEY: z.string().optional(),
    FIELD_ENCRYPTION_KEY_VERSION: intFromString(1),

    // Worker runtime. Jobs legitimately run longer than an API request (a reconciliation
    // sweep scans a lot of rows), so they get their own ceiling rather than inheriting
    // the API's 15s.
    WORKER_STATEMENT_TIMEOUT_MS: intFromString(60_000),
    /** How long a rolling deploy may take before in-flight work is abandoned. */
    WORKER_SHUTDOWN_GRACE_MS: intFromString(15_000),
    /** Reclaim window for events left PROCESSING by a worker that died mid-batch. */
    OUTBOX_VISIBILITY_TIMEOUT_SECONDS: intFromString(300),
    /** Set false on replicas that should only run the dispatcher, not scheduled jobs. */
    WORKER_RUN_SCHEDULED_JOBS: booleanish.default(true),
    WORKER_RUN_OUTBOX_DISPATCHER: booleanish.default(true),
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV !== 'production') return;

    // Production hardening: things that are convenient locally are unacceptable live.
    const require = (key: keyof typeof env, why: string): void => {
      if (!env[key]) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key as string], message: why });
      }
    };

    require('SUPABASE_SECRET_KEY', 'The backend cannot reach Supabase without a secret key');
    require('SUPABASE_JWKS_URL', 'JWT verification requires the project JWKS URL');
    require(
      'FIELD_ENCRYPTION_KEY',
      'Bank account and KYC document numbers cannot be stored without an encryption key',
    );
    require('INTERNAL_SERVICE_TOKEN_SECRET', 'Worker-to-API calls must be signed');
    require('TYPESENSE_ADMIN_API_KEY', 'Search indexing requires an admin key');

    if (env.PAYMENT_PROVIDER === 'mock') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PAYMENT_PROVIDER'],
        message: 'The mock payment provider must never run in production',
      });
    }
    if (env.PAYMENT_PROVIDER === 'razorpay') {
      require('RAZORPAY_KEY_ID', 'Razorpay key id is required');
      require('RAZORPAY_KEY_SECRET', 'Razorpay key secret is required');
      require('RAZORPAY_WEBHOOK_SECRET', 'Webhook signature verification requires the secret');
    }
    if (env.SHIPPING_PROVIDER === 'mock') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SHIPPING_PROVIDER'],
        message: 'The mock shipping provider must never run in production',
      });
    }
    if (env.DATABASE_PREPARE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_PREPARE'],
        message: 'Prepared statements are incompatible with the Supabase transaction pooler',
      });
    }
    if (env.LOG_LEVEL === 'trace' || env.LOG_LEVEL === 'debug') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['LOG_LEVEL'],
        message: 'Debug logging in production risks leaking sensitive request data',
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

export function loadServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    // Fail fast and loudly: a half-configured service is worse than one that will not start.
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  cached = parsed.data;
  return cached;
}

/** Test helper. Never call this in application code. */
export function resetEnvCache(): void {
  cached = null;
}

export function corsOrigins(env: ServerEnv): string[] {
  return env.API_CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isProduction(env: ServerEnv): boolean {
  return env.APP_ENV === 'production';
}
