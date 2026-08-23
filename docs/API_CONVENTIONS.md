# NovaMart — API Conventions

Applies to every endpoint in `services/commerce-api`. Deviations require an ADR.

---

## 1. Versioning and routing

```
/api/v1/<resource>[/<id>][/<sub-resource>]
```

- Version is in the path. `v1` is frozen once public clients ship; additive changes only.
- Resources are plural nouns. Actions that are not CRUD use a sub-path verb:
  `POST /api/v1/orders/{id}/cancel`.
- Audience is expressed by prefix where authorization differs materially:
  - `/api/v1/...` — customer/public surface
  - `/api/v1/seller/...` — seller principals
  - `/api/v1/admin/...` — internal staff principals
  - `/api/v1/ops/...` — warehouse/delivery/operations principals
  - `/api/v1/webhooks/...` — provider callbacks (signature auth, no JWT)

## 2. Response envelope

Success:

```json
{
  "success": true,
  "data": { },
  "meta": { "requestId": "01J...", "cursor": { "next": "eyJ..." } }
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "INVENTORY_UNAVAILABLE",
    "message": "Requested quantity is unavailable",
    "details": [{ "field": "items[0].quantity", "issue": "only 2 units available" }]
  },
  "requestId": "01J..."
}
```

Rules:
- `error.code` is a stable `SCREAMING_SNAKE_CASE` enum from `packages/types`. Clients branch on
  `code`, never on `message`.
- `error.message` is safe to display but is English; clients localise from `code`.
- Stack traces, SQL, provider payloads and internal identifiers are never in responses. They go to
  structured logs keyed by `requestId`.
- `204 No Content` is used for successful deletes with no body.

## 3. Status codes

| Code | Use |
| --- | --- |
| 200 | Successful read or mutation returning a body |
| 201 | Resource created (includes `Location`) |
| 202 | Accepted for asynchronous processing |
| 204 | Success, no body |
| 400 | Malformed request / failed schema validation |
| 401 | Missing or invalid credentials |
| 403 | Authenticated but not permitted (also used for RLS/ownership failures) |
| 404 | Resource absent **or** not visible to this principal (no existence leak) |
| 409 | State conflict: invalid transition, duplicate, version mismatch |
| 410 | Expired resource (checkout session, reservation) |
| 422 | Semantically invalid business request (e.g. coupon not applicable) |
| 423 | Locked (account/seller suspended) |
| 429 | Rate limited (`Retry-After` set) |
| 500 | Unexpected server error |
| 502/503/504 | Downstream provider failure or maintenance mode |

## 4. Canonical error codes

```
AUTH_REQUIRED · AUTH_INVALID_TOKEN · AUTH_TOKEN_EXPIRED · AUTH_MFA_REQUIRED
FORBIDDEN · PERMISSION_DENIED · ACCOUNT_SUSPENDED · SELLER_NOT_APPROVED
VALIDATION_FAILED · RESOURCE_NOT_FOUND · CONFLICT · VERSION_CONFLICT
IDEMPOTENCY_KEY_REQUIRED · IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD
RATE_LIMITED · MAINTENANCE_MODE · APP_UPDATE_REQUIRED
CART_EMPTY · CART_ITEM_UNAVAILABLE · LISTING_NOT_SELLABLE · PRICE_CHANGED
INVENTORY_UNAVAILABLE · RESERVATION_EXPIRED
COUPON_INVALID · COUPON_EXPIRED · COUPON_LIMIT_REACHED · PROMOTION_NOT_APPLICABLE
ADDRESS_INVALID · PINCODE_NOT_SERVICEABLE · COD_NOT_AVAILABLE
CHECKOUT_SESSION_EXPIRED · ORDER_NOT_CANCELLABLE · INVALID_STATE_TRANSITION
PAYMENT_FAILED · PAYMENT_ALREADY_CAPTURED · PAYMENT_VERIFICATION_FAILED
REFUND_NOT_ALLOWED · REFUND_AMOUNT_EXCEEDS_CAPTURED
RETURN_NOT_ELIGIBLE · RETURN_WINDOW_CLOSED
SHIPPING_UNAVAILABLE · PROVIDER_UNAVAILABLE
SETTLEMENT_NOT_READY · INSUFFICIENT_BALANCE
INTERNAL_ERROR
```

## 5. Authentication

- Customer/seller/staff clients: `Authorization: Bearer <supabase access token>`. The API verifies
  the JWT signature against the project JWKS, checks `exp`/`aud`/`iss`, then loads authorization
  from `identity.user_roles`.
