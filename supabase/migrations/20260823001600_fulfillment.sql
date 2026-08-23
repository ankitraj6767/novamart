-- =============================================================================
-- NovaMart — 0016 Fulfillment: carriers, serviceability, rate cards, shipments,
--                  packages, labels, tracking, delivery proof, NDR/RTO, COD remittance
--
-- Provider-agnostic by construction (brief §37): carriers are rows, adapters are
-- code behind the ShippingProvider port. Adding Delhivery or XpressBees is
-- configuration plus one adapter, never a schema change.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- fulfillment.carriers
-- -----------------------------------------------------------------------------
create table fulfillment.carriers (
  id                     uuid primary key default extensions.gen_random_uuid(),
  code                   text        not null unique
                           constraint carriers_code_shape check (code ~ '^[A-Z][A-Z0-9_]*$'),
  name                   text        not null,
  logo_url               text,
  -- Aggregators (Shiprocket) expose many carriers behind one integration.
  integration_type       text        not null default 'DIRECT'
                           check (integration_type in ('DIRECT', 'AGGREGATOR', 'IN_HOUSE')),
  parent_carrier_id      uuid        references fulfillment.carriers (id) on delete set null,

  supports_cod           boolean     not null default true,
  supports_prepaid       boolean     not null default true,
  supports_reverse       boolean     not null default true,
  supports_qc_at_pickup  boolean     not null default false,
  supports_multi_piece   boolean     not null default true,
  supports_hazmat        boolean     not null default false,

  max_weight_grams       integer     check (max_weight_grams is null or max_weight_grams > 0),
  max_declared_value_paise public.paise,
  -- Volumetric divisor for chargeable weight; carriers differ (4000/5000/6000).
  volumetric_divisor     integer     not null default 5000 check (volumetric_divisor > 0),

  -- Operational quality, used by carrier selection.
  average_delivery_days  numeric(4, 1),
  on_time_rate           public.percentage,
  rto_rate               public.percentage,
  ndr_rate               public.percentage,
  selection_priority     smallint    not null default 100,

  tracking_url_template  text,
  is_active              boolean     not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index carriers_active_idx on fulfillment.carriers (selection_priority) where is_active;

create trigger carriers_set_updated_at
  before update on fulfillment.carriers
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- fulfillment.carrier_serviceability — per-carrier, per-pincode capability.
-- Layered on top of the platform-level flags in fulfillment.pincodes.
-- -----------------------------------------------------------------------------
create table fulfillment.carrier_serviceability (
  id                  uuid primary key default extensions.gen_random_uuid(),
  carrier_id          uuid        not null references fulfillment.carriers (id) on delete cascade,
  pincode             public.indian_pincode not null references fulfillment.pincodes (pincode) on delete cascade,
  prepaid_available   boolean     not null default true,
  cod_available       boolean     not null default true,
  reverse_available   boolean     not null default true,
  -- Transit days from this carrier's nearest hub.
  sla_days            smallint    not null check (sla_days between 1 and 30),
  cod_limit_paise     public.paise,
  is_oda              boolean     not null default false,
  oda_surcharge_paise public.paise not null default 0,
  -- Last sync from the carrier's serviceability feed.
  synced_at           timestamptz not null default now(),
  unique (carrier_id, pincode)
);

create index carrier_serviceability_pincode_idx on fulfillment.carrier_serviceability (pincode)
  where prepaid_available;
create index carrier_serviceability_cod_idx     on fulfillment.carrier_serviceability (pincode)
  where cod_available;
create index carrier_serviceability_carrier_idx on fulfillment.carrier_serviceability (carrier_id);

-- -----------------------------------------------------------------------------
-- fulfillment.carrier_rate_cards / slabs — zone × weight pricing.
-- -----------------------------------------------------------------------------
create table fulfillment.carrier_rate_cards (
  id                    uuid primary key default extensions.gen_random_uuid(),
  carrier_id            uuid        not null references fulfillment.carriers (id) on delete cascade,
  name                  text        not null,
  shipment_mode         text        not null default 'SURFACE'
                          check (shipment_mode in ('SURFACE', 'AIR', 'EXPRESS')),
  direction             text        not null default 'FORWARD'
                          check (direction in ('FORWARD', 'REVERSE')),
  cod_fee_paise         public.paise not null default 0,
  cod_fee_percentage    public.percentage not null default 0,
  -- Insurance / risk surcharge on declared value.
  insurance_percentage  public.percentage not null default 0,
  fuel_surcharge_percentage public.percentage not null default 0,
  gst_rate              public.percentage not null default 18,
  effective_from        date        not null default current_date,
  effective_to          date,
  is_active             boolean     not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint rate_cards_period_valid check (effective_to is null or effective_to >= effective_from)
);

create index rate_cards_carrier_idx on fulfillment.carrier_rate_cards (carrier_id, direction, shipment_mode)
  where is_active;

create trigger carrier_rate_cards_set_updated_at
  before update on fulfillment.carrier_rate_cards
  for each row execute function private.set_updated_at();

create table fulfillment.carrier_rate_slabs (
  id                  uuid primary key default extensions.gen_random_uuid(),
  rate_card_id        uuid        not null references fulfillment.carrier_rate_cards (id) on delete cascade,
  zone_code           text        not null references fulfillment.delivery_zones (code) on delete restrict,
  -- Base charge covers up to base_weight_grams; each additional step costs extra.
  base_weight_grams   integer     not null check (base_weight_grams > 0),
  base_charge_paise   public.paise not null check (base_charge_paise >= 0),
  additional_step_grams integer   not null check (additional_step_grams > 0),
  additional_charge_paise public.paise not null check (additional_charge_paise >= 0),
  min_charge_paise    public.paise not null default 0,
  unique (rate_card_id, zone_code, base_weight_grams)
);

create index rate_slabs_lookup_idx on fulfillment.carrier_rate_slabs (rate_card_id, zone_code, base_weight_grams);

-- Computes the shipping charge for a chargeable weight in a zone.
create or replace function fulfillment.calculate_shipping_charge(
  p_rate_card_id           uuid,
  p_zone_code              text,
  p_chargeable_weight_grams integer,
  p_declared_value_paise   public.paise default 0,
  p_is_cod                 boolean default false
)
returns table (
  base_paise      public.paise,
  weight_paise    public.paise,
  cod_fee_paise   public.paise,
  insurance_paise public.paise,
  fuel_paise      public.paise,
  gst_paise       public.paise,
  total_paise     public.paise
)
language plpgsql
stable
set search_path = fulfillment, private, pg_catalog
as $$
declare
  v_card  fulfillment.carrier_rate_cards;
  v_slab  fulfillment.carrier_rate_slabs;
  v_extra_steps integer;
  v_base  public.paise;
  v_weight public.paise;
  v_cod   public.paise;
  v_ins   public.paise;
  v_fuel  public.paise;
  v_subtotal public.paise;
  v_gst   public.paise;
begin
  select * into v_card from fulfillment.carrier_rate_cards where id = p_rate_card_id;
  if v_card.id is null then
    raise exception 'Rate card % not found', p_rate_card_id using errcode = 'no_data_found';
  end if;

  -- Pick the slab whose base weight is the largest that still fits, else the smallest.
  select * into v_slab
    from fulfillment.carrier_rate_slabs s
   where s.rate_card_id = p_rate_card_id
     and s.zone_code = p_zone_code
   order by case when s.base_weight_grams <= p_chargeable_weight_grams then 0 else 1 end,
            s.base_weight_grams desc
   limit 1;

  if v_slab.id is null then
    raise exception 'No rate slab for zone % on rate card %', p_zone_code, p_rate_card_id
      using errcode = 'no_data_found', hint = 'SHIPPING_UNAVAILABLE';
  end if;

  v_base := v_slab.base_charge_paise;

  v_extra_steps := greatest(
    0,
    ceil((p_chargeable_weight_grams - v_slab.base_weight_grams)::numeric / v_slab.additional_step_grams)::integer
  );
  v_weight := v_extra_steps * v_slab.additional_charge_paise;

  v_cod := case
             when p_is_cod then greatest(
               v_card.cod_fee_paise,
               private.apply_percentage(p_declared_value_paise, v_card.cod_fee_percentage)
             )
             else 0
           end;

  v_ins  := private.apply_percentage(p_declared_value_paise, v_card.insurance_percentage);
  v_fuel := private.apply_percentage(v_base + v_weight, v_card.fuel_surcharge_percentage);

  v_subtotal := greatest(v_base + v_weight + v_cod + v_ins + v_fuel, v_slab.min_charge_paise);
  v_gst := private.apply_percentage(v_subtotal, v_card.gst_rate);

  return query select v_base, v_weight, v_cod, v_ins, v_fuel, v_gst, v_subtotal + v_gst;
end;
$$;

-- -----------------------------------------------------------------------------
-- fulfillment.shipments — one seller, one warehouse, one carrier.
-- -----------------------------------------------------------------------------
create table fulfillment.shipments (
  id                     uuid primary key default private.uuid_generate_v7(),
  shipment_reference     text        not null unique,
  order_id               uuid        not null references commerce.orders (id) on delete restrict,
  seller_id              uuid        not null references seller.sellers (id) on delete restrict,
  warehouse_id           uuid        not null references inventory.warehouses (id) on delete restrict,
  carrier_id             uuid        references fulfillment.carriers (id) on delete restrict,

  direction              text        not null default 'FORWARD'
                           check (direction in ('FORWARD', 'REVERSE')),
  shipment_mode          text        not null default 'SURFACE'
                           check (shipment_mode in ('SURFACE', 'AIR', 'EXPRESS')),

  -- Carrier identifiers.
  awb_number             text,
  provider_shipment_id   text,
  provider_order_id      text,

  status                 text        not null default 'CREATED'
                           check (status in ('CREATED', 'LABEL_GENERATED', 'PICKUP_SCHEDULED',
                                             'PICKED_UP', 'IN_TRANSIT', 'REACHED_DESTINATION_HUB',
                                             'OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED',
                                             'RTO_INITIATED', 'RTO_IN_TRANSIT', 'RTO_DELIVERED',
                                             'LOST', 'DAMAGED', 'CANCELLED')),

  is_cod                 boolean     not null default false,
  cod_amount_paise       public.paise not null default 0 check (cod_amount_paise >= 0),
  declared_value_paise   public.paise not null default 0,

  -- Weights: actual vs volumetric; carriers bill on the greater.
  actual_weight_grams    integer     check (actual_weight_grams is null or actual_weight_grams > 0),
  volumetric_weight_grams integer,
  chargeable_weight_grams integer,
  -- What we expected to pay vs what the carrier actually billed. Differences are
  -- disputed with the carrier and recovered from the seller where applicable.
  estimated_freight_paise public.paise,
  actual_freight_paise    public.paise,
  freight_variance_paise  public.paise,

  pickup_pincode         public.indian_pincode not null references fulfillment.pincodes (pincode) on delete restrict,
  delivery_pincode       public.indian_pincode not null references fulfillment.pincodes (pincode) on delete restrict,
  zone_code              text        references fulfillment.delivery_zones (code) on delete set null,

  -- Address snapshot: the shipment must remain shippable even if the customer
  -- edits their address book.
  delivery_address       jsonb       not null,
  pickup_address         jsonb       not null,

  promised_delivery_date date,
  estimated_delivery_date date,
  pickup_scheduled_at    timestamptz,
  picked_up_at           timestamptz,
  delivered_at           timestamptz,
  delivery_attempt_count smallint    not null default 0,

  cancellation_reason    text,
  cancelled_at           timestamptz,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint shipments_cod_amount check (is_cod = (cod_amount_paise > 0) or not is_cod),
  constraint shipments_delivered_has_timestamp
    check (status <> 'DELIVERED' or delivered_at is not null)
);

comment on table fulfillment.shipments is
  'A shipment belongs to exactly one seller, warehouse and carrier. Multi-seller orders produce multiple shipments.';

create unique index shipments_awb_idx on fulfillment.shipments (carrier_id, awb_number)
  where awb_number is not null;
create index shipments_order_idx     on fulfillment.shipments (order_id);
create index shipments_seller_idx    on fulfillment.shipments (seller_id, created_at desc);
create index shipments_warehouse_idx on fulfillment.shipments (warehouse_id, status);
create index shipments_status_idx    on fulfillment.shipments (status, created_at desc);
create index shipments_carrier_idx   on fulfillment.shipments (carrier_id, status);
create index shipments_cod_idx       on fulfillment.shipments (delivered_at)
  where is_cod and status = 'DELIVERED';
-- SLA breach detection.
create index shipments_sla_idx       on fulfillment.shipments (promised_delivery_date)
  where status not in ('DELIVERED', 'CANCELLED', 'RTO_DELIVERED');
create index shipments_reference_trgm_idx on fulfillment.shipments using gin (shipment_reference extensions.gin_trgm_ops);

create trigger shipments_set_updated_at
  before update on fulfillment.shipments
  for each row execute function private.set_updated_at();

create or replace function fulfillment.assign_shipment_reference()
returns trigger
language plpgsql
set search_path = fulfillment, private, pg_catalog
as $$
begin
  if new.shipment_reference is null then
    new.shipment_reference := private.next_reference('SH', 'private.shipment_reference_seq');
  end if;
  -- Chargeable weight is the greater of actual and volumetric.
  if new.actual_weight_grams is not null or new.volumetric_weight_grams is not null then
    new.chargeable_weight_grams := greatest(
      coalesce(new.actual_weight_grams, 0),
      coalesce(new.volumetric_weight_grams, 0)
    );
  end if;
  return new;
end;
$$;

create trigger shipments_assign_reference
  before insert or update of actual_weight_grams, volumetric_weight_grams on fulfillment.shipments
  for each row execute function fulfillment.assign_shipment_reference();

-- -----------------------------------------------------------------------------
-- fulfillment.shipment_items
-- -----------------------------------------------------------------------------
create table fulfillment.shipment_items (
  id             uuid primary key default extensions.gen_random_uuid(),
  shipment_id    uuid        not null references fulfillment.shipments (id) on delete cascade,
  order_item_id  uuid        not null references commerce.order_items (id) on delete restrict,
  sku_id         uuid        not null references catalog.skus (id) on delete restrict,
  quantity       integer     not null check (quantity > 0),
  -- Serial/IMEI capture for high-value electronics.
  serial_numbers text[]      not null default '{}',
  created_at     timestamptz not null default now(),
  unique (shipment_id, order_item_id)
);

create index shipment_items_shipment_idx on fulfillment.shipment_items (shipment_id);
create index shipment_items_order_item_idx on fulfillment.shipment_items (order_item_id);

-- -----------------------------------------------------------------------------
-- fulfillment.shipment_packages — physical boxes, for multi-piece shipments.
-- -----------------------------------------------------------------------------
create table fulfillment.shipment_packages (
  id                uuid primary key default extensions.gen_random_uuid(),
  shipment_id       uuid        not null references fulfillment.shipments (id) on delete cascade,
  package_number    smallint    not null check (package_number > 0),
  -- Carrier's per-piece barcode.
  package_barcode   text,
  length_mm         integer     check (length_mm is null or length_mm > 0),
  width_mm          integer     check (width_mm  is null or width_mm  > 0),
  height_mm         integer     check (height_mm is null or height_mm > 0),
  weight_grams      integer     check (weight_grams is null or weight_grams > 0),
  packaging_type    text        check (packaging_type in ('BOX', 'POLY_BAG', 'ENVELOPE', 'TUBE', 'PALLET')),
  packed_by         uuid        references identity.profiles (id) on delete set null,
  packed_at         timestamptz,
  created_at        timestamptz not null default now(),
  unique (shipment_id, package_number)
);

create index shipment_packages_shipment_idx on fulfillment.shipment_packages (shipment_id);

-- -----------------------------------------------------------------------------
-- fulfillment.shipping_labels
-- -----------------------------------------------------------------------------
create table fulfillment.shipping_labels (
  id             uuid primary key default extensions.gen_random_uuid(),
  shipment_id    uuid        not null references fulfillment.shipments (id) on delete cascade,
  label_format   text        not null default 'PDF' check (label_format in ('PDF', 'PNG', 'ZPL')),
  storage_bucket text        not null default 'documents-private',
  storage_path   text        not null,
  -- Short-lived signed URL; regenerated on demand rather than stored long-lived.
  awb_number     text,
  is_current     boolean     not null default true,
  generated_at   timestamptz not null default now(),
  voided_at      timestamptz,
  void_reason    text
);

create unique index shipping_labels_current_idx on fulfillment.shipping_labels (shipment_id)
  where is_current;
create index shipping_labels_shipment_idx on fulfillment.shipping_labels (shipment_id, generated_at desc);

-- -----------------------------------------------------------------------------
-- fulfillment.tracking_events — append-only, deduplicated on the provider's event id.
-- Out-of-order delivery is normal; the status machine decides what to apply.
-- -----------------------------------------------------------------------------
create table fulfillment.tracking_events (
  id                  uuid primary key default private.uuid_generate_v7(),
  shipment_id         uuid        not null references fulfillment.shipments (id) on delete cascade,
  -- Provider's event identifier; the deduplication key.
  provider_event_id   text,
  carrier_status_code text,
  -- NovaMart's normalised status, mapped from the carrier's vocabulary.
  normalised_status   text        not null,
  description         text        not null,
  location            text,
  location_pincode    public.indian_pincode,
  -- Carrier-reported time vs when we received it: the gap matters for SLA disputes.
  occurred_at         timestamptz not null,
  received_at         timestamptz not null default now(),
  -- Whether this event advanced the shipment status or was recorded only.
  was_applied         boolean     not null default false,
  raw_payload         jsonb       not null default '{}'::jsonb
);

create unique index tracking_events_provider_idx on fulfillment.tracking_events (shipment_id, provider_event_id)
  where provider_event_id is not null;
create index tracking_events_shipment_idx on fulfillment.tracking_events (shipment_id, occurred_at desc);
create index tracking_events_status_idx    on fulfillment.tracking_events (normalised_status, occurred_at desc);

create trigger tracking_events_append_only
  before update or delete on fulfillment.tracking_events
  for each row execute function private.prevent_mutation();

-- -----------------------------------------------------------------------------
-- fulfillment.delivery_attempts + NDR actions (brief §37)
-- -----------------------------------------------------------------------------
create table fulfillment.delivery_attempts (
  id                  uuid primary key default private.uuid_generate_v7(),
  shipment_id         uuid        not null references fulfillment.shipments (id) on delete cascade,
  attempt_number      smallint    not null check (attempt_number > 0),
  outcome             text        not null
                        check (outcome in ('DELIVERED', 'CUSTOMER_NOT_AVAILABLE', 'ADDRESS_INCORRECT',
                                            'CUSTOMER_REFUSED', 'PAYMENT_NOT_READY', 'PREMISES_CLOSED',
                                            'UNREACHABLE', 'OUT_OF_DELIVERY_AREA', 'WEATHER',
                                            'RESCHEDULED_BY_CUSTOMER', 'DAMAGED_IN_TRANSIT')),
  failure_reason      text,
  attempted_at        timestamptz not null default now(),
  agent_name          text,
  agent_phone_masked  text,
  -- Delivery partner id when NovaMart's own logistics performed the attempt.
  delivery_agent_id   uuid        references identity.profiles (id) on delete set null,
  location_latitude   numeric(9, 6),
  location_longitude  numeric(9, 6),
  next_attempt_date   date,
  unique (shipment_id, attempt_number)
);

create index delivery_attempts_shipment_idx on fulfillment.delivery_attempts (shipment_id, attempt_number);
create index delivery_attempts_failed_idx   on fulfillment.delivery_attempts (attempted_at desc)
  where outcome <> 'DELIVERED';
create index delivery_attempts_agent_idx    on fulfillment.delivery_attempts (delivery_agent_id, attempted_at desc)
  where delivery_agent_id is not null;

create table fulfillment.ndr_actions (
  id                  uuid primary key default private.uuid_generate_v7(),
  shipment_id         uuid        not null references fulfillment.shipments (id) on delete cascade,
  delivery_attempt_id uuid        references fulfillment.delivery_attempts (id) on delete set null,
  action              text        not null
                        check (action in ('REATTEMPT', 'RESCHEDULE', 'UPDATE_ADDRESS', 'UPDATE_PHONE',
                                           'CUSTOMER_CONTACTED', 'RTO', 'HOLD_AT_HUB', 'ESCALATE')),
  requested_by_type   text        not null default 'SUPPORT'
                        check (requested_by_type in ('CUSTOMER', 'SELLER', 'SUPPORT', 'SYSTEM')),
  requested_by        uuid        references identity.profiles (id) on delete set null,
  notes               text,
  new_address         jsonb,
  new_phone_masked    text,
  reschedule_date     date,
  -- Whether the carrier accepted the instruction.
  carrier_ack_status  text        check (carrier_ack_status in ('PENDING', 'ACCEPTED', 'REJECTED')),
  carrier_response    jsonb,
  created_at          timestamptz not null default now()
);

create index ndr_actions_shipment_idx on fulfillment.ndr_actions (shipment_id, created_at desc);
create index ndr_actions_pending_idx  on fulfillment.ndr_actions (created_at)
  where carrier_ack_status = 'PENDING';

-- -----------------------------------------------------------------------------
-- fulfillment.delivery_proofs — OTP hash, signature, photo. Never the raw OTP.
-- -----------------------------------------------------------------------------
create table fulfillment.delivery_proofs (
  id                  uuid primary key default extensions.gen_random_uuid(),
  shipment_id         uuid        not null unique references fulfillment.shipments (id) on delete cascade,
  proof_type          text        not null
                        check (proof_type in ('OTP', 'SIGNATURE', 'PHOTO', 'QR_SCAN', 'CARRIER_POD')),
  -- HMAC of the delivery OTP. The raw value is never persisted or logged.
  otp_hash            text,
  otp_verified_at     timestamptz,
  signature_storage_path text,
  photo_storage_path  text,
  storage_bucket      text        default 'documents-private',
  recipient_name      text,
  relationship        text,
  latitude            numeric(9, 6),
  longitude           numeric(9, 6),
  -- Distance between the delivery geotag and the address geocode: a large gap is a
  -- fraud signal worth investigating.
  distance_from_address_metres integer,
  delivered_by        uuid        references identity.profiles (id) on delete set null,
  captured_at         timestamptz not null default now()
);

comment on column fulfillment.delivery_proofs.otp_hash is
  'HMAC of the delivery OTP. Raw OTP values are never stored or logged (SECURITY_MODEL §11).';

create index delivery_proofs_agent_idx on fulfillment.delivery_proofs (delivered_by, captured_at desc)
  where delivered_by is not null;

-- -----------------------------------------------------------------------------
-- fulfillment.cod_remittances — cash collected by agents/carriers, reconciled to
-- the paisa before it counts as payment received.
-- -----------------------------------------------------------------------------
create table fulfillment.cod_remittances (
  id                    uuid primary key default private.uuid_generate_v7(),
  remittance_reference  text        not null unique,
  source_type           text        not null
                          check (source_type in ('CARRIER', 'DELIVERY_AGENT')),
  carrier_id            uuid        references fulfillment.carriers (id) on delete restrict,
  delivery_agent_id     uuid        references identity.profiles (id) on delete restrict,

  collection_date       date        not null,
  expected_amount_paise public.paise not null check (expected_amount_paise >= 0),
  received_amount_paise public.paise not null default 0 check (received_amount_paise >= 0),
  variance_paise        public.paise generated always as
                          (received_amount_paise - expected_amount_paise) stored,
  shipment_count        integer     not null default 0,

  status                text        not null default 'PENDING'
                          check (status in ('PENDING', 'PARTIALLY_RECEIVED', 'RECONCILED',
                                            'SHORT', 'DISPUTED', 'WRITTEN_OFF')),
  bank_reference        text,
  received_at           timestamptz,
  reconciled_by         uuid        references identity.profiles (id) on delete set null,
  reconciled_at         timestamptz,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint cod_remittance_source check (
    (source_type = 'CARRIER' and carrier_id is not null)
 or (source_type = 'DELIVERY_AGENT' and delivery_agent_id is not null)
  )
);

create index cod_remittances_date_idx   on fulfillment.cod_remittances (collection_date desc);
create index cod_remittances_open_idx   on fulfillment.cod_remittances (collection_date)
  where status in ('PENDING', 'PARTIALLY_RECEIVED', 'SHORT', 'DISPUTED');
create index cod_remittances_agent_idx  on fulfillment.cod_remittances (delivery_agent_id, collection_date desc)
  where delivery_agent_id is not null;

create trigger cod_remittances_set_updated_at
  before update on fulfillment.cod_remittances
  for each row execute function private.set_updated_at();

create or replace function fulfillment.assign_remittance_reference()
returns trigger
language plpgsql
set search_path = fulfillment, pg_catalog
as $$
begin
  if new.remittance_reference is null then
    new.remittance_reference := 'CR' || to_char(new.collection_date, 'YYYYMMDD') || '-' ||
                                substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 6);
  end if;
  return new;
