-- =============================================================================
-- NovaMart — 0024 Row Level Security
--
-- Strategy (SECURITY_MODEL §5):
--   1. RLS is force-enabled on EVERY table in every domain schema. Deny by default.
--   2. Policies are then added only where a client legitimately needs access.
--   3. Financial, audit and platform tables get NO policy at all: they are
--      reachable only by service_role, which bypasses RLS.
--   4. Ownership and permission checks go through identity.* helpers, never
--      through JWT user_metadata (ADR 0009).
--
-- Every policy has a matching allow AND deny test in tests/rls. A policy without a
-- negative test is not considered done.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Step 1: enable RLS everywhere. This loop is deliberate: a table added later
-- without a policy is inaccessible rather than wide open.
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select n.nspname, c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('identity', 'catalog', 'seller', 'pricing', 'inventory', 'commerce',
                         'payments', 'fulfillment', 'returns', 'finance', 'marketing',
                         'support', 'analytics', 'audit', 'platform')
       and c.relkind in ('r', 'p')            -- ordinary and partitioned tables
       and not c.relispartition                -- partitions inherit from the parent
  loop
    execute format('alter table %I.%I enable row level security', r.nspname, r.relname);
    -- FORCE means even the table owner is subject to policies. service_role holds
    -- BYPASSRLS, so the backend still works, but a mistakenly-owned connection does not
    -- silently gain full access.
    execute format('alter table %I.%I force row level security', r.nspname, r.relname);
  end loop;
end;
$$;

-- =============================================================================
-- identity
-- =============================================================================

-- A user reads their own profile. Staff need an explicit permission.
create policy profiles_select_own on identity.profiles
  for select to authenticated
  using (id = identity.current_user_id());

create policy profiles_select_staff on identity.profiles
  for select to authenticated
  using (identity.has_permission('customer.read'));

-- Self-service updates are restricted to presentational fields. Status, risk tier
-- and lifetime metrics are not client-writable: the WITH CHECK clause pins the
-- columns a user must not change.
create policy profiles_update_own on identity.profiles
  for update to authenticated
  using (id = identity.current_user_id() and account_status = 'ACTIVE')
  with check (
    id = identity.current_user_id()
    and account_status = 'ACTIVE'
    and risk_tier = (select p.risk_tier from identity.profiles p where p.id = identity.current_user_id())
    and lifetime_order_count = (select p.lifetime_order_count from identity.profiles p where p.id = identity.current_user_id())
    and lifetime_gmv_paise = (select p.lifetime_gmv_paise from identity.profiles p where p.id = identity.current_user_id())
    and referral_code is not distinct from (select p.referral_code from identity.profiles p where p.id = identity.current_user_id())
  );

comment on policy profiles_update_own on identity.profiles is
  'Self-service edits only. Status, risk tier and lifetime metrics cannot be changed by the client.';

-- Addresses: full self-service, but only while the account is active.
create policy addresses_select_own on identity.addresses
  for select to authenticated
  using (user_id = identity.current_user_id() and deleted_at is null);

create policy addresses_insert_own on identity.addresses
  for insert to authenticated
  with check (user_id = identity.current_user_id() and identity.is_account_active());

create policy addresses_update_own on identity.addresses
  for update to authenticated
  using (user_id = identity.current_user_id() and deleted_at is null)
  with check (user_id = identity.current_user_id());

-- Deletion is soft: a hard delete would orphan historical orders.
create policy addresses_soft_delete_own on identity.addresses
  for update to authenticated
  using (user_id = identity.current_user_id())
  with check (user_id = identity.current_user_id());

create policy addresses_select_support on identity.addresses
  for select to authenticated
  using (identity.has_permission('customer.read_address'));

-- Devices: a user manages their own registrations.
create policy devices_all_own on identity.user_devices
  for all to authenticated
  using (user_id = identity.current_user_id())
  with check (user_id = identity.current_user_id());

create policy preferences_select_own on identity.user_preferences
  for select to authenticated
  using (user_id = identity.current_user_id());

create policy preferences_update_own on identity.user_preferences
  for update to authenticated
  using (user_id = identity.current_user_id())
  with check (user_id = identity.current_user_id());

create policy preferences_insert_own on identity.user_preferences
  for insert to authenticated
  with check (user_id = identity.current_user_id());

-- A user may see which roles they hold; they may never write role rows. There is
-- deliberately no INSERT/UPDATE/DELETE policy here for any client role.
create policy user_roles_select_own on identity.user_roles
  for select to authenticated
  using (user_id = identity.current_user_id() and revoked_at is null);

create policy user_roles_select_staff on identity.user_roles
  for select to authenticated
  using (identity.has_permission('role.read'));

-- The role catalogue is readable so consoles can render permission names.
create policy roles_select_authenticated on identity.roles
  for select to authenticated using (true);

create policy permissions_select_staff on identity.permissions
  for select to authenticated
  using (identity.has_permission('role.read'));

create policy role_permissions_select_staff on identity.role_permissions
  for select to authenticated
  using (identity.has_permission('role.read'));

