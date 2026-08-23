-- =============================================================================
-- NovaMart — 0005 Geography: states, districts, cities, pincodes, delivery zones
--
-- PAN-India from day one (brief §81). Nothing assumes a single city.
-- GST state codes live here because place-of-supply determines CGST/SGST vs IGST.
-- Loaded early because identity.addresses references pincodes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- fulfillment.states — 2-letter code plus the statutory GST state code.
-- -----------------------------------------------------------------------------
create table fulfillment.states (
  code            text primary key
                    constraint states_code_shape check (code ~ '^[A-Z]{2}$'),
  -- First two digits of a GSTIN. Determines intra- vs inter-state supply.
  gst_state_code  text        not null unique
                    constraint states_gst_code_shape check (gst_state_code ~ '^[0-9]{2}$'),
  name            text        not null unique,
  name_hi         text,
  -- Union territories have distinct GST treatment (UTGST instead of SGST).
  is_union_territory boolean  not null default false,
  region          text        not null
                    check (region in ('NORTH', 'SOUTH', 'EAST', 'WEST', 'CENTRAL', 'NORTH_EAST')),
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now()
);

comment on table fulfillment.states is
  'Indian states and union territories with GST state codes used for place-of-supply tax determination.';

create index states_region_idx on fulfillment.states (region) where is_active;

-- -----------------------------------------------------------------------------
-- fulfillment.districts
-- -----------------------------------------------------------------------------
create table fulfillment.districts (
  id          uuid primary key default extensions.gen_random_uuid(),
  state_code  text        not null references fulfillment.states (code) on delete restrict,
  name        text        not null,
  name_hi     text,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  unique (state_code, name)
);

create index districts_state_idx on fulfillment.districts (state_code) where is_active;

-- -----------------------------------------------------------------------------
-- fulfillment.cities
-- tier drives logistics rate cards and delivery SLA defaults.
-- -----------------------------------------------------------------------------
create table fulfillment.cities (
  id           uuid primary key default extensions.gen_random_uuid(),
  district_id  uuid        not null references fulfillment.districts (id) on delete restrict,
  state_code   text        not null references fulfillment.states (code) on delete restrict,
  name         text        not null,
  name_hi      text,
  tier         text        not null default 'TIER_3'
                 check (tier in ('METRO', 'TIER_1', 'TIER_2', 'TIER_3', 'TIER_4', 'RURAL')),
  latitude     numeric(9, 6),
  longitude    numeric(9, 6),
  is_active    boolean     not null default true,
  created_at   timestamptz not null default now(),
  unique (district_id, name),
  constraint cities_latitude_range  check (latitude  is null or latitude  between -90  and 90),
  constraint cities_longitude_range check (longitude is null or longitude between -180 and 180)
);

