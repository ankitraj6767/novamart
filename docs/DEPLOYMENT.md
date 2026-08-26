# NovaMart deployment

## Environments

NovaMart has separate local, development, staging and production environments. Each has its
own Supabase project, database credentials, JWT issuer, Redis, Typesense collection and provider
credentials. Secret values are injected by the deployment platform; they are never committed to
`.env`, browser bundles or `platform.integration_settings`.

## Local

```bash
pnpm db:start
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d
pnpm db:reset
pnpm install
pnpm dev
```

## Containers

`Dockerfile.commerce-api` and `Dockerfile.worker` build only their bounded runtime. The API and
worker use Node 22, pnpm 9.15.4 and the same lockfile. Redis and Typesense are local development
dependencies; Supabase is managed through the Supabase CLI so migrations and Auth/Storage/
Realtime configuration remain authoritative.

## Release gates

Every release must pass typecheck, build, unit tests, database reset/lint, RLS negative tests,
and staged E2E tests. Migrations are reviewed and applied separately from application rollout.
Production deploys must use `PAYMENT_PROVIDER` and `SHIPPING_PROVIDER` adapters backed by real
credentials; mock adapters are rejected by environment validation.

## Rollback and recovery

Application rollback is safe only when the previous binary understands the current event
contracts. Database migrations are additive where practical; destructive changes require a
separate expand/backfill/contract release. Restore testing, PITR and provider reconciliation
are operational requirements before PAN-India launch.
