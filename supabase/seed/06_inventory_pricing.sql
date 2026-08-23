-- =============================================================================
-- NovaMart seed — 06 Listings, prices, inventory, promotions, Buy Box
--
-- Two sellers compete on the same SKUs with different prices and different quality
-- scores, which is the whole point of the Buy Box: the cheaper seller does not
-- automatically win (brief §29).
-- Stock is received through inventory.receive_stock() so the ledger is consistent
-- from the first unit rather than being back-filled.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Listings. Aurex lists its own devices; Metro competes on the same phones and on
-- audio; Trailhead lists footwear and apparel.
-- -----------------------------------------------------------------------------
insert into catalog.seller_listings (
  seller_id, sku_id, seller_sku_code, condition, fulfillment_model,
  declared_mrp_paise, status, min_order_quantity, max_order_quantity,
  handling_time_days, is_buy_box_eligible, default_warehouse_id
)
select s.id, sk.id, v.seller_sku, 'NEW', v.model,
       v.mrp, 'ACTIVE', 1, v.max_qty, v.handling, true, w.id
  from (values
    -- Aurex: own brand, fast handling, NovaMart-fulfilled on the flagship
    ('aurex-official-store', 'NM-AURX-P9P-BLK-256', 'AURX-P9P-BLK-256', 'NOVAMART_FULFILLED', 8999900::bigint, 2, 1, 'WH-AUREX-BLR'),
    ('aurex-official-store', 'NM-AURX-P9P-BLK-512', 'AURX-P9P-BLK-512', 'NOVAMART_FULFILLED', 9899900,        2, 1, 'WH-AUREX-BLR'),
    ('aurex-official-store', 'NM-AURX-P9P-GRY-256', 'AURX-P9P-GRY-256', 'SELLER_FULFILLED',   8999900,        2, 1, 'WH-AUREX-BLR'),
    ('aurex-official-store', 'NM-VOLT-SRG-BLU-128', 'AURX-VOLT-BLU',    'SELLER_FULFILLED',   1699900,        3, 1, 'WH-AUREX-DEL'),
    -- Metro: cheaper on the flagship but weaker service metrics
    ('metro-gadget-house',   'NM-AURX-P9P-BLK-256', 'MGH-P9P-256',      'SELLER_FULFILLED',   8999900,        2, 3, 'WH-METRO-MUM'),
    ('metro-gadget-house',   'NM-VOLT-SRG-BLU-128', 'MGH-SURGE-BLU',    'SELLER_FULFILLED',   1699900,        4, 2, 'WH-METRO-MUM'),
    ('metro-gadget-house',   'NM-VOLT-SRG-BLK-128', 'MGH-SURGE-BLK',    'SELLER_FULFILLED',   1699900,        4, 2, 'WH-METRO-MUM'),
    ('metro-gadget-house',   'NM-SNQ-AURA-BLK',     'MGH-AURA-BLK',     'SELLER_FULFILLED',   1299900,        5, 2, 'WH-METRO-MUM'),
    ('metro-gadget-house',   'NM-SNQ-AURA-WHT',     'MGH-AURA-WHT',     'SELLER_FULFILLED',   1299900,        5, 2, 'WH-METRO-MUM'),
    -- Trailhead: footwear and apparel
    ('trailhead-sports',     'NM-TRL-RDG-GRN-8',    'TRL-RDG-GRN-8',    'SELLER_FULFILLED',   449900,         3, 2, 'WH-TRAIL-CHN'),
    ('trailhead-sports',     'NM-TRL-RDG-GRN-9',    'TRL-RDG-GRN-9',    'SELLER_FULFILLED',   449900,         3, 2, 'WH-TRAIL-CHN'),
    ('trailhead-sports',     'NM-TRL-RDG-BLK-8',    'TRL-RDG-BLK-8',    'SELLER_FULFILLED',   449900,         3, 2, 'WH-TRAIL-CHN'),
    ('trailhead-sports',     'NM-LOOM-CRW-BLU-M',   'TRL-LOOM-BLU-M',   'SELLER_FULFILLED',   99900,          6, 2, 'WH-TRAIL-CHN'),
    ('trailhead-sports',     'NM-LOOM-CRW-BLU-L',   'TRL-LOOM-BLU-L',   'SELLER_FULFILLED',   99900,          6, 2, 'WH-TRAIL-CHN'),
    ('trailhead-sports',     'NM-LOOM-CRW-WHT-M',   'TRL-LOOM-WHT-M',   'SELLER_FULFILLED',   99900,          6, 2, 'WH-TRAIL-CHN')
  ) as v(seller_slug, sku_code, seller_sku, model, mrp, max_qty, handling, warehouse_code)
  join seller.sellers s on s.slug = v.seller_slug
  join catalog.skus sk on sk.sku_code = v.sku_code
  join inventory.warehouses w on w.code = v.warehouse_code
