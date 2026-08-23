-- =============================================================================
-- NovaMart — 0012 Pricing: listing prices, promotions, coupons, bank offers,
--                  flash sales, tax rules, commission rules, Buy Box weights
--
-- Computation order is fixed (brief §27) and every input is configurable at
-- runtime. No commission, tax rate or discount is hardcoded anywhere.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- pricing.listing_prices — current price for a seller listing.
-- One row per listing; history is append-only in listing_price_history.
-- -----------------------------------------------------------------------------
create table pricing.listing_prices (
  listing_id           uuid primary key references catalog.seller_listings (id) on delete cascade,
  seller_id            uuid        not null references seller.sellers (id) on delete cascade,
  sku_id               uuid        not null references catalog.skus (id) on delete cascade,
  currency             public.currency_code not null default 'INR',

  -- MRP as printed on this seller's packaging. Discount claims are computed
  -- against this, so an inflated MRP is a compliance issue.
  mrp_paise            public.paise not null check (mrp_paise > 0),
  -- What the customer pays before platform discounts, coupons and offers.
  selling_price_paise  public.paise not null check (selling_price_paise > 0),
  -- Derived, stored so listing queries can sort and filter on discount directly.
  discount_paise       public.paise generated always as (mrp_paise - selling_price_paise) stored,
  discount_percentage  numeric(6, 3) generated always as (
                         round(((mrp_paise - selling_price_paise)::numeric * 100) / mrp_paise, 3)
                       ) stored,

  -- Seller's floor price: bulk repricing and promotions may not go below it.
  floor_price_paise    public.paise check (floor_price_paise is null or floor_price_paise > 0),

  -- Whether the seller allows platform-funded discounts on this listing.
  allows_platform_discount boolean not null default true,

  effective_from       timestamptz not null default now(),
  updated_by           uuid        references identity.profiles (id) on delete set null,
  update_source        text        not null default 'SELLER_UI'
                         check (update_source in ('SELLER_UI', 'BULK_UPLOAD', 'API', 'REPRICER',
                                                   'ADMIN_OVERRIDE', 'PROMOTION')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- Selling above MRP is illegal under the Legal Metrology rules.
  constraint listing_prices_not_above_mrp check (selling_price_paise <= mrp_paise),
  constraint listing_prices_above_floor
    check (floor_price_paise is null or selling_price_paise >= floor_price_paise)
);

comment on table pricing.listing_prices is
  'Current price per seller listing. Prices never live on catalog.products.';
comment on constraint listing_prices_not_above_mrp on pricing.listing_prices is
  'Selling above the printed MRP is illegal in India. Enforced in the database.';

create index listing_prices_sku_idx    on pricing.listing_prices (sku_id, selling_price_paise);
create index listing_prices_seller_idx on pricing.listing_prices (seller_id);
create index listing_prices_discount_idx on pricing.listing_prices (discount_percentage desc);

create trigger listing_prices_set_updated_at
  before update on pricing.listing_prices
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- pricing.listing_price_history — append-only. Required for repricing audits,
-- "price drop" notifications and dark-pattern investigations.
-- -----------------------------------------------------------------------------
create table pricing.listing_price_history (
  id                      uuid primary key default private.uuid_generate_v7(),
  listing_id              uuid        not null references catalog.seller_listings (id) on delete cascade,
  seller_id               uuid        not null references seller.sellers (id) on delete cascade,
  sku_id                  uuid        not null references catalog.skus (id) on delete cascade,
  old_mrp_paise           public.paise,
  new_mrp_paise           public.paise not null,
  old_selling_price_paise public.paise,
  new_selling_price_paise public.paise not null,
  change_reason           text,
  update_source           text        not null,
  changed_by              uuid        references identity.profiles (id) on delete set null,
  occurred_at             timestamptz not null default now()
);

create index listing_price_history_listing_idx on pricing.listing_price_history (listing_id, occurred_at desc);
create index listing_price_history_sku_idx     on pricing.listing_price_history (sku_id, occurred_at desc);

create trigger listing_price_history_append_only
  before update or delete on pricing.listing_price_history
  for each row execute function private.prevent_mutation();

create or replace function pricing.record_price_change()
returns trigger
language plpgsql
set search_path = pricing, pg_catalog
as $$
begin
  if tg_op = 'INSERT'
     or new.selling_price_paise is distinct from old.selling_price_paise
     or new.mrp_paise is distinct from old.mrp_paise then
    insert into pricing.listing_price_history (
      listing_id, seller_id, sku_id,
      old_mrp_paise, new_mrp_paise, old_selling_price_paise, new_selling_price_paise,
      update_source, changed_by
    ) values (
      new.listing_id, new.seller_id, new.sku_id,
      case when tg_op = 'INSERT' then null else old.mrp_paise end, new.mrp_paise,
      case when tg_op = 'INSERT' then null else old.selling_price_paise end, new.selling_price_paise,
      new.update_source, new.updated_by
    );
  end if;
  return null;
end;
$$;

create trigger listing_prices_record_history
  after insert or update of mrp_paise, selling_price_paise on pricing.listing_prices
  for each row execute function pricing.record_price_change();

-- -----------------------------------------------------------------------------
-- pricing.tax_rules — configurable GST (brief §42). Legal rates change; code must not.
-- -----------------------------------------------------------------------------
create table pricing.tax_rules (
  id                uuid primary key default extensions.gen_random_uuid(),
  hsn_code          public.hsn_code not null,
  description       text        not null,
  gst_rate          public.percentage not null,
  cess_rate         public.percentage not null default 0,
  -- Some HSN codes carry a different rate above/below a price threshold
  -- (e.g. footwear and apparel slabs).
  price_threshold_paise public.paise,
  rate_above_threshold  public.percentage,
  -- Compensation cess applies to a few categories (tobacco, luxury vehicles).
  is_exempt         boolean     not null default false,
  is_nil_rated      boolean     not null default false,
  effective_from    date        not null,
  effective_to      date,
  notification_reference text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint tax_rules_period_valid check (effective_to is null or effective_to >= effective_from),
  constraint tax_rules_threshold_pair
    check ((price_threshold_paise is null) = (rate_above_threshold is null))
);

comment on table pricing.tax_rules is
  'GST rates by HSN with effective dating. Historical orders resolve the rate that applied on their order date.';

-- Only one active rule per HSN per period. Overlap is prevented by an exclusion
-- constraint on the date range.
create index tax_rules_hsn_idx on pricing.tax_rules (hsn_code, effective_from desc);
-- btree_gist supplies the gist opclass for text equality; the opclass is schema-
-- qualified so resolution does not depend on the session search_path.
alter table pricing.tax_rules
  add constraint tax_rules_no_overlap
  exclude using gist (
    (hsn_code::text) extensions.gist_text_ops with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
  );

create trigger tax_rules_set_updated_at
  before update on pricing.tax_rules
  for each row execute function private.set_updated_at();

-- Resolves the GST rate for an HSN code on a given date. Historical orders pass
-- their own order date so invoices stay reproducible.
create or replace function pricing.resolve_gst_rate(
  p_hsn_code    public.hsn_code,
  p_amount_paise public.paise default null,
  p_as_of       date default current_date
)
returns table (gst_rate public.percentage, cess_rate public.percentage, is_exempt boolean)
language sql
stable
set search_path = pricing, pg_catalog
as $$
  select case
           when t.is_exempt or t.is_nil_rated then 0::public.percentage
           when t.price_threshold_paise is not null
                and p_amount_paise is not null
                and p_amount_paise > t.price_threshold_paise
             then t.rate_above_threshold
           else t.gst_rate
         end,
         t.cess_rate,
         (t.is_exempt or t.is_nil_rated)
    from pricing.tax_rules t
   where t.hsn_code = p_hsn_code
     and t.effective_from <= p_as_of
     and (t.effective_to is null or t.effective_to >= p_as_of)
   order by t.effective_from desc
   limit 1;
$$;

-- -----------------------------------------------------------------------------
-- pricing.commission_rules — configurable marketplace commission (brief §41).
-- Resolution is most-specific-wins: product → brand → seller → category → global.
-- -----------------------------------------------------------------------------
create table pricing.commission_rules (
  id                 uuid primary key default extensions.gen_random_uuid(),
  name               text        not null,
  scope_type         text        not null
                       check (scope_type in ('GLOBAL', 'CATEGORY', 'SELLER', 'PRODUCT', 'BRAND',
                                              'SELLER_CATEGORY', 'CAMPAIGN')),
  category_id        uuid        references catalog.categories (id) on delete cascade,
  seller_id          uuid        references seller.sellers (id) on delete cascade,
  product_id         uuid        references catalog.products (id) on delete cascade,
  brand_id           uuid        references catalog.brands (id) on delete cascade,
  campaign_id        uuid,

  fulfillment_model  text        check (fulfillment_model in ('SELLER_FULFILLED', 'NOVAMART_FULFILLED',
                                                              'WAREHOUSE_FULFILLED', 'DROPSHIP')),

  commission_type    text        not null
                       check (commission_type in ('PERCENTAGE', 'FIXED', 'HYBRID')),
  percentage         public.percentage,
  fixed_paise        public.paise,
  -- Slab bounds: commission applies only to order items within this price band.
  min_price_paise    public.paise,
  max_price_paise    public.paise,
  -- Caps and floors on the computed commission itself.
  min_commission_paise public.paise,
  max_commission_paise public.paise,

  -- Additional platform fees charged alongside commission.
  closing_fee_paise  public.paise not null default 0,
  payment_gateway_fee_percentage public.percentage not null default 0,
  -- Fixed fee applied to the shipping component for NovaMart-fulfilled items.
  fulfillment_fee_paise public.paise not null default 0,

  -- GST charged by NovaMart on its own commission (currently 18%).
  commission_gst_rate public.percentage not null default 18,

  priority           smallint    not null default 100,
  effective_from     date        not null default current_date,
  effective_to       date,
  is_active          boolean     not null default true,
  created_by         uuid        references identity.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint commission_type_fields check (
    (commission_type = 'PERCENTAGE' and percentage  is not null and fixed_paise is null)
 or (commission_type = 'FIXED'      and fixed_paise is not null and percentage  is null)
 or (commission_type = 'HYBRID'     and percentage  is not null and fixed_paise is not null)
  ),
  constraint commission_scope_fields check (
    (scope_type = 'GLOBAL')
 or (scope_type = 'CATEGORY'        and category_id is not null)
 or (scope_type = 'SELLER'          and seller_id   is not null)
 or (scope_type = 'PRODUCT'         and product_id  is not null)
 or (scope_type = 'BRAND'           and brand_id    is not null)
 or (scope_type = 'SELLER_CATEGORY' and seller_id   is not null and category_id is not null)
 or (scope_type = 'CAMPAIGN'        and campaign_id is not null)
  ),
  constraint commission_price_band check (
    min_price_paise is null or max_price_paise is null or max_price_paise > min_price_paise
  ),
  constraint commission_period_valid check (effective_to is null or effective_to >= effective_from)
);

comment on table pricing.commission_rules is
  'Commission configuration. Resolution is most-specific-wins, then priority, then newest effective_from.';

create index commission_rules_lookup_idx on pricing.commission_rules (scope_type, priority)
  where is_active;
create index commission_rules_category_idx on pricing.commission_rules (category_id) where is_active;
create index commission_rules_seller_idx   on pricing.commission_rules (seller_id) where is_active;
create index commission_rules_product_idx  on pricing.commission_rules (product_id) where is_active;

create trigger commission_rules_set_updated_at
  before update on pricing.commission_rules
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- pricing.promotions — platform and seller funded discounts (brief §28)
-- -----------------------------------------------------------------------------
create table pricing.promotions (
  id                   uuid primary key default extensions.gen_random_uuid(),
  code                 text        not null unique,
  name                 text        not null,
  description          text,
  -- Who absorbs the discount. Drives the settlement posting.
  funded_by            text        not null
                         check (funded_by in ('PLATFORM', 'SELLER', 'BRAND', 'SHARED')),
  seller_funded_percentage public.percentage,

  promotion_type       text        not null
                         check (promotion_type in ('PERCENTAGE_OFF', 'FLAT_OFF', 'BUY_X_GET_Y',
                                                    'BUNDLE', 'FREE_SHIPPING', 'CASHBACK',
                                                    'TIERED_DISCOUNT')),
  discount_percentage  public.percentage,
  discount_paise       public.paise,
  max_discount_paise   public.paise,
  min_cart_value_paise public.paise,
  -- BUY_X_GET_Y configuration.
  buy_quantity         smallint,
  get_quantity         smallint,

  -- Stacking control: exclusive promotions suppress all others on the same item.
  is_exclusive         boolean     not null default false,
  stack_priority       smallint    not null default 100,

  -- Usage limits enforced by unique constraints and locked counters, not by
  -- application counting (brief §28).
  total_usage_limit    integer     check (total_usage_limit is null or total_usage_limit > 0),
  per_user_limit       integer     check (per_user_limit is null or per_user_limit > 0),
  usage_count          integer     not null default 0 check (usage_count >= 0),

  starts_at            timestamptz not null,
  ends_at              timestamptz not null,
  status               text        not null default 'DRAFT'
                         check (status in ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'ENDED', 'CANCELLED')),

  -- Display treatment on the storefront.
  badge_text           text,
  badge_color          text check (badge_color is null or badge_color ~ '^#[0-9A-Fa-f]{6}$'),
  terms_url            text,

  created_by           uuid        references identity.profiles (id) on delete set null,
  approved_by          uuid        references identity.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint promotions_period_valid check (ends_at > starts_at),
  constraint promotions_discount_fields check (
    (promotion_type = 'PERCENTAGE_OFF' and discount_percentage is not null)
 or (promotion_type = 'FLAT_OFF'       and discount_paise is not null)
 or (promotion_type = 'BUY_X_GET_Y'    and buy_quantity is not null and get_quantity is not null)
 or (promotion_type in ('BUNDLE', 'FREE_SHIPPING', 'CASHBACK', 'TIERED_DISCOUNT'))
  ),
  constraint promotions_shared_funding
    check (funded_by <> 'SHARED' or seller_funded_percentage is not null),
  -- A percentage discount without a cap is how a pricing error becomes a news story.
  constraint promotions_percentage_needs_cap
    check (promotion_type <> 'PERCENTAGE_OFF' or max_discount_paise is not null)
);

