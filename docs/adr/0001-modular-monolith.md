# ADR 0001 — Modular monolith with event-driven boundaries

Status: Accepted · Date: 2026-08-23 · Deciders: Principal Architect, CTO

## Context

NovaMart must launch quickly with a small team and still scale to 10M+ users. The two common
failure modes are a spaghetti monolith with no boundaries, and a premature fleet of microservices
where a single checkout requires six network hops, distributed transactions and six on-call
rotations before there is any traffic.

Marketplace checkout needs a single ACID transaction across cart, pricing, inventory and orders.
Splitting those into separate services at launch forces sagas and compensating transactions for
problems we do not yet have.

## Decision

Build `services/commerce-api` as a **modular monolith**: one deployable NestJS application with
hard internal domain boundaries.

- Each domain is a NestJS module owning its own tables, repositories and services.
- A module may only touch another domain through that domain's exported application service
  interface (an in-process port) or through published domain events. Direct cross-domain table
  reads are forbidden and enforced by an ESLint import boundary rule plus code review.
- Asynchronous work runs in `services/worker-service`, consuming the same domain events.
- Extraction to a separate service is a deployment change, not a rewrite, because callers already
  depend on an interface rather than a table.

Extraction triggers, in order of likelihood: search indexing, notification delivery, analytics
ingestion, payments/webhooks, checkout.

## Consequences

Positive: single transaction for checkout; one deploy; simple local development; boundaries already
in place for later extraction; no distributed tracing complexity at launch.

Negative: one process can be brought down by one bad module — mitigated by per-domain circuit
breakers around providers, bulkhead connection pools for checkout/payments, and separate worker
deployment. Scaling is coarse-grained until extraction. Boundary discipline must be actively
enforced or it erodes.

## Alternatives rejected

**Microservices from day one** — operational cost and distributed-transaction complexity are not
justified by launch traffic; would slow delivery by months.

**Unstructured monolith** — cheapest to start, but the cost of retrofitting boundaries at 1M users
is exactly the rewrite we are trying to avoid.

**Serverless functions per endpoint** — cold starts on checkout, no connection pooling story for
Postgres at scale, and transaction spanning across functions is impossible.