end;
$$;

create trigger cod_remittances_assign_reference
  before insert on fulfillment.cod_remittances
  for each row execute function fulfillment.assign_remittance_reference();

create table fulfillment.cod_remittance_items (
  id                uuid primary key default extensions.gen_random_uuid(),
  remittance_id     uuid        not null references fulfillment.cod_remittances (id) on delete cascade,
  shipment_id       uuid        not null references fulfillment.shipments (id) on delete restrict,
  order_id          uuid        not null references commerce.orders (id) on delete restrict,
  expected_paise    public.paise not null check (expected_paise >= 0),
  received_paise    public.paise not null default 0 check (received_paise >= 0),
  match_status      text        not null default 'PENDING'
                      check (match_status in ('PENDING', 'MATCHED', 'SHORT', 'EXCESS', 'MISSING')),
  notes             text,
  created_at        timestamptz not null default now(),
  unique (remittance_id, shipment_id)
);

create index cod_remittance_items_remittance_idx on fulfillment.cod_remittance_items (remittance_id, match_status);
create index cod_remittance_items_shipment_idx   on fulfillment.cod_remittance_items (shipment_id);

-- -----------------------------------------------------------------------------
-- fulfillment.delivery_agent_shifts — availability and cash accountability for
-- NovaMart's own delivery partners (brief §14).
-- -----------------------------------------------------------------------------
create table fulfillment.delivery_agent_shifts (
  id                  uuid primary key default private.uuid_generate_v7(),
  delivery_agent_id   uuid        not null references identity.profiles (id) on delete cascade,
  warehouse_id        uuid        references inventory.warehouses (id) on delete set null,
  shift_date          date        not null,
  status              text        not null default 'AVAILABLE'
                        check (status in ('AVAILABLE', 'ON_DUTY', 'ON_BREAK', 'OFF_DUTY')),
  started_at          timestamptz,
  ended_at            timestamptz,
  shipments_assigned  integer     not null default 0,
  shipments_delivered integer     not null default 0,
  shipments_failed    integer     not null default 0,
  cod_collected_paise public.paise not null default 0,
  cod_deposited_paise public.paise not null default 0,
  distance_km         numeric(8, 2),
  earnings_paise      public.paise not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (delivery_agent_id, shift_date)
);