comment on constraint promotions_percentage_needs_cap on pricing.promotions is
  'Percentage promotions must declare a maximum discount. Uncapped percentages turn a config typo into unbounded loss.';

create index promotions_active_idx on pricing.promotions (starts_at, ends_at)
  where status = 'ACTIVE';
create index promotions_status_idx on pricing.promotions (status, starts_at desc);

create trigger promotions_set_updated_at
  before update on pricing.promotions
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- pricing.promotion_rules — the condition set (brief §28)
-- Rules are ANDed within a group and ORed across groups, so complex eligibility is
-- expressible without code.
-- -----------------------------------------------------------------------------
create table pricing.promotion_rules (
  id             uuid primary key default extensions.gen_random_uuid(),
  promotion_id   uuid        not null references pricing.promotions (id) on delete cascade,
  rule_group     smallint    not null default 1,
  attribute      text        not null
                   check (attribute in ('CART_TOTAL', 'ITEM_COUNT', 'CATEGORY', 'BRAND', 'SELLER',
                                         'PRODUCT', 'SKU', 'PAYMENT_METHOD', 'PAYMENT_INSTRUMENT',
                                         'CUSTOMER_SEGMENT', 'IS_FIRST_ORDER', 'STATE_CODE',
                                         'PINCODE', 'CITY_TIER', 'DAY_OF_WEEK', 'HOUR_OF_DAY',
                                         'APP_PLATFORM', 'USER_RISK_TIER')),
  operator       text        not null
                   check (operator in ('EQ', 'NEQ', 'IN', 'NOT_IN', 'GTE', 'LTE', 'GT', 'LT', 'BETWEEN')),
  value_text     text,
  value_numeric  numeric(18, 4),
  value_numeric_max numeric(18, 4),
  value_array    text[],
  created_at     timestamptz not null default now(),

  constraint promotion_rules_value_present check (
    value_text is not null or value_numeric is not null or value_array is not null
  ),
  constraint promotion_rules_between_needs_max
    check (operator <> 'BETWEEN' or (value_numeric is not null and value_numeric_max is not null))
);

