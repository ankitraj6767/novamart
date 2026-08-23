-- =============================================================================
-- NovaMart seed — 03 Catalog taxonomy: categories, policies, brands, attributes
--
-- A realistic slice rather than a token one: two top-level trees, per-category
-- policies that differ (electronics vs apparel return windows and GST slabs), and
-- attributes that are genuinely variant-defining so the PDP variant selector has
-- something real to work with.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Category tree. Parents first so the closure trigger can build ancestry.
-- -----------------------------------------------------------------------------
insert into catalog.categories (code, name, name_hi, slug, display_order, show_in_home_grid, seo_title)
values
  ('ELECTRONICS', 'Electronics', 'इलेक्ट्रॉनिक्स', 'electronics', 10, true,
   'Electronics Online: Mobiles, Laptops, Audio | NovaMart'),
  ('FASHION',     'Fashion',     'फैशन',          'fashion',     20, true,
   'Fashion Online: Clothing, Footwear, Accessories | NovaMart'),
  ('HOME',        'Home & Kitchen', 'घर और रसोई',  'home-kitchen', 30, true,
   'Home & Kitchen Essentials | NovaMart')
on conflict (code) do nothing;

insert into catalog.categories (code, parent_id, name, name_hi, slug, display_order)
select v.code, p.id, v.name, v.name_hi, v.slug, v.display_order
  from (values
    ('MOBILES',     'ELECTRONICS', 'Mobiles',        'मोबाइल',   'mobiles',     10),
    ('AUDIO',       'ELECTRONICS', 'Audio',          'ऑडियो',    'audio',       20),
    ('COMPUTERS',   'ELECTRONICS', 'Computers',      'कंप्यूटर',  'computers',   30),
    ('MEN',         'FASHION',     'Men',            'पुरुष',     'men',         10),
    ('WOMEN',       'FASHION',     'Women',          'महिला',     'women',       20),
    ('KITCHEN',     'HOME',        'Kitchen',        'रसोई',      'kitchen',     10)
  ) as v(code, parent_code, name, name_hi, slug, display_order)
  join catalog.categories p on p.code = v.parent_code
on conflict (code) do nothing;

insert into catalog.categories (code, parent_id, name, name_hi, slug, display_order)
select v.code, p.id, v.name, v.name_hi, v.slug, v.display_order
  from (values
    ('SMARTPHONES',   'MOBILES',   'Smartphones',        'स्मार्टफोन',   'smartphones',    10),
    ('FEATURE_PHONES','MOBILES',   'Feature Phones',     'फीचर फोन',     'feature-phones', 20),
    ('HEADPHONES',    'AUDIO',     'Headphones & Earbuds','हेडफ़ोन',      'headphones',     10),
    ('SPEAKERS',      'AUDIO',     'Speakers',           'स्पीकर',        'speakers',       20),
    ('LAPTOPS',       'COMPUTERS', 'Laptops',            'लैपटॉप',       'laptops',        10),
    ('MENS_FOOTWEAR', 'MEN',       'Footwear',           'जूते',          'mens-footwear',  10),
    ('MENS_TSHIRTS',  'MEN',       'T-Shirts',           'टी-शर्ट',      'mens-tshirts',   20),
    ('WOMENS_FOOTWEAR','WOMEN',    'Footwear',           'जूते',          'womens-footwear',10),
    ('COOKWARE',      'KITCHEN',   'Cookware',           'बर्तन',         'cookware',       10)
  ) as v(code, parent_code, name, name_hi, slug, display_order)
  join catalog.categories p on p.code = v.parent_code
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Category policies. Deliberately different per category: a phone and a t-shirt do
-- not carry the same return window, GST slab or commission.
-- -----------------------------------------------------------------------------
insert into catalog.category_policies (
  category_id, return_window_days, return_type, replacement_window_days,
  default_commission_percentage, cod_allowed, cod_limit_paise,
  default_hsn_code, default_gst_rate, requires_return_qc, min_images, requires_moderation
)
select c.id, v.window_days, v.return_type, v.replacement_days,
       v.commission, v.cod, v.cod_limit, v.hsn, v.gst, v.qc, v.min_images, true
  from (values
    ('SMARTPHONES',    7,  'REFUND_OR_REPLACEMENT', 7,  8.000,  true,  2000000::bigint, '8517', 18.000, true, 4),
    ('FEATURE_PHONES', 7,  'REFUND_OR_REPLACEMENT', 7,  10.000, true,  1000000,         '8517', 18.000, true, 3),
    ('HEADPHONES',     7,  'REFUND_OR_REPLACEMENT', 7,  14.000, true,  1000000,         '8518', 18.000, true, 3),
    ('SPEAKERS',       7,  'REFUND_OR_REPLACEMENT', 7,  14.000, true,  1000000,         '8518', 18.000, true, 3),
    ('LAPTOPS',        7,  'REFUND_OR_REPLACEMENT', 7,  6.000,  true,  2000000,         '8471', 18.000, true, 4),
    -- Apparel and footwear: longer window, size-driven returns are the norm.
    ('MENS_FOOTWEAR',  14, 'REFUND_OR_REPLACEMENT', 14, 20.000, true,  500000,          '6403', 5.000,  true, 4),
    ('WOMENS_FOOTWEAR',14, 'REFUND_OR_REPLACEMENT', 14, 20.000, true,  500000,          '6403', 5.000,  true, 4),
    ('MENS_TSHIRTS',   14, 'REFUND_OR_REPLACEMENT', 14, 22.000, true,  500000,          '6109', 5.000,  true, 3),
    ('COOKWARE',       7,  'REFUND_OR_REPLACEMENT', 7,  18.000, true,  500000,          '2106', 18.000, true, 3)
  ) as v(code, window_days, return_type, replacement_days, commission, cod, cod_limit, hsn, gst, qc, min_images)
  join catalog.categories c on c.code = v.code
