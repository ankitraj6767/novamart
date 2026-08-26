import 'reflect-metadata';
import { Logger, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import { corsOrigins, loadServerEnv } from '@novamart/config';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const env = loadServerEnv();
  const logger = new Logger('Bootstrap');

  const adapter = new FastifyAdapter({
    trustProxy: env.API_TRUST_PROXY,
    bodyLimit: env.API_BODY_LIMIT_BYTES,
    // Correlation ids come from the context middleware, not Fastify's counter.
    genReqId: () => '',
    disableRequestLogging: true,
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
    logger: env.APP_ENV === 'local' ? ['log', 'warn', 'error', 'debug'] : ['log', 'warn', 'error'],
    // Webhook signatures are computed over the RAW body (brief §34). Without the raw
    // bytes, HMAC verification silently fails and every provider event looks forged.
    rawBody: true,
  });

  app.setGlobalPrefix(env.API_BASE_PATH);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  if (env.APP_ENV !== 'production') {
    const swagger = new DocumentBuilder()
      .setTitle('NovaMart Commerce API')
      .setDescription('Server-authoritative multi-vendor commerce APIs')
      .setVersion('1.0')
      .addBearerAuth()
      .addApiKey({ type: 'apiKey', name: 'Idempotency-Key', in: 'header' }, 'Idempotency-Key')
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger), { useGlobalPrefix: true });
  }

  // @fastify/helmet and @fastify/cors declare their plugin types against their own
  // resolved copy of fastify's types, which pnpm isolates from the copy
  // @nestjs/platform-fastify resolves. The runtime contract is identical; only the
  // nominal types differ. The expect-error will start failing (and can be removed) once
  // the versions converge.
  // @ts-expect-error plugin type is structurally compatible across fastify type copies
  await app.register(helmet, {
    contentSecurityPolicy: false, // The API serves JSON; CSP belongs on the web apps.
    crossOriginResourcePolicy: { policy: 'same-site' },
    hsts: env.APP_ENV === 'production' ? { maxAge: 63_072_000, includeSubDomains: true } : false,
  });

  const origins = corsOrigins(env);
  // @ts-expect-error plugin type is structurally compatible across fastify type copies
  await app.register(cors, {
    origin: origins.length > 0 ? origins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'X-Request-Id',
      'X-Trace-Id',
      'X-Client-Platform',
      'X-Client-Version',
      'X-Device-Id',
      'Accept-Language',
    ],
    exposedHeaders: [
      'X-Request-Id',
      'X-Trace-Id',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'Retry-After',
      'Idempotency-Replayed',
    ],
    maxAge: 600,
  });

  app.enableShutdownHooks();

  await app.listen(env.API_PORT, env.API_HOST);
  logger.log(
    `commerce-api listening on http://${env.API_HOST}:${env.API_PORT}${env.API_BASE_PATH}/v1 (${env.APP_ENV})`,
  );
}

void bootstrap().catch((error) => {
  // Startup failures must be loud and fatal: a half-started API is worse than none.
  // eslint-disable-next-line no-console
  console.error('Fatal error during bootstrap', error);
  process.exit(1);
});
