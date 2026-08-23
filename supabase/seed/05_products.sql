-- =============================================================================
-- NovaMart seed — 05 Products, variants, SKUs, media, specifications, attributes
--
-- Real products with meaningful names, correct HSN codes and Legal Metrology fields.
-- The variant structure is genuine: colour x storage for phones, colour x size for
-- footwear, so the PDP selector and the SKU/inventory split are exercised properly.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Products
-- -----------------------------------------------------------------------------
insert into catalog.products (
  category_id, brand_id, title, slug, subtitle, description, highlights, search_keywords,
  hsn_code, gst_rate, country_of_origin, manufacturer_name, manufacturer_address,
  packer_name, generic_name, net_quantity,
  warranty_type, warranty_period_months, warranty_summary,
  status, moderation_status, moderated_at, popularity_score, seo_title
)
select c.id, b.id, v.title, v.slug, v.subtitle, v.description, v.highlights, v.keywords,
       v.hsn, v.gst, 'India', v.manufacturer, v.manufacturer_address,
       v.manufacturer, v.generic_name, v.net_quantity,
       v.warranty_type, v.warranty_months, v.warranty_summary,
       'ACTIVE', 'APPROVED', now() - interval '10 days', v.popularity, v.seo_title
  from (values
    ('SMARTPHONES', 'aurex',
     'Aurex Pulse 9 Pro 5G', 'aurex-pulse-9-pro-5g',
     'Flagship performance with a 6.7-inch AMOLED display',
     'The Aurex Pulse 9 Pro pairs a 6.7-inch 120 Hz AMOLED display with the Nova X2 processor and a 5,200 mAh battery. Triple rear camera with optical stabilisation, IP68 rating, and 80 W wired charging.',
     ARRAY['6.7-inch 120 Hz AMOLED display', 'Nova X2 octa-core processor', '5,200 mAh battery with 80 W charging', '50 MP OIS triple camera', 'IP68 dust and water resistance'],
     ARRAY['aurex pulse', 'pulse 9 pro', '5g phone', 'aurex mobile', 'pulse9'],
     '8517', 18.000, 'Aurex Devices Private Limited', 'Plot 42, Bommasandra Industrial Area, Bengaluru 560099',
     'Smartphone', '1 unit', 'MANUFACTURER', 12, '12 months manufacturer warranty on device, 6 months on accessories',
     94.5, 'Aurex Pulse 9 Pro 5G — Price, Specs & Reviews | NovaMart'),

    ('SMARTPHONES', 'volt',
     'Volt Surge 5G', 'volt-surge-5g',
     'Everyday 5G with a 6,000 mAh battery',
     'The Volt Surge focuses on battery life: 6,000 mAh with 33 W charging, a 6.6-inch 90 Hz display and a clean Android build with three years of security updates.',
     ARRAY['6,000 mAh battery', '6.6-inch 90 Hz display', '33 W fast charging', 'Three years of security updates'],
     ARRAY['volt surge', 'budget 5g', 'long battery phone', 'volt mobile'],
     '8517', 18.000, 'Volt Electronics Private Limited', 'Sector 63, Noida 201301',
     'Smartphone', '1 unit', 'MANUFACTURER', 12, '12 months manufacturer warranty',
     78.2, 'Volt Surge 5G — Long Battery 5G Phone | NovaMart'),

    ('HEADPHONES', 'soniq',
     'Soniq Aura ANC Wireless Headphones', 'soniq-aura-anc-wireless-headphones',
     'Active noise cancellation with 40-hour playback',
     'Over-ear wireless headphones with hybrid active noise cancellation, 40 mm drivers and up to 40 hours of playback. Multipoint pairing and USB-C fast charge.',
     ARRAY['Hybrid active noise cancellation', '40 mm dynamic drivers', 'Up to 40 hours playback', 'Multipoint Bluetooth 5.3', 'USB-C fast charging'],
     ARRAY['soniq aura', 'anc headphones', 'noise cancelling', 'wireless headphones'],
     '8518', 18.000, 'Soniq Audio Private Limited', 'Unit 12, Peenya Industrial Area, Bengaluru 560058',
     'Wireless headphones', '1 unit', 'MANUFACTURER', 12, '12 months warranty against manufacturing defects',
     71.8, 'Soniq Aura ANC Wireless Headphones | NovaMart'),

    ('MENS_FOOTWEAR', 'trailhead',
     'Trailhead Ridge Running Shoes', 'trailhead-ridge-running-shoes',
     'Cushioned road running shoes for daily training',
     'Breathable engineered mesh upper with a dual-density EVA midsole and carbon rubber outsole. Built for daily road running on Indian tarmac.',
     ARRAY['Engineered mesh upper', 'Dual-density EVA midsole', 'Carbon rubber outsole', 'Weight: 265 g (UK 8)'],
     ARRAY['trailhead ridge', 'running shoes', 'sports shoes men', 'jogging shoes'],
     '6403', 5.000, 'Trailhead Sports Private Limited', '18 Guindy Industrial Estate, Chennai 600032',
     'Footwear', '1 pair', 'MANUFACTURER', 6, '6 months warranty against manufacturing defects',
     58.4, 'Trailhead Ridge Running Shoes for Men | NovaMart'),

    ('MENS_TSHIRTS', 'loomweave',
     'Loomweave Combed Cotton Crew Neck T-Shirt', 'loomweave-combed-cotton-crew-neck-t-shirt',
     '180 GSM combed cotton, pre-shrunk',
     'A 180 GSM combed cotton crew neck t-shirt, bio-washed and pre-shrunk so it holds shape after repeated washes. Made in Tiruppur.',
     ARRAY['180 GSM combed cotton', 'Bio-washed and pre-shrunk', 'Ribbed crew neck', 'Made in Tiruppur'],
     ARRAY['loomweave tshirt', 'cotton t-shirt men', 'plain tshirt', 'crew neck'],
     '6109', 5.000, 'Loomweave Apparel LLP', 'SIDCO Industrial Estate, Tiruppur 641604',
     'T-Shirt', '1 unit', 'NONE', null, null,
     44.1, 'Loomweave Combed Cotton T-Shirt for Men | NovaMart')
  ) as v(cat_code, brand_slug, title, slug, subtitle, description, highlights, keywords,
         hsn, gst, manufacturer, manufacturer_address, generic_name, net_quantity,
         warranty_type, warranty_months, warranty_summary, popularity, seo_title)
  join catalog.categories c on c.code = v.cat_code
  join catalog.brands b on b.slug = v.brand_slug