-- =============================================================================
-- catalog — public read of active content, seller-scoped writes on listings
-- =============================================================================

create policy categories_select_public on catalog.categories
  for select to anon, authenticated
  using (is_active);

create policy categories_manage_staff on catalog.categories
  for all to authenticated
  using (identity.has_permission('category.manage'))
  with check (identity.has_permission('category.manage'));

create policy category_attributes_select_public on catalog.category_attributes
  for select to anon, authenticated using (true);

create policy category_policies_select_public on catalog.category_policies
  for select to anon, authenticated using (true);

create policy attribute_definitions_select_public on catalog.attribute_definitions
  for select to anon, authenticated using (is_active);

create policy attribute_options_select_public on catalog.attribute_options
  for select to anon, authenticated using (is_active);

create policy brands_select_public on catalog.brands
  for select to anon, authenticated using (is_active);

create policy brands_manage_staff on catalog.brands
  for all to authenticated
  using (identity.has_permission('brand.manage'))
  with check (identity.has_permission('brand.manage'));

-- Products: the public sees approved, active products. Sellers see their own
-- submissions in any state. Staff with the permission see everything.
create policy products_select_public on catalog.products
  for select to anon, authenticated
  using (status = 'ACTIVE' and moderation_status = 'APPROVED');

create policy products_select_own_seller on catalog.products
  for select to authenticated
  using (created_by_seller_id in (select identity.my_seller_ids()));

create policy products_select_staff on catalog.products
  for select to authenticated
  using (identity.has_permission('product.read'));

create policy products_manage_staff on catalog.products
  for all to authenticated
  using (identity.has_permission('product.manage'))
  with check (identity.has_permission('product.manage'));

create policy product_variants_select_public on catalog.product_variants
  for select to anon, authenticated
  using (status = 'ACTIVE' and exists (
    select 1 from catalog.products p
     where p.id = product_variants.product_id
       and p.status = 'ACTIVE' and p.moderation_status = 'APPROVED'));

create policy skus_select_public on catalog.skus
  for select to anon, authenticated
  using (status = 'ACTIVE' and exists (
    select 1 from catalog.products p
     where p.id = skus.product_id
       and p.status = 'ACTIVE' and p.moderation_status = 'APPROVED'));

create policy product_media_select_public on catalog.product_media
  for select to anon, authenticated
  using (moderation_status = 'APPROVED');

create policy product_specifications_select_public on catalog.product_specifications
  for select to anon, authenticated using (true);

create policy product_attribute_values_select_public on catalog.product_attribute_values
  for select to anon, authenticated using (true);

create policy variant_attribute_values_select_public on catalog.variant_attribute_values
  for select to anon, authenticated using (true);

-- Listings: the public sees active ones; a seller sees and manages only their own.
create policy seller_listings_select_public on catalog.seller_listings
  for select to anon, authenticated
  using (status = 'ACTIVE');

create policy seller_listings_select_own on catalog.seller_listings
  for select to authenticated
  using (identity.has_seller_scope(seller_id));

-- Sellers may create and edit their own listings, but only for sellers they are
-- scoped to, and they can never assign a listing to another seller (WITH CHECK).
create policy seller_listings_insert_own on catalog.seller_listings
  for insert to authenticated
  with check (
    identity.has_scoped_permission('listing.create', 'seller', seller_id)
    and seller.is_transactable(seller_id)
  );

create policy seller_listings_update_own on catalog.seller_listings
  for update to authenticated
  using (identity.has_scoped_permission('listing.update', 'seller', seller_id))
  with check (identity.has_scoped_permission('listing.update', 'seller', seller_id));

create policy seller_listings_staff on catalog.seller_listings
  for all to authenticated
  using (identity.has_permission('listing.manage'))
  with check (identity.has_permission('listing.manage'));

create policy listing_status_history_select_own on catalog.listing_status_history
  for select to authenticated
  using (exists (select 1 from catalog.seller_listings l
                  where l.id = listing_status_history.listing_id
                    and identity.has_seller_scope(l.seller_id)));

create policy product_moderation_events_select_seller on catalog.product_moderation_events
  for select to authenticated
  using (exists (select 1 from catalog.products p
                  where p.id = product_moderation_events.product_id
                    and p.created_by_seller_id in (select identity.my_seller_ids())));

-- =============================================================================
-- pricing — prices are public; promotion internals are not
-- =============================================================================

create policy listing_prices_select_public on pricing.listing_prices
  for select to anon, authenticated using (true);

create policy listing_prices_manage_own on pricing.listing_prices
  for all to authenticated
  using (identity.has_scoped_permission('price.update', 'seller', seller_id))
  with check (identity.has_scoped_permission('price.update', 'seller', seller_id));

create policy listing_price_history_select_own on pricing.listing_price_history
  for select to authenticated
  using (identity.has_seller_scope(seller_id) or identity.has_permission('price.read'));