create index promotion_rules_promotion_idx on pricing.promotion_rules (promotion_id, rule_group);

-- -----------------------------------------------------------------------------
-- pricing.promotion_targets — which items the discount applies to.
-- Separate from rules: rules decide eligibility, targets decide scope.
-- -----------------------------------------------------------------------------
create table pricing.promotion_targets (
  id             uuid primary key default extensions.gen_random_uuid(),
  promotion_id   uuid        not null references pricing.promotions (id) on delete cascade,
  target_type    text        not null
                   check (target_type in ('ALL', 'CATEGORY', 'BRAND', 'SELLER', 'PRODUCT', 'SKU', 'LISTING')),
  category_id    uuid        references catalog.categories (id) on delete cascade,
  brand_id       uuid        references catalog.brands (id) on delete cascade,
  seller_id      uuid        references seller.sellers (id) on delete cascade,
  product_id     uuid        references catalog.products (id) on delete cascade,
  sku_id         uuid        references catalog.skus (id) on delete cascade,
  listing_id     uuid        references catalog.seller_listings (id) on delete cascade,
  -- Exclusions are expressed as targets with is_exclusion = true.
  is_exclusion   boolean     not null default false,
  created_at     timestamptz not null default now(),

  constraint promotion_targets_reference_present check (
    (target_type = 'ALL')
 or (target_type = 'CATEGORY' and category_id is not null)
 or (target_type = 'BRAND'    and brand_id    is not null)
 or (target_type = 'SELLER'   and seller_id   is not null)
 or (target_type = 'PRODUCT'  and product_id  is not null)
 or (target_type = 'SKU'      and sku_id      is not null)
 or (target_type = 'LISTING'  and listing_id  is not null)
  )
);