on conflict (slug) do nothing;

-- -----------------------------------------------------------------------------
-- Variants. attribute_signature is the deterministic fingerprint that prevents
-- duplicate variants differing only in attribute ordering.
-- -----------------------------------------------------------------------------
insert into catalog.product_variants (product_id, variant_label, attribute_signature, is_default, display_order)
select p.id, v.label, v.signature, v.is_default, v.display_order
  from (values
    ('aurex-pulse-9-pro-5g', 'Midnight Black, 256 GB', 'colour=midnight-black;storage=256', true,  10),
    ('aurex-pulse-9-pro-5g', 'Midnight Black, 512 GB', 'colour=midnight-black;storage=512', false, 20),
    ('aurex-pulse-9-pro-5g', 'Titanium Grey, 256 GB',  'colour=titanium-grey;storage=256',  false, 30),
    ('volt-surge-5g',        'Ocean Blue, 128 GB',     'colour=ocean-blue;storage=128',     true,  10),
    ('volt-surge-5g',        'Midnight Black, 128 GB', 'colour=midnight-black;storage=128', false, 20),
    ('soniq-aura-anc-wireless-headphones', 'Midnight Black', 'colour=midnight-black',       true,  10),
    ('soniq-aura-anc-wireless-headphones', 'Pearl White',    'colour=pearl-white',          false, 20),
    ('trailhead-ridge-running-shoes', 'Forest Green, UK 8',  'colour=forest-green;shoe_size=uk8', true,  10),
    ('trailhead-ridge-running-shoes', 'Forest Green, UK 9',  'colour=forest-green;shoe_size=uk9', false, 20),
    ('trailhead-ridge-running-shoes', 'Midnight Black, UK 8','colour=midnight-black;shoe_size=uk8', false, 30),
    ('loomweave-combed-cotton-crew-neck-t-shirt', 'Ocean Blue, M',   'colour=ocean-blue;apparel_size=m',  true,  10),
    ('loomweave-combed-cotton-crew-neck-t-shirt', 'Ocean Blue, L',   'colour=ocean-blue;apparel_size=l',  false, 20),
    ('loomweave-combed-cotton-crew-neck-t-shirt', 'Pearl White, M',  'colour=pearl-white;apparel_size=m', false, 30)
  ) as v(product_slug, label, signature, is_default, display_order)
  join catalog.products p on p.slug = v.product_slug
