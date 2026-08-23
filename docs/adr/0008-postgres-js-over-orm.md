# ADR 0008 — postgres.js with explicit SQL instead of a full ORM

Status: Accepted · Date: 2026-08-23

## Context

The correctness-critical paths need `SELECT ... FOR UPDATE`, `FOR UPDATE SKIP LOCKED`, CTEs,
window functions, partial indexes, deterministic lock ordering, `ON CONFLICT DO NOTHING` for
idempotency, and explicit transaction control with `lock_timeout`. ORMs abstract exactly these away,
and their generated SQL for the checkout path is where marketplaces discover N+1 queries and
accidental lock escalation.

## Decision

Use **postgres.js** (`postgres`) as the driver, with hand-written SQL in repository classes.

- One repository per aggregate, exposing intention-revealing methods
  (`reserveStock`, `claimOutboxBatch`, `insertLedgerEntry`), never a generic query builder.
- Transactions are explicit: `sql.begin(async (tx) => { ... })`, with the transaction handle passed
  down so a use case's writes are provably in one transaction.
- Row types are declared in `packages/types` and verified against the database by contract tests
  that run `SELECT` statements against a freshly migrated database in CI. A schema drift breaks the
  build.
- Supabase's transaction pooler requires `prepare: false`; that is set in the config and documented.
- Zero string interpolation into SQL. postgres.js tagged templates parameterise by default; an
  ESLint rule bans `sql.unsafe` outside a small allowlist (migrations, admin tooling).

Migrations remain plain SQL under `supabase/migrations/`, applied by the Supabase CLI. The database
schema is authored by hand, not generated from code — the schema is the contract.

## Consequences

Positive: full control over locking, indexes and query plans; `EXPLAIN ANALYZE` matches the code
verbatim; excellent performance (postgres.js is among the fastest Node drivers); no migration
generation surprises; readable SQL that a DBA can review.

Negative: more boilerplate than an ORM; row types are maintained deliberately (mitigated by the
contract tests and `supabase gen types`); no automatic relation loading, so joins are written
explicitly; developers must actually know SQL — treated as a requirement, not a drawback.

## Alternatives rejected

**Prisma** — poor support for row-level locking and raw transaction control; its own migration
engine conflicts with Supabase CLI migrations.

**TypeORM** — decorator-driven entities encourage lazy loading and hidden queries in exactly the
paths that must be explicit.

**Drizzle** — closest contender and a reasonable future option; rejected for now because the
schema-per-domain layout plus hand-tuned locking SQL gains little from its type-safe builder, and
we did not want two sources of schema truth.

**Kysely** — good type-safe builder; rejected to avoid maintaining generated types for ~150 tables
across 15 schemas as the primary access path. Reconsider if repository boilerplate becomes a drag.
