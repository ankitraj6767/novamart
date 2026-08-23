# NovaMart — Entity Relationship Model

Schema-by-schema relationship map. Authoritative DDL lives in `supabase/migrations/`. Column-level
notes are in `docs/DATABASE.md`.

Legend: `1–*` one-to-many, `*–*` many-to-many, `1–1` one-to-one, `(im)` immutable/append-only.

---

## Schema layout

```
identity     principals, roles, permissions, devices, addresses
catalog      categories, brands, attributes, products, variants, skus, listings
seller       seller businesses, users, KYC, bank, tax, warehouses
inventory    warehouses, stock balances, ledger (im), reservations, transfers
pricing      listing prices, price history, promotions, coupons, bank offers, tax, commission rules
commerce     carts, wishlists, checkout sessions, orders, order items, reviews, Q&A
payments     intents, attempts, transactions (im), webhook events (im), refunds, reconciliation
fulfillment  serviceability, shipments, packages, labels, tracking (im), delivery proof, reverse
returns      return requests, items, evidence, inspections, replacements
finance      seller ledger (im), commissions, fees, settlements, payouts, adjustments
marketing    campaigns, home sections, banners, collections, notification templates, notifications
support      tickets, messages, attachments, SLA
analytics    event stream, aggregates, risk events/scores, fraud rules/cases
audit        audit logs (im), security events (im)
platform     feature flags, settings, integrations, app versions, outbox (im), idempotency keys
```

## identity

```
auth.users (Supabase)
   │ 1–1
   ▼
identity.profiles ──1–*── identity.user_devices
   │  │                   identity.user_preferences (1–1)
   │  │
   │  └──1–*── identity.addresses ──*–1── identity.pincodes
   │
   └──1–*── identity.user_roles ──*–1── identity.roles ──*–*── identity.permissions
                    │                                    (via role_permissions)
                    └── scope_type/scope_id → identity.resource_scopes
```

Key constraints: `addresses` has a partial unique index `(user_id) WHERE is_default AND deleted_at
IS NULL`. `user_roles` unique on `(user_id, role_id, scope_type, scope_id)`.

## seller

```
seller.sellers
   ├──1–*── seller.seller_users ──*–1── identity.profiles
   ├──1–*── seller.seller_documents        (kyc-private storage refs)
   ├──1–*── seller.seller_bank_accounts    (one primary, partial unique)
   ├──1–1── seller.seller_tax_profiles     (GSTIN, PAN, composition flag)
   ├──1–*── seller.seller_warehouses ──1–1── inventory.warehouses
   ├──1–*── seller.seller_status_history   (im)
   └──1–1── seller.seller_performance      (rolling metrics projection)
```

## catalog

```
catalog.categories ──1–*── catalog.categories (parent_id, tree)
   │   └── catalog.category_closure (ancestor_id, descendant_id, depth)
   ├──1–*── catalog.category_attributes ──*–1── catalog.attribute_definitions
   │                                                  └──1–*── catalog.attribute_options
   ├──1–1── catalog.category_policies (return window, commission default, required fields)
   └──1–*── catalog.products

catalog.brands ──1–*── catalog.products

catalog.products
   ├──1–*── catalog.product_variants ──1–*── catalog.skus
   ├──1–*── catalog.product_media
   ├──1–*── catalog.product_specifications
   ├──1–*── catalog.product_attribute_values ──*–1── catalog.attribute_definitions
   ├──1–1── commerce.product_rating_summary
   └──1–*── catalog.product_moderation_events (im)

catalog.product_variants ──1–*── catalog.variant_attribute_values

catalog.skus ──1–*── catalog.seller_listings ──*–1── seller.sellers
                          ├──1–1── pricing.listing_prices (current)
                          ├──1–*── pricing.listing_price_history (im)
                          ├──1–*── catalog.listing_status_history (im)
                          └──1–*── inventory.warehouse_inventory (via sku + seller warehouse)
```

`seller_listings` unique on `(seller_id, sku_id)`. `skus` unique on `sku_code`.

## inventory

```
inventory.warehouses ──1–*── inventory.warehouse_inventory ──*–1── catalog.skus
                                    │  available_quantity, reserved_quantity,
                                    │  damaged_quantity, in_transit_quantity, version
                                    ├──1–*── inventory.inventory_ledger (im)
                                    ├──1–*── inventory.inventory_reservations
                                    └──1–*── inventory.inventory_adjustments

inventory.inventory_transfers ──1–*── inventory.inventory_transfer_items
inventory.inventory_reservations ──*–1── commerce.orders (nullable until order created)
```

`warehouse_inventory` unique on `(warehouse_id, sku_id, seller_id)`; CHECKs keep all quantities
`>= 0`. `inventory_ledger` is insert-only with a trigger blocking update/delete.

## pricing

```
pricing.listing_prices ──1–*── pricing.listing_price_history (im)

pricing.promotions ──1–*── pricing.promotion_rules
                   └──1–*── pricing.promotion_targets  (category|product|sku|brand|seller|segment)

pricing.coupons ──1–*── pricing.coupon_rules
                └──1–*── pricing.coupon_redemptions ──*–1── commerce.orders

pricing.bank_offers ──1–*── pricing.bank_offer_rules
pricing.flash_sales ──1–*── pricing.flash_sale_items ──*–1── catalog.seller_listings

pricing.tax_rules      (hsn_code, gst_rate, effective_from/to)
pricing.commission_rules (scope: category|seller|product|brand|campaign, type: pct|fixed|hybrid)
```

## commerce — cart to order