on conflict (product_id, attribute_signature) do nothing;

-- -----------------------------------------------------------------------------
-- SKUs. Weight and dimensions are real: couriers bill on max(actual, volumetric),
-- and the shipping engine needs both to quote correctly.
-- -----------------------------------------------------------------------------
insert into catalog.skus (
  variant_id, sku_code, barcode_type, barcode,
  weight_grams, length_mm, width_mm, height_mm, reference_mrp_paise, is_fragile, status
)
select pv.id, v.sku_code, 'EAN_13', v.barcode,
       v.weight, v.length_mm, v.width_mm, v.height_mm, v.mrp, v.fragile, 'ACTIVE'
  from (values
    ('aurex-pulse-9-pro-5g', 'colour=midnight-black;storage=256', 'NM-AURX-P9P-BLK-256', '8901234500017', 420, 180, 90,  40, 8999900::bigint, true),
    ('aurex-pulse-9-pro-5g', 'colour=midnight-black;storage=512', 'NM-AURX-P9P-BLK-512', '8901234500024', 420, 180, 90,  40, 9899900,        true),
    ('aurex-pulse-9-pro-5g', 'colour=titanium-grey;storage=256',  'NM-AURX-P9P-GRY-256', '8901234500031', 420, 180, 90,  40, 8999900,        true),
    ('volt-surge-5g',        'colour=ocean-blue;storage=128',     'NM-VOLT-SRG-BLU-128', '8901234500048', 460, 175, 88,  42, 1699900,        true),
    ('volt-surge-5g',        'colour=midnight-black;storage=128', 'NM-VOLT-SRG-BLK-128', '8901234500055', 460, 175, 88,  42, 1699900,        true),
    ('soniq-aura-anc-wireless-headphones', 'colour=midnight-black', 'NM-SNQ-AURA-BLK',   '8901234500062', 610, 220, 190, 90, 1299900,        true),
    ('soniq-aura-anc-wireless-headphones', 'colour=pearl-white',    'NM-SNQ-AURA-WHT',   '8901234500079', 610, 220, 190, 90, 1299900,        true),
    ('trailhead-ridge-running-shoes', 'colour=forest-green;shoe_size=uk8',  'NM-TRL-RDG-GRN-8',  '8901234500086', 780, 330, 220, 130, 449900, false),
    ('trailhead-ridge-running-shoes', 'colour=forest-green;shoe_size=uk9',  'NM-TRL-RDG-GRN-9',  '8901234500093', 800, 340, 220, 130, 449900, false),
    ('trailhead-ridge-running-shoes', 'colour=midnight-black;shoe_size=uk8','NM-TRL-RDG-BLK-8',  '8901234500109', 780, 330, 220, 130, 449900, false),
    ('loomweave-combed-cotton-crew-neck-t-shirt', 'colour=ocean-blue;apparel_size=m',  'NM-LOOM-CRW-BLU-M', '8901234500116', 180, 250, 200, 30, 99900, false),
    ('loomweave-combed-cotton-crew-neck-t-shirt', 'colour=ocean-blue;apparel_size=l',  'NM-LOOM-CRW-BLU-L', '8901234500123', 190, 250, 200, 30, 99900, false),
    ('loomweave-combed-cotton-crew-neck-t-shirt', 'colour=pearl-white;apparel_size=m', 'NM-LOOM-CRW-WHT-M', '8901234500130', 180, 250, 200, 30, 99900, false)
  ) as v(product_slug, signature, sku_code, barcode, weight, length_mm, width_mm, height_mm, mrp, fragile)
  join catalog.products p on p.slug = v.product_slug
  join catalog.product_variants pv on pv.product_id = p.id and pv.attribute_signature = v.signature
