# NovaMart — Domain Model

This document defines bounded contexts, aggregates, invariants and the vocabulary used across code,
database schemas and conversation. Names here are normative: code must use them.

---

## 1. The catalog vocabulary (most commonly modelled wrong)

These are five distinct concepts. Conflating them is the single most expensive marketplace mistake.

| Concept | Owner | Meaning | Example |
| --- | --- | --- | --- |
| **Product** | NovaMart catalog team | Abstract, seller-agnostic item identity | Apple iPhone 16 Pro |
| **Variant** | NovaMart catalog team | A specific combination of variant-defining attributes | Black Titanium, 256 GB |
| **SKU** | NovaMart catalog team | The stock-keeping unit; the thing inventory counts | `NM-IPH16P-BLK-256` |
| **Listing** | Seller | A seller's offer to sell a SKU at a price with terms | Seller A offers ₹1,34,900, 2-day dispatch |
| **Inventory** | Seller / warehouse | Quantity of a SKU at a physical location | 42 units at WH-BLR-01 |

Consequences enforced in the schema:

- Many listings → one SKU. `seller_listings` has `UNIQUE (seller_id, sku_id)`.
- Price lives on the **listing**, never on the product. `catalog.products` has no price column.
- Stock lives on `(sku_id, warehouse_id)`, never on the listing.
- Reviews and Q&A attach to the **product** (shared social proof), ratings for sellers attach to
  the **seller**.
- The **Buy Box** selects one winning listing per SKU for display; it is a computed projection.

## 2. Bounded contexts

Each context maps to one backend module and one or more Postgres schemas. Cross-context access is
through published events or an explicit in-process port — never a direct table read.

### Identity (`identity`)
Aggregates: `UserAccount`, `Role`, `Permission`, `Device`, `Session`.
Owns: who a principal is and what they may do. Supabase Auth owns credentials; NovaMart owns
profiles, roles, permissions and scopes.
Invariants: a permission grant is always `(user, role, optional resource scope)`. Roles are
application-managed rows, never JWT `user_metadata`.

### Customer (`identity`, `commerce`)
Aggregates: `CustomerProfile`, `Address`, `Preference`, `Wishlist`, `RecentlyViewed`.
Invariants: exactly one default shipping address per user (partial unique index); addresses are
soft-deleted because orders reference historical address snapshots.

### Seller (`seller`)
Aggregates: `Seller` (the business), `SellerUser`, `SellerDocument`, `BankAccount`, `TaxProfile`,
`SellerWarehouse`.
Lifecycle: `DRAFT → DOCUMENTS_PENDING → UNDER_REVIEW → {ACTION_REQUIRED, APPROVED, REJECTED}`,
then `SUSPENDED`/`BLOCKED` from `APPROVED`.
Invariants: a seller can only have active listings while `APPROVED`. Every status change writes
`seller_status_history` with actor and reason. KYC documents live only in private buckets.

### Catalog (`catalog`)
Aggregates: `Category` (tree + closure), `Brand`, `AttributeDefinition`, `Product`, `Variant`,
`Sku`, `Listing`.
Invariants:
- Category is a DAG-free tree; `category_closure` maintains ancestor/descendant with depth.
- A category defines which attributes are required, filterable and variant-defining.
- A variant's attribute values must satisfy the category's variant-defining attribute set.
- A listing is sellable only when product is `ACTIVE`, listing is `ACTIVE`, seller is `APPROVED`,
  and stock exists. This is one SQL predicate, reused everywhere (`catalog.v_sellable_listings`).

### Inventory (`inventory`)
Aggregates: `Warehouse`, `WarehouseInventory`, `Reservation`, `LedgerEntry`, `Adjustment`,
`Transfer`.
Invariants (the hardest in the system):
- `available_quantity >= 0`, `reserved_quantity >= 0` enforced by CHECK constraints.
- Every quantity change writes an immutable `inventory_ledger` row. Balance is reproducible by
  replaying the ledger; a reconciliation job asserts ledger sum == materialised balance.
- Reservations are created only under `SELECT ... FOR UPDATE`, always locking rows in `sku_id`
  order to avoid deadlocks.
- A reservation has `expires_at`; expiry releases stock exactly once (status transition guarded).

### Cart (`commerce`)
Aggregates: `Cart`, `CartItem`, `SavedForLater`.
Invariant: cart prices are **advisory display values**. Checkout ignores them and recomputes.

### Pricing (`pricing`)
Aggregates: `ListingPrice`, `PriceBreakdown`, `TaxRule`, `CommissionRule`.
Computation order is fixed and total-preserving:
```
MRP → seller discount → platform discount → coupon → offer → bank offer
    → shipping → other charges → tax split → final payable
```
Invariant: every order persists an immutable price snapshot. Historical orders are never recomputed
from current prices.

### Promotion (`pricing`)
Aggregates: `Promotion`, `PromotionRule`, `Coupon`, `CouponRedemption`, `BankOffer`, `FlashSale`.
Invariants: usage limits are enforced by unique constraints + row locks, not by application counting.
Per-user limits use `UNIQUE (coupon_id, user_id, order_id)` plus an aggregate check under lock.

### Checkout (`commerce`)
Aggregates: `CheckoutSession`, `CheckoutItem`, `PriceSnapshot`.
Invariant: a checkout session is single-use and idempotent; the same `Idempotency-Key` returns the
same order, never a second order.

