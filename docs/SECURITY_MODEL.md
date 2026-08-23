# NovaMart — Security Model

Threat-driven design for authentication, authorization, data isolation, secrets and abuse control.

---

## 1. Trust boundaries

```
UNTRUSTED                          SEMI-TRUSTED                  TRUSTED
Flutter apps                       Next.js server runtime        commerce-api
Browser JS                         (server actions, RSC)         workers
Provider webhook callers                                         Supabase Postgres (RLS + roles)
CSV/bulk uploads
```

Rules:
- Untrusted code holds **only** the Supabase publishable/anon key. Never a service role key, DB
  password, provider secret or admin credential.
- Next.js server code may hold a scoped server key but still calls `commerce-api` for commerce
  mutations; it does not become a second commerce brain.
- `commerce-api` and workers hold privileged credentials, injected from a secret manager at runtime.

## 2. Authentication

| Principal | Method | Notes |
| --- | --- | --- |
| Customer | Supabase Auth: phone OTP, email OTP/password, Google, Apple | Optional biometric unlock gates local access to a stored refresh token |
| Seller user | Email + password + mandatory MFA for `SELLER_OWNER`/`SELLER_FINANCE_MANAGER` | Invited into a seller org, never self-attached |
| Staff | Email + password + **mandatory TOTP MFA**, 30-minute idle session, 8-hour absolute | Optional SSO later |
| Delivery/warehouse | Phone OTP, device-bound session | Device binding recorded in `identity.user_devices` |
| Worker/service | Signed internal service token, short TTL, narrow scope | Rotated automatically |
| Provider webhook | HMAC signature over raw body + timestamp skew window | No user identity |

Token handling:
- Access tokens are short-lived (1 hour). Refresh happens through Supabase SDK.
- Mobile refresh tokens are stored in Keychain/Keystore via `flutter_secure_storage`, never in
  shared preferences.
- Web sessions use httpOnly, `Secure`, `SameSite=Lax` cookies set by the Next.js server; tokens are
  not exposed to client JS in operator consoles.
- Logout revokes the Supabase session and clears device push registration.

## 3. Authorization: RBAC with resource scopes

Authorization is a database-backed decision, never a claim the client controls.

```
identity.roles              (code, name, kind: CUSTOMER|SELLER|STAFF|OPS)
identity.permissions        (code = 'resource.action', description)
identity.role_permissions   (role_id, permission_id)
identity.user_roles         (user_id, role_id, scope_type, scope_id, granted_by, expires_at)
identity.resource_scopes    (scope_type, scope_id)  -- seller, warehouse, region, category
```

Decision function:

```
allowed(principal, permission, resource) =
     EXISTS user_roles ur JOIN role_permissions rp
       WHERE ur.user_id = principal
         AND rp.permission = permission
         AND (ur.expires_at IS NULL OR ur.expires_at > now())
         AND ( ur.scope_type IS NULL                       -- global grant
               OR (ur.scope_type = resource.scope_type
                   AND ur.scope_id = resource.scope_id) )  -- scoped grant
```

Enforcement happens in three independent layers, all required:

1. **API guard** — `@Permissions('refund.approve')` + scope resolver.
2. **Row Level Security** — even a leaked publishable key cannot read another user's rows.
3. **Domain assertion** — the service re-checks ownership inside the transaction before mutating.

Anti-patterns explicitly banned:
- `USING (auth.role() = 'authenticated')` as an authorization policy.
- Reading roles from `auth.jwt() -> 'user_metadata'` (user-writable).
- Granting `SUPER_ADMIN` for convenience. `SUPER_ADMIN` is break-glass, MFA-gated, audited, and
  limited to a named list reviewed quarterly.

## 4. Role catalogue

```
CUSTOMER

SELLER_OWNER · SELLER_ADMIN · SELLER_CATALOG_MANAGER · SELLER_ORDER_MANAGER
SELLER_FINANCE_MANAGER

WAREHOUSE_MANAGER · WAREHOUSE_PICKER · WAREHOUSE_PACKER · WAREHOUSE_QC
INVENTORY_EMPLOYEE · DELIVERY_AGENT

SUPPORT_AGENT · SUPPORT_MANAGER

CATALOG_MANAGER · CATEGORY_MANAGER · MARKETING_MANAGER · OPERATIONS_MANAGER
FINANCE_MANAGER · FRAUD_ANALYST

ADMIN · SUPER_ADMIN
```