-- Only currently-running promotions are visible, and only their display fields.
-- Rules and targets stay server-side so eligibility cannot be reverse-engineered
-- and farmed.
create policy promotions_select_active on pricing.promotions
  for select to anon, authenticated
  using (status = 'ACTIVE' and now() between starts_at and ends_at);

create policy promotions_manage_staff on pricing.promotions
  for all to authenticated
  using (identity.has_permission('promotion.manage'))
  with check (identity.has_permission('promotion.manage'));

create policy bank_offers_select_active on pricing.bank_offers
  for select to anon, authenticated
  using (is_active and now() between starts_at and ends_at);

create policy flash_sales_select_visible on pricing.flash_sales
  for select to anon, authenticated
  using (status in ('SCHEDULED', 'LIVE')
         and (teaser_from is null or teaser_from <= now())
         and ends_at > now());

create policy flash_sale_items_select_visible on pricing.flash_sale_items
  for select to anon, authenticated
  using (exists (select 1 from pricing.flash_sales fs
                  where fs.id = flash_sale_items.flash_sale_id
                    and fs.status in ('SCHEDULED', 'LIVE')
                    and fs.ends_at > now()));

-- A user sees their own coupon grants and public coupons; never other users' codes.
create policy coupons_select_own on pricing.coupons
  for select to authenticated
  using (
    is_active and now() between starts_at and ends_at
    and (distribution = 'PUBLIC' or issued_to_user_id = identity.current_user_id())
  );

create policy coupon_redemptions_select_own on pricing.coupon_redemptions
  for select to authenticated
  using (user_id = identity.current_user_id());

-- Commission rules are commercially sensitive: sellers see only rules that could
-- apply to them, staff with the permission see all.
create policy commission_rules_select_seller on pricing.commission_rules
  for select to authenticated
  using (
    (seller_id is not null and identity.has_seller_scope(seller_id))
    or (seller_id is null and identity.has_role('SELLER_OWNER'))
    or identity.has_permission('commission.read')
  );

create policy tax_rules_select_authenticated on pricing.tax_rules
  for select to authenticated using (true);

-- =============================================================================
-- inventory — sellers see their own stock; nobody writes it from a client
-- =============================================================================

create policy warehouses_select_own on inventory.warehouses
  for select to authenticated
  using (
    (seller_id is not null and identity.has_seller_scope(seller_id))
    or identity.has_warehouse_scope(id)
    or identity.has_permission('warehouse.read')
  );

create policy warehouses_manage_seller on inventory.warehouses
  for all to authenticated
  using (seller_id is not null and identity.has_scoped_permission('warehouse.manage', 'seller', seller_id))
  with check (seller_id is not null and identity.has_scoped_permission('warehouse.manage', 'seller', seller_id));

-- Read-only for sellers and warehouse staff. Quantity changes go through the
-- reservation/receipt/adjustment functions, which are service_role only.
create policy warehouse_inventory_select_scoped on inventory.warehouse_inventory
  for select to authenticated
  using (
    identity.has_seller_scope(seller_id)
    or identity.has_warehouse_scope(warehouse_id)
    or identity.has_permission('inventory.read')
  );

create policy inventory_ledger_select_scoped on inventory.inventory_ledger
  for select to authenticated
  using (
    identity.has_seller_scope(seller_id)
    or identity.has_warehouse_scope(warehouse_id)
    or identity.has_permission('inventory.read_ledger')
  );

create policy inventory_reservations_select_scoped on inventory.inventory_reservations
  for select to authenticated
  using (
    user_id = identity.current_user_id()
    or identity.has_seller_scope(seller_id)
    or identity.has_permission('inventory.read')
  );

-- Adjustments may be REQUESTED from a console, but application is server-side and
-- approval requires a different principal (segregation of duties in the schema).
create policy inventory_adjustments_select_scoped on inventory.inventory_adjustments
  for select to authenticated
  using (
    identity.has_seller_scope(seller_id)
    or identity.has_warehouse_scope(warehouse_id)
    or identity.has_permission('inventory.adjust')
  );

create policy inventory_transfers_select_scoped on inventory.inventory_transfers
  for select to authenticated
  using (identity.has_seller_scope(seller_id) or identity.has_permission('inventory.read'));

create policy stock_counts_select_scoped on inventory.stock_counts
  for select to authenticated
  using (identity.has_warehouse_scope(warehouse_id) or identity.has_permission('inventory.read'));

-- =============================================================================
-- seller
-- =============================================================================

-- Storefront pages show approved sellers publicly.
create policy sellers_select_public on seller.sellers
  for select to anon, authenticated
  using (status = 'APPROVED');

create policy sellers_select_own on seller.sellers
  for select to authenticated
  using (identity.has_seller_scope(id) or created_by = identity.current_user_id());

create policy sellers_select_staff on seller.sellers
  for select to authenticated
  using (identity.has_permission('seller.read'));