create index promotion_targets_promotion_idx on pricing.promotion_targets (promotion_id);
create index promotion_targets_category_idx  on pricing.promotion_targets (category_id) where category_id is not null;
create index promotion_targets_sku_idx       on pricing.promotion_targets (sku_id) where sku_id is not null;

-- -----------------------------------------------------------------------------
-- pricing.coupons
-- -----------------------------------------------------------------------------
create table pricing.coupons (
  id                   uuid primary key default extensions.gen_random_uuid(),
  code                 text        not null
                         constraint coupons_code_shape check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
  name                 text        not null,
  description          text,
  -- Coupons may be generic (one shared code) or unique-per-user.
  distribution         text        not null default 'PUBLIC'
                         check (distribution in ('PUBLIC', 'PRIVATE', 'UNIQUE_PER_USER', 'REFERRAL')),
  -- For UNIQUE_PER_USER coupons, the principal the code was issued to.
  issued_to_user_id    uuid        references identity.profiles (id) on delete cascade,

  discount_type        text        not null
                         check (discount_type in ('PERCENTAGE', 'FLAT', 'FREE_SHIPPING', 'CASHBACK')),
  discount_percentage  public.percentage,
  discount_paise       public.paise,
  max_discount_paise   public.paise,
  min_cart_value_paise public.paise not null default 0,

  funded_by            text        not null default 'PLATFORM'
                         check (funded_by in ('PLATFORM', 'SELLER', 'BRAND', 'SHARED')),
  seller_id            uuid        references seller.sellers (id) on delete cascade,

  total_usage_limit    integer     check (total_usage_limit is null or total_usage_limit > 0),
  per_user_limit       integer     not null default 1 check (per_user_limit > 0),
  usage_count          integer     not null default 0 check (usage_count >= 0),

  -- Restrict to first-time buyers, specific segments or new-customer acquisition.
  first_order_only     boolean     not null default false,
  customer_segments    text[]      not null default '{}',
  applicable_payment_methods text[] not null default '{}',

  starts_at            timestamptz not null,
  ends_at              timestamptz not null,
  is_active            boolean     not null default true,
  is_stackable         boolean     not null default false,

  created_by           uuid        references identity.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint coupons_period_valid check (ends_at > starts_at),
  constraint coupons_discount_fields check (
    (discount_type = 'PERCENTAGE'    and discount_percentage is not null and max_discount_paise is not null)
 or (discount_type in ('FLAT', 'CASHBACK') and discount_paise is not null)
 or (discount_type = 'FREE_SHIPPING')
  ),
  constraint coupons_unique_per_user_has_owner
    check (distribution <> 'UNIQUE_PER_USER' or issued_to_user_id is not null),
  constraint coupons_seller_funded_has_seller
    check (funded_by <> 'SELLER' or seller_id is not null)
);