create index delivery_shifts_agent_idx on fulfillment.delivery_agent_shifts (delivery_agent_id, shift_date desc);
create index delivery_shifts_cash_idx  on fulfillment.delivery_agent_shifts (shift_date desc)
  where cod_collected_paise > cod_deposited_paise;

create trigger delivery_agent_shifts_set_updated_at
  before update on fulfillment.delivery_agent_shifts
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Delivery promise engine (brief §38). Returns a concrete date, not a range.
-- -----------------------------------------------------------------------------
create or replace function fulfillment.calculate_delivery_promise(
  p_warehouse_id  uuid,
  p_pincode       public.indian_pincode,
  p_is_cod        boolean default false,
  p_handling_days smallint default 1,
  p_as_of         timestamptz default now()
)
returns table (
  promised_date     date,
  carrier_id        uuid,
  zone_code         text,
  transit_days      smallint,
  cutoff_missed     boolean,
  is_serviceable    boolean,
  block_reason      text
)
language plpgsql
stable
set search_path = fulfillment, inventory, pg_catalog
as $$
declare
  v_wh          inventory.warehouses;
  v_pin         fulfillment.pincodes;
  v_zone        text;
  v_carrier     record;
  v_dispatch    date;
  v_promised    date;
  v_cutoff_missed boolean := false;
  v_added       smallint := 0;
  v_dow         smallint;