on conflict (category_id) do nothing;

-- -----------------------------------------------------------------------------
-- Brands
-- -----------------------------------------------------------------------------
insert into catalog.brands (name, slug, description, country_of_origin, is_featured, display_order)
values
  ('Aurex',      'aurex',      'Premium smartphones and wearables engineered in Bengaluru.', 'India', true,  10),
  ('Volt',       'volt',       'Value-first mobiles and accessories.',                       'India', true,  20),
  ('Soniq',      'soniq',      'Audio equipment for everyday listening.',                     'India', true,  30),
  ('Trailhead',  'trailhead',  'Outdoor and running footwear.',                               'India', false, 40),
  ('Kettle & Co','kettle-and-co','Cookware for Indian kitchens.',                             'India', false, 50),
  ('Loomweave',  'loomweave',  'Cotton basics made in Tiruppur.',                             'India', false, 60)
on conflict (slug) do nothing;

-- -----------------------------------------------------------------------------
-- Attribute definitions. is_variant_defining is what makes the variant selector
-- data-driven rather than hardcoded per category (brief §22).
-- -----------------------------------------------------------------------------
insert into catalog.attribute_definitions
  (code, name, name_hi, data_type, unit, input_type, is_variant_defining, is_filterable,
   is_searchable, is_comparable, display_group, display_order)
values
  ('colour',       'Colour',        'रंग',      'COLOR',      null,   'SWATCH',       true,  true,  true,  true,  'General',   10),
  -- ENUM attributes carry no unit: the option labels already read '128 GB'. The
  -- attribute_unit_only_numeric constraint enforces this so units cannot end up
  -- duplicated in facet labels.
  ('storage',      'Storage',       'स्टोरेज',  'ENUM',       null,   'SELECT',       true,  true,  true,  true,  'Memory',    20),
  ('ram',          'RAM',           'रैम',      'ENUM',       null,   'SELECT',       false, true,  true,  true,  'Memory',    30),
  ('screen_size',  'Screen Size',   null,       'NUMBER',     'inch', 'NUMBER',       false, true,  false, true,  'Display',   40),
  ('battery',      'Battery',       null,       'NUMBER',     'mAh',  'NUMBER',       false, true,  false, true,  'Battery',   50),
  ('processor',    'Processor',     null,       'TEXT',       null,   'TEXT',         false, true,  true,  true,  'Performance', 60),
  ('rear_camera',  'Rear Camera',   null,       'TEXT',       null,   'TEXT',         false, true,  true,  true,  'Camera',    70),
  ('shoe_size',    'Size',          'साइज़',    'ENUM',       null,   'SELECT',       true,  true,  false, false, 'Fit',       80),
  ('apparel_size', 'Size',          'साइज़',    'ENUM',       null,   'SELECT',       true,  true,  false, false, 'Fit',       85),
  ('material',     'Material',      null,       'TEXT',       null,   'TEXT',         false, true,  true,  true,  'General',   90),
  ('driver_size',  'Driver Size',   null,       'NUMBER',     'mm',   'NUMBER',       false, true,  false, true,  'Audio',    100),
  ('anc',          'Noise Cancellation', null,  'BOOLEAN',    null,   'CHECKBOX',     false, true,  false, true,  'Audio',    110),
  ('capacity',     'Capacity',      null,       'NUMBER',     'L',    'NUMBER',       false, true,  false, true,  'General',  120)
on conflict (code) do nothing;