-- A seller may edit its own presentational and operational fields. Status,
-- approval and commission overrides are pinned: those are staff decisions.
create policy sellers_update_own on seller.sellers
  for update to authenticated
  using (identity.has_scoped_permission('seller.update', 'seller', id))
  with check (
    identity.has_scoped_permission('seller.update', 'seller', id)
    and status = (select s.status from seller.sellers s where s.id = sellers.id)
    and default_commission_percentage is not distinct from
        (select s.default_commission_percentage from seller.sellers s where s.id = sellers.id)
    and settlement_cycle = (select s.settlement_cycle from seller.sellers s where s.id = sellers.id)
    and settlement_hold_days = (select s.settlement_hold_days from seller.sellers s where s.id = sellers.id)
  );

comment on policy sellers_update_own on seller.sellers is
  'A seller cannot approve itself, change its own commission, or alter its settlement terms.';

create policy seller_users_select_own on seller.seller_users
  for select to authenticated
  using (
    user_id = identity.current_user_id()
    or identity.has_seller_scope(seller_id)
    or identity.has_permission('seller.read')
  );

create policy seller_users_manage_own on seller.seller_users
  for all to authenticated
  using (identity.has_scoped_permission('seller_user.manage', 'seller', seller_id))
  with check (identity.has_scoped_permission('seller_user.manage', 'seller', seller_id));

-- KYC: the owning seller may see metadata about its own documents (status, type),
-- and staff need an explicit, audited permission. Nobody else, ever.
create policy seller_documents_select_own on seller.seller_documents
  for select to authenticated
  using (identity.has_scoped_permission('seller_document.read', 'seller', seller_id));

create policy seller_documents_select_staff on seller.seller_documents
  for select to authenticated
  using (identity.has_permission('seller_document.verify'));

create policy seller_documents_insert_own on seller.seller_documents
  for insert to authenticated
  with check (identity.has_scoped_permission('seller_document.upload', 'seller', seller_id));

-- Bank accounts and tax profiles: owning seller and finance staff only.
create policy seller_bank_accounts_select_own on seller.seller_bank_accounts
  for select to authenticated
  using (
    identity.has_scoped_permission('seller_bank.read', 'seller', seller_id)
    or identity.has_permission('seller_bank.verify')
  );

create policy seller_tax_profiles_select_own on seller.seller_tax_profiles
  for select to authenticated
  using (
    identity.has_scoped_permission('seller_tax.read', 'seller', seller_id)
    or identity.has_permission('seller.read')
  );

create policy seller_status_history_select_own on seller.seller_status_history
  for select to authenticated
  using (identity.has_seller_scope(seller_id) or identity.has_permission('seller.read'));

create policy seller_performance_select_own on seller.seller_performance
  for select to authenticated
  using (identity.has_seller_scope(seller_id) or identity.has_permission('seller.read'));

-- =============================================================================
-- commerce — carts, orders, reviews
-- =============================================================================

create policy carts_all_own on commerce.carts
  for all to authenticated
  using (user_id = identity.current_user_id())
  with check (user_id = identity.current_user_id());

create policy cart_items_all_own on commerce.cart_items
  for all to authenticated
  using (exists (select 1 from commerce.carts c
                  where c.id = cart_items.cart_id and c.user_id = identity.current_user_id()))
  with check (exists (select 1 from commerce.carts c
                       where c.id = cart_items.cart_id and c.user_id = identity.current_user_id()));

create policy saved_for_later_all_own on commerce.saved_for_later
  for all to authenticated
  using (user_id = identity.current_user_id())
  with check (user_id = identity.current_user_id());

create policy wishlists_all_own on commerce.wishlists
  for all to authenticated
  using (user_id = identity.current_user_id())
  with check (user_id = identity.current_user_id());

-- Publicly shared wishlists are readable by anyone holding the share token. The
-- token is checked in the API, which then reads with the service role; this policy
-- covers the authenticated-owner path only.
create policy wishlist_items_all_own on commerce.wishlist_items
  for all to authenticated
  using (exists (select 1 from commerce.wishlists w
                  where w.id = wishlist_items.wishlist_id and w.user_id = identity.current_user_id()))
  with check (exists (select 1 from commerce.wishlists w
                       where w.id = wishlist_items.wishlist_id and w.user_id = identity.current_user_id()));

create policy recently_viewed_all_own on commerce.recently_viewed
  for all to authenticated
  using (user_id = identity.current_user_id())
  with check (user_id = identity.current_user_id());

-- Checkout sessions are readable by their owner. They are created and mutated only
-- by the checkout engine (service_role): there is no client write policy.
create policy checkout_sessions_select_own on commerce.checkout_sessions
  for select to authenticated
  using (user_id = identity.current_user_id());

create policy checkout_items_select_own on commerce.checkout_items
  for select to authenticated
  using (exists (select 1 from commerce.checkout_sessions cs
                  where cs.id = checkout_items.checkout_session_id
                    and cs.user_id = identity.current_user_id()));

-- Orders: the customer sees their own; a seller sees orders containing their items;
-- support sees what its permission allows. No client may write an order.
create policy orders_select_own on commerce.orders
  for select to authenticated
  using (user_id = identity.current_user_id());

