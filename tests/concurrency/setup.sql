-- =============================================================================
-- Concurrency fixture: one SKU with exactly 100 units at one warehouse.
--
-- Used by tests/concurrency/run-oversell-test.sh to prove the requirement in
-- brief §66: with 100 units and many concurrent reservation attempts, exactly 100
-- reservations succeed. Never 101.
-- =============================================================================

begin;

-- Clean any previous run so the test is repeatable.
delete from inventory.inventory_ledger
 where sku_id in (select id from catalog.skus where sku_code = 'TEST-CONCURRENCY-001');
delete from inventory.inventory_reservations
 where sku_id in (select id from catalog.skus where sku_code = 'TEST-CONCURRENCY-001');
delete from inventory.warehouse_inventory
 where sku_id in (select id from catalog.skus where sku_code = 'TEST-CONCURRENCY-001');
delete from catalog.skus where sku_code = 'TEST-CONCURRENCY-001';
delete from catalog.product_variants
 where product_id in (select id from catalog.products where slug = 'concurrency-test-product');
delete from catalog.products where slug = 'concurrency-test-product';
delete from inventory.warehouses where code = 'TEST-WH-01';
delete from seller.sellers where slug = 'concurrency-test-seller';
delete from catalog.categories where code = 'TEST_CONCURRENCY';

-- Category (leaf, active) and its policy.
insert into catalog.categories (code, name, slug, is_active)
values ('TEST_CONCURRENCY', 'Concurrency Test', 'concurrency-test', true);

insert into catalog.category_policies (category_id, default_hsn_code, default_gst_rate, return_window_days, return_type)
select id, '8517', 18, 7, 'REFUND_OR_REPLACEMENT' from catalog.categories where code = 'TEST_CONCURRENCY';

-- Approved seller.
insert into seller.sellers (
  display_name, slug, legal_name, business_type,
  primary_contact_name, primary_contact_email, primary_contact_phone,
  registered_state_code, status, status_reason, approved_at, agreement_accepted_at, agreement_version
) values (
  'Concurrency Test Seller', 'concurrency-test-seller', 'Concurrency Test Private Limited', 'PRIVATE_LIMITED',
  'Test Contact', 'seller@test.novamart.in', '919000000001',
  'KA', 'APPROVED', null, now(), now(), 'v1.0'
);

-- Warehouse in a serviceable pincode.
insert into inventory.warehouses (
  code, name, seller_id, warehouse_type, address_line1, city, state_code, pincode
)
select 'TEST-WH-01', 'Test Warehouse Bengaluru', s.id, 'SELLER_PICKUP',
       '1 Test Road', 'Bengaluru', 'KA', '560034'
  from seller.sellers s where s.slug = 'concurrency-test-seller';

-- Product, variant, SKU.
insert into catalog.products (
  category_id, title, slug, status, moderation_status, moderated_at, hsn_code, gst_rate, country_of_origin
)
select c.id, 'Concurrency Test Product', 'concurrency-test-product', 'ACTIVE', 'APPROVED', now(), '8517', 18, 'India'
  from catalog.categories c where c.code = 'TEST_CONCURRENCY';

insert into catalog.product_variants (product_id, variant_label, attribute_signature, is_default)
select id, 'Default', 'default', true from catalog.products where slug = 'concurrency-test-product';

insert into catalog.skus (variant_id, product_id, sku_code, weight_grams, status)
select v.id, v.product_id, 'TEST-CONCURRENCY-001', 500, 'ACTIVE'
  from catalog.product_variants v
  join catalog.products p on p.id = v.product_id
 where p.slug = 'concurrency-test-product';

-- Exactly 100 units, received through the real inbound path so the ledger is
-- consistent from the start.
select inventory.receive_stock(
         w.id, sk.id, s.id, 100, 'PURCHASE_RECEIPT', 'CONCURRENCY-TEST', 'Fixture seeding'
       )
  from inventory.warehouses w
  cross join catalog.skus sk
  cross join seller.sellers s
 where w.code = 'TEST-WH-01'
   and sk.sku_code = 'TEST-CONCURRENCY-001'
   and s.slug = 'concurrency-test-seller';

commit;

\echo 'Fixture ready:'
select wi.available_quantity, wi.reserved_quantity, wi.physical_quantity
  from inventory.warehouse_inventory wi
  join catalog.skus sk on sk.id = wi.sku_id
 where sk.sku_code = 'TEST-CONCURRENCY-001';