comment on table pricing.coupons is
  'Coupon definitions. Usage limits are enforced by unique constraints on redemptions plus a locked counter.';

create unique index coupons_code_active_idx on pricing.coupons (upper(code))
  where is_active and distribution <> 'UNIQUE_PER_USER';
create unique index coupons_code_user_idx on pricing.coupons (upper(code), issued_to_user_id)
  where distribution = 'UNIQUE_PER_USER';
create index coupons_active_window_idx on pricing.coupons (starts_at, ends_at) where is_active;
create index coupons_user_idx on pricing.coupons (issued_to_user_id) where issued_to_user_id is not null;
create index coupons_seller_idx on pricing.coupons (seller_id) where seller_id is not null;

create trigger coupons_set_updated_at
  before update on pricing.coupons
  for each row execute function private.set_updated_at();

create table pricing.coupon_rules (
  id             uuid primary key default extensions.gen_random_uuid(),
  coupon_id      uuid        not null references pricing.coupons (id) on delete cascade,
  rule_group     smallint    not null default 1,
  attribute      text        not null,
  operator       text        not null
                   check (operator in ('EQ', 'NEQ', 'IN', 'NOT_IN', 'GTE', 'LTE', 'GT', 'LT', 'BETWEEN')),
  value_text     text,
  value_numeric  numeric(18, 4),
  value_array    text[],
  created_at     timestamptz not null default now()
);