create policy orders_select_seller on commerce.orders
  for select to authenticated
  using (exists (select 1 from commerce.order_items oi
                  where oi.order_id = orders.id
                    and identity.has_seller_scope(oi.seller_id)));

create policy orders_select_staff on commerce.orders
  for select to authenticated
  using (identity.has_permission('order.read'));

create policy order_items_select_own on commerce.order_items
  for select to authenticated
  using (exists (select 1 from commerce.orders o
                  where o.id = order_items.order_id and o.user_id = identity.current_user_id()));

create policy order_items_select_seller on commerce.order_items
  for select to authenticated
  using (identity.has_seller_scope(seller_id));

create policy order_items_select_warehouse on commerce.order_items
  for select to authenticated
  using (warehouse_id is not null and identity.has_warehouse_scope(warehouse_id));

create policy order_items_select_staff on commerce.order_items
  for select to authenticated
  using (identity.has_permission('order.read'));

create policy order_addresses_select_own on commerce.order_addresses
  for select to authenticated
  using (exists (select 1 from commerce.orders o
                  where o.id = order_addresses.order_id and o.user_id = identity.current_user_id()));

-- A seller sees the shipping address only for orders it must fulfil, and only
-- while fulfilment is in progress. Support access is permission-gated and audited.
create policy order_addresses_select_seller on commerce.order_addresses
  for select to authenticated
  using (
    address_type = 'SHIPPING'
    and exists (select 1 from commerce.order_items oi
                 where oi.order_id = order_addresses.order_id
                   and identity.has_seller_scope(oi.seller_id)
                   and oi.status in ('CONFIRMED', 'ALLOCATED', 'PROCESSING', 'PACKED',
                                     'READY_TO_SHIP', 'SHIPPED', 'OUT_FOR_DELIVERY'))
  );

comment on policy order_addresses_select_seller on commerce.order_addresses is
  'Sellers see a customer address only while they are actively fulfilling, and never the billing address.';

create policy order_price_breakdowns_select_own on commerce.order_price_breakdowns
  for select to authenticated
  using (exists (select 1 from commerce.orders o
                  where o.id = order_price_breakdowns.order_id and o.user_id = identity.current_user_id()));

create policy order_item_breakdowns_select_own on commerce.order_item_price_breakdowns
  for select to authenticated
  using (exists (select 1 from commerce.orders o
                  where o.id = order_item_price_breakdowns.order_id
                    and o.user_id = identity.current_user_id()));

-- Sellers see the commercial breakdown for their own items (they need to know their
-- commission), but not another seller's.
create policy order_item_breakdowns_select_seller on commerce.order_item_price_breakdowns
  for select to authenticated
  using (exists (select 1 from commerce.order_items oi
                  where oi.id = order_item_price_breakdowns.order_item_id
                    and identity.has_seller_scope(oi.seller_id)));

create policy order_status_history_select_own on commerce.order_status_history
  for select to authenticated
  using (exists (select 1 from commerce.orders o
                  where o.id = order_status_history.order_id and o.user_id = identity.current_user_id()));

create policy order_item_status_history_select_own on commerce.order_item_status_history
  for select to authenticated
  using (exists (select 1 from commerce.orders o
                  where o.id = order_item_status_history.order_id and o.user_id = identity.current_user_id())
         or exists (select 1 from commerce.order_items oi
                     where oi.id = order_item_status_history.order_item_id
                       and identity.has_seller_scope(oi.seller_id)));

create policy order_events_select_own on commerce.order_events
  for select to authenticated
  using (
    is_customer_visible
    and exists (select 1 from commerce.orders o
                 where o.id = order_events.order_id and o.user_id = identity.current_user_id())
  );

-- Reviews: published reviews are public. A user manages their own.
create policy reviews_select_published on commerce.reviews
  for select to anon, authenticated
  using (status = 'PUBLISHED');

create policy reviews_select_own on commerce.reviews
  for select to authenticated
  using (user_id = identity.current_user_id());

create policy reviews_insert_own on commerce.reviews
  for insert to authenticated
  with check (user_id = identity.current_user_id() and identity.is_account_active());

create policy reviews_update_own on commerce.reviews
  for update to authenticated
  using (user_id = identity.current_user_id() and status in ('PUBLISHED', 'PENDING_MODERATION'))
  with check (user_id = identity.current_user_id());

create policy reviews_moderate_staff on commerce.reviews
  for all to authenticated
  using (identity.has_permission('review.moderate'))
  with check (identity.has_permission('review.moderate'));

create policy review_media_select_approved on commerce.review_media
  for select to anon, authenticated
  using (moderation_status = 'APPROVED');

create policy review_media_insert_own on commerce.review_media
  for insert to authenticated
  with check (exists (select 1 from commerce.reviews r
                       where r.id = review_media.review_id and r.user_id = identity.current_user_id()));

create policy review_votes_all_own on commerce.review_votes
  for all to authenticated
  using (user_id = identity.current_user_id())
  with check (user_id = identity.current_user_id());