on conflict (seller_id, sku_id) do nothing;

-- -----------------------------------------------------------------------------
-- Prices. Metro undercuts Aurex on the flagship by Rs.1,500 — the Buy Box test is
-- whether the cheaper-but-weaker seller wins. It should not.
-- -----------------------------------------------------------------------------
insert into pricing.listing_prices (
  listing_id, seller_id, sku_id, mrp_paise, selling_price_paise,
  floor_price_paise, allows_platform_discount, update_source
)
select l.id, l.seller_id, l.sku_id, l.declared_mrp_paise, v.price,
       v.floor, true, 'BULK_UPLOAD'
  from (values
    ('aurex-official-store', 'NM-AURX-P9P-BLK-256', 8249900::bigint, 7900000::bigint),
    ('aurex-official-store', 'NM-AURX-P9P-BLK-512', 9149900,         8800000),
    ('aurex-official-store', 'NM-AURX-P9P-GRY-256', 8299900,         7900000),
    ('aurex-official-store', 'NM-VOLT-SRG-BLU-128', 1549900,         1450000),
    ('metro-gadget-house',   'NM-AURX-P9P-BLK-256', 8099900,         7900000),
    ('metro-gadget-house',   'NM-VOLT-SRG-BLU-128', 1499900,         1420000),
    ('metro-gadget-house',   'NM-VOLT-SRG-BLK-128', 1499900,         1420000),
    ('metro-gadget-house',   'NM-SNQ-AURA-BLK',     1099900,         1000000),
    ('metro-gadget-house',   'NM-SNQ-AURA-WHT',     1119900,         1000000),
    ('trailhead-sports',     'NM-TRL-RDG-GRN-8',     359900,          320000),
    ('trailhead-sports',     'NM-TRL-RDG-GRN-9',     359900,          320000),
    ('trailhead-sports',     'NM-TRL-RDG-BLK-8',     369900,          320000),
    ('trailhead-sports',     'NM-LOOM-CRW-BLU-M',     64900,           55000),
    ('trailhead-sports',     'NM-LOOM-CRW-BLU-L',     64900,           55000),
    ('trailhead-sports',     'NM-LOOM-CRW-WHT-M',     69900,           55000)
  ) as v(seller_slug, sku_code, price, floor)
  join seller.sellers s on s.slug = v.seller_slug
  join catalog.skus sk on sk.sku_code = v.sku_code
  join catalog.seller_listings l on l.seller_id = s.id and l.sku_id = sk.id
on conflict (listing_id) do nothing;

-- -----------------------------------------------------------------------------
-- Inventory. Received through the real inbound function so inventory_ledger and the
-- materialised balances agree from the outset — inventory.reconcile_balances() should
-- return zero rows immediately after seeding.
-- -----------------------------------------------------------------------------
select inventory.receive_stock(
         w.id, sk.id, s.id, v.quantity, 'PURCHASE_RECEIPT',
         'SEED-' || v.sku_code, 'Initial seed stock'
       )
  from (values
    ('aurex-official-store', 'WH-AUREX-BLR', 'NM-AURX-P9P-BLK-256', 120),
    ('aurex-official-store', 'WH-AUREX-BLR', 'NM-AURX-P9P-BLK-512', 45),
    ('aurex-official-store', 'WH-AUREX-BLR', 'NM-AURX-P9P-GRY-256', 60),
    ('aurex-official-store', 'WH-AUREX-DEL', 'NM-VOLT-SRG-BLU-128', 200),
    ('metro-gadget-house',   'WH-METRO-MUM', 'NM-AURX-P9P-BLK-256', 35),
    ('metro-gadget-house',   'WH-METRO-MUM', 'NM-VOLT-SRG-BLU-128', 150),
    ('metro-gadget-house',   'WH-METRO-MUM', 'NM-VOLT-SRG-BLK-128', 140),
    ('metro-gadget-house',   'WH-METRO-MUM', 'NM-SNQ-AURA-BLK',     90),
    ('metro-gadget-house',   'WH-METRO-MUM', 'NM-SNQ-AURA-WHT',     70),
    ('trailhead-sports',     'WH-TRAIL-CHN', 'NM-TRL-RDG-GRN-8',    80),
    ('trailhead-sports',     'WH-TRAIL-CHN', 'NM-TRL-RDG-GRN-9',    65),
    ('trailhead-sports',     'WH-TRAIL-CHN', 'NM-TRL-RDG-BLK-8',    55),
    ('trailhead-sports',     'WH-TRAIL-CHN', 'NM-LOOM-CRW-BLU-M',   300),
    ('trailhead-sports',     'WH-TRAIL-CHN', 'NM-LOOM-CRW-BLU-L',   260),
    ('trailhead-sports',     'WH-TRAIL-CHN', 'NM-LOOM-CRW-WHT-M',   180)
  ) as v(seller_slug, warehouse_code, sku_code, quantity)
  join seller.sellers s on s.slug = v.seller_slug
  join inventory.warehouses w on w.code = v.warehouse_code
  join catalog.skus sk on sk.sku_code = v.sku_code
 where not exists (
   select 1 from inventory.warehouse_inventory wi
    where wi.warehouse_id = w.id and wi.sku_id = sk.id and wi.seller_id = s.id
 );

