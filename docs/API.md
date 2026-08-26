# NovaMart API

The commerce API is versioned under `/api/v1`. Responses use the global success envelope;
errors expose a stable `error.code` and `requestId`.

## Customer

| Area        | Endpoints                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Catalog     | `GET /catalog/home`, `/catalog/categories`, `/catalog/products`, `/catalog/products/:slug`, `/catalog/serviceability/:pincode` |
| Search      | `GET /search`, `/search/suggest`, `/search/recommendations`; `POST /search/events`                                             |
| Cart        | `GET /cart`; `POST /cart/items`, `/cart/coupon`, `/cart/pincode`; item update/remove/save-for-later routes                     |
| Checkout    | `POST /checkout` plus quote/update/place routes                                                                                |
| Orders      | `GET /orders`, `/orders/:id`; `POST /orders/:id/cancel`                                                                        |
| Payments    | `POST /payments/orders/:orderId/session`, `/payments/verify`; provider webhooks are authenticated by signature                 |
| Returns     | `GET /returns/reasons`, `GET /returns`; `POST /returns`                                                                        |
| Reviews/Q&A | `GET /reviews/products/:productId`, `/reviews/products/:productId/questions`; authenticated create/vote/report/answer routes   |
| Customer    | `GET/POST/DELETE /customer/wishlist...`, `GET /customer/recently-viewed`; `GET /notifications`                                 |
| Support     | `GET /support/help`, `/support/categories`; authenticated ticket/message routes                                                |

Prices, tax, discounts, inventory and payment status are server-owned. A client may send
intent and acknowledgement values, but the API re-reads source records before any state or
money mutation.

## Seller and operations

| Area             | Endpoints                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Sellers          | Seller registration, tax/bank onboarding, warehouses, listings, dashboard, seller orders and item status updates under `/sellers` |
| Inventory        | Receipts, maker-checker adjustments, stock list and immutable ledger under `/inventory`                                           |
| Fulfillment      | Shipment queue/create/label, order tracking under `/shipping`; carrier callbacks under `/shipping/webhooks/:provider`             |
| Returns/QC       | Approval, rejection, receipt and inspection under `/returns/:returnRequestId/...`                                                 |
| Finance          | Balance, ledger, settlement generation/approval, payouts and financial adjustments under `/seller-finance`                        |
| Support          | Agent ticket update/escalation routes under `/support`                                                                            |
| Risk             | Rules, events, scores and fraud cases under `/risk`                                                                               |
| Dynamic platform | Settings, feature flags and homepage sections under `/admin/platform`                                                             |

Checkout and order creation require an `Idempotency-Key`; refund, shipment, payout and
settlement writes also carry deterministic database idempotency keys. Privileged routes
require permissions from `identity.user_roles` and never infer authority from user-controlled
metadata.

## Provider boundaries

Payment, shipping, search, notification and storage providers remain behind adapters. Local
development uses the configured mock payment/shipping paths only; production configuration
rejects mock payment/shipping providers. Production credentials are read from environment or
secret management and are never stored in client bundles or `platform.integration_settings`.
