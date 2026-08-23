-- =============================================================================
-- NovaMart — 0009 Catalog: categories, brands, attributes, products, variants,
--                  SKUs, media, specifications, seller listings
--
-- The five concepts are kept strictly separate (DOMAIN_MODEL §1):
--   Product (identity) → Variant (attribute combination) → SKU (stock unit)
--   Listing (a seller's offer on a SKU) → Inventory (quantity at a location)
-- catalog.products deliberately has NO price column.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- catalog.categories — fully dynamic tree (brief §21)
-- -----------------------------------------------------------------------------
create table catalog.categories (
  id             uuid primary key default extensions.gen_random_uuid(),
  parent_id      uuid        references catalog.categories (id) on delete restrict,
  code           text        not null unique
                   constraint categories_code_shape check (code ~ '^[A-Z][A-Z0-9_]*$'),
  name           text        not null check (length(trim(name)) between 2 and 120),
  name_hi        text,
  slug           public.url_slug not null,
  -- Materialised path of slugs for URLs and breadcrumbs: 'electronics/phones/smartphones'.
  path           text        not null,
  level          smallint    not null default 0 check (level between 0 and 6),
  -- Products may only be attached to leaf categories; maintained by trigger.
  is_leaf        boolean     not null default true,

  description    text,
  image_url      text,
  icon_url       text,
  banner_url     text,
  display_order  smallint    not null default 100,

  is_active      boolean     not null default true,
  -- Hidden categories still resolve by URL but do not appear in navigation.
  show_in_navigation boolean not null default true,
  show_in_home_grid  boolean not null default false,

  -- SEO (brief §16)
  seo_title       text,
  seo_description text,
  seo_keywords    text[],
  canonical_url   text,

  -- When a category is merged away, requests redirect here (301) instead of 404.
  merged_into_id  uuid       references catalog.categories (id) on delete set null,
  merged_at       timestamptz,

  created_by     uuid        references identity.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint categories_no_self_parent check (parent_id is distinct from id),
  constraint categories_root_level check ((parent_id is null) = (level = 0)),
  constraint categories_merge_target_differs check (merged_into_id is distinct from id),
  unique (parent_id, slug)
);

comment on table catalog.categories is
  'Category tree. Admin-managed: create, rename, reorder, disable, merge. No hardcoded categories anywhere.';
comment on column catalog.categories.path is
  'Slash-joined slug path used for SEO URLs and breadcrumbs. Maintained by trigger.';

create unique index categories_path_idx on catalog.categories (path);
create index categories_parent_idx      on catalog.categories (parent_id, display_order) where is_active;
create index categories_leaf_idx        on catalog.categories (id) where is_leaf and is_active;
create index categories_navigation_idx  on catalog.categories (parent_id, display_order)
  where is_active and show_in_navigation;
create index categories_name_trgm_idx   on catalog.categories using gin (name extensions.gin_trgm_ops);

create trigger categories_set_updated_at
  before update on catalog.categories
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- catalog.category_closure — transitive ancestry.
-- Makes "all products under Electronics" a single indexed join instead of a
-- recursive query on every request.
-- -----------------------------------------------------------------------------
create table catalog.category_closure (
  ancestor_id   uuid     not null references catalog.categories (id) on delete cascade,
  descendant_id uuid     not null references catalog.categories (id) on delete cascade,
  depth         smallint not null check (depth >= 0),
  primary key (ancestor_id, descendant_id)
);

create index category_closure_descendant_idx on catalog.category_closure (descendant_id, depth);

comment on table catalog.category_closure is
  'Closure table: one row per (ancestor, descendant, distance), including self at depth 0.';

-- Maintains path, level, closure rows and the parent''s is_leaf flag. Also rejects
-- cycles, which a self-referencing tree otherwise permits.
create or replace function catalog.maintain_category_tree()
returns trigger
language plpgsql
set search_path = catalog, private, pg_catalog
as $$
declare
  v_parent_path  text;
  v_parent_level smallint;
begin
  if tg_op = 'UPDATE' and new.parent_id is not null then
    -- A node cannot be moved beneath its own descendant.
    if exists (
      select 1 from catalog.category_closure
       where ancestor_id = new.id and descendant_id = new.parent_id
    ) then
      raise exception 'Moving category % under % would create a cycle', new.code, new.parent_id
        using errcode = 'check_violation';
    end if;
  end if;

  if new.parent_id is null then
    new.level := 0;
    new.path  := new.slug;
  else
    select path, level into v_parent_path, v_parent_level
      from catalog.categories where id = new.parent_id;

    if v_parent_path is null then
      raise exception 'Parent category % does not exist', new.parent_id
        using errcode = 'foreign_key_violation';
    end if;

    new.level := v_parent_level + 1;
    new.path  := v_parent_path || '/' || new.slug;
  end if;

  return new;
end;
$$;

create trigger categories_maintain_tree
  before insert or update of parent_id, slug on catalog.categories
  for each row execute function catalog.maintain_category_tree();

-- Recomputes path and level for an entire subtree. Called after a node is moved or
-- its slug changes, so descendant URLs never drift out of sync with the tree.
create or replace function catalog.rebuild_subtree_paths(p_root_id uuid)
returns void
language plpgsql
set search_path = catalog, pg_catalog
as $$
begin
  with recursive tree as (
    -- The root's own path was already recomputed by the BEFORE trigger.
    select c.id, c.path, c.level
      from catalog.categories c
     where c.id = p_root_id
    union all
    select child.id, t.path || '/' || child.slug, (t.level + 1)::smallint
      from catalog.categories child
      join tree t on child.parent_id = t.id
  )
  update catalog.categories c
     set path = t.path,
         level = t.level
    from tree t
   where c.id = t.id
     and (c.path is distinct from t.path or c.level is distinct from t.level);
end;
$$;

-- Closure maintenance and descendant path repair run after the row is written.
create or replace function catalog.sync_category_closure()
returns trigger
language plpgsql
set search_path = catalog, pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    -- Self reference plus every ancestor of the parent, one level deeper.
    insert into catalog.category_closure (ancestor_id, descendant_id, depth)
    values (new.id, new.id, 0);

    if new.parent_id is not null then
      insert into catalog.category_closure (ancestor_id, descendant_id, depth)
      select c.ancestor_id, new.id, c.depth + 1
        from catalog.category_closure c
       where c.descendant_id = new.parent_id
      on conflict do nothing;

      -- The parent now has a child.
      update catalog.categories set is_leaf = false
       where id = new.parent_id and is_leaf;
    end if;

  elsif tg_op = 'UPDATE' and new.parent_id is distinct from old.parent_id then
    -- Detach the moved subtree from its former ancestors.
    delete from catalog.category_closure
     where descendant_id in (select descendant_id from catalog.category_closure where ancestor_id = new.id)
       and ancestor_id not in (select descendant_id from catalog.category_closure where ancestor_id = new.id);

    -- Reattach beneath the new parent.
    if new.parent_id is not null then
      insert into catalog.category_closure (ancestor_id, descendant_id, depth)
      select p.ancestor_id, d.descendant_id, p.depth + d.depth + 1
        from catalog.category_closure p
        cross join catalog.category_closure d
       where p.descendant_id = new.parent_id
         and d.ancestor_id = new.id
      on conflict do nothing;

      update catalog.categories set is_leaf = false where id = new.parent_id and is_leaf;
    end if;

    -- The old parent may have become a leaf again.
    if old.parent_id is not null then
      update catalog.categories c set is_leaf = true
       where c.id = old.parent_id
         and not exists (select 1 from catalog.categories x where x.parent_id = c.id);
    end if;

    -- Descendant URLs must follow the move.
    perform catalog.rebuild_subtree_paths(new.id);

  elsif tg_op = 'UPDATE' and new.slug is distinct from old.slug then
    -- Same parent, new slug: only the paths below this node change.
    perform catalog.rebuild_subtree_paths(new.id);
  end if;

  return null;
end;
$$;

create trigger categories_sync_closure
  after insert or update of parent_id, slug on catalog.categories
  for each row execute function catalog.sync_category_closure();

-- -----------------------------------------------------------------------------
-- catalog.category_policies — per-category commercial and compliance rules.
-- Separate from the taxonomy because policy changes far more often than structure.
-- -----------------------------------------------------------------------------
create table catalog.category_policies (
  category_id             uuid primary key references catalog.categories (id) on delete cascade,

  -- Returns (brief §39). Inherited from the nearest ancestor with a policy if absent.
  return_window_days      smallint    check (return_window_days between 0 and 90),
  return_type             text        check (return_type in ('REFUND_ONLY', 'REPLACEMENT_ONLY',
                                                              'REFUND_OR_REPLACEMENT', 'NON_RETURNABLE')),
  replacement_window_days smallint    check (replacement_window_days between 0 and 90),
  -- Some categories only allow returns for damaged/wrong items, not change of mind.
  return_reasons_allowed  text[],

  -- Commerce
  default_commission_percentage public.percentage,
  cod_allowed             boolean     not null default true,
  cod_limit_paise         public.paise,
  -- Categories where NovaMart requires QC before restocking a return.
  requires_return_qc      boolean     not null default true,

  -- Tax defaults; a product may override with its own HSN/rate.
  default_hsn_code        public.hsn_code,
  default_gst_rate        public.percentage,

  -- Compliance
  is_restricted           boolean     not null default false,
  requires_brand_authorisation boolean not null default false,
  -- Document types a seller must have verified to list in this category.
  required_seller_documents text[]    not null default '{}',
  minimum_buyer_age       smallint    check (minimum_buyer_age is null or minimum_buyer_age between 1 and 25),
  is_hazmat               boolean     not null default false,
  is_fragile              boolean     not null default false,

  -- Listing quality gates
  min_images              smallint    not null default 3 check (min_images between 1 and 12),
  requires_moderation     boolean     not null default true,
  max_title_length        smallint    not null default 150,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint category_policies_return_window_consistent
    check (return_type is distinct from 'NON_RETURNABLE' or coalesce(return_window_days, 0) = 0)
);

comment on table catalog.category_policies is
  'Per-category commercial and compliance policy. Resolved with ancestor inheritance at read time.';

create trigger category_policies_set_updated_at
  before update on catalog.category_policies
  for each row execute function private.set_updated_at();

-- Resolves a policy by walking up the closure to the nearest ancestor that defines
-- the field. Categories inherit rather than duplicate.
create or replace function catalog.resolve_category_policy(p_category_id uuid)
returns table (
  return_window_days            smallint,
  return_type                   text,
  replacement_window_days       smallint,
  default_commission_percentage public.percentage,
  cod_allowed                   boolean,
  cod_limit_paise               public.paise,
  default_hsn_code              public.hsn_code,
  default_gst_rate              public.percentage,
  requires_return_qc            boolean,
  is_restricted                 boolean,
  minimum_buyer_age             smallint
)
language sql
stable
set search_path = catalog, pg_catalog
as $$
  with lineage as (
    select cp.*, cc.depth
      from catalog.category_closure cc
      join catalog.category_policies cp on cp.category_id = cc.ancestor_id
     where cc.descendant_id = p_category_id
  )
  select
    (select l.return_window_days            from lineage l where l.return_window_days            is not null order by l.depth limit 1),
    (select l.return_type                   from lineage l where l.return_type                   is not null order by l.depth limit 1),
    (select l.replacement_window_days       from lineage l where l.replacement_window_days       is not null order by l.depth limit 1),
    (select l.default_commission_percentage from lineage l where l.default_commission_percentage is not null order by l.depth limit 1),
    coalesce((select l.cod_allowed from lineage l order by l.depth limit 1), true),
    (select l.cod_limit_paise               from lineage l where l.cod_limit_paise               is not null order by l.depth limit 1),
    (select l.default_hsn_code              from lineage l where l.default_hsn_code              is not null order by l.depth limit 1),
    (select l.default_gst_rate              from lineage l where l.default_gst_rate              is not null order by l.depth limit 1),
    coalesce((select l.requires_return_qc from lineage l order by l.depth limit 1), true),
    coalesce((select l.is_restricted      from lineage l order by l.depth limit 1), false),
    (select l.minimum_buyer_age             from lineage l where l.minimum_buyer_age             is not null order by l.depth limit 1);
$$;

-- -----------------------------------------------------------------------------
-- catalog.brands
-- -----------------------------------------------------------------------------
create table catalog.brands (
  id              uuid primary key default extensions.gen_random_uuid(),
  name            text        not null check (length(trim(name)) between 1 and 120),
  slug            public.url_slug not null unique,
  logo_url        text,
  description     text,
  -- Brands requiring authorisation letters before a seller may list.
  is_authorised_only boolean  not null default false,
  brand_owner_seller_id uuid  references seller.sellers (id) on delete set null,
  country_of_origin text,
  website_url     text,
  is_active       boolean     not null default true,
  display_order   smallint    not null default 100,
  is_featured     boolean     not null default false,
  seo_title       text,
  seo_description text,
  product_count   integer     not null default 0 check (product_count >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index brands_name_unique_idx on catalog.brands (lower(name));
create index brands_active_idx   on catalog.brands (display_order) where is_active;
create index brands_featured_idx on catalog.brands (display_order) where is_active and is_featured;
create index brands_name_trgm_idx on catalog.brands using gin (name extensions.gin_trgm_ops);

create trigger brands_set_updated_at
  before update on catalog.brands
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- catalog.attribute_definitions — dynamic attributes (brief §22)
-- No schema change is ever needed to support a new category's attributes.
-- -----------------------------------------------------------------------------
create table catalog.attribute_definitions (
  id             uuid primary key default extensions.gen_random_uuid(),
  code           text        not null unique
                   constraint attribute_code_shape check (code ~ '^[a-z][a-z0-9_]*$'),
  name           text        not null,
  name_hi        text,
  description    text,
  data_type      text        not null
                   check (data_type in ('TEXT', 'NUMBER', 'INTEGER', 'BOOLEAN', 'ENUM',
                                         'MULTI_ENUM', 'DATE', 'DIMENSION', 'COLOR')),
  -- Unit for NUMBER/DIMENSION attributes: 'GB', 'mAh', 'inch', 'g'.
  unit           text,
  -- Rendering hint for the seller form and the filter sidebar.
  input_type     text        not null default 'TEXT'
                   check (input_type in ('TEXT', 'TEXTAREA', 'NUMBER', 'SELECT', 'MULTI_SELECT',
                                          'RADIO', 'CHECKBOX', 'SWATCH', 'DATE', 'RANGE')),
  -- Defaults; a category binding may override each of these.
  is_variant_defining boolean not null default false,
  is_filterable  boolean     not null default false,
  is_searchable  boolean     not null default false,
  is_comparable  boolean     not null default false,
  -- Grouping in the PDP specification table: 'Display', 'Battery', 'Camera'.
  display_group  text,
  display_order  smallint    not null default 100,
  -- Validation applied to seller-entered values (min/max/pattern/step).
  validation     jsonb       not null default '{}'::jsonb,
  is_active      boolean     not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint attribute_unit_only_numeric
    check (unit is null or data_type in ('NUMBER', 'INTEGER', 'DIMENSION'))
);

comment on table catalog.attribute_definitions is
  'Attribute catalogue. Adding an attribute never requires a database column (brief §22).';

create index attribute_definitions_filterable_idx on catalog.attribute_definitions (code) where is_filterable and is_active;
create index attribute_definitions_group_idx      on catalog.attribute_definitions (display_group, display_order);

create trigger attribute_definitions_set_updated_at
  before update on catalog.attribute_definitions
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- catalog.attribute_options — allowed values for ENUM/MULTI_ENUM/COLOR attributes
-- -----------------------------------------------------------------------------
create table catalog.attribute_options (
  id            uuid primary key default extensions.gen_random_uuid(),
  attribute_id  uuid        not null references catalog.attribute_definitions (id) on delete cascade,
  value         text        not null,
  label         text        not null,
  label_hi      text,
  -- Colour swatch or texture image for SWATCH inputs.
  swatch_hex    text        check (swatch_hex is null or swatch_hex ~ '^#[0-9A-Fa-f]{6}$'),
  swatch_image_url text,
  -- Sort key for size-like attributes where alphabetical order is wrong (S < M < L).
  display_order smallint    not null default 100,
  -- Numeric equivalent for range filtering on enum-stored numbers ('128 GB' → 128).
  numeric_value numeric(14, 4),
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now(),
  unique (attribute_id, value)
);

create index attribute_options_attribute_idx on catalog.attribute_options (attribute_id, display_order)
  where is_active;

-- -----------------------------------------------------------------------------
-- catalog.category_attributes — binds attributes to categories with per-category
-- requirements. This is what makes "phones have RAM, shoes have size" data, not code.
-- -----------------------------------------------------------------------------
create table catalog.category_attributes (
  id                  uuid primary key default extensions.gen_random_uuid(),
  category_id         uuid        not null references catalog.categories (id) on delete cascade,
  attribute_id        uuid        not null references catalog.attribute_definitions (id) on delete restrict,
  is_required         boolean     not null default false,
  -- Overrides the attribute default for this category.
  is_variant_defining boolean     not null default false,
  is_filterable       boolean     not null default true,
  is_key_specification boolean    not null default false,
  display_order       smallint    not null default 100,
  help_text           text,
  -- Restricts the allowed options for this category (e.g. only clothing sizes).
  allowed_option_ids  uuid[],
  default_value       text,
  created_at          timestamptz not null default now(),
  unique (category_id, attribute_id)
);

comment on column catalog.category_attributes.is_variant_defining is
  'When true, this attribute participates in variant identity for products in this category.';

create index category_attributes_category_idx on catalog.category_attributes (category_id, display_order);
create index category_attributes_variant_idx  on catalog.category_attributes (category_id)
  where is_variant_defining;
create index category_attributes_filter_idx   on catalog.category_attributes (category_id)
  where is_filterable;

-- -----------------------------------------------------------------------------
-- catalog.products — seller-agnostic product identity. NO PRICE HERE.
-- -----------------------------------------------------------------------------
create table catalog.products (
  id                uuid primary key default extensions.gen_random_uuid(),
  category_id       uuid        not null references catalog.categories (id) on delete restrict,
  brand_id          uuid        references catalog.brands (id) on delete restrict,

  title             text        not null check (length(trim(title)) between 5 and 300),
  slug              public.url_slug not null,
  -- Stable public identifier used in URLs and deep links: /product/{slug}/p/{public_id}
  public_id         text        not null unique,
  subtitle          text,
  description       text,
  -- Bullet highlights shown above the fold on the PDP.
  highlights        text[]      not null default '{}',
  -- Free-text terms fed into the search index (misspellings, colloquial names).
  search_keywords   text[]      not null default '{}',

  -- Tax classification. Falls back to the category default when null.
  hsn_code          public.hsn_code,
  gst_rate          public.percentage,

  -- Legal Metrology (Packaged Commodities) Rules require these on Indian listings.
  country_of_origin text        not null default 'India',
  manufacturer_name text,
  manufacturer_address text,
  packer_name       text,
  packer_address    text,
  importer_name     text,
  importer_address  text,
  net_quantity      text,
  -- Generic name as required for packaged commodities.
  generic_name      text,

  warranty_type     text        check (warranty_type in ('MANUFACTURER', 'SELLER', 'NONE')),
  warranty_period_months smallint check (warranty_period_months is null or warranty_period_months between 0 and 240),
  warranty_summary  text,

  status            text        not null default 'DRAFT'
                      check (status in ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'INACTIVE',
                                        'REJECTED', 'BLOCKED', 'ARCHIVED')),
  status_reason     text,
  -- Moderation is separate from status: an ACTIVE product can be re-flagged.
  moderation_status text        not null default 'PENDING'
                      check (moderation_status in ('PENDING', 'APPROVED', 'REJECTED', 'FLAGGED')),
  moderated_by      uuid        references identity.profiles (id) on delete set null,
  moderated_at      timestamptz,
  moderation_notes  text,

  -- Denormalised popularity signals maintained by the analytics worker. Feed the
  -- search ranking and "trending" modules.
  view_count_30d    integer     not null default 0 check (view_count_30d >= 0),
  order_count_30d   integer     not null default 0 check (order_count_30d >= 0),
  popularity_score  numeric(10, 4) not null default 0,

  seo_title         text,
  seo_description   text,
  canonical_url     text,

  -- The seller who submitted the product (catalog is shared, authorship is not).
  created_by_seller_id uuid     references seller.sellers (id) on delete set null,
  created_by        uuid        references identity.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  archived_at       timestamptz,

  constraint products_status_reason_present
    check (status not in ('REJECTED', 'BLOCKED') or status_reason is not null),
  constraint products_active_requires_approval
    check (status <> 'ACTIVE' or moderation_status = 'APPROVED')
);

comment on table catalog.products is
  'Seller-agnostic product identity. Prices live on seller listings; stock lives on SKUs at warehouses.';
comment on constraint products_active_requires_approval on catalog.products is
  'A product cannot be ACTIVE without passing moderation. Enforced in the database, not just the UI.';

create unique index products_slug_idx on catalog.products (slug);
create index products_category_idx    on catalog.products (category_id) where status = 'ACTIVE';
create index products_brand_idx       on catalog.products (brand_id) where status = 'ACTIVE';
create index products_status_idx      on catalog.products (status);
create index products_moderation_queue_idx on catalog.products (created_at)
  where moderation_status in ('PENDING', 'FLAGGED');
create index products_popularity_idx  on catalog.products (popularity_score desc) where status = 'ACTIVE';
create index products_seller_idx      on catalog.products (created_by_seller_id);
create index products_title_trgm_idx  on catalog.products using gin (title extensions.gin_trgm_ops);
create index products_updated_idx     on catalog.products (updated_at desc);

create trigger products_set_updated_at
  before update on catalog.products
  for each row execute function private.set_updated_at();

-- Products may only be attached to leaf categories: a product in both "Electronics"
-- and "Electronics > Phones" makes navigation and filtering incoherent.
create or replace function catalog.assert_leaf_category()
returns trigger
language plpgsql
set search_path = catalog, pg_catalog
as $$
declare
  v_is_leaf boolean;
  v_active  boolean;
  v_code    text;
begin
  select is_leaf, is_active, code into v_is_leaf, v_active, v_code
    from catalog.categories where id = new.category_id;

  if v_is_leaf is null then
    raise exception 'Category % does not exist', new.category_id using errcode = 'foreign_key_violation';
  end if;

  if not v_is_leaf then
    raise exception 'Category % has subcategories; products must be attached to a leaf category', v_code
      using errcode = 'check_violation';
  end if;

  if not v_active and new.status = 'ACTIVE' then
    raise exception 'Category % is inactive and cannot hold active products', v_code
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger products_assert_leaf_category
  before insert or update of category_id, status on catalog.products
  for each row execute function catalog.assert_leaf_category();

-- Public id and slug generation.
create or replace function catalog.assign_product_identifiers()
returns trigger
language plpgsql
set search_path = catalog, private, extensions, pg_catalog
as $$
declare
  v_base text;
  v_slug text;
  v_n    int := 0;
begin
  if new.public_id is null then
    -- 10 uppercase base32-ish characters, unambiguous and URL-safe.
    new.public_id := upper(translate(encode(extensions.gen_random_bytes(7), 'base64'), '+/=IOl', 'XY0123'));
    new.public_id := substr(new.public_id, 1, 10);
  end if;

  if new.slug is null then
    v_base := private.slugify(new.title);
    v_base := substr(v_base, 1, 140);
    v_slug := v_base;
    -- Titles legitimately collide across brands; disambiguate deterministically.
    while exists (select 1 from catalog.products p where p.slug = v_slug and p.id is distinct from new.id) loop
      v_n := v_n + 1;
      v_slug := v_base || '-' || v_n;
    end loop;
    new.slug := v_slug;
  end if;

  return new;
end;
$$;

create trigger products_assign_identifiers
  before insert on catalog.products
  for each row execute function catalog.assign_product_identifiers();

-- -----------------------------------------------------------------------------
-- catalog.product_variants — one row per variant-defining attribute combination
-- -----------------------------------------------------------------------------
create table catalog.product_variants (
  id             uuid primary key default extensions.gen_random_uuid(),
  product_id     uuid        not null references catalog.products (id) on delete cascade,
  -- Human label derived from variant attributes: '256 GB, Black Titanium'.
  variant_label  text        not null,
  -- Deterministic fingerprint of the variant attribute values. Prevents duplicate
  -- variants that differ only in attribute ordering.
  attribute_signature text   not null,
  display_order  smallint    not null default 100,
  is_default     boolean     not null default false,
  status         text        not null default 'ACTIVE'
                   check (status in ('ACTIVE', 'INACTIVE', 'DISCONTINUED')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (product_id, attribute_signature)
);

create index product_variants_product_idx on catalog.product_variants (product_id, display_order);
create unique index product_variants_default_idx on catalog.product_variants (product_id)
  where is_default;

create trigger product_variants_set_updated_at
  before update on catalog.product_variants
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- catalog.skus — the stock-keeping unit. Inventory counts THIS.
-- -----------------------------------------------------------------------------
create table catalog.skus (
  id                 uuid primary key default extensions.gen_random_uuid(),
  variant_id         uuid        not null references catalog.product_variants (id) on delete cascade,
  -- Denormalised for the extremely common "SKU → product" lookup on hot paths.
  product_id         uuid        not null references catalog.products (id) on delete cascade,
  sku_code           text        not null unique
                       constraint sku_code_shape check (sku_code ~ '^[A-Z0-9][A-Z0-9-]{2,63}$'),

  -- Trade identifiers. EAN-13/UPC-A where the manufacturer provides one.
  barcode_type       text        check (barcode_type in ('EAN_13', 'UPC_A', 'ISBN_13', 'GTIN_14', 'INTERNAL')),
  barcode            text,

  -- Shipping dimensions. Couriers charge on max(actual, volumetric) weight, so
  -- both are needed and volumetric is derived.
  weight_grams       integer     check (weight_grams is null or weight_grams between 1 and 200000),
  length_mm          integer     check (length_mm is null or length_mm between 1 and 3000),
  width_mm           integer     check (width_mm  is null or width_mm  between 1 and 3000),
  height_mm          integer     check (height_mm is null or height_mm between 1 and 3000),
  -- Volumetric weight in grams at the standard 5000 divisor (cm³/5000 kg).
  volumetric_weight_grams integer generated always as (
    case when length_mm is not null and width_mm is not null and height_mm is not null
         then ((length_mm::numeric / 10) * (width_mm::numeric / 10) * (height_mm::numeric / 10) / 5000 * 1000)::integer
    end
  ) stored,

  -- Reference MRP from the catalog team. The legally printed MRP per batch is
  -- declared by the seller on the listing.
  reference_mrp_paise public.paise check (reference_mrp_paise is null or reference_mrp_paise > 0),

  -- Handling attributes that affect packing and courier eligibility.
  is_fragile         boolean     not null default false,
  is_hazmat          boolean     not null default false,
  is_liquid          boolean     not null default false,
  requires_serial_tracking boolean not null default false,
  shelf_life_days    smallint,

  status             text        not null default 'ACTIVE'
                       check (status in ('ACTIVE', 'INACTIVE', 'DISCONTINUED')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table catalog.skus is
  'Stock-keeping unit. inventory.warehouse_inventory counts SKUs; listings offer them.';
comment on column catalog.skus.volumetric_weight_grams is
  'Derived volumetric weight (divisor 5000). Courier billing uses max(actual, volumetric).';

create index skus_variant_idx  on catalog.skus (variant_id);
create index skus_product_idx  on catalog.skus (product_id) where status = 'ACTIVE';
create unique index skus_barcode_idx on catalog.skus (barcode)
  where barcode is not null and barcode_type <> 'INTERNAL';

create trigger skus_set_updated_at
  before update on catalog.skus
  for each row execute function private.set_updated_at();

-- Keep the denormalised product_id honest.
create or replace function catalog.sync_sku_product()
returns trigger
language plpgsql
set search_path = catalog, pg_catalog
as $$
declare
  v_product_id uuid;
begin
  select product_id into v_product_id from catalog.product_variants where id = new.variant_id;

  if v_product_id is null then
    raise exception 'Variant % does not exist', new.variant_id using errcode = 'foreign_key_violation';
  end if;

  new.product_id := v_product_id;
  return new;
end;
$$;

create trigger skus_sync_product
  before insert or update of variant_id on catalog.skus
  for each row execute function catalog.sync_sku_product();

-- -----------------------------------------------------------------------------
-- catalog.product_media
-- -----------------------------------------------------------------------------
create table catalog.product_media (
  id             uuid primary key default extensions.gen_random_uuid(),
  product_id     uuid        not null references catalog.products (id) on delete cascade,
  -- Variant-specific imagery (colour shots). NULL means it applies to the product.
  variant_id     uuid        references catalog.product_variants (id) on delete cascade,
  media_type     text        not null default 'IMAGE'
                   check (media_type in ('IMAGE', 'VIDEO', 'VIEW_360', 'DOCUMENT')),
  storage_bucket text        not null default 'products-public'
                   check (storage_bucket = 'products-public'),
  storage_path   text        not null,
  -- Absolute CDN URL, materialised so read paths never build URLs.
  public_url     text        not null,
  alt_text       text,
  -- Intrinsic dimensions let the client reserve space and avoid layout shift.
  width_px       integer     check (width_px  is null or width_px  between 1 and 10000),
  height_px      integer     check (height_px is null or height_px between 1 and 10000),
  file_size_bytes integer    check (file_size_bytes is null or file_size_bytes between 1 and 26214400),
  mime_type      text        not null,
  -- Compact placeholder for progressive loading (brief §75).
  blurhash       text,
  duration_seconds integer   check (duration_seconds is null or duration_seconds between 1 and 600),
  display_order  smallint    not null default 100,
  is_primary     boolean     not null default false,
  moderation_status text     not null default 'PENDING'
                   check (moderation_status in ('PENDING', 'APPROVED', 'REJECTED')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint product_media_mime_allowed check (
    (media_type = 'IMAGE'    and mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif'))
    or (media_type = 'VIDEO' and mime_type in ('video/mp4', 'video/webm'))
    or (media_type in ('VIEW_360', 'DOCUMENT'))
  ),
  constraint product_media_video_needs_duration
    check (media_type <> 'VIDEO' or duration_seconds is not null)
);

create unique index product_media_primary_idx on catalog.product_media (product_id)
  where is_primary and variant_id is null;
create index product_media_product_idx on catalog.product_media (product_id, display_order);
create index product_media_variant_idx on catalog.product_media (variant_id, display_order)
  where variant_id is not null;
create index product_media_moderation_idx on catalog.product_media (created_at)
  where moderation_status = 'PENDING';

create trigger product_media_set_updated_at
  before update on catalog.product_media
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- catalog.product_attribute_values — typed values for product-level attributes.
-- Typed columns rather than a single jsonb blob, so range filters and facets can
-- use real indexes.
-- -----------------------------------------------------------------------------
create table catalog.product_attribute_values (
  id             uuid primary key default extensions.gen_random_uuid(),
  product_id     uuid        not null references catalog.products (id) on delete cascade,
  attribute_id   uuid        not null references catalog.attribute_definitions (id) on delete restrict,
  value_text     text,
  value_number   numeric(18, 6),
  value_boolean  boolean,
  value_date     date,
  option_id      uuid        references catalog.attribute_options (id) on delete restrict,
  -- MULTI_ENUM values.
  option_ids     uuid[],
  unit           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (product_id, attribute_id),

  constraint product_attribute_one_value check (
    (value_text    is not null)::int
  + (value_number  is not null)::int
  + (value_boolean is not null)::int
  + (value_date    is not null)::int
  + (option_id     is not null)::int
  + (option_ids    is not null)::int = 1
  )
);

comment on constraint product_attribute_one_value on catalog.product_attribute_values is
  'Exactly one typed value column must be populated, matching the attribute data type.';

create index product_attribute_values_product_idx   on catalog.product_attribute_values (product_id);
create index product_attribute_values_attribute_idx on catalog.product_attribute_values (attribute_id, option_id)
  where option_id is not null;
create index product_attribute_values_number_idx    on catalog.product_attribute_values (attribute_id, value_number)
  where value_number is not null;
create index product_attribute_values_options_gin   on catalog.product_attribute_values using gin (option_ids)
  where option_ids is not null;

create trigger product_attribute_values_set_updated_at
  before update on catalog.product_attribute_values
  for each row execute function private.set_updated_at();

-- Validates the value against the attribute's declared data type. Without this,
-- a NUMBER attribute quietly accumulates text values and facets break.
create or replace function catalog.validate_attribute_value()
returns trigger
language plpgsql
set search_path = catalog, pg_catalog
as $$
declare
  v_type text;
  v_code text;
begin
  select data_type, code into v_type, v_code
    from catalog.attribute_definitions where id = new.attribute_id;

  if v_type is null then
    raise exception 'Attribute % does not exist', new.attribute_id using errcode = 'foreign_key_violation';
  end if;

  case v_type
    when 'TEXT' then
      if new.value_text is null then
        raise exception 'Attribute % expects value_text', v_code using errcode = 'check_violation';
      end if;
    when 'NUMBER', 'INTEGER', 'DIMENSION' then
      if new.value_number is null then
        raise exception 'Attribute % expects value_number', v_code using errcode = 'check_violation';
      end if;
      if v_type = 'INTEGER' and new.value_number <> trunc(new.value_number) then
        raise exception 'Attribute % expects an integer value', v_code using errcode = 'check_violation';
      end if;
    when 'BOOLEAN' then
      if new.value_boolean is null then
        raise exception 'Attribute % expects value_boolean', v_code using errcode = 'check_violation';
      end if;
    when 'DATE' then
      if new.value_date is null then
        raise exception 'Attribute % expects value_date', v_code using errcode = 'check_violation';
      end if;
    when 'ENUM', 'COLOR' then
      if new.option_id is null then
        raise exception 'Attribute % expects option_id', v_code using errcode = 'check_violation';
      end if;
      if not exists (select 1 from catalog.attribute_options o
                      where o.id = new.option_id and o.attribute_id = new.attribute_id) then
        raise exception 'Option % does not belong to attribute %', new.option_id, v_code
          using errcode = 'check_violation';
      end if;
    when 'MULTI_ENUM' then
      if new.option_ids is null or array_length(new.option_ids, 1) is null then
        raise exception 'Attribute % expects option_ids', v_code using errcode = 'check_violation';
      end if;
      if exists (
        select 1 from unnest(new.option_ids) as oid
         where not exists (select 1 from catalog.attribute_options o
                            where o.id = oid and o.attribute_id = new.attribute_id)
      ) then
        raise exception 'One or more options do not belong to attribute %', v_code
          using errcode = 'check_violation';
      end if;
    else
      raise exception 'Unhandled attribute data type %', v_type using errcode = 'check_violation';
  end case;

  return new;
end;
$$;

create trigger product_attribute_values_validate
  before insert or update on catalog.product_attribute_values
  for each row execute function catalog.validate_attribute_value();

-- -----------------------------------------------------------------------------
-- catalog.variant_attribute_values — the attribute values that DEFINE a variant
-- -----------------------------------------------------------------------------
create table catalog.variant_attribute_values (
  id            uuid primary key default extensions.gen_random_uuid(),
  variant_id    uuid        not null references catalog.product_variants (id) on delete cascade,
  attribute_id  uuid        not null references catalog.attribute_definitions (id) on delete restrict,
  option_id     uuid        references catalog.attribute_options (id) on delete restrict,
  value_text    text,
  value_number  numeric(18, 6),
  created_at    timestamptz not null default now(),
  unique (variant_id, attribute_id),
  constraint variant_attribute_one_value check (
    (option_id is not null)::int + (value_text is not null)::int + (value_number is not null)::int = 1
  )
);

create index variant_attribute_values_variant_idx   on catalog.variant_attribute_values (variant_id);
create index variant_attribute_values_attribute_idx on catalog.variant_attribute_values (attribute_id, option_id);

-- -----------------------------------------------------------------------------
-- catalog.product_specifications — presentational spec sheet.
-- Distinct from attributes: attributes are queryable facets, specifications are
-- free-form marketing copy that must not pollute the filter index.
-- -----------------------------------------------------------------------------
create table catalog.product_specifications (
  id            uuid primary key default extensions.gen_random_uuid(),
  product_id    uuid        not null references catalog.products (id) on delete cascade,
  group_name    text        not null default 'General',
  label         text        not null,
  value         text        not null,
  display_order smallint    not null default 100,
  created_at    timestamptz not null default now(),
  unique (product_id, group_name, label)
);

create index product_specifications_product_idx
  on catalog.product_specifications (product_id, group_name, display_order);

-- -----------------------------------------------------------------------------
-- catalog.seller_listings — a seller's offer on a SKU.
-- UNIQUE (seller_id, sku_id) is the constraint that keeps the catalog and the
-- offer layer from collapsing into each other.
-- -----------------------------------------------------------------------------
create table catalog.seller_listings (
  id                  uuid primary key default extensions.gen_random_uuid(),
  seller_id           uuid        not null references seller.sellers (id) on delete restrict,
  sku_id              uuid        not null references catalog.skus (id) on delete restrict,
  -- Denormalised for hot-path filtering without a join to skus.
  product_id          uuid        not null references catalog.products (id) on delete restrict,

  -- Seller's own SKU reference, shown in their reports and bulk files.
  seller_sku_code     text,

  condition           text        not null default 'NEW'
                        check (condition in ('NEW', 'REFURBISHED_EXCELLENT', 'REFURBISHED_GOOD',
                                              'OPEN_BOX', 'USED_LIKE_NEW', 'USED_GOOD')),
  fulfillment_model   text        not null default 'SELLER_FULFILLED'
                        check (fulfillment_model in ('SELLER_FULFILLED', 'NOVAMART_FULFILLED',
                                                      'WAREHOUSE_FULFILLED', 'DROPSHIP')),

  -- Legally printed MRP for this seller's stock. Per-listing because different
  -- batches carry different printed MRPs.
  declared_mrp_paise  public.paise not null check (declared_mrp_paise > 0),

  status              text        not null default 'DRAFT'
                        check (status in ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'INACTIVE',
                                          'OUT_OF_STOCK', 'SUPPRESSED', 'BLOCKED', 'ARCHIVED')),
  status_reason       text,
  -- Suppression is platform-initiated (policy/quality); INACTIVE is seller-initiated.
  suppressed_reason   text        check (suppressed_reason in ('PRICE_ERROR', 'POLICY_VIOLATION',
                                                               'QUALITY_COMPLAINTS', 'COUNTERFEIT_SUSPECTED',
                                                               'MISSING_DOCUMENTS', 'HIGH_CANCELLATION')),

  -- Order quantity guards.
  min_order_quantity  smallint    not null default 1 check (min_order_quantity >= 1),
  max_order_quantity  smallint    not null default 10 check (max_order_quantity >= 1),

  -- Dispatch commitment for this listing, overriding the seller default.
  handling_time_days  smallint    not null default 1 check (handling_time_days between 0 and 14),

  -- Buy Box participation (brief §29).
  is_buy_box_eligible boolean     not null default true,
  -- Cached Buy Box outcome, recomputed by the pricing/Buy Box worker.
  buy_box_score       numeric(10, 4),
  is_buy_box_winner   boolean     not null default false,

  -- Listing-level policy overrides. NULL inherits category policy.
  return_window_days  smallint    check (return_window_days between 0 and 90),
  cod_allowed         boolean,
  is_replacement_allowed boolean,

  -- Preferred pickup/dispatch warehouse for seller-fulfilled listings.
  default_warehouse_id uuid,

  first_activated_at  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  archived_at         timestamptz,

  unique (seller_id, sku_id),
  constraint seller_listings_quantity_range check (max_order_quantity >= min_order_quantity),
  constraint seller_listings_suppressed_reason
    check (status <> 'SUPPRESSED' or suppressed_reason is not null),
  constraint seller_listings_status_reason
    check (status not in ('BLOCKED', 'INACTIVE') or status_reason is not null)
);

comment on table catalog.seller_listings is
  'A seller''s offer on a SKU. UNIQUE (seller_id, sku_id) keeps catalog and offers separate.';
comment on column catalog.seller_listings.declared_mrp_paise is
  'MRP printed on this seller''s packaging. Per-listing: batches differ, and the discount shown must be truthful.';

create index seller_listings_seller_idx   on catalog.seller_listings (seller_id, status);
create index seller_listings_sku_idx      on catalog.seller_listings (sku_id) where status = 'ACTIVE';
create index seller_listings_product_idx  on catalog.seller_listings (product_id) where status = 'ACTIVE';
create index seller_listings_buybox_idx   on catalog.seller_listings (sku_id, buy_box_score desc)
  where status = 'ACTIVE' and is_buy_box_eligible;
create unique index seller_listings_winner_idx on catalog.seller_listings (sku_id)
  where is_buy_box_winner;
create index seller_listings_suppressed_idx on catalog.seller_listings (seller_id, updated_at desc)
  where status = 'SUPPRESSED';
create index seller_listings_warehouse_idx on catalog.seller_listings (default_warehouse_id)
  where default_warehouse_id is not null;

create trigger seller_listings_set_updated_at
  before update on catalog.seller_listings
  for each row execute function private.set_updated_at();

-- Keep product_id aligned with the SKU, and block activation for sellers who are
-- not approved.
create or replace function catalog.validate_listing()
returns trigger
language plpgsql
set search_path = catalog, seller, pg_catalog
as $$
declare
  v_product_id     uuid;
  v_sku_status     text;
  v_product_status text;
  v_seller_status  text;
begin
  select s.product_id, s.status, p.status
    into v_product_id, v_sku_status, v_product_status
    from catalog.skus s
    join catalog.products p on p.id = s.product_id
   where s.id = new.sku_id;

  if v_product_id is null then
    raise exception 'SKU % does not exist', new.sku_id using errcode = 'foreign_key_violation';
  end if;

  new.product_id := v_product_id;

  if new.status = 'ACTIVE' then
    select status into v_seller_status from seller.sellers where id = new.seller_id;

    if v_seller_status <> 'APPROVED' then
      raise exception 'Seller is % and cannot hold active listings', v_seller_status
        using errcode = 'check_violation';
    end if;

    if v_sku_status <> 'ACTIVE' then
      raise exception 'SKU % is % and cannot be listed', new.sku_id, v_sku_status
        using errcode = 'check_violation';
    end if;

    if v_product_status <> 'ACTIVE' then
      raise exception 'Product is % and cannot be listed', v_product_status
        using errcode = 'check_violation';
    end if;

    if new.first_activated_at is null then
      new.first_activated_at := now();
    end if;
  end if;

  return new;
end;
$$;

create trigger seller_listings_validate
  before insert or update of sku_id, status, seller_id on catalog.seller_listings
  for each row execute function catalog.validate_listing();

-- -----------------------------------------------------------------------------
-- catalog.listing_status_history — append-only
-- -----------------------------------------------------------------------------
create table catalog.listing_status_history (
  id          uuid primary key default private.uuid_generate_v7(),
  listing_id  uuid        not null references catalog.seller_listings (id) on delete cascade,
  from_status text,
  to_status   text        not null,
  reason      text,
  changed_by  uuid        references identity.profiles (id) on delete set null,
  actor_type  text        not null default 'SELLER'
                check (actor_type in ('SELLER', 'STAFF', 'SYSTEM')),
  occurred_at timestamptz not null default now()
);

create index listing_status_history_listing_idx on catalog.listing_status_history (listing_id, occurred_at desc);

create trigger listing_status_history_append_only
  before update or delete on catalog.listing_status_history
  for each row execute function private.prevent_mutation();

create or replace function catalog.record_listing_status_change()
returns trigger
language plpgsql
set search_path = catalog, private, pg_catalog
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into catalog.listing_status_history (listing_id, from_status, to_status, reason, changed_by)
    values (new.id,
            case when tg_op = 'INSERT' then null else old.status end,
            new.status,
            coalesce(new.status_reason, new.suppressed_reason),
            private.current_actor_id());
  end if;
  return null;
end;
$$;

create trigger seller_listings_record_status
  after insert or update of status on catalog.seller_listings
  for each row execute function catalog.record_listing_status_change();

-- -----------------------------------------------------------------------------
-- catalog.product_moderation_events — append-only moderation trail
-- -----------------------------------------------------------------------------
create table catalog.product_moderation_events (
  id            uuid primary key default private.uuid_generate_v7(),
  product_id    uuid        not null references catalog.products (id) on delete cascade,
  action        text        not null
                  check (action in ('SUBMITTED', 'APPROVED', 'REJECTED', 'FLAGGED', 'UNFLAGGED',
                                     'EDIT_REQUESTED', 'BLOCKED', 'UNBLOCKED')),
  -- Which checks failed: images, title, counterfeit suspicion, compliance fields.
  reason_codes  text[]      not null default '{}',
  notes         text,
  -- Snapshot of the fields the moderator objected to, for the seller's correction UI.
  field_feedback jsonb      not null default '{}'::jsonb,
  actor_id      uuid        references identity.profiles (id) on delete set null,
  actor_type    text        not null default 'STAFF'
                  check (actor_type in ('SELLER', 'STAFF', 'SYSTEM')),
  occurred_at   timestamptz not null default now()
);

create index product_moderation_events_product_idx
  on catalog.product_moderation_events (product_id, occurred_at desc);

create trigger product_moderation_events_append_only
  before update or delete on catalog.product_moderation_events
  for each row execute function private.prevent_mutation();