-- Link inventory rows back to their listing for the seller stock view.
update inventory.warehouse_inventory wi
   set listing_id = l.id
  from catalog.seller_listings l
 where l.seller_id = wi.seller_id
   and l.sku_id = wi.sku_id
   and wi.listing_id is null;

-- Low-stock thresholds so the seller console has something to alert on.
update inventory.warehouse_inventory
   set reorder_point = greatest(10, (available_quantity * 0.15)::int),
       reorder_quantity = greatest(25, (available_quantity * 0.5)::int)
 where reorder_point is null;

-- -----------------------------------------------------------------------------
-- Promotions and coupons
-- -----------------------------------------------------------------------------
-- promotions_discount_fields requires the amount matching the promotion type to be
-- present on insert: a PERCENTAGE_OFF must declare a cap, a FLAT_OFF an amount.
insert into pricing.promotions (
  code, name, description, funded_by, promotion_type, discount_percentage, discount_paise,
  max_discount_paise, min_cart_value_paise, starts_at, ends_at, status,
  badge_text, badge_color, stack_priority
) values
  ('AUDIO_FEST_10', 'Audio Fest — 10% off', 'Ten percent off audio, capped at Rs.1,500.',
   'PLATFORM', 'PERCENTAGE_OFF', 10.000, null, 150000, 0,
   now() - interval '2 days', now() + interval '30 days', 'ACTIVE',
   'Audio Fest', '#1B4E8C', 50),
  ('FOOTWEAR_FLAT_300', 'Flat Rs.300 off footwear', 'Flat Rs.300 off running shoes.',
   'SELLER', 'FLAT_OFF', null, 30000, null, 300000,
   now() - interval '1 day', now() + interval '20 days', 'ACTIVE',
   'Save Rs.300', '#1F4D33', 60)
on conflict (code) do nothing;

insert into pricing.promotion_targets (promotion_id, target_type, category_id)
select p.id, 'CATEGORY', c.id
  from pricing.promotions p
  join catalog.categories c on c.code = 'HEADPHONES'
 where p.code = 'AUDIO_FEST_10'
on conflict do nothing;

insert into pricing.promotion_targets (promotion_id, target_type, category_id)
select p.id, 'CATEGORY', c.id
  from pricing.promotions p
  join catalog.categories c on c.code = 'MENS_FOOTWEAR'
 where p.code = 'FOOTWEAR_FLAT_300'
on conflict do nothing;

insert into pricing.coupons (
  code, name, description, distribution, discount_type, discount_percentage, discount_paise,
  max_discount_paise, min_cart_value_paise, funded_by, per_user_limit,
  first_order_only, starts_at, ends_at, is_active
) values
  ('NOVA10', 'NOVA10 — 10% off your first order', 'Ten percent off, up to Rs.1,000, first order only.',
   'PUBLIC', 'PERCENTAGE', 10.000, null, 100000, 99900, 'PLATFORM', 1,
   true, now() - interval '7 days', now() + interval '60 days', true),
  ('SAVE500', 'SAVE500 — Rs.500 off above Rs.4,999', 'Flat Rs.500 off orders above Rs.4,999.',
   'PUBLIC', 'FLAT', null, 50000, null, 499900, 'PLATFORM', 3,
   false, now() - interval '7 days', now() + interval '60 days', true),
  ('FREESHIP', 'FREESHIP — free delivery', 'Free delivery on any order.',
   'PUBLIC', 'FREE_SHIPPING', null, null, null, 0, 'PLATFORM', 5,
   false, now() - interval '7 days', now() + interval '60 days', true)
on conflict do nothing;

insert into pricing.bank_offers (
  code, bank_name, offer_title, offer_description, payment_methods, card_types,
  discount_type, discount_percentage, max_discount_paise, min_transaction_paise,
  starts_at, ends_at, is_active
) values
  ('HDFC_CC_10', 'HDFC Bank', '10% instant discount on HDFC credit cards',
   'Flat 10% instant discount up to Rs.2,000 on HDFC Bank credit cards.',
   '{CARD}', '{CREDIT_CARD}', 'INSTANT_PERCENTAGE', 10.000, 200000, 500000,
   now() - interval '3 days', now() + interval '45 days', true)
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Elect the Buy Box winner for every seeded SKU using the real scoring function.
-- Aurex should win the contested flagship despite Metro's lower price, because the
-- weighted score accounts for seller score, cancellation rate and fulfilment model.
-- -----------------------------------------------------------------------------
select pricing.recompute_buy_box(sk.id)
  from catalog.skus sk
 where exists (select 1 from catalog.seller_listings l where l.sku_id = sk.id and l.status = 'ACTIVE');

