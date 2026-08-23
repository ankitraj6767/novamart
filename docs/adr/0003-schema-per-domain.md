# ADR 0003 — Schema-per-domain instead of one `public` schema

Status: Accepted · Date: 2026-08-23

## Context

NovaMart will have roughly 150 tables. Supabase defaults everything into `public`, which is exposed
by the auto-generated REST API. A single flat namespace makes ownership, grants and API exposure
all-or-nothing.

## Decision

Create one schema per bounded context: `identity`, `catalog`, `seller`, `pricing`, `inventory`,
`commerce`, `payments`, `fulfillment`, `returns`, `finance`, `marketing`, `support`, `analytics`,
`audit`, `platform`, plus `api` for client-facing views/functions.

- Only `api` and a deliberately chosen subset of `catalog`/`commerce` are exposed through
  PostgREST (`config.toml: api.schemas`). `payments`, `finance`, `audit` and `platform` are never
  exposed to the anon/authenticated roles at all.
- Grants are per schema: `anon` and `authenticated` get `USAGE` only on schemas they legitimately
  read, and `SELECT` only on specific tables/views.
- Table names lose their prefixes: `payments.refunds`, not `public.payment_refunds`.
- `public` holds nothing but Supabase-managed extensions/artifacts.

## Consequences

Positive: exposure is deny-by-default at the schema level, a much stronger guarantee than
per-table RLS alone; clear ownership; readable names; easier future extraction (a schema maps to a
service); `search_path` discipline prevents accidental cross-domain queries.

Negative: every query needs a qualified name; Supabase type generation must list schemas explicitly;
some Supabase Studio features are `public`-oriented; contributors must know which schema owns what
(documented in `docs/DATABASE.md`).

## Alternatives rejected

**Everything in `public` with prefixes** — one RLS mistake exposes a financial table through the
auto-generated API. Unacceptable for money.

**Separate databases per domain** — loses the cross-domain ACID transaction that checkout requires.