create index coupon_rules_coupon_idx on pricing.coupon_rules (coupon_id, rule_group);

-- -----------------------------------------------------------------------------
-- pricing.coupon_redemptions — the enforcement point for usage limits.
-- UNIQUE (coupon_id, order_id) makes double-application impossible even if the
-- application logic is wrong.
-- -----------------------------------------------------------------------------
create table pricing.coupon_redemptions (
  id                uuid primary key default private.uuid_generate_v7(),
  coupon_id         uuid        not null references pricing.coupons (id) on delete restrict,
  user_id           uuid        not null references identity.profiles (id) on delete restrict,
  order_id          uuid        not null,
  discount_paise    public.paise not null check (discount_paise >= 0),
  status            text        not null default 'APPLIED'
                      check (status in ('APPLIED', 'REVERSED')),
  reversed_at       timestamptz,
  reversal_reason   text,
  redeemed_at       timestamptz not null default now(),
  unique (coupon_id, order_id)
);

create index coupon_redemptions_user_idx   on pricing.coupon_redemptions (coupon_id, user_id)
  where status = 'APPLIED';
create index coupon_redemptions_order_idx  on pricing.coupon_redemptions (order_id);

-- -----------------------------------------------------------------------------
-- pricing.bank_offers — instrument-level discounts (brief §28)
-- -----------------------------------------------------------------------------
create table pricing.bank_offers (
  id                    uuid primary key default extensions.gen_random_uuid(),
  code                  text        not null unique,
  bank_name             text        not null,
  offer_title           text        not null,
  offer_description     text        not null,

  -- Which instruments qualify. NULL/empty means all instruments of that type.
  payment_methods       text[]      not null
                          check (array_length(payment_methods, 1) >= 1),
  card_networks         text[]      not null default '{}',
  card_types            text[]      not null default '{}',
  -- First six digits of the card (issuer identification number) prefixes.
  card_bin_prefixes     text[]      not null default '{}',
  is_emi_only           boolean     not null default false,
  emi_tenure_months     smallint[],

  discount_type         text        not null
                          check (discount_type in ('INSTANT_PERCENTAGE', 'INSTANT_FLAT',
                                                    'CASHBACK_PERCENTAGE', 'CASHBACK_FLAT',
                                                    'NO_COST_EMI')),
  discount_percentage   public.percentage,
  discount_paise        public.paise,
  max_discount_paise    public.paise,
  min_transaction_paise public.paise not null default 0,

  -- Bank offers are usually capped per card per period.
  per_card_limit        integer,
  total_usage_limit     integer,
  usage_count           integer     not null default 0 check (usage_count >= 0),

  starts_at             timestamptz not null,
  ends_at               timestamptz not null,
  is_active             boolean     not null default true,
  terms_url             text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint bank_offers_period_valid check (ends_at > starts_at),
  constraint bank_offers_discount_fields check (
    (discount_type in ('INSTANT_PERCENTAGE', 'CASHBACK_PERCENTAGE')
      and discount_percentage is not null and max_discount_paise is not null)
 or (discount_type in ('INSTANT_FLAT', 'CASHBACK_FLAT') and discount_paise is not null)
 or (discount_type = 'NO_COST_EMI')
  )
);