create policy review_reports_insert_own on commerce.review_reports
  for insert to authenticated
  with check (reported_by = identity.current_user_id());

create policy review_reports_select_own on commerce.review_reports
  for select to authenticated
  using (reported_by = identity.current_user_id() or identity.has_permission('review.moderate'));

create policy rating_summary_select_public on commerce.product_rating_summary
  for select to anon, authenticated using (true);

-- Q&A
create policy questions_select_published on commerce.product_questions
  for select to anon, authenticated using (status = 'PUBLISHED');

create policy questions_select_own on commerce.product_questions
  for select to authenticated using (user_id = identity.current_user_id());

create policy questions_insert_own on commerce.product_questions
  for insert to authenticated
  with check (user_id = identity.current_user_id() and identity.is_account_active());

create policy answers_select_published on commerce.product_answers
  for select to anon, authenticated using (status = 'PUBLISHED');

create policy answers_insert_own on commerce.product_answers
  for insert to authenticated
  with check (
    (user_id = identity.current_user_id() or identity.has_seller_scope(seller_id))
    and identity.is_account_active()
  );

create policy question_votes_all_own on commerce.question_votes
  for all to authenticated
  using (user_id = identity.current_user_id())
  with check (user_id = identity.current_user_id());

-- =============================================================================
-- fulfillment — geography is public; shipments are scoped
-- =============================================================================

create policy states_select_public on fulfillment.states
  for select to anon, authenticated using (is_active);

create policy districts_select_public on fulfillment.districts
  for select to anon, authenticated using (is_active);

create policy cities_select_public on fulfillment.cities
  for select to anon, authenticated using (is_active);

create policy pincodes_select_public on fulfillment.pincodes
  for select to anon, authenticated using (true);

create policy delivery_zones_select_public on fulfillment.delivery_zones
  for select to anon, authenticated using (true);

create policy carriers_select_public on fulfillment.carriers
  for select to anon, authenticated using (is_active);

create policy carrier_serviceability_select_public on fulfillment.carrier_serviceability
  for select to anon, authenticated using (true);

-- Rate cards are commercially sensitive: sellers need them, customers do not.
create policy rate_cards_select_seller on fulfillment.carrier_rate_cards
  for select to authenticated
  using (identity.has_role('SELLER_OWNER') or identity.has_permission('shipping.read'));

create policy rate_slabs_select_seller on fulfillment.carrier_rate_slabs
  for select to authenticated
  using (identity.has_role('SELLER_OWNER') or identity.has_permission('shipping.read'));

create policy shipments_select_customer on fulfillment.shipments
  for select to authenticated
  using (exists (select 1 from commerce.orders o
                  where o.id = shipments.order_id and o.user_id = identity.current_user_id()));

create policy shipments_select_seller on fulfillment.shipments
  for select to authenticated
  using (identity.has_seller_scope(seller_id) or identity.has_warehouse_scope(warehouse_id));

create policy shipments_select_staff on fulfillment.shipments
  for select to authenticated
  using (identity.has_permission('shipment.read'));

create policy shipment_items_select_scoped on fulfillment.shipment_items
  for select to authenticated
  using (exists (select 1 from fulfillment.shipments s
                  where s.id = shipment_items.shipment_id
                    and (identity.has_seller_scope(s.seller_id)
                         or identity.has_warehouse_scope(s.warehouse_id)
                         or exists (select 1 from commerce.orders o
                                     where o.id = s.order_id and o.user_id = identity.current_user_id()))));

create policy tracking_events_select_scoped on fulfillment.tracking_events
  for select to authenticated
  using (exists (select 1 from fulfillment.shipments s
                  where s.id = tracking_events.shipment_id
                    and (exists (select 1 from commerce.orders o
                                  where o.id = s.order_id and o.user_id = identity.current_user_id())
                         or identity.has_seller_scope(s.seller_id)
                         or identity.has_permission('shipment.read'))));

create policy delivery_attempts_select_scoped on fulfillment.delivery_attempts
  for select to authenticated
  using (
    delivery_agent_id = identity.current_user_id()
    or exists (select 1 from fulfillment.shipments s
                join commerce.orders o on o.id = s.order_id
                where s.id = delivery_attempts.shipment_id and o.user_id = identity.current_user_id())
    or identity.has_permission('shipment.read')
  );

create policy delivery_shifts_select_own on fulfillment.delivery_agent_shifts
  for select to authenticated
  using (delivery_agent_id = identity.current_user_id() or identity.has_permission('delivery.manage'));

-- COD remittance is finance data: no customer or seller access.
create policy cod_remittances_select_staff on fulfillment.cod_remittances
  for select to authenticated
  using (delivery_agent_id = identity.current_user_id() or identity.has_permission('cod.reconcile'));

-- =============================================================================
-- returns
-- =============================================================================

create policy return_reasons_select_public on returns.return_reasons
  for select to anon, authenticated using (is_active);

create policy return_policies_select_public on returns.return_policies
  for select to anon, authenticated using (is_active);

create policy return_requests_select_own on returns.return_requests
  for select to authenticated
  using (user_id = identity.current_user_id());

