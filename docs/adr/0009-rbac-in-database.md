# ADR 0009 — RBAC resolved from database tables, not JWT metadata

Status: Accepted · Date: 2026-08-23

## Context

Supabase JWTs carry `user_metadata` and `app_metadata`. `user_metadata` is **writable by the user**
through the Auth API. Any system that authorises on `user_metadata.role` can be defeated by a
customer setting their own role to `ADMIN`. This is one of the most common Supabase security
failures in production.

NovaMart also needs scoped authority: a `SELLER_ORDER_MANAGER` for seller X must not see seller Y's
orders; a `WAREHOUSE_PICKER` at Bengaluru must not act on Delhi stock.

## Decision

Authorization is resolved from application-managed tables:

```
identity.roles · identity.permissions · identity.role_permissions
identity.user_roles (user_id, role_id, scope_type, scope_id, granted_by, expires_at)
```

- `user_metadata` is never read for any authorization decision, anywhere.
- The API resolves the effective permission set per request (cached in Redis for 60 s, invalidated
  on role change events) and enforces it in a `PermissionsGuard`.
- RLS policies call `SECURITY DEFINER STABLE` helpers — `identity.has_permission(text)`,
  `identity.has_seller_scope(uuid)`, `identity.has_warehouse_scope(uuid)` — which read the same
  tables, so the database enforces the same rules independently of the API.
- Role grants are themselves permission-gated (`role.grant`), audited, and optionally
  time-bounded via `expires_at`.
- `SUPER_ADMIN` is break-glass: MFA-gated, alerted on use, and reviewed quarterly.

Helper functions pin `search_path` (`SET search_path = identity, pg_catalog`) so a malicious schema
cannot shadow the tables they read.

## Consequences

Positive: privilege escalation via self-service metadata is structurally impossible; scoped
multi-tenant authority is expressible; revocation is immediate (bounded by the 60 s cache);
the database enforces the same model as the API, so an API bug is not automatically a data breach;
role changes are auditable.

Negative: authorization needs a database read (mitigated by caching); RLS helper functions add
per-statement cost (mitigated by `STABLE` and indexed lookups); slightly more setup than trusting
a claim.

## Alternatives rejected

**`app_metadata` claims in the JWT** — not user-writable, and faster (no DB read), but revocation
waits for token expiry and scoped grants bloat the token. Rejected as the primary mechanism;
may later be used as a cache of coarse role names only, never as the authority.

**Supabase custom access token hook** — attractive, and can be added later as an optimisation, but
the authority must still be the tables so RLS and the API cannot diverge.