create index bank_offers_active_idx on pricing.bank_offers (starts_at, ends_at) where is_active;

create trigger bank_offers_set_updated_at
  before update on pricing.bank_offers
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- pricing.flash_sales — time-boxed, quantity-limited deals.
-- Quantity limits are enforced against inventory reservations, not a counter, so a
-- flash sale cannot oversell.
-- -----------------------------------------------------------------------------
create table pricing.flash_sales (
  id             uuid primary key default extensions.gen_random_uuid(),
  name           text        not null,
  slug           public.url_slug not null unique,
  description    text,
  banner_url     text,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  status         text        not null default 'SCHEDULED'
                   check (status in ('DRAFT', 'SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED')),
  -- Teaser window: the sale is visible but not purchasable.
  teaser_from    timestamptz,
  display_order  smallint    not null default 100,
  created_by     uuid        references identity.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint flash_sales_period_valid check (ends_at > starts_at),
  constraint flash_sales_teaser_before_start check (teaser_from is null or teaser_from <= starts_at)
);

create index flash_sales_live_idx on pricing.flash_sales (starts_at, ends_at)
  where status in ('SCHEDULED', 'LIVE');

create trigger flash_sales_set_updated_at
  before update on pricing.flash_sales
  for each row execute function private.set_updated_at();

create table pricing.flash_sale_items (
  id                    uuid primary key default extensions.gen_random_uuid(),
  flash_sale_id         uuid        not null references pricing.flash_sales (id) on delete cascade,
  listing_id            uuid        not null references catalog.seller_listings (id) on delete cascade,
  sku_id                uuid        not null references catalog.skus (id) on delete cascade,
  -- The sale price, validated against the listing's floor price.
  sale_price_paise      public.paise not null check (sale_price_paise > 0),
  -- Units allocated to the sale. Sold units are counted from confirmed orders.
  allocated_quantity    integer     not null check (allocated_quantity > 0),
  sold_quantity         integer     not null default 0 check (sold_quantity >= 0),
  max_quantity_per_user smallint    not null default 1,
  display_order         smallint    not null default 100,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (flash_sale_id, listing_id),
  constraint flash_sale_items_not_oversold check (sold_quantity <= allocated_quantity)
);

create index flash_sale_items_sale_idx    on pricing.flash_sale_items (flash_sale_id, display_order);
create index flash_sale_items_listing_idx on pricing.flash_sale_items (listing_id);

create trigger flash_sale_items_set_updated_at
  before update on pricing.flash_sale_items
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- pricing.buy_box_weights — configurable Buy Box scoring (brief §29).
-- Lowest price does not automatically win: seller quality is weighted in, and the
-- weights are tunable without a deploy.
-- -----------------------------------------------------------------------------
create table pricing.buy_box_weights (
  id                        uuid primary key default extensions.gen_random_uuid(),
  name                      text        not null,
  -- NULL category means the platform default profile.
  category_id               uuid        references catalog.categories (id) on delete cascade,

  weight_price              numeric(5, 2) not null default 35.00,
  weight_seller_score       numeric(5, 2) not null default 20.00,
  weight_delivery_speed     numeric(5, 2) not null default 15.00,
  weight_stock_depth        numeric(5, 2) not null default 5.00,
  weight_cancellation_rate  numeric(5, 2) not null default 10.00,
  weight_return_rate        numeric(5, 2) not null default 5.00,
  weight_seller_rating      numeric(5, 2) not null default 5.00,
  weight_fulfillment_model  numeric(5, 2) not null default 5.00,

  -- Hard gates: a listing failing any of these is ineligible regardless of score.
  min_seller_score          numeric(5, 2) not null default 40.00,
  max_cancellation_rate     public.percentage not null default 10.00,
  max_return_rate           public.percentage not null default 25.00,
  require_in_stock          boolean     not null default true,

  is_active                 boolean     not null default true,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  -- Weights must total 100 so the score is interpretable.
  constraint buy_box_weights_total_100 check (
    weight_price + weight_seller_score + weight_delivery_speed + weight_stock_depth
    + weight_cancellation_rate + weight_return_rate + weight_seller_rating
    + weight_fulfillment_model = 100
  )
);