```
commerce.carts ──1–*── commerce.cart_items ──*–1── catalog.seller_listings
commerce.saved_for_later · commerce.wishlists ──1–*── commerce.wishlist_items
commerce.recently_viewed

commerce.checkout_sessions ──1–*── commerce.checkout_items
                           └──1–*── commerce.checkout_price_snapshots

commerce.orders                              (parent, customer-facing NM number)
   ├──1–*── commerce.order_items             (per seller/sku/warehouse; independent lifecycle)
   │            ├──1–1── commerce.order_item_price_breakdowns (im)
   │            ├──1–*── commerce.order_item_status_history   (im)
   │            ├──1–*── fulfillment.shipment_items
   │            ├──1–*── returns.return_items
   │            └──1–*── finance.seller_ledger (SALE, COMMISSION, FEE, RETURN entries)
   ├──1–*── commerce.order_addresses         (snapshot, im)
   ├──1–1── commerce.order_price_breakdowns  (order-level totals, im)
   ├──1–*── commerce.order_status_history    (im)
   ├──1–*── commerce.order_events            (im)
   ├──1–*── payments.payment_intents
   └──1–*── fulfillment.shipments
```

State transitions are validated against `commerce.order_status_transitions` (a data table), guarded
by a trigger on `order_items`.

## payments

```
payments.payment_intents ──1–*── payments.payment_attempts ──1–*── payments.payment_transactions (im)
         │                                                              (AUTH|CAPTURE|REFUND|CHARGEBACK)
         ├──1–*── payments.refunds ──1–*── payments.refund_attempts
         └──*–1── commerce.orders

payments.payment_webhook_events (im, UNIQUE(provider, provider_event_id))
payments.payment_reconciliation ──1–*── payments.payment_reconciliation_items
payments.cod_eligibility_decisions (im, audit of COD engine output)
```

## fulfillment

```
fulfillment.pincodes ──1–*── fulfillment.serviceability_zones ──*–1── fulfillment.carriers
fulfillment.carrier_rate_cards ──1–*── fulfillment.carrier_rate_slabs

fulfillment.shipments
   ├──1–*── fulfillment.shipment_items ──*–1── commerce.order_items
   ├──1–*── fulfillment.shipment_packages
   ├──1–1── fulfillment.shipping_labels
   ├──1–*── fulfillment.tracking_events (im, UNIQUE(shipment_id, provider_event_id))
   ├──1–*── fulfillment.delivery_attempts ──1–*── fulfillment.ndr_actions
   └──1–1── fulfillment.delivery_proofs   (OTP hash, signature, photo ref, geo)

fulfillment.reverse_shipments ──*–1── returns.return_requests
fulfillment.cod_remittances ──1–*── fulfillment.cod_remittance_items
```

## returns

```
returns.return_requests
   ├──1–*── returns.return_items ──*–1── commerce.order_items
   ├──1–*── returns.return_evidence          (returns-private storage)
   ├──1–1── returns.return_inspections       (QC outcome, grade, restock decision)
   ├──1–*── returns.return_status_history    (im)
   ├──0–1── returns.replacement_orders ──*–1── commerce.orders
   └──0–1── payments.refunds

returns.return_policies ──*–1── catalog.categories (default) / seller.sellers (override)
```

## finance

```
finance.seller_ledger (im)   entry_type: SALE|COMMISSION|PLATFORM_FEE|SHIPPING_FEE|TAX|
                             RETURN_REVERSAL|REFUND|ADJUSTMENT|PAYOUT
   ├──*–1── seller.sellers
   ├──*–1── commerce.order_items (nullable)
   └──1–1── finance.settlement_items ──*–1── finance.seller_settlements
                                                  └──1–*── finance.seller_payouts

finance.commissions ──*–1── commerce.order_items
finance.platform_fees ──*–1── commerce.order_items
finance.financial_adjustments (im, requires approval + audit)
finance.invoices ──*–1── commerce.orders     (tax invoice, credit note)
```

Seller balance is always `SUM(seller_ledger.amount_paise)` for unsettled entries. No balance column.

## marketing / commerce social

```
marketing.campaigns ──1–*── marketing.banners
marketing.home_sections (type, configuration_json, position, window, audience, status)
marketing.collections ──1–*── marketing.collection_items
marketing.notification_templates ──1–*── marketing.notifications ──*–1── identity.profiles

commerce.reviews ──1–*── commerce.review_media
                 ├──1–*── commerce.review_votes
                 └──1–*── commerce.review_reports
commerce.product_questions ──1–*── commerce.product_answers ──1–*── commerce.question_votes
```

## support / analytics / audit / platform

```
support.support_tickets ──1–*── support.support_messages ──1–*── support.support_attachments
                        └──1–*── support.ticket_status_history (im)

analytics.events (im, partitioned monthly)
analytics.daily_metrics · analytics.product_metrics · analytics.seller_metrics
analytics.risk_events (im) · analytics.risk_scores · analytics.fraud_rules · analytics.fraud_cases

audit.audit_logs (im) · audit.security_events (im)

platform.feature_flags ──1–*── platform.feature_flag_rules
platform.platform_settings · platform.integration_settings · platform.app_version_policies
platform.outbox_events (im until published) · platform.idempotency_keys
platform.consumer_offsets (consumer_name, event_id) — idempotency for consumers
```

## Partitioning plan (applied when volume justifies it)

| Table | Strategy |
| --- | --- |
| `analytics.events` | RANGE on `occurred_at`, monthly, from day one |
| `commerce.orders`, `commerce.order_items` | RANGE on `created_at`, monthly, at ~50M rows |
| `inventory.inventory_ledger` | RANGE on `created_at`, monthly, at ~100M rows |
| `fulfillment.tracking_events` | RANGE on `occurred_at`, monthly, at ~100M rows |
| `audit.audit_logs` | RANGE on `occurred_at`, monthly, from day one |
| `payments.payment_webhook_events` | RANGE on `received_at`, monthly |