-- Enum options. display_order matters for sizes: alphabetical order is wrong (S < M < L).
insert into catalog.attribute_options (attribute_id, value, label, swatch_hex, display_order, numeric_value)
select a.id, v.value, v.label, v.swatch, v.display_order, v.numeric_value
  from (values
    ('colour',  'midnight-black', 'Midnight Black', '#101014', 10, null::numeric),
    ('colour',  'titanium-grey',  'Titanium Grey',  '#7A7D82', 20, null),
    ('colour',  'ocean-blue',     'Ocean Blue',     '#1B4E8C', 30, null),
    ('colour',  'pearl-white',    'Pearl White',    '#F4F4F2', 40, null),
    ('colour',  'forest-green',   'Forest Green',   '#1F4D33', 50, null),
    ('storage', '128',            '128 GB',         null,      10, 128),
    ('storage', '256',            '256 GB',         null,      20, 256),
    ('storage', '512',            '512 GB',         null,      30, 512),
    ('ram',     '6',              '6 GB',           null,      10, 6),
    ('ram',     '8',              '8 GB',           null,      20, 8),
    ('ram',     '12',             '12 GB',          null,      30, 12),
    ('shoe_size', 'uk6',          'UK 6',           null,      10, 6),
    ('shoe_size', 'uk7',          'UK 7',           null,      20, 7),
    ('shoe_size', 'uk8',          'UK 8',           null,      30, 8),
    ('shoe_size', 'uk9',          'UK 9',           null,      40, 9),
    ('shoe_size', 'uk10',         'UK 10',          null,      50, 10),
    ('apparel_size', 's',         'S',              null,      10, 1),
    ('apparel_size', 'm',         'M',              null,      20, 2),
    ('apparel_size', 'l',         'L',              null,      30, 3),
    ('apparel_size', 'xl',        'XL',             null,      40, 4),
    ('apparel_size', 'xxl',       'XXL',            null,      50, 5)
  ) as v(attr, value, label, swatch, display_order, numeric_value)
  join catalog.attribute_definitions a on a.code = v.attr
on conflict (attribute_id, value) do nothing;

-- -----------------------------------------------------------------------------
-- Bind attributes to categories. This is what makes "phones have storage, shoes have
-- size" configuration rather than code.
-- -----------------------------------------------------------------------------
insert into catalog.category_attributes
  (category_id, attribute_id, is_required, is_variant_defining, is_filterable, is_key_specification, display_order)
select c.id, a.id, v.required, v.variant_defining, true, v.key_spec, v.display_order
  from (values
    ('SMARTPHONES', 'colour',      true,  true,  true,  10),
    ('SMARTPHONES', 'storage',     true,  true,  true,  20),
    ('SMARTPHONES', 'ram',         true,  false, true,  30),
    ('SMARTPHONES', 'screen_size', true,  false, true,  40),
    ('SMARTPHONES', 'battery',     true,  false, true,  50),
    ('SMARTPHONES', 'processor',   true,  false, true,  60),
    ('SMARTPHONES', 'rear_camera', true,  false, true,  70),
    ('HEADPHONES',  'colour',      true,  true,  true,  10),
    ('HEADPHONES',  'driver_size', false, false, true,  20),
    ('HEADPHONES',  'anc',         false, false, true,  30),
    ('MENS_FOOTWEAR','colour',     true,  true,  true,  10),
    ('MENS_FOOTWEAR','shoe_size',  true,  true,  true,  20),
    ('MENS_FOOTWEAR','material',   false, false, true,  30),
    ('MENS_TSHIRTS','colour',      true,  true,  true,  10),
    ('MENS_TSHIRTS','apparel_size',true,  true,  true,  20),
    ('MENS_TSHIRTS','material',    false, false, true,  30),
    ('COOKWARE',    'capacity',    false, false, true,  10),
    ('COOKWARE',    'material',    true,  false, true,  20)
  ) as v(cat, attr, required, variant_defining, key_spec, display_order)
  join catalog.categories c on c.code = v.cat
  join catalog.attribute_definitions a on a.code = v.attr
on conflict (category_id, attribute_id) do nothing;

-- -----------------------------------------------------------------------------
-- Category-specific commission rules, overriding the global 12%.
-- -----------------------------------------------------------------------------
insert into pricing.commission_rules
  (name, scope_type, category_id, commission_type, percentage, closing_fee_paise,
   payment_gateway_fee_percentage, commission_gst_rate, priority, effective_from)
select 'Commission — ' || c.name, 'CATEGORY', c.id, 'PERCENTAGE', cp.default_commission_percentage,
       1000, 2.000, 18.000, 100, '2026-01-01'
  from catalog.categories c
  join catalog.category_policies cp on cp.category_id = c.id
 where cp.default_commission_percentage is not null
on conflict do nothing;