create unique index buy_box_weights_default_idx on pricing.buy_box_weights ((1))
  where category_id is null and is_active;
create unique index buy_box_weights_category_idx on pricing.buy_box_weights (category_id)
  where category_id is not null and is_active;

create trigger buy_box_weights_set_updated_at
  before update on pricing.buy_box_weights
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- pricing.resolve_commission — most-specific-wins resolution.
-- -----------------------------------------------------------------------------
create or replace function pricing.resolve_commission(
  p_seller_id         uuid,
  p_category_id       uuid,
  p_product_id        uuid,
  p_brand_id          uuid,
  p_item_price_paise  public.paise,
  p_fulfillment_model text default 'SELLER_FULFILLED',
  p_as_of             date default current_date
)
returns table (
  rule_id                        uuid,
  commission_paise               public.paise,
  commission_percentage          public.percentage,
  closing_fee_paise              public.paise,
  fulfillment_fee_paise          public.paise,
  payment_gateway_fee_percentage public.percentage,
  commission_gst_rate            public.percentage
)
language plpgsql
stable
set search_path = pricing, catalog, private, pg_catalog
as $$
declare
  v_rule pricing.commission_rules;
  v_raw  public.paise;
begin
  select r.* into v_rule
    from pricing.commission_rules r
   where r.is_active
     and r.effective_from <= p_as_of
     and (r.effective_to is null or r.effective_to >= p_as_of)
     and (r.fulfillment_model is null or r.fulfillment_model = p_fulfillment_model)
     and (r.min_price_paise is null or p_item_price_paise >= r.min_price_paise)
     and (r.max_price_paise is null or p_item_price_paise <= r.max_price_paise)
     and (
           (r.scope_type = 'PRODUCT'         and r.product_id = p_product_id)
        or (r.scope_type = 'SELLER_CATEGORY' and r.seller_id = p_seller_id
              and r.category_id in (select cc.ancestor_id from catalog.category_closure cc
                                     where cc.descendant_id = p_category_id))
        or (r.scope_type = 'BRAND'           and r.brand_id = p_brand_id)
        or (r.scope_type = 'SELLER'          and r.seller_id = p_seller_id)
        or (r.scope_type = 'CATEGORY'
              and r.category_id in (select cc.ancestor_id from catalog.category_closure cc
                                     where cc.descendant_id = p_category_id))
        or (r.scope_type = 'GLOBAL')
     )
   order by
     -- Specificity first, then explicit priority, then the newest rule.
     case r.scope_type
       when 'PRODUCT'         then 1
       when 'SELLER_CATEGORY' then 2
       when 'BRAND'           then 3
       when 'SELLER'          then 4
       when 'CATEGORY'        then 5
       else 6
     end,
     r.priority,
     r.effective_from desc
   limit 1;

  if v_rule.id is null then
    raise exception 'No commission rule resolves for seller % category %', p_seller_id, p_category_id
      using errcode = 'no_data_found',
            hint = 'Seed a GLOBAL commission rule so resolution can never fail.';
  end if;

  v_raw := case v_rule.commission_type
             when 'PERCENTAGE' then private.apply_percentage(p_item_price_paise, v_rule.percentage)
             when 'FIXED'      then v_rule.fixed_paise
             else private.apply_percentage(p_item_price_paise, v_rule.percentage) + v_rule.fixed_paise
           end;

  if v_rule.min_commission_paise is not null then
    v_raw := greatest(v_raw, v_rule.min_commission_paise);
  end if;
  if v_rule.max_commission_paise is not null then
    v_raw := least(v_raw, v_rule.max_commission_paise);
  end if;

  return query select
    v_rule.id,
    v_raw,
    v_rule.percentage,
    v_rule.closing_fee_paise,
    v_rule.fulfillment_fee_paise,
    v_rule.payment_gateway_fee_percentage,
    v_rule.commission_gst_rate;
end;
$$;

comment on function pricing.resolve_commission(uuid, uuid, uuid, uuid, public.paise, text, date) is
  'Resolves commission most-specific-wins: product → seller+category → brand → seller → category → global.';