create policy return_requests_select_seller on returns.return_requests
  for select to authenticated
  using (identity.has_seller_scope(seller_id));

create policy return_requests_select_staff on returns.return_requests
  for select to authenticated
  using (identity.has_permission('return.read'));

-- Return requests are created through the API so eligibility is validated
-- server-side against the order-time policy snapshot. No client INSERT policy.

create policy return_items_select_scoped on returns.return_items
  for select to authenticated
  using (exists (select 1 from returns.return_requests rr
                  where rr.id = return_items.return_request_id
                    and (rr.user_id = identity.current_user_id()
                         or identity.has_seller_scope(rr.seller_id)
                         or identity.has_permission('return.read'))));

create policy return_evidence_select_scoped on returns.return_evidence
  for select to authenticated
  using (exists (select 1 from returns.return_requests rr
                  where rr.id = return_evidence.return_request_id
                    and (rr.user_id = identity.current_user_id()
                         or identity.has_seller_scope(rr.seller_id)
                         or identity.has_permission('return.read'))));

create policy return_evidence_insert_own on returns.return_evidence
  for insert to authenticated
  with check (exists (select 1 from returns.return_requests rr
                       where rr.id = return_evidence.return_request_id
                         and rr.user_id = identity.current_user_id()));

create policy return_status_history_select_scoped on returns.return_status_history
  for select to authenticated
  using (exists (select 1 from returns.return_requests rr
                  where rr.id = return_status_history.return_request_id
                    and (rr.user_id = identity.current_user_id()
                         or identity.has_seller_scope(rr.seller_id))));

create policy reverse_shipments_select_scoped on returns.reverse_shipments
  for select to authenticated
  using (exists (select 1 from returns.return_requests rr
                  where rr.id = reverse_shipments.return_request_id
                    and (rr.user_id = identity.current_user_id()
                         or identity.has_seller_scope(rr.seller_id)
                         or identity.has_permission('return.read'))));

-- QC inspections are visible to the seller and staff; the customer sees the outcome
-- through the return status and refund, not the internal checklist.
create policy return_inspections_select_scoped on returns.return_inspections
  for select to authenticated
  using (exists (select 1 from returns.return_requests rr
                  where rr.id = return_inspections.return_request_id
                    and (identity.has_seller_scope(rr.seller_id)
                         or identity.has_permission('return.qc'))));

-- =============================================================================
-- payments — customers see the status of their own payments and refunds only.
-- No client can see provider payloads, webhook events, reconciliation or tokens.
-- =============================================================================

create policy payment_intents_select_own on payments.payment_intents
  for select to authenticated
  using (user_id = identity.current_user_id() or identity.has_permission('payment.read'));

create policy refunds_select_own on payments.refunds
  for select to authenticated
  using (user_id = identity.current_user_id() or identity.has_permission('refund.read'));

create policy saved_instruments_select_own on payments.saved_payment_instruments
  for select to authenticated
  using (user_id = identity.current_user_id() and deleted_at is null);

create policy saved_instruments_delete_own on payments.saved_payment_instruments
  for update to authenticated
  using (user_id = identity.current_user_id())
  with check (user_id = identity.current_user_id());

-- Deliberately NO policies on:
--   payments.payment_attempts, payment_transactions, payment_webhook_events,
--   refund_attempts, payment_reconciliation, payment_reconciliation_items,
--   cod_eligibility_decisions
-- These are reachable only by service_role.

-- =============================================================================
-- finance — sellers see their own ledger, settlements, payouts and invoices.
-- Nothing here is client-writable.
-- =============================================================================

create policy seller_ledger_select_own on finance.seller_ledger
  for select to authenticated
  using (
    identity.has_scoped_permission('finance.read', 'seller', seller_id)
    or identity.has_permission('finance.read_all')
  );

create policy settlements_select_own on finance.seller_settlements
  for select to authenticated
  using (
    identity.has_scoped_permission('settlement.read', 'seller', seller_id)
    or identity.has_permission('settlement.read_all')
  );

create policy settlement_items_select_own on finance.settlement_items
  for select to authenticated
  using (exists (select 1 from finance.seller_settlements s
                  where s.id = settlement_items.settlement_id
                    and (identity.has_seller_scope(s.seller_id)
                         or identity.has_permission('settlement.read_all'))));

create policy payouts_select_own on finance.seller_payouts
  for select to authenticated
  using (
    identity.has_scoped_permission('payout.read', 'seller', seller_id)
    or identity.has_permission('payout.read_all')
  );

create policy commissions_select_own on finance.commissions
  for select to authenticated
  using (identity.has_seller_scope(seller_id) or identity.has_permission('finance.read_all'));

create policy platform_fees_select_own on finance.platform_fees
  for select to authenticated
  using (identity.has_seller_scope(seller_id) or identity.has_permission('finance.read_all'));