begin
  select * into v_wh from inventory.warehouses where id = p_warehouse_id;
  select * into v_pin from fulfillment.pincodes where pincode = p_pincode;

  if v_wh.id is null then
    return query select null::date, null::uuid, null::text, null::smallint, false, false, 'WAREHOUSE_NOT_FOUND';
    return;
  end if;

  if v_pin.pincode is null or not v_pin.is_serviceable
     or (v_pin.suspended_until is not null and v_pin.suspended_until >= current_date) then
    return query select null::date, null::uuid, null::text, null::smallint, false, false, 'PINCODE_NOT_SERVICEABLE';
    return;
  end if;

  if p_is_cod and not v_pin.cod_available then
    return query select null::date, null::uuid, null::text, null::smallint, false, false, 'COD_NOT_AVAILABLE';
    return;
  end if;

  v_zone := fulfillment.resolve_zone(v_wh.pincode, p_pincode);

  -- Best carrier by SLA, then by platform preference.
  select cs.carrier_id, cs.sla_days
    into v_carrier
    from fulfillment.carrier_serviceability cs
    join fulfillment.carriers c on c.id = cs.carrier_id
   where cs.pincode = p_pincode
     and c.is_active
     and (not p_is_cod or (cs.cod_available and c.supports_cod))
     and (p_is_cod or cs.prepaid_available)
   order by cs.sla_days, c.selection_priority, c.on_time_rate desc nulls last
   limit 1;

  if v_carrier.carrier_id is null then
    return query select null::date, null::uuid, v_zone, null::smallint, false, false, 'NO_CARRIER_AVAILABLE';
    return;
  end if;

  -- Dispatch date: today if before cutoff, else tomorrow, then handling time.
  v_dispatch := (p_as_of at time zone 'Asia/Kolkata')::date;
  if (p_as_of at time zone 'Asia/Kolkata')::time > v_wh.pickup_cutoff_time then
    v_dispatch := v_dispatch + 1;
    v_cutoff_missed := true;
  end if;
  v_dispatch := v_dispatch + p_handling_days;

  -- Roll forward to the next day the warehouse actually operates.
  for i in 0 .. 13 loop
    v_dow := extract(dow from v_dispatch)::smallint;
    exit when v_dow = any (v_wh.operating_days);
    v_dispatch := v_dispatch + 1;
  end loop;

  -- Transit days are calendar days for Indian couriers, plus ODA penalty.
  v_added := v_carrier.sla_days + case when v_pin.is_oda then 2 else 0 end;
  v_promised := v_dispatch + v_added;

  return query select v_promised, v_carrier.carrier_id, v_zone, v_added::smallint,
                      v_cutoff_missed, true, null::text;
end;
$$;

comment on function fulfillment.calculate_delivery_promise(uuid, public.indian_pincode, boolean, smallint, timestamptz) is
  'Returns a concrete promised delivery date from warehouse cutoff, operating days, carrier SLA and ODA penalty.';

-- Deferred references now that shipments exist.
alter table inventory.inventory_ledger
  add constraint inventory_ledger_shipment_fk
  foreign key (shipment_id) references fulfillment.shipments (id) on delete set null;