on conflict (sku_code) do nothing;

-- -----------------------------------------------------------------------------
-- Variant attribute values, so the PDP selector can be built from data.
-- -----------------------------------------------------------------------------
insert into catalog.variant_attribute_values (variant_id, attribute_id, option_id)
select pv.id, ad.id, ao.id
  from catalog.product_variants pv
  cross join lateral (
    -- Split 'colour=x;storage=y' into its attribute/value pairs.
    select split_part(pair, '=', 1) as attr_code, split_part(pair, '=', 2) as attr_value
      from unnest(string_to_array(pv.attribute_signature, ';')) as pair
  ) parts
  join catalog.attribute_definitions ad on ad.code = parts.attr_code
  join catalog.attribute_options ao on ao.attribute_id = ad.id and ao.value = parts.attr_value
on conflict (variant_id, attribute_id) do nothing;

-- -----------------------------------------------------------------------------
-- Product-level attribute values (the non-variant specs used for filtering).
-- -----------------------------------------------------------------------------
insert into catalog.product_attribute_values (product_id, attribute_id, value_number, unit)
select p.id, ad.id, v.value, ad.unit
  from (values
    ('aurex-pulse-9-pro-5g', 'screen_size', 6.7),
    ('aurex-pulse-9-pro-5g', 'battery',     5200),
    ('volt-surge-5g',        'screen_size', 6.6),
    ('volt-surge-5g',        'battery',     6000),
    ('soniq-aura-anc-wireless-headphones', 'driver_size', 40)
  ) as v(product_slug, attr, value)
  join catalog.products p on p.slug = v.product_slug
  join catalog.attribute_definitions ad on ad.code = v.attr
on conflict (product_id, attribute_id) do nothing;

insert into catalog.product_attribute_values (product_id, attribute_id, value_text)
select p.id, ad.id, v.value
  from (values
    ('aurex-pulse-9-pro-5g', 'processor',   'Nova X2 octa-core'),
    ('aurex-pulse-9-pro-5g', 'rear_camera', '50 MP OIS + 12 MP ultra-wide + 8 MP telephoto'),
    ('volt-surge-5g',        'processor',   'Nova A1 octa-core'),
    ('volt-surge-5g',        'rear_camera', '50 MP + 2 MP depth'),
    ('trailhead-ridge-running-shoes', 'material', 'Engineered mesh upper, EVA midsole'),
    ('loomweave-combed-cotton-crew-neck-t-shirt', 'material', '100% combed cotton')
  ) as v(product_slug, attr, value)
  join catalog.products p on p.slug = v.product_slug
  join catalog.attribute_definitions ad on ad.code = v.attr
on conflict (product_id, attribute_id) do nothing;

insert into catalog.product_attribute_values (product_id, attribute_id, value_boolean)
select p.id, ad.id, true
  from catalog.products p
  join catalog.attribute_definitions ad on ad.code = 'anc'
 where p.slug = 'soniq-aura-anc-wireless-headphones'
on conflict (product_id, attribute_id) do nothing;

