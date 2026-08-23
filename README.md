# NovaMart

A production-grade, multi-vendor e-commerce marketplace for India. Multiple independent sellers list
against a shared catalog; NovaMart owns the buyer relationship, the money flow, the fulfilment
promise and the trust layer.

This is not a demo. Money is integer paise, stock cannot go negative, payments are confirmed only by
verified server-side provider state, and every sensitive action is audited.

---

## Repository layout

```
novamart/
├── apps/
│   ├── customer-mobile/      Flutter — shoppers
│   ├── seller-mobile/        Flutter — seller operations on the go
│   ├── delivery-mobile/      Flutter — delivery partners
│   ├── warehouse-mobile/     Flutter — pick/pack/QC/inbound
│   ├── customer-web/         Next.js — storefront (SSR + SEO)
│   ├── seller-web/           Next.js — Seller Center
│   ├── admin-web/            Next.js — Admin control centre
│   ├── operations-web/       Next.js — Operations console
│   └── support-web/          Next.js — Support console
├── services/
│   ├── commerce-api/         NestJS on Fastify — all commerce logic
│   ├── worker-service/       Outbox dispatcher + domain consumers
│   ├── search-indexer/       Typesense projection worker
│   ├── notification-worker/  Push/email/SMS/WhatsApp delivery
│   ├── analytics-worker/     Event ingestion and aggregates
│   └── scheduled-jobs/       Reservation sweeps, reconciliation, settlements
├── packages/
│   ├── types/                Shared TypeScript types + generated DB types
│   ├── validation/           Zod schemas (one definition, all consumers)
│   ├── domain/              Money, state machines, ports (EventBus, SearchEngine, ...)
│   ├── events/               Domain event contracts
│   ├── permissions/          Permission and role catalogue
│   ├── logger/               pino with redaction + trace correlation
│   ├── config/               Environment schema and loading
│   ├── api-client/           Typed client used by all Next.js apps
│   ├── ui/                   Design system (tokens + shadcn-based components)
│   └── testing/              Test harness, fixtures, factories
├── supabase/
│   ├── migrations/           Versioned SQL — the schema is the contract
│   ├── policies/             RLS policy documentation and test matrix
│   ├── functions/            Edge Functions
│   ├── seed/                 Realistic seed data
│   └── config.toml
├── infrastructure/           IaC, Docker, deployment manifests
├── docs/                     Architecture, database, API, security, runbook, ADRs
├── scripts/                  Developer and CI scripts
└── tests/                    Cross-cutting: RLS, concurrency, E2E, load
```

## Prerequisites

| Tool | Version |
| --- | --- |
| Node.js | 22.x (see `.nvmrc`) |
| pnpm | 9.15+ |
| Docker | required for local Supabase, Redis, Typesense |
| Supabase CLI | 2.x |
| Flutter | 3.44+ (Dart 3.12+) |

## Getting started

```bash
# 1. Install JS dependencies
pnpm install

# 2. Environment
cp .env.example .env.local          # fill in local values

# 3. Start local infrastructure (Postgres, Auth, Storage, Realtime, Redis, Typesense)
pnpm db:start                       # supabase start
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d

# 4. Apply migrations and seed
pnpm db:reset                       # migrations + seed on a fresh database

# 5. Generate database types
pnpm db:types

# 6. Run everything
pnpm dev
```

Local URLs: API `http://localhost:4000`, storefront `:3000`, seller `:3001`, admin `:3002`,
operations `:3003`, support `:3004`, Supabase Studio `:54323`, Typesense `:8108`.

Flutter apps:

```bash
pnpm flutter:pubget
cd apps/customer-mobile && flutter run --dart-define-from-file=.env.local.json
```

## Common commands

```bash
pnpm build            # build all packages, services and web apps
pnpm typecheck        # strict TypeScript across the workspace
pnpm lint             # ESLint + import boundary rules
pnpm test             # unit + integration
pnpm test:e2e         # Playwright (web) — requires running stack
pnpm db:diff          # generate a migration from local schema changes
pnpm db:lint          # Supabase/Postgres linting
pnpm flutter:analyze  # Dart analyzer across all Flutter apps
pnpm flutter:test     # Flutter unit + widget tests
```

## Non-negotiable engineering rules

1. Clients never send prices, discounts or totals. The server recomputes everything.
2. Payment success comes only from a verified webhook or server-side provider fetch.
3. Stock changes only inside a transaction with row locks, and always writes a ledger entry.
4. Money is integer paise. No floats, ever.
5. Every domain event is written to the outbox in the same transaction as its state change.
6. Every financial or stock-moving endpoint is idempotent, backed by a unique constraint.
7. RLS is enabled on every client-reachable table, and every policy has a negative test.
8. Authorization comes from `identity.user_roles`, never from JWT `user_metadata`.
9. Historical orders are read from price snapshots, never recomputed.
10. A feature is done when it has database constraints, migration, RLS, permissions, API,
    validation, business logic, UI states (loading/empty/error), logging, audit, tests, docs and
    monitoring — not when the screen renders.

## Documentation

| Document | Purpose |
| --- | --- |
| [SYSTEM_ARCHITECTURE](docs/SYSTEM_ARCHITECTURE.md) | Components, data flows, scale path |
| [DOMAIN_MODEL](docs/DOMAIN_MODEL.md) | Bounded contexts, aggregates, invariants |
| [ER_DIAGRAM](docs/ER_DIAGRAM.md) | Schemas and relationships |
| [DATABASE](docs/DATABASE.md) | Conventions, indexes, migration safety |
| [API](docs/API.md) | Endpoint reference |
| [API_CONVENTIONS](docs/API_CONVENTIONS.md) | Envelope, errors, pagination, idempotency |
| [SECURITY](docs/SECURITY.md) / [SECURITY_MODEL](docs/SECURITY_MODEL.md) | Threat model, RBAC, RLS |
| [DEPLOYMENT](docs/DEPLOYMENT.md) | Environments, CI/CD, release process |
| [RUNBOOK](docs/RUNBOOK.md) | On-call procedures, incident response |
| [CONTRIBUTING](docs/CONTRIBUTING.md) | Workflow, standards, review checklist |
| [ROADMAP](docs/ROADMAP.md) | Phase plan and verification gates |
| [ADRs](docs/adr/README.md) | Why the architecture is what it is |

## Licence

Proprietary. All rights reserved.