create index cities_state_idx     on fulfillment.cities (state_code) where is_active;
create index cities_district_idx  on fulfillment.cities (district_id) where is_active;
create index cities_tier_idx      on fulfillment.cities (tier) where is_active;
-- Fuzzy city lookup for address autocomplete in operator consoles.
create index cities_name_trgm_idx on fulfillment.cities using gin (name extensions.gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- fulfillment.delivery_zones
-- Zone classification is the primary input to shipping rate cards. Indian courier
-- pricing is zone-based, not distance-based.
-- -----------------------------------------------------------------------------
create table fulfillment.delivery_zones (
  code         text primary key
                 check (code in ('LOCAL', 'ZONAL', 'METRO_TO_METRO', 'REST_OF_INDIA',
                                  'NORTH_EAST', 'JAMMU_KASHMIR', 'ISLANDS')),
  name         text        not null,
  description  text        not null,
  -- Baseline transit days; carrier-specific SLAs override this.
  default_sla_days smallint not null check (default_sla_days between 1 and 30),
  sort_order   smallint    not null default 100
);

comment on table fulfillment.delivery_zones is
  'Courier pricing/SLA zones. Indian logistics rate cards are zone-based, so this is a first-class dimension.';

-- -----------------------------------------------------------------------------
-- fulfillment.pincodes
-- The operational heart of Indian serviceability. Per-pincode flags are platform
-- defaults; per-carrier capability is layered on top in carrier_serviceability.
-- -----------------------------------------------------------------------------
create table fulfillment.pincodes (
  pincode            public.indian_pincode primary key,
  city_id            uuid        not null references fulfillment.cities (id) on delete restrict,
  district_id        uuid        not null references fulfillment.districts (id) on delete restrict,
  state_code         text        not null references fulfillment.states (code) on delete restrict,
  zone_code          text        not null references fulfillment.delivery_zones (code) on delete restrict,
  -- Postal locality name, useful for address autofill.
  locality           text,
  latitude           numeric(9, 6),
  longitude          numeric(9, 6),

  -- Platform-level serviceability. A false here blocks the pincode regardless of
  -- what any individual carrier claims.
  is_serviceable     boolean     not null default true,
  prepaid_available  boolean     not null default true,
  cod_available      boolean     not null default true,
  -- Reverse pickup is materially harder than forward delivery in many pincodes.
  reverse_pickup_available boolean not null default true,
  -- Out-of-delivery-area surcharge applies.
  is_oda             boolean     not null default false,

  -- Platform default promise; the delivery promise engine refines this per
  -- warehouse/carrier/cutoff.
  default_sla_days   smallint    not null default 5 check (default_sla_days between 1 and 30),
  cod_limit_paise    public.paise check (cod_limit_paise is null or cod_limit_paise > 0),

  -- Operational notes for support ("floods, suspended until…").
  remarks            text,
  suspended_until    date,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint pincodes_latitude_range  check (latitude  is null or latitude  between -90  and 90),
  constraint pincodes_longitude_range check (longitude is null or longitude between -180 and 180),
  -- COD without prepaid is a data error, not a business model.
  constraint pincodes_cod_requires_service check (not cod_available or is_serviceable)
);

comment on table fulfillment.pincodes is
  'Pincode master with platform-level serviceability. Carrier-specific capability layers on top.';
comment on column fulfillment.pincodes.is_oda is
  'Out of Delivery Area: carriers levy a surcharge and extend SLA for these pincodes.';

create index pincodes_city_idx       on fulfillment.pincodes (city_id);
create index pincodes_state_idx      on fulfillment.pincodes (state_code);
create index pincodes_zone_idx       on fulfillment.pincodes (zone_code);
create index pincodes_serviceable_idx on fulfillment.pincodes (pincode) where is_serviceable;
create index pincodes_cod_idx        on fulfillment.pincodes (pincode) where cod_available and is_serviceable;
create index pincodes_suspended_idx  on fulfillment.pincodes (suspended_until) where suspended_until is not null;

create trigger pincodes_set_updated_at
  before update on fulfillment.pincodes
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Zone resolution between an origin and destination pincode. Used by the shipping
-- rate engine and the delivery promise engine.
-- -----------------------------------------------------------------------------
create or replace function fulfillment.resolve_zone(
  p_origin_pincode      public.indian_pincode,
  p_destination_pincode public.indian_pincode
)
returns text
language plpgsql
stable
set search_path = fulfillment, pg_catalog
as $$
declare
  o record;
  d record;
begin
  select p.state_code, p.city_id, p.district_id, c.tier
    into o
    from fulfillment.pincodes p
    join fulfillment.cities c on c.id = p.city_id
   where p.pincode = p_origin_pincode;

  select p.state_code, p.city_id, p.district_id, c.tier
    into d
    from fulfillment.pincodes p
    join fulfillment.cities c on c.id = p.city_id
   where p.pincode = p_destination_pincode;

  if o is null or d is null then
    return null;
  end if;

  -- Special zones win over geographic proximity: courier economics, not distance.
  if d.state_code in ('AR', 'AS', 'MN', 'ML', 'MZ', 'NL', 'TR', 'SK') then
    return 'NORTH_EAST';
  elsif d.state_code = 'JK' or d.state_code = 'LA' then
    return 'JAMMU_KASHMIR';
  elsif d.state_code in ('AN', 'LD') then
    return 'ISLANDS';
  elsif o.city_id = d.city_id then
    return 'LOCAL';
  elsif o.tier = 'METRO' and d.tier = 'METRO' then
    return 'METRO_TO_METRO';
  elsif o.state_code = d.state_code then
    return 'ZONAL';
  else
    return 'REST_OF_INDIA';
  end if;
end;
$$;

comment on function fulfillment.resolve_zone(public.indian_pincode, public.indian_pincode) is
  'Maps an origin/destination pincode pair to a courier pricing zone.';

-- -----------------------------------------------------------------------------
-- Intra-state vs inter-state supply. Drives CGST+SGST vs IGST (brief §42).
-- -----------------------------------------------------------------------------
create or replace function fulfillment.is_intra_state_supply(
  p_seller_state_code   text,
  p_customer_state_code text
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_seller_state_code is not null
     and p_customer_state_code is not null
     and p_seller_state_code = p_customer_state_code;
$$;