-- -----------------------------------------------------------------------------
-- Media. Placeholder URLs point at the local storage host; a production import would
-- upload through the API so images are re-encoded and EXIF stripped.
-- -----------------------------------------------------------------------------
insert into catalog.product_media (
  product_id, media_type, storage_path, public_url, alt_text,
  width_px, height_px, mime_type, blurhash, display_order, is_primary, moderation_status
)
select p.id, 'IMAGE',
       'products/' || p.id || '/' || v.n || '.webp',
       'http://127.0.0.1:54321/storage/v1/object/public/products-public/products/' || p.id || '/' || v.n || '.webp',
       p.title || ' — image ' || v.n,
       1200, 1200, 'image/webp', 'LEHV6nWB2yk8pyo0adR*.7kCMdnj', v.n * 10, v.n = 1, 'APPROVED'
  from catalog.products p
  cross join (values (1), (2), (3), (4)) as v(n)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Presentational specification sheet, distinct from queryable attributes.
-- -----------------------------------------------------------------------------
insert into catalog.product_specifications (product_id, group_name, label, value, display_order)
select p.id, v.group_name, v.label, v.value, v.display_order
  from (values
    ('aurex-pulse-9-pro-5g', 'Display', 'Type',        'LTPO AMOLED, 120 Hz adaptive',  10),
    ('aurex-pulse-9-pro-5g', 'Display', 'Resolution',  '1440 x 3200 pixels',            20),
    ('aurex-pulse-9-pro-5g', 'Display', 'Brightness',  '2600 nits peak',                30),
    ('aurex-pulse-9-pro-5g', 'Battery', 'Capacity',    '5200 mAh',                      10),
    ('aurex-pulse-9-pro-5g', 'Battery', 'Charging',    '80 W wired, 50 W wireless',      20),
    ('aurex-pulse-9-pro-5g', 'Camera',  'Rear',        '50 MP OIS + 12 MP + 8 MP',       10),
    ('aurex-pulse-9-pro-5g', 'Camera',  'Front',       '32 MP',                          20),
    ('aurex-pulse-9-pro-5g', 'General', 'Water resistance', 'IP68',                      10),
    ('aurex-pulse-9-pro-5g', 'General', 'In the box',  'Handset, 80 W charger, USB-C cable, case', 20),
    ('volt-surge-5g',        'Display', 'Type',        'IPS LCD, 90 Hz',                 10),
    ('volt-surge-5g',        'Battery', 'Capacity',    '6000 mAh',                       10),
    ('volt-surge-5g',        'Battery', 'Charging',    '33 W wired',                     20),
    ('soniq-aura-anc-wireless-headphones', 'Audio',   'Drivers',  '40 mm dynamic',       10),
    ('soniq-aura-anc-wireless-headphones', 'Audio',   'Codecs',   'SBC, AAC, LDAC',      20),
    ('soniq-aura-anc-wireless-headphones', 'Battery', 'Playback', 'Up to 40 hours (ANC off)', 10),
    ('trailhead-ridge-running-shoes', 'Fit',      'Arch support', 'Neutral',             10),
    ('trailhead-ridge-running-shoes', 'General',  'Weight',       '265 g (UK 8)',        10),
    ('trailhead-ridge-running-shoes', 'Care',     'Cleaning',     'Wipe with damp cloth; do not machine wash', 10),
    ('loomweave-combed-cotton-crew-neck-t-shirt', 'Fabric', 'Composition', '100% combed cotton', 10),
    ('loomweave-combed-cotton-crew-neck-t-shirt', 'Fabric', 'GSM',         '180 GSM',    20),
    ('loomweave-combed-cotton-crew-neck-t-shirt', 'Care',   'Wash',        'Machine wash cold, do not bleach', 10)
  ) as v(product_slug, group_name, label, value, display_order)
  join catalog.products p on p.slug = v.product_slug
on conflict (product_id, group_name, label) do nothing;