Seller and warehouse roles are always scoped (`scope_type='seller'|'warehouse'`). Staff roles are
global unless scoped to a region or category.

## 5. RLS strategy

| Table class | Policy |
| --- | --- |
| Public catalog (`catalog.categories`, `brands`, `products`, `product_media`, sellable listings) | `SELECT` for `anon`+`authenticated` where `status='ACTIVE'` and not soft-deleted. No client writes. |
| Customer-owned (`addresses`, `carts`, `wishlists`, `orders`, `reviews`, `support_tickets`) | `SELECT/INSERT/UPDATE` where `user_id = auth.uid()`, with column-level restrictions on status fields |
| Seller-owned (`seller_listings`, `warehouse_inventory`, seller orders) | Access through `identity.has_seller_scope(seller_id)` helper, which reads `user_roles` |
| Staff-visible | Access through `identity.has_permission('x.y')` helper |
| Financial/ledger (`inventory_ledger`, `seller_ledger`, `payment_*`, `settlements`) | **RLS enabled with no client policy at all.** Only the service role (API/workers) can touch them |
| Private/sensitive (`seller_documents`, `kyc`, `risk_events`, `audit_logs`) | No client policy; staff read only through API endpoints that audit the access |

Helper functions live in the `identity` schema, are `SECURITY DEFINER` with `search_path` pinned to
avoid injection, and are `STABLE` so Postgres can cache them per statement.

Every policy has a corresponding test in `tests/rls` that asserts both the allowed case and the
denied case using real JWTs for different principals. A policy without a negative test is not done.

## 6. Storage buckets

| Bucket | Visibility | Contents | Max size | MIME allowlist |
| --- | --- | --- | --- | --- |
| `products-public` | public read | product images, galleries | 8 MB | jpeg, png, webp, avif |
| `brands-public` | public read | brand logos | 2 MB | jpeg, png, webp, svg |
| `categories-public` | public read | category art | 2 MB | jpeg, png, webp |
| `reviews-public` | public read | review photos/videos | 25 MB | jpeg, png, webp, mp4 |
| `seller-private` | owner + staff | seller assets, bulk import files | 50 MB | csv, xlsx, jpeg, png, pdf |
| `kyc-private` | owner write, staff read (audited) | PAN, GST, cheque, address proof | 10 MB | pdf, jpeg, png |
| `returns-private` | owner + staff | return evidence, QC photos | 25 MB | jpeg, png, mp4 |
| `support-private` | ticket participants + agents | ticket attachments | 25 MB | pdf, jpeg, png, txt |
| `invoices-private` | owner + staff | tax invoices, credit notes | 5 MB | pdf |
| `documents-private` | staff | agreements, legal | 25 MB | pdf |

Uploads always go through a **server-issued signed upload URL** after the API validates declared
MIME type, size and the caller's right to write to that path. Path convention:
`{entity}/{entity_id}/{uuid}.{ext}` — never user-supplied filenames. Private objects are served
through short-lived signed URLs (≤ 5 minutes), never public links.

## 7. Input handling

- Every request body, query string, header-driven parameter, webhook payload, provider response and
  CSV row is validated with Zod before use.
- SQL is always parameterised. String interpolation into SQL is a CI-blocking lint failure.
- HTML from CMS rich content is sanitised server-side with a strict allowlist before storage and
  rendered without `dangerouslySetInnerHTML` unless it passed that sanitiser.
- Uploaded images are re-encoded (strips EXIF and polyglot payloads) before public exposure.
- CSV imports are processed as data only; formula-injection prefixes (`=`, `+`, `-`, `@`) are
  escaped on export.

## 8. Web hardening

Security headers set at the edge and in Next.js middleware:

```
Content-Security-Policy: default-src 'self'; img-src 'self' https://cdn.novamart.in data:;
  script-src 'self' 'nonce-<per-request>'; connect-src 'self' https://*.supabase.co https://api.novamart.in;
  frame-ancestors 'none'; base-uri 'self'; object-src 'none'
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(self), geolocation=(self)
Cross-Origin-Opener-Policy: same-origin
```

