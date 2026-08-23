# ADR 0002 — Supabase as the primary platform

Status: Accepted · Date: 2026-08-23

## Context

NovaMart needs managed Postgres, authentication, object storage, realtime, queues and cron without
a platform team. The product brief mandates Supabase.

## Decision

Use Supabase for Postgres (source of truth), Auth (credentials and session issuance), Storage
(media and documents), Realtime (order/shipment live updates, warehouse dashboards), Queues (event
transport at launch) and Cron (scheduled sweeps).

Boundaries we hold deliberately:

- **Auth**: Supabase owns credentials and token issuance. NovaMart owns profiles, roles and
  permissions in `identity.*`. Authorization is never read from JWT `user_metadata`.
- **Edge Functions**: used only for Supabase-native glue and latency-sensitive shims. Core commerce
  runs in `commerce-api`, which needs connection pooling, long transactions, row locks and a real
  DI/testing story.
- **Direct client access**: clients read public catalog and their own rows through RLS. All
  mutations that touch money, stock or order state go through `commerce-api`.
- **Portability**: nothing depends on a Supabase-only SQL feature. Auth is abstracted behind an
  `IdentityProvider` port, Storage behind `ObjectStore`, Queues behind `EventBus`. A migration to
  self-hosted Postgres + an alternative auth provider is an adapter swap plus a user migration.

## Consequences

Positive: very fast to production; RLS gives defence in depth for free; managed backups and PITR;
one vendor for six concerns; local development parity via `supabase start` (Docker).

Negative: vendor concentration risk; connection limits require the transaction pooler (which means
`prepare: false` for postgres.js and no session-level features); Queues are less capable than Kafka
(mitigated by the `EventBus` port); Storage image transformation is less flexible than a dedicated
image CDN (mitigated by Cloudflare in front).

## Alternatives rejected

**Raw AWS (RDS + Cognito + S3 + SQS)** — more control, materially more platform work before the
first order ships.

**Firebase** — no relational integrity or transactions; disqualifying for inventory and money.