-- -----------------------------------------------------------------------------
-- Homepage sections, so the storefront has real content to render.
-- -----------------------------------------------------------------------------
insert into marketing.home_sections (
  code, section_type, title, title_hi, subtitle, configuration, position, status, surfaces
) values
  ('HERO', 'HERO_BANNER', null, null, null, '{"autoplaySeconds":5}'::jsonb, 10, 'ACTIVE', '{web,android,ios}'),
  ('SHOP_BY_CATEGORY', 'CATEGORY_GRID', 'Shop by category', 'श्रेणी से खरीदें', null,
   '{"source":"home_grid","limit":8,"columns":4}'::jsonb, 20, 'ACTIVE', '{web,android,ios}'),
  ('DEALS_TODAY', 'DEALS_STRIP', 'Deals of the day', 'आज के ऑफर', 'Limited-time prices',
   '{"source":"discount","minDiscountPercentage":10,"limit":12}'::jsonb, 30, 'ACTIVE', '{web,android,ios}'),
  ('TRENDING_ELECTRONICS', 'PRODUCT_CAROUSEL', 'Trending in Electronics', 'इलेक्ट्रॉनिक्स में ट्रेंडिंग', null,
   '{"source":"category","categoryCode":"ELECTRONICS","sort":"popularity","limit":12}'::jsonb, 40, 'ACTIVE', '{web,android,ios}'),
  ('TOP_BRANDS', 'BRAND_STRIP', 'Top brands', 'टॉप ब्रांड', null,
   '{"source":"featured","limit":8}'::jsonb, 50, 'ACTIVE', '{web,android,ios}'),
  ('RECENTLY_VIEWED', 'RECENTLY_VIEWED', 'Pick up where you left off', 'जहाँ छोड़ा था वहीं से शुरू करें', null,
   '{"limit":10}'::jsonb, 60, 'ACTIVE', '{web,android,ios}'),
  ('FASHION_PICKS', 'PRODUCT_CAROUSEL', 'Fashion picks', 'फैशन चुनिंदा', null,
   '{"source":"category","categoryCode":"FASHION","sort":"popularity","limit":12}'::jsonb, 70, 'ACTIVE', '{web,android,ios}')
on conflict (code) do nothing;

insert into marketing.banners (
  home_section_id, alt_text, image_url_mobile, image_url_desktop,
  background_color, link_type, link_target, cta_label, position, status
)
select hs.id, v.alt, v.mobile, v.desktop, v.bg, v.link_type, v.target, v.cta, v.position, 'ACTIVE'
  from (values
    ('HERO', 'Aurex Pulse 9 Pro — now available',
     'http://127.0.0.1:54321/storage/v1/object/public/products-public/banners/hero-pulse-mobile.webp',
     'http://127.0.0.1:54321/storage/v1/object/public/products-public/banners/hero-pulse-desktop.webp',
     '#101014', 'PRODUCT', 'aurex-pulse-9-pro-5g', 'Shop now', 10),
    ('HERO', 'Audio Fest — up to 10% off',
     'http://127.0.0.1:54321/storage/v1/object/public/products-public/banners/hero-audio-mobile.webp',
     'http://127.0.0.1:54321/storage/v1/object/public/products-public/banners/hero-audio-desktop.webp',
     '#1B4E8C', 'CATEGORY', 'electronics/audio/headphones', 'Explore deals', 20)
  ) as v(section_code, alt, mobile, desktop, bg, link_type, target, cta, position)
  join marketing.home_sections hs on hs.code = v.section_code
on conflict do nothing;

-- Search vocabulary: how people actually type, versus how the catalogue is titled.
insert into marketing.search_synonyms (root_term, synonyms, synonym_type)
values
  ('mobile',     ARRAY['phone', 'smartphone', 'cellphone', 'handset'], 'MULTI_WAY'),
  ('headphone',  ARRAY['headphones', 'earphone', 'earphones', 'headset'], 'MULTI_WAY'),
  ('shoes',      ARRAY['shoe', 'footwear', 'sneakers', 'trainers'], 'MULTI_WAY'),
  ('tshirt',     ARRAY['t-shirt', 't shirt', 'tee'], 'MULTI_WAY'),
  ('anc',        ARRAY['noise cancelling', 'noise cancellation', 'noise canceling'], 'ONE_WAY')
on conflict (root_term, locale) do nothing;
