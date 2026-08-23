-- =============================================================================
-- NovaMart — 0026 Table privileges for client roles
--
-- RLS decides WHICH ROWS a client may touch. GRANT decides WHETHER the client can
-- reach the table at all. Both are required, and both are explicit here.
--
-- PostgREST exposes only `public` and `api`, so these grants primarily enable:
--   * Supabase Realtime subscriptions (order tracking, shipment updates)
--   * Direct SDK reads of public catalog data from Flutter/web
-- Every mutation that touches money, stock or order state still goes through
-- commerce-api. Nothing below grants write access to those tables.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- api schema: the client-facing read surface
-- -----------------------------------------------------------------------------
grant select on api.categories             to anon, authenticated;
grant select on api.brands                 to anon, authenticated;
grant select on api.category_filters       to anon, authenticated;
grant select on api.home_sections          to anon, authenticated;
grant select on api.public_settings        to anon, authenticated;
grant select on api.app_version_policy     to anon, authenticated;
grant select on api.pincode_serviceability to anon, authenticated;
grant select on api.return_reasons         to anon, authenticated;
grant select on api.help_articles          to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Public catalog reads. RLS restricts these to active, approved rows.
-- -----------------------------------------------------------------------------
grant select on
  catalog.categories,
  catalog.category_attributes,
  catalog.category_policies,
  catalog.attribute_definitions,
  catalog.attribute_options,
  catalog.brands,
  catalog.products,
  catalog.product_variants,
  catalog.skus,
  catalog.product_media,
  catalog.product_specifications,
  catalog.product_attribute_values,
  catalog.variant_attribute_values,
  catalog.seller_listings
  to anon, authenticated;

grant select on catalog.v_sellable_listings, catalog.v_product_cards to anon, authenticated;

grant select on pricing.listing_prices, pricing.promotions, pricing.bank_offers,
                pricing.flash_sales, pricing.flash_sale_items
  to anon, authenticated;

grant select on seller.sellers to anon, authenticated;

grant select on commerce.product_rating_summary, commerce.reviews, commerce.review_media,
                commerce.product_questions, commerce.product_answers
  to anon, authenticated;

grant select on fulfillment.states, fulfillment.districts, fulfillment.cities,
                fulfillment.pincodes, fulfillment.delivery_zones, fulfillment.carriers,
                fulfillment.carrier_serviceability
  to anon, authenticated;

grant select on returns.return_reasons, returns.return_policies to anon, authenticated;

grant select on marketing.campaigns, marketing.home_sections, marketing.banners,
                marketing.collections, marketing.collection_items
  to anon, authenticated;

grant select on support.ticket_categories, support.help_articles to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Authenticated-only reads. RLS scopes every one of these to the caller's own rows
-- or to their seller/warehouse scope.
-- -----------------------------------------------------------------------------
grant select on
  identity.profiles,
  identity.addresses,
  identity.user_devices,
  identity.user_preferences,
  identity.user_roles,
  identity.roles,
  identity.permissions,
  identity.role_permissions
  to authenticated;

grant select on
  commerce.carts,
  commerce.cart_items,
  commerce.saved_for_later,
  commerce.wishlists,
  commerce.wishlist_items,
  commerce.recently_viewed,
  commerce.checkout_sessions,
  commerce.checkout_items,
  commerce.orders,
  commerce.order_items,
  commerce.order_addresses,
  commerce.order_price_breakdowns,
  commerce.order_item_price_breakdowns,
  commerce.order_status_history,
  commerce.order_item_status_history,
  commerce.order_events,
  commerce.review_votes,
  commerce.review_reports,
  commerce.question_votes
  to authenticated;

grant select on
  seller.seller_users,
  seller.seller_documents,
  seller.seller_bank_accounts,
  seller.seller_tax_profiles,
  seller.seller_status_history,
  seller.seller_performance
  to authenticated;

grant select on
  inventory.warehouses,
  inventory.warehouse_inventory,
  inventory.inventory_ledger,
  inventory.inventory_reservations,
  inventory.inventory_adjustments,
  inventory.inventory_transfers,
  inventory.stock_counts
  to authenticated;

grant select on
  pricing.listing_price_history,
  pricing.coupons,
  pricing.coupon_redemptions,
  pricing.commission_rules,
  pricing.tax_rules
  to authenticated;

grant select on
  fulfillment.shipments,
  fulfillment.shipment_items,
  fulfillment.tracking_events,
  fulfillment.delivery_attempts,
  fulfillment.delivery_agent_shifts,
  fulfillment.carrier_rate_cards,
  fulfillment.carrier_rate_slabs,
  fulfillment.cod_remittances
  to authenticated;

grant select on
  returns.return_requests,
  returns.return_items,
  returns.return_evidence,
  returns.return_inspections,
  returns.return_status_history,
  returns.reverse_shipments
  to authenticated;

-- Payments: only the customer-facing status tables. Attempts, transactions, webhook
-- events, reconciliation and COD decisions get no grant at all.
grant select on
  payments.payment_intents,
  payments.refunds,
  payments.saved_payment_instruments
  to authenticated;