- CSRF: operator consoles use double-submit cookie + `SameSite=Lax` + origin checks on mutations.
- CORS on `commerce-api` allows only known first-party origins per environment; no wildcard with
  credentials.
- Mobile: certificate pinning for the API domain, root/jailbreak signal recorded as a risk event
  (not a hard block), no secrets in the binary, obfuscated release builds.

## 9. Abuse and rate control

- Redis token buckets per IP, per user, per device and per phone number.
- Cloudflare WAF + bot management in front of storefront and API.
- OTP: attempt caps, exponential backoff, hashed OTP storage, single-use, 5-minute TTL.
- Credential stuffing: progressive delays, device fingerprint anomaly checks, breach-password
  rejection on set/change.
- Coupon farming, COD abuse, return abuse and review abuse are handled by the rules engine in the
  risk module, writing `risk_events` and opening `fraud_cases`.

## 10. Secrets

- Sources: environment injection from the platform secret manager (Doppler/AWS Secrets Manager) in
  deployed environments; `.env.local` (gitignored) for local development only.
- `.env.example` documents every variable name with no real values.
- Rotation: provider keys quarterly, service tokens automatically, database credentials on staff
  departure, immediately on suspected exposure. Runbook: `docs/RUNBOOK.md#credential-rotation`.
- CI runs secret scanning (gitleaks) on every push; a hit fails the build.
- No secret is ever logged. The logger has a redaction allowlist (see §11).

## 11. Logging rules

Never logged, at any level, in any environment:

```
passwords · OTP values · full card numbers · CVV · payment provider secrets
access/refresh tokens · session cookies · Supabase service keys
KYC document contents · full bank account numbers (last4 only)
customer phone/email in plaintext outside audited access paths
```

The pino logger applies a redaction path list plus a value-shape detector for card-like and
token-like strings. Attempting to log a redacted key emits `[REDACTED]`.

## 12. Audit

Every sensitive action writes `audit.audit_logs`:

```
actor_id · actor_type · actor_roles · action · resource_type · resource_id
old_value (jsonb) · new_value (jsonb) · reason · ip · user_agent · device_id
request_id · trace_id · occurred_at
```

Append-only: `INSERT` only, no `UPDATE`/`DELETE` grant for any role including service role
(enforced by a `BEFORE UPDATE OR DELETE` trigger that raises). Audited actions include seller
approval/suspension, product moderation, price override, commission change, inventory adjustment,
manual refund, role grant/revoke, KYC document access, settlement processing, feature flag change
and maintenance mode toggle.

## 13. Payment security

- PCI scope minimised: card data never touches NovaMart servers. Provider-hosted collection or
  provider SDK tokenisation only.
- Webhook signature verification before parsing, on raw bytes, constant-time comparison.
- Replay protection: `UNIQUE (provider, provider_event_id)` plus timestamp window.
- Amount verification: the provider-reported amount must equal the stored `payment_intent` amount
  to the paisa, else the event is quarantined and an alert fires.
- Refunds require `refund.approve` permission above a configurable threshold, and always write an
  audit record with reason.

## 14. Privacy and data rights

- Data minimisation: only what commerce requires. No card storage, no unnecessary KYC copies.
- Encryption in transit everywhere (TLS 1.2+); at rest via Supabase-managed encryption.
- Column-level encryption for bank account numbers and document numbers, keys held outside the DB.
- DSAR support: account data export and deletion endpoints. Deletion anonymises the customer while
  preserving legally required financial and tax records (order/invoice retention).
- Retention: audit logs 7 years, financial records 8 years (Indian statutory), risk events 2 years,
  raw analytics events 13 months.

## 15. Per-domain security checkpoint

Before a domain is marked complete, all twelve items must be signed off:

```
[ ] Authentication enforced on every route
[ ] Authorization: permission + scope, negative tests present
[ ] RLS enabled, policies tested for allow and deny
[ ] Input validation at every boundary
[ ] No sensitive data in responses, logs or errors
[ ] No privilege escalation path (role grant, scope forgery, mass assignment)
[ ] No IDOR/BOLA (object access always scoped to principal)
[ ] Rate limiting configured
[ ] Audit records written for sensitive actions
[ ] Secrets injected, not committed; least privilege
[ ] Webhooks verified and idempotent
[ ] Concurrency: locks/constraints proven by a test
```