### Orders (`commerce`)
Aggregates: `Order` (parent, customer-facing), `OrderItem` (per seller/warehouse/shipment unit).
Invariants:
- Multi-seller orders split into per-seller fulfilment groups; each `order_item` has independent
  status, shipment, return and refund lifecycles.
- Status transitions are validated against an explicit state machine table. `DELIVERED → PACKED`
  is impossible at the database level (`commerce.order_status_transitions` + trigger guard).
- Every transition appends to `order_item_status_history` with actor, reason, occurred_at.

### Payments (`payments`)
Aggregates: `PaymentIntent`, `PaymentAttempt`, `Transaction`, `WebhookEvent`, `Refund`,
`RefundAttempt`, `ReconciliationRun`.
Invariants:
- Order is confirmed only on server-verified provider state (webhook or server-side fetch).
- `payment_webhook_events` has `UNIQUE (provider, provider_event_id)`; duplicate deliveries are
  no-ops.
- Sum of successful refunds for an item can never exceed the captured amount for that item
  (enforced under lock + CHECK on running totals).
- Card numbers are never stored. Only provider tokens and last4/network metadata.

### Fulfillment (`fulfillment`)
Aggregates: `Shipment`, `Package`, `Label`, `TrackingEvent`, `DeliveryAttempt`, `DeliveryProof`,
`ReverseShipment`, `ServiceabilityZone`, `DeliveryPromise`.
Invariants: a shipment belongs to exactly one seller and one warehouse; tracking events are
append-only and deduplicated on `(shipment_id, provider_event_id)`.

### Returns (`returns`)
Aggregates: `ReturnRequest`, `ReturnItem`, `Evidence`, `Inspection`, `ReplacementOrder`.
Invariants: return eligibility is computed from the category/seller policy captured **at order
time**, not the policy as it exists today. Refund is issued only after QC decision (or per policy).

### Finance (`finance`)
Aggregates: `SellerLedgerEntry` (immutable), `Commission`, `PlatformFee`, `Settlement`,
`SettlementItem`, `Payout`, `Adjustment`.
Invariants: seller balance is `SUM(ledger.amount)` — never a mutable column. Every settlement is
reproducible from the exact ledger entries it consumed (`settlement_items` pins entry ids).

### Reviews (`commerce`)
Aggregates: `Review`, `ReviewMedia`, `Vote`, `Report`, `RatingSummary`.
Invariant: `is_verified_purchase` is true only if the user has a `DELIVERED` order item for that
product. `UNIQUE (product_id, user_id)` prevents review spam.

### Support (`support`)
Aggregates: `Ticket`, `Message`, `Attachment`, `Macro`, `SlaPolicy`.

### Risk (`audit`, `analytics`)
Aggregates: `RiskEvent`, `RiskScore`, `FraudRule`, `FraudCase`.

### Marketing / CMS (`marketing`)
Aggregates: `Campaign`, `HomeSection`, `Banner`, `Collection`, `NotificationTemplate`.
Invariant: the storefront homepage is entirely data-driven from `home_sections`; no hardcoded
sections in client code.

### Platform (`platform`)
Aggregates: `FeatureFlag`, `PlatformSetting`, `IntegrationSetting`, `AppVersionPolicy`,
`OutboxEvent`, `IdempotencyKey`.

## 3. Cross-context event contracts

Events are the only sanctioned cross-context coupling. Full payload schemas live in
`packages/events`. Naming: `DOMAIN.ENTITY_ACTION_PAST_TENSE`, versioned (`v1`).

```
identity   USER_REGISTERED
seller     SELLER_REGISTERED · SELLER_APPROVED · SELLER_SUSPENDED
catalog    PRODUCT_CREATED · PRODUCT_UPDATED · LISTING_CREATED · LISTING_UPDATED
inventory  INVENTORY_UPDATED · INVENTORY_RESERVED · INVENTORY_RELEASED
commerce   CHECKOUT_STARTED · ORDER_CREATED · ORDER_CONFIRMED · ORDER_CANCELLED
payments   PAYMENT_CREATED · PAYMENT_SUCCESS · PAYMENT_FAILED
           REFUND_CREATED · REFUND_SUCCESS · REFUND_FAILED
fulfillment SHIPMENT_CREATED · ORDER_SHIPPED · OUT_FOR_DELIVERY · ORDER_DELIVERED
returns    RETURN_REQUESTED · RETURN_APPROVED · RETURN_RECEIVED
finance    SETTLEMENT_CREATED · SELLER_PAID
```

Every consumer must be idempotent: `(consumer_name, event_id)` uniqueness is the standard guard.

## 4. Ubiquitous language

| Term | Definition |
| --- | --- |
| Buy Box | The winning listing shown by default for a SKU |
| Fulfilment node | The `(seller, warehouse)` pair chosen to serve an order item |
| Delivery promise | A concrete date ("Delivery by Tue, 25 Aug"), not a range |
| Reservation | A time-bounded hold on stock, not a sale |
| Settlement | A batch that converts ledger entries into one payable amount |
| RTO | Return to origin — undelivered shipment sent back |
| NDR | Non-delivery report — a failed delivery attempt requiring action |
| GMV | Gross merchandise value, before cancellations/returns |
| NMV | Net merchandise value, after cancellations/returns/refunds |