-- Invoices: the buyer sees their own, the seller sees the ones it raised.
create policy invoices_select_scoped on finance.invoices
  for select to authenticated
  using (
    user_id = identity.current_user_id()
    or identity.has_seller_scope(seller_id)
    or identity.has_permission('invoice.read')
  );

create policy financial_adjustments_select_own on finance.financial_adjustments
  for select to authenticated
  using (identity.has_seller_scope(seller_id) or identity.has_permission('finance.adjust'));

-- =============================================================================
-- marketing
-- =============================================================================

create policy campaigns_select_public on marketing.campaigns
  for select to anon, authenticated
  using (status in ('SCHEDULED', 'LIVE') and ends_at > now());

create policy home_sections_select_public on marketing.home_sections
  for select to anon, authenticated
  using (status = 'ACTIVE'
         and (starts_at is null or starts_at <= now())
         and (ends_at is null or ends_at > now()));

create policy banners_select_public on marketing.banners
  for select to anon, authenticated
  using (status = 'ACTIVE'
         and (starts_at is null or starts_at <= now())
         and (ends_at is null or ends_at > now()));

create policy collections_select_public on marketing.collections
  for select to anon, authenticated using (is_active);

create policy collection_items_select_public on marketing.collection_items
  for select to anon, authenticated using (true);

create policy notifications_select_own on marketing.notifications
  for select to authenticated
  using (user_id = identity.current_user_id());

-- A user may mark their own notifications read; nothing else.
create policy notifications_update_own on marketing.notifications
  for update to authenticated
  using (user_id = identity.current_user_id())
  with check (user_id = identity.current_user_id());

create policy segment_members_select_own on marketing.customer_segment_members
  for select to authenticated
  using (user_id = identity.current_user_id());

-- =============================================================================
-- support
-- =============================================================================

create policy ticket_categories_select_public on support.ticket_categories
  for select to anon, authenticated using (is_active);

create policy help_articles_select_published on support.help_articles
  for select to anon, authenticated using (status = 'PUBLISHED');

create policy tickets_select_own on support.support_tickets
  for select to authenticated
  using (
    requester_id = identity.current_user_id()
    or (seller_id is not null and identity.has_seller_scope(seller_id))
    or assigned_to = identity.current_user_id()
    or identity.has_permission('ticket.read')
  );

create policy tickets_insert_own on support.support_tickets
  for insert to authenticated
  with check (requester_id = identity.current_user_id() and identity.is_account_active());

-- Internal notes are never visible to a requester: the is_internal check is the
-- only thing between an agent's private note and the customer.
create policy support_messages_select_scoped on support.support_messages
  for select to authenticated
  using (
    exists (select 1 from support.support_tickets t
             where t.id = support_messages.ticket_id
               and (
                     (not support_messages.is_internal
                      and (t.requester_id = identity.current_user_id()
                           or (t.seller_id is not null and identity.has_seller_scope(t.seller_id))))
                  or t.assigned_to = identity.current_user_id()
                  or identity.has_permission('ticket.read')
               ))
  );

comment on policy support_messages_select_scoped on support.support_messages is
  'Requesters never see internal notes. Agents with ticket.read see the full thread.';

create policy support_messages_insert_own on support.support_messages
  for insert to authenticated
  with check (
    not is_internal
    and sender_id = identity.current_user_id()
    and exists (select 1 from support.support_tickets t
                 where t.id = support_messages.ticket_id
                   and (t.requester_id = identity.current_user_id()
                        or (t.seller_id is not null and identity.has_seller_scope(t.seller_id))))
  );

create policy support_attachments_select_scoped on support.support_attachments
  for select to authenticated
  using (exists (select 1 from support.support_tickets t
                  where t.id = support_attachments.ticket_id
                    and (t.requester_id = identity.current_user_id()
                         or (t.seller_id is not null and identity.has_seller_scope(t.seller_id))
                         or identity.has_permission('ticket.read'))));

-- =============================================================================
-- analytics, audit, platform — no client policies at all.
--
-- RLS is enabled with zero policies, which denies every client role outright.
-- The behavioural event stream is write-only from the API; risk scores, fraud cases
-- and audit logs are staff-facing through audited API endpoints, never direct reads.
-- =============================================================================

-- One deliberate exception: a user may read their own notification-relevant risk
-- restrictions is NOT exposed. Support reads risk through the API so the read
-- itself is logged in audit.data_access_logs.

-- =============================================================================
-- Assertion: every table in a domain schema has RLS enabled. This fails the
-- migration if a future table slips through, which is the point.
-- =============================================================================
do $$
declare
  v_missing text;
begin
  select string_agg(format('%s.%s', n.nspname, c.relname), ', ')
    into v_missing
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('identity', 'catalog', 'seller', 'pricing', 'inventory', 'commerce',
                       'payments', 'fulfillment', 'returns', 'finance', 'marketing',
                       'support', 'analytics', 'audit', 'platform')
     and c.relkind in ('r', 'p')
     and not c.relispartition
     and not c.relrowsecurity;

  if v_missing is not null then
    raise exception 'RLS is not enabled on: %', v_missing;
  end if;
end;
$$;