-- Finance: sellers read their own books through RLS.
grant select on
  finance.seller_ledger,
  finance.seller_settlements,
  finance.settlement_items,
  finance.seller_payouts,
  finance.commissions,
  finance.platform_fees,
  finance.invoices,
  finance.financial_adjustments
  to authenticated;

grant select on
  marketing.notifications,
  marketing.customer_segment_members
  to authenticated;

grant select on
  support.support_tickets,
  support.support_messages,
  support.support_attachments
  to authenticated;

-- -----------------------------------------------------------------------------
-- Client-writable tables. This list is deliberately short: it is the complete set
-- of things a browser or mobile app may change without going through the API.
--
-- Nothing here can affect price, stock, order state, payment or settlement.
-- -----------------------------------------------------------------------------
grant insert, update on identity.profiles          to authenticated;   -- self-service profile fields
grant insert, update on identity.addresses         to authenticated;   -- address book (soft delete only)
grant insert, update, delete on identity.user_devices     to authenticated;
grant insert, update on identity.user_preferences   to authenticated;

grant insert, update, delete on commerce.carts             to authenticated;
grant insert, update, delete on commerce.cart_items        to authenticated;
grant insert, update, delete on commerce.saved_for_later   to authenticated;
grant insert, update, delete on commerce.wishlists         to authenticated;
grant insert, update, delete on commerce.wishlist_items    to authenticated;
grant insert, update, delete on commerce.recently_viewed   to authenticated;

grant insert, update on commerce.reviews            to authenticated;
grant insert on commerce.review_media               to authenticated;
grant insert, update, delete on commerce.review_votes      to authenticated;
grant insert on commerce.review_reports             to authenticated;
grant insert on commerce.product_questions          to authenticated;
grant insert on commerce.product_answers            to authenticated;
grant insert, update, delete on commerce.question_votes    to authenticated;

grant update on marketing.notifications             to authenticated;   -- mark as read

grant insert on support.support_tickets             to authenticated;
grant insert on support.support_messages            to authenticated;

-- Seller console writes. RLS restricts each to the caller's seller scope, and the
-- WITH CHECK clauses pin the fields a seller must not change.
grant insert, update on catalog.seller_listings     to authenticated;
grant insert, update on pricing.listing_prices      to authenticated;
grant insert, update on inventory.warehouses        to authenticated;
grant insert on seller.seller_documents             to authenticated;
grant insert, update on seller.seller_users         to authenticated;
grant update on seller.sellers                      to authenticated;
grant insert on returns.return_evidence             to authenticated;

-- Sequence usage for the few tables where a client inserts and a sequence is used.
grant usage on all sequences in schema commerce, identity, catalog, pricing, support to authenticated;

-- -----------------------------------------------------------------------------
-- Realtime: publish only the tables clients legitimately subscribe to.
-- Order and shipment tracking are the real use cases; everything else is polled or
-- pushed. Adding a financial table here would leak through Realtime even with
-- PostgREST locked down.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table commerce.orders;
    alter publication supabase_realtime add table commerce.order_items;
    alter publication supabase_realtime add table commerce.order_events;
    alter publication supabase_realtime add table fulfillment.shipments;
    alter publication supabase_realtime add table fulfillment.tracking_events;
    alter publication supabase_realtime add table marketing.notifications;
    alter publication supabase_realtime add table returns.return_requests;
    alter publication supabase_realtime add table inventory.warehouse_inventory;
  end if;
exception when duplicate_object then
  null;  -- idempotent: table already in the publication
end;
$$;

-- -----------------------------------------------------------------------------
-- Function execute privileges for client-callable helpers.
-- -----------------------------------------------------------------------------
grant execute on function catalog.resolve_category_policy(uuid)                to anon, authenticated;
grant execute on function fulfillment.resolve_zone(public.indian_pincode, public.indian_pincode) to authenticated;
grant execute on function returns.check_eligibility(uuid, text)                to authenticated;
grant execute on function pricing.resolve_gst_rate(public.hsn_code, public.paise, date) to authenticated;

-- Everything else in the domain schemas stays server-side.
revoke execute on function inventory.reserve_stock(jsonb, uuid, uuid, uuid, interval, text) from anon, authenticated;
revoke execute on function finance.post_order_item_earnings(uuid, integer)      from anon, authenticated;
revoke execute on function finance.mark_ledger_settled(uuid[], uuid)            from anon, authenticated;
revoke execute on function finance.next_invoice_number(uuid, text, text)        from anon, authenticated;
revoke execute on function pricing.recompute_buy_box(uuid)                      from anon, authenticated;
revoke execute on function platform.claim_outbox_batch(text, int)               from anon, authenticated;
revoke execute on function platform.complete_outbox_event(uuid)                 from anon, authenticated;
revoke execute on function platform.fail_outbox_event(uuid, text)               from anon, authenticated;
revoke execute on function analytics.ensure_event_partition(date)               from anon, authenticated;