- Service-to-service (workers): mTLS-free internal network plus a signed service token with a
  narrow scope claim. Never the Supabase service role key over the public internet.
- Webhooks: provider HMAC signature over the **raw** request body, verified before JSON parsing,
  with timestamp skew rejection.

## 6. Authorization

Guards are declarative:

```ts
@Permissions('order.cancel')
@Scope('order', 'id')          // ownership/scope resolution for this resource
@Post(':id/cancel')
```

Rules:
- Permission strings are `resource.action` (`product.create`, `refund.approve`).
- Scoped roles carry a resource scope (`seller:<uuid>`, `warehouse:<uuid>`) checked against the
  target resource.
- `403` on permission failure, `404` when revealing existence would leak information.

## 7. Idempotency

Required on: checkout, order creation, cancellation, payment initiation, refund creation, shipment
creation, settlement processing, inventory adjustment, bulk imports.

```
Idempotency-Key: <uuid v4>
```

- Stored in `platform.idempotency_keys` with `UNIQUE (scope, key)` plus a hash of the request body.
- Replay with the same body → the original response is returned verbatim (`Idempotency-Replayed: true`).
- Replay with a different body → `409 IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD`.
- Keys are retained 30 days.

## 8. Pagination

Cursor pagination is the default and the only option for order/event/ledger scale tables:

```
GET /api/v1/orders?limit=20&cursor=eyJpZCI6...
→ meta.cursor = { "next": "eyJ...", "hasMore": true }
```

Offset pagination is allowed only for admin tables with a bounded row count and always caps at
`offset <= 10000`. `limit` defaults to 20, maximum 100.

## 9. Filtering and sorting

```
GET /api/v1/products?category=smartphones&brand=apple&price.gte=20000&price.lte=50000
                    &rating.gte=4&sort=-popularity,price&facets=brand,ram
```

- `field.op` operators: `eq` (implicit), `ne`, `gte`, `lte`, `gt`, `lt`, `in`, `contains`.
- `sort` is comma-separated; `-` prefix means descending. Only whitelisted fields are sortable.
- All filters are parsed by Zod schemas; unknown parameters are rejected with `VALIDATION_FAILED`.

## 10. Money and quantities

- All money is an **integer count of paise** (`INTEGER`/`BIGINT`), never a float.
  Field names carry the unit: `unit_price_paise`, `total_payable_paise`.
- Currency is always `INR` at launch but is an explicit column/field.
- Quantities are integers with CHECK constraints.
- API responses include a preformatted display string (`"₹1,34,900"`) computed server-side so all
  clients format identically.

## 11. Time and identifiers

- Timestamps are `timestamptz`, serialised as RFC 3339 UTC (`2026-08-23T10:15:30.000Z`).
- Business dates that must not shift with timezone (invoice date, settlement period) are `date`.
- Primary keys are UUID v7 where ordering helps (orders, events) and UUID v4 elsewhere.
- Human-facing identifiers are separate, prefixed and unique: `NM12345678` (order),
  `RT12345678` (return), `SH12345678` (shipment), `ST12345678` (settlement).

## 12. Required headers

Request:

```
Authorization: Bearer <jwt>
Idempotency-Key: <uuid>          (mutations listed in §7)
X-Request-Id: <uuid>             (optional; generated if absent)
X-Client-Platform: android|ios|web
X-Client-Version: 1.4.2
Accept-Language: en-IN|hi-IN
```

Response:

```
X-Request-Id · X-Trace-Id · X-RateLimit-Limit · X-RateLimit-Remaining · X-RateLimit-Reset
Retry-After (on 429/503) · Idempotency-Replayed (on replay)
```

## 13. Rate limits (defaults, tunable at runtime via `platform.platform_settings`)

| Surface | Limit |
| --- | --- |
| Unauthenticated read | 60 req/min per IP |
| Authenticated read | 300 req/min per user |
| Search | 120 req/min per user |
| Cart mutations | 60 req/min per user |
| Checkout | 10 req/min per user |
| Payment initiation | 10 req/min per user |
| OTP request | 5 per 15 min per phone, 20/hour per IP |
| Admin write | 120 req/min per user |
| Bulk import | 5 per hour per seller |

## 14. Validation

Zod schemas in `packages/validation` are the single definition, shared by the API and the Next.js
clients, and mirrored by Dart models generated from the same OpenAPI document. Every boundary is
validated: client requests, webhook payloads, provider responses, CSV imports, queue messages.

## 15. Deprecation

Breaking changes ship as `/api/v2`. Deprecated endpoints return `Deprecation` and `Sunset` headers
for at least 90 days and are tracked by usage metrics per client version before removal.
