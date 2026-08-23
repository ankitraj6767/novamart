-- =============================================================================
-- NovaMart — 0014 Commerce: orders, order items, address snapshots, immutable
--                  price breakdowns, status history, order events
--
-- Multi-seller by construction (brief §31): the customer sees one order number;
-- internally each item has its own seller, warehouse, shipment, status, return and
-- refund lifecycle.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- commerce.orders — the parent order the customer sees.
-- Amounts here are the sum of the item breakdowns, never an independent calculation.
-- -----------------------------------------------------------------------------
create table commerce.orders (
  id                    uuid primary key default private.uuid_generate_v7(),
  -- Customer-facing number: NM100000001.
  order_number          text        not null unique,
  user_id               uuid        not null references identity.profiles (id) on delete restrict,
  checkout_session_id   uuid        references commerce.checkout_sessions (id) on delete set null,

  status                text        not null default 'CREATED',
  -- Denormalised roll-up of item statuses so list views need no aggregation.
  fulfillment_summary   text        not null default 'PENDING'
                          check (fulfillment_summary in ('PENDING', 'PARTIALLY_SHIPPED', 'SHIPPED',
                                                          'PARTIALLY_DELIVERED', 'DELIVERED',
                                                          'PARTIALLY_CANCELLED', 'CANCELLED',
                                                          'PARTIALLY_RETURNED', 'RETURNED')),

  currency              public.currency_code not null default 'INR',
  items_count           integer     not null default 0 check (items_count >= 0),
  units_count           integer     not null default 0 check (units_count >= 0),
  sellers_count         smallint    not null default 0 check (sellers_count >= 0),

  -- Authoritative totals, mirrored from order_price_breakdowns for fast reads.
  items_subtotal_paise      public.paise not null check (items_subtotal_paise >= 0),
  total_discount_paise      public.paise not null default 0 check (total_discount_paise >= 0),
  shipping_paise            public.paise not null default 0 check (shipping_paise >= 0),
  cod_fee_paise             public.paise not null default 0 check (cod_fee_paise >= 0),
  tax_paise                 public.paise not null default 0 check (tax_paise >= 0),
  total_payable_paise       public.paise not null check (total_payable_paise >= 0),
  -- Amount actually captured; may lag total_payable_paise for COD.
  amount_paid_paise         public.paise not null default 0 check (amount_paid_paise >= 0),
  amount_refunded_paise     public.paise not null default 0 check (amount_refunded_paise >= 0),

  payment_method        text        not null
                          check (payment_method in ('UPI', 'CARD', 'NET_BANKING', 'WALLET',
                                                    'EMI', 'COD', 'PAY_LATER', 'GIFT_CARD', 'MIXED')),
  payment_status        text        not null default 'PENDING'
                          check (payment_status in ('PENDING', 'AUTHORISED', 'PAID', 'PARTIALLY_PAID',
                                                     'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED',
                                                     'PENDING_COD')),
  is_cod                boolean     not null default false,

  applied_coupon_id     uuid        references pricing.coupons (id) on delete set null,
  applied_coupon_code   text,

  delivery_pincode      public.indian_pincode not null references fulfillment.pincodes (pincode) on delete restrict,
  -- Promise shown at checkout, retained so SLA breaches are measurable.
  promised_delivery_date date,

  -- Gifting
  is_gift               boolean     not null default false,
  gift_message          text,

  -- Cancellation
  cancelled_at          timestamptz,
  cancelled_by          uuid        references identity.profiles (id) on delete set null,
  cancellation_actor    text        check (cancellation_actor in ('CUSTOMER', 'SELLER', 'SUPPORT', 'SYSTEM')),
  cancellation_reason   text,

  -- Risk assessment captured at order time.
  risk_score            numeric(5, 2),
  risk_flags            text[]      not null default '{}',

  client_platform       text        check (client_platform in ('android', 'ios', 'web')),
  client_version        text,
  placed_from_ip        inet,
  request_id            text,
  trace_id              text,

  placed_at             timestamptz not null default now(),
  confirmed_at          timestamptz,
  completed_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint orders_cancellation_fields
    check (cancelled_at is null or (cancellation_reason is not null and cancellation_actor is not null)),
  -- Refunds can never exceed what was captured.
  constraint orders_refund_within_paid check (amount_refunded_paise <= amount_paid_paise),
  constraint orders_cod_payment_method check (is_cod = (payment_method = 'COD'))
);

comment on table commerce.orders is
  'Parent order. One customer-facing number; per-item lifecycles live in order_items (brief §31).';

create index orders_user_idx        on commerce.orders (user_id, placed_at desc);
create index orders_status_idx      on commerce.orders (status, placed_at desc);
create index orders_payment_idx     on commerce.orders (payment_status, placed_at desc);
create index orders_placed_idx      on commerce.orders (placed_at desc);
create index orders_pincode_idx     on commerce.orders (delivery_pincode);
create index orders_cod_idx         on commerce.orders (placed_at desc) where is_cod;
create index orders_number_trgm_idx on commerce.orders using gin (order_number extensions.gin_trgm_ops);
-- Payment-pending sweeper: orders stuck awaiting payment.
create index orders_pending_payment_idx on commerce.orders (created_at)
  where payment_status = 'PENDING' and status in ('CREATED', 'PENDING_PAYMENT');
create index orders_risk_idx        on commerce.orders (risk_score desc) where risk_score is not null;

create trigger orders_set_updated_at
  before update on commerce.orders
  for each row execute function private.set_updated_at();

create or replace function commerce.assign_order_number()
returns trigger
language plpgsql
set search_path = commerce, private, pg_catalog
as $$
begin
  if new.order_number is null then
    new.order_number := private.next_reference('NM', 'private.order_reference_seq');
  end if;
  return new;
end;
$$;

create trigger orders_assign_number
  before insert on commerce.orders
  for each row execute function commerce.assign_order_number();

-- -----------------------------------------------------------------------------
-- commerce.order_status_transitions — the state machine as DATA (ADR 0012).
-- Adding a legitimate transition is a migration/config change, not a code change
-- across five clients.
-- -----------------------------------------------------------------------------
create table commerce.order_status_transitions (
  from_status         text        not null,
  to_status           text        not null,
  -- Which principal types may perform this transition.
  allowed_actor_types text[]      not null default '{SYSTEM}',
  requires_reason     boolean     not null default false,
  -- Applies to the parent order, the item, or both.
  applies_to          text        not null default 'ITEM'
                        check (applies_to in ('ORDER', 'ITEM', 'BOTH')),
  description         text,
  primary key (from_status, to_status, applies_to)
);

comment on table commerce.order_status_transitions is
  'Allowed status transitions. A transition absent from this table is rejected by trigger (ADR 0012).';

-- Rank orders the lifecycle so late/out-of-order provider webhooks cannot regress
-- a status (a "shipped" event arriving after "delivered" is recorded, not applied).
create table commerce.order_status_ranks (
  status   text     primary key,
  rank     smallint not null,
  is_terminal boolean not null default false,
  -- Statuses in which the customer may still cancel.
  customer_cancellable boolean not null default false
);

insert into commerce.order_status_ranks (status, rank, is_terminal, customer_cancellable) values
  ('CREATED',                 10, false, true),
  ('PENDING_PAYMENT',         20, false, true),
  ('PAYMENT_FAILED',          25, true,  false),
  ('PAYMENT_CONFIRMED',       30, false, true),
  ('CONFIRMED',               40, false, true),
  ('ALLOCATED',               50, false, true),
  ('PROCESSING',              60, false, true),
  ('PACKED',                  70, false, false),
  ('READY_TO_SHIP',           75, false, false),
  ('SHIPPED',                 80, false, false),
  ('OUT_FOR_DELIVERY',        90, false, false),
  ('DELIVERED',              100, false, false),
  ('CANCELLATION_REQUESTED',  45, false, false),
  ('CANCELLED',               46, true,  false),
  ('RETURN_REQUESTED',       110, false, false),
  ('RETURN_APPROVED',        120, false, false),
  ('RETURN_REJECTED',        121, true,  false),
  ('RETURN_PICKED',          130, false, false),
  ('RETURN_RECEIVED',        140, false, false),
  ('RETURN_QC_COMPLETED',    150, false, false),
  ('REFUND_PENDING',         160, false, false),
  ('REFUNDED',               170, true,  false),
  ('REFUND_FAILED',          165, false, false),
  ('REPLACEMENT_CREATED',    155, true,  false),
  ('RTO_INITIATED',          105, false, false),
  ('RTO_DELIVERED',          106, true,  false),
  ('LOST_IN_TRANSIT',        107, true,  false);

-- Forward lifecycle.
insert into commerce.order_status_transitions (from_status, to_status, allowed_actor_types, requires_reason, applies_to, description) values
  ('CREATED',            'PENDING_PAYMENT',   '{SYSTEM}',                         false, 'BOTH', 'Payment intent created'),
  ('CREATED',            'CONFIRMED',         '{SYSTEM}',                         false, 'BOTH', 'COD order needs no capture'),
  ('CREATED',            'CANCELLED',         '{CUSTOMER,SUPPORT,SYSTEM}',        true,  'BOTH', 'Abandoned before payment'),
  ('PENDING_PAYMENT',    'PAYMENT_CONFIRMED', '{SYSTEM}',                         false, 'BOTH', 'Verified provider success'),
  ('PENDING_PAYMENT',    'PAYMENT_FAILED',    '{SYSTEM}',                         true,  'BOTH', 'Provider reported failure'),
  ('PENDING_PAYMENT',    'CANCELLED',         '{CUSTOMER,SUPPORT,SYSTEM}',        true,  'BOTH', 'Customer abandoned payment'),
  ('PAYMENT_FAILED',     'PENDING_PAYMENT',   '{CUSTOMER,SYSTEM}',                false, 'BOTH', 'Customer retried payment'),
  ('PAYMENT_CONFIRMED',  'CONFIRMED',         '{SYSTEM}',                         false, 'BOTH', 'Order accepted for fulfilment'),
  ('CONFIRMED',          'ALLOCATED',         '{SYSTEM}',                         false, 'ITEM', 'Fulfilment node assigned'),
  ('CONFIRMED',          'CANCELLATION_REQUESTED', '{CUSTOMER,SUPPORT}',          true,  'BOTH', 'Customer requested cancellation'),
  ('CONFIRMED',          'CANCELLED',         '{SELLER,SUPPORT,SYSTEM}',          true,  'BOTH', 'Seller or platform cancelled'),
  ('ALLOCATED',          'PROCESSING',        '{SELLER,WAREHOUSE,SYSTEM}',        false, 'ITEM', 'Picking started'),
  ('ALLOCATED',          'CANCELLATION_REQUESTED', '{CUSTOMER,SUPPORT}',          true,  'ITEM', 'Customer requested cancellation'),
  ('ALLOCATED',          'CANCELLED',         '{SELLER,SUPPORT,SYSTEM}',          true,  'ITEM', 'Cancelled before processing'),
  ('PROCESSING',         'PACKED',            '{SELLER,WAREHOUSE}',               false, 'ITEM', 'Packed and QC passed'),
  ('PROCESSING',         'CANCELLED',         '{SELLER,SUPPORT,SYSTEM}',          true,  'ITEM', 'Cancelled during processing'),
  ('PACKED',             'READY_TO_SHIP',     '{SELLER,WAREHOUSE,SYSTEM}',        false, 'ITEM', 'Label generated, awaiting pickup'),
  ('PACKED',             'CANCELLED',         '{SUPPORT,SYSTEM}',                 true,  'ITEM', 'Cancelled before handover'),
  ('READY_TO_SHIP',      'SHIPPED',           '{SYSTEM,WAREHOUSE}',               false, 'ITEM', 'Handed to carrier'),
  ('READY_TO_SHIP',      'CANCELLED',         '{SUPPORT,SYSTEM}',                 true,  'ITEM', 'Cancelled before handover'),
  ('SHIPPED',            'OUT_FOR_DELIVERY',  '{SYSTEM}',                         false, 'ITEM', 'Carrier out for delivery'),
  ('SHIPPED',            'RTO_INITIATED',     '{SYSTEM}',                         true,  'ITEM', 'Undeliverable, returning to origin'),
  ('SHIPPED',            'LOST_IN_TRANSIT',   '{SUPPORT,SYSTEM}',                 true,  'ITEM', 'Carrier lost the shipment'),
  ('OUT_FOR_DELIVERY',   'DELIVERED',         '{SYSTEM}',                         false, 'ITEM', 'Delivery confirmed'),
  ('OUT_FOR_DELIVERY',   'RTO_INITIATED',     '{SYSTEM}',                         true,  'ITEM', 'Delivery attempts exhausted'),
  ('OUT_FOR_DELIVERY',   'LOST_IN_TRANSIT',   '{SUPPORT,SYSTEM}',                 true,  'ITEM', 'Carrier lost the shipment'),
  ('RTO_INITIATED',      'RTO_DELIVERED',     '{SYSTEM,WAREHOUSE}',               false, 'ITEM', 'Returned to origin'),
  -- Cancellation request resolution.
  ('CANCELLATION_REQUESTED', 'CANCELLED',     '{SELLER,SUPPORT,SYSTEM}',          true,  'BOTH', 'Cancellation approved'),
  ('CANCELLATION_REQUESTED', 'PROCESSING',    '{SELLER,SUPPORT}',                 true,  'ITEM', 'Cancellation rejected, already in progress'),
  -- Post-delivery.
  ('DELIVERED',          'RETURN_REQUESTED',  '{CUSTOMER,SUPPORT}',               true,  'ITEM', 'Return requested within window'),
  ('RETURN_REQUESTED',   'RETURN_APPROVED',   '{SELLER,SUPPORT,SYSTEM}',          false, 'ITEM', 'Return approved'),
  ('RETURN_REQUESTED',   'RETURN_REJECTED',   '{SELLER,SUPPORT}',                 true,  'ITEM', 'Return rejected'),
  ('RETURN_APPROVED',    'RETURN_PICKED',     '{SYSTEM}',                         false, 'ITEM', 'Reverse pickup completed'),
  ('RETURN_PICKED',      'RETURN_RECEIVED',   '{WAREHOUSE,SELLER,SYSTEM}',        false, 'ITEM', 'Item received at return centre'),
  ('RETURN_RECEIVED',    'RETURN_QC_COMPLETED', '{WAREHOUSE,SELLER}',             false, 'ITEM', 'QC inspection completed'),
  ('RETURN_QC_COMPLETED','REFUND_PENDING',    '{SYSTEM}',                         false, 'ITEM', 'Refund queued'),
  ('RETURN_QC_COMPLETED','REPLACEMENT_CREATED', '{SYSTEM}',                       false, 'ITEM', 'Replacement order created'),
  ('RETURN_QC_COMPLETED','RETURN_REJECTED',   '{WAREHOUSE,SUPPORT}',              true,  'ITEM', 'Failed QC, return rejected'),
  -- Refunds. Cancellation and RTO also refund.
  ('CANCELLED',          'REFUND_PENDING',    '{SYSTEM}',                         false, 'ITEM', 'Refund queued for cancelled item'),
  ('RTO_DELIVERED',      'REFUND_PENDING',    '{SYSTEM}',                         false, 'ITEM', 'Refund queued after RTO'),
  ('LOST_IN_TRANSIT',    'REFUND_PENDING',    '{SYSTEM}',                         false, 'ITEM', 'Refund queued for lost shipment'),
  ('REFUND_PENDING',     'REFUNDED',          '{SYSTEM}',                         false, 'ITEM', 'Refund settled by provider'),
  ('REFUND_PENDING',     'REFUND_FAILED',     '{SYSTEM}',                         true,  'ITEM', 'Provider refund failed'),
  ('REFUND_FAILED',      'REFUND_PENDING',    '{SUPPORT,SYSTEM}',                 false, 'ITEM', 'Refund retried');

create index order_status_transitions_from_idx on commerce.order_status_transitions (from_status, applies_to);

-- -----------------------------------------------------------------------------
-- Order-level status is constrained by the same table.
-- -----------------------------------------------------------------------------
alter table commerce.orders
  add constraint orders_status_known
  foreign key (status) references commerce.order_status_ranks (status) on update cascade;

-- -----------------------------------------------------------------------------
-- commerce.order_items — the real unit of fulfilment.
-- -----------------------------------------------------------------------------
create table commerce.order_items (
  id                    uuid primary key default private.uuid_generate_v7(),
  order_id              uuid        not null references commerce.orders (id) on delete restrict,
  -- Per-item customer-facing suffix: NM100000001-1.
  item_number           text        not null,
  line_number           smallint    not null check (line_number > 0),

  listing_id            uuid        not null references catalog.seller_listings (id) on delete restrict,
  sku_id                uuid        not null references catalog.skus (id) on delete restrict,
  product_id            uuid        not null references catalog.products (id) on delete restrict,
  seller_id             uuid        not null references seller.sellers (id) on delete restrict,
  warehouse_id          uuid        references inventory.warehouses (id) on delete set null,
  reservation_id        uuid        references inventory.inventory_reservations (id) on delete set null,

  -- Snapshot of catalog identity: the product may be renamed or delisted later, but
  -- the invoice must still say what was bought.
  product_title         text        not null,
  variant_label         text,
  sku_code              text        not null,
  brand_name            text,
  primary_image_url     text,
  hsn_code              public.hsn_code,

  quantity              integer     not null check (quantity > 0),
  status                text        not null default 'CREATED'
                          references commerce.order_status_ranks (status) on update cascade,
  status_reason         text,

  fulfillment_model     text        not null default 'SELLER_FULFILLED',

  -- Policy captured AT ORDER TIME. Return eligibility is judged against this, not
  -- against today's policy (ADR 0010).
  return_window_days    smallint    not null default 0,
  return_type           text        not null default 'NON_RETURNABLE',
  return_eligible_until date,
  is_replacement_allowed boolean    not null default false,

  promised_dispatch_by  timestamptz,
  promised_delivery_date date,
  dispatched_at         timestamptz,
  delivered_at          timestamptz,
  cancelled_at          timestamptz,

  -- Quantities affected by post-purchase events, for partial handling.
  cancelled_quantity    integer     not null default 0 check (cancelled_quantity >= 0),
  returned_quantity     integer     not null default 0 check (returned_quantity >= 0),
  refunded_paise         public.paise not null default 0 check (refunded_paise >= 0),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  unique (order_id, line_number),
  unique (item_number),
  constraint order_items_cancelled_within_quantity check (cancelled_quantity <= quantity),
  constraint order_items_returned_within_quantity  check (returned_quantity  <= quantity),
  constraint order_items_status_reason
    check (status not in ('CANCELLED', 'RETURN_REJECTED', 'REFUND_FAILED') or status_reason is not null)
);

comment on table commerce.order_items is
  'The fulfilment unit. Independent seller, warehouse, shipment, status, return and refund lifecycle per item.';
comment on column commerce.order_items.return_window_days is
  'Snapshotted at order time. Return eligibility must not change because the policy changed later.';

create index order_items_order_idx      on commerce.order_items (order_id, line_number);
create index order_items_seller_idx     on commerce.order_items (seller_id, created_at desc);
create index order_items_status_idx     on commerce.order_items (status, created_at desc);
create index order_items_sku_idx        on commerce.order_items (sku_id, created_at desc);
create index order_items_warehouse_idx  on commerce.order_items (warehouse_id, status)
  where warehouse_id is not null;
create index order_items_listing_idx    on commerce.order_items (listing_id);
-- Seller SLA breach detection.
create index order_items_dispatch_due_idx on commerce.order_items (promised_dispatch_by)
  where status in ('CONFIRMED', 'ALLOCATED', 'PROCESSING') and dispatched_at is null;
-- Return window expiry sweep.
create index order_items_return_window_idx on commerce.order_items (return_eligible_until)
  where status = 'DELIVERED' and return_eligible_until is not null;
create index order_items_delivered_idx   on commerce.order_items (delivered_at desc)
  where delivered_at is not null;

create trigger order_items_set_updated_at
  before update on commerce.order_items
  for each row execute function private.set_updated_at();

create or replace function commerce.assign_order_item_number()
returns trigger
language plpgsql
set search_path = commerce, pg_catalog
as $$
declare
  v_order_number text;
begin
  if new.item_number is null then
    select order_number into v_order_number from commerce.orders where id = new.order_id;
    new.item_number := v_order_number || '-' || new.line_number::text;
  end if;
  return new;
end;
$$;

create trigger order_items_assign_number
  before insert on commerce.order_items
  for each row execute function commerce.assign_order_item_number();

-- -----------------------------------------------------------------------------
-- commerce.order_addresses — immutable snapshot (customer may edit or delete the
-- source address afterwards; the shipment and invoice must not change).
-- -----------------------------------------------------------------------------
create table commerce.order_addresses (
  id                uuid primary key default extensions.gen_random_uuid(),
  order_id          uuid        not null references commerce.orders (id) on delete cascade,
  address_type      text        not null check (address_type in ('SHIPPING', 'BILLING')),
  source_address_id uuid        references identity.addresses (id) on delete set null,

  recipient_name    text        not null,
  recipient_phone   public.phone_e164 not null,
  alternate_phone   public.phone_e164,
  address_line1     text        not null,
  address_line2     text,
  landmark          text,
  locality          text,
  city              text        not null,
  district          text,
  state_code        text        not null,
  pincode           public.indian_pincode not null,
  country_code      text        not null default 'IN',
  latitude          numeric(9, 6),
  longitude         numeric(9, 6),
  delivery_instructions text,
  created_at        timestamptz not null default now(),
  unique (order_id, address_type)
);

create trigger order_addresses_append_only
  before update or delete on commerce.order_addresses
  for each row execute function private.prevent_mutation();

-- -----------------------------------------------------------------------------
-- commerce.order_item_price_breakdowns — the immutable money record (ADR 0010).
-- Everything downstream (invoice, refund, commission, settlement) reads THIS.
-- -----------------------------------------------------------------------------
create table commerce.order_item_price_breakdowns (
  order_item_id             uuid primary key references commerce.order_items (id) on delete cascade,
  order_id                  uuid        not null references commerce.orders (id) on delete cascade,
  schema_version            smallint    not null default 1,
  currency                  public.currency_code not null default 'INR',

  quantity                  integer     not null check (quantity > 0),
  -- Per-unit values.
  unit_mrp_paise            public.paise not null check (unit_mrp_paise > 0),
  unit_selling_price_paise  public.paise not null check (unit_selling_price_paise > 0),

  -- Line-level components, in the order the engine applies them (brief §27).
  gross_paise               public.paise not null check (gross_paise >= 0),
  seller_discount_paise     public.paise not null default 0 check (seller_discount_paise >= 0),
  platform_discount_paise   public.paise not null default 0 check (platform_discount_paise >= 0),
  coupon_discount_paise     public.paise not null default 0 check (coupon_discount_paise >= 0),
  promotion_discount_paise  public.paise not null default 0 check (promotion_discount_paise >= 0),
  bank_offer_discount_paise public.paise not null default 0 check (bank_offer_discount_paise >= 0),
  total_discount_paise      public.paise not null default 0 check (total_discount_paise >= 0),

  shipping_paise            public.paise not null default 0 check (shipping_paise >= 0),
  cod_fee_paise             public.paise not null default 0 check (cod_fee_paise >= 0),
  gift_wrap_paise           public.paise not null default 0 check (gift_wrap_paise >= 0),

  -- GST. Indian retail prices are tax-inclusive, so taxable value is derived.
  taxable_value_paise       public.paise not null check (taxable_value_paise >= 0),
  gst_rate                  public.percentage not null,
  cgst_paise                public.paise not null default 0 check (cgst_paise >= 0),
  sgst_paise                public.paise not null default 0 check (sgst_paise >= 0),
  igst_paise                public.paise not null default 0 check (igst_paise >= 0),
  cess_paise                public.paise not null default 0 check (cess_paise >= 0),
  total_tax_paise           public.paise not null default 0 check (total_tax_paise >= 0),
  is_intra_state            boolean     not null,
  place_of_supply_state_code text       not null,

  total_payable_paise       public.paise not null check (total_payable_paise >= 0),

  -- Marketplace economics, computed at order time from the rules then in force.
  commission_rule_id        uuid,
  commission_rate           public.percentage,
  commission_paise          public.paise not null default 0 check (commission_paise >= 0),
  commission_gst_paise      public.paise not null default 0 check (commission_gst_paise >= 0),
  platform_fee_paise        public.paise not null default 0 check (platform_fee_paise >= 0),
  payment_gateway_fee_paise public.paise not null default 0 check (payment_gateway_fee_paise >= 0),
  fulfillment_fee_paise     public.paise not null default 0 check (fulfillment_fee_paise >= 0),
  -- What the seller earns before settlement adjustments.
  seller_payable_paise      public.paise not null,

  -- Which promotion/coupon/tax/commission rules fired, with their ids and versions.
  applied_rules             jsonb       not null default '[]'::jsonb,
  computed_at               timestamptz not null default now(),

  -- Intra-state supply means CGST+SGST; inter-state means IGST. Never both.
  constraint breakdown_gst_split_consistent check (
    (is_intra_state     and igst_paise = 0)
 or (not is_intra_state and cgst_paise = 0 and sgst_paise = 0)
  ),
  -- CGST and SGST are always equal halves.
  constraint breakdown_cgst_equals_sgst check (cgst_paise = sgst_paise),
  constraint breakdown_tax_total check (total_tax_paise = cgst_paise + sgst_paise + igst_paise + cess_paise),
  constraint breakdown_discount_total check (
    total_discount_paise = seller_discount_paise + platform_discount_paise
                         + coupon_discount_paise + promotion_discount_paise
                         + bank_offer_discount_paise
  ),
  -- The arithmetic must close: gross - discounts + charges = payable.
  constraint breakdown_total_closes check (
    total_payable_paise = gross_paise - total_discount_paise
                        + shipping_paise + cod_fee_paise + gift_wrap_paise
  ),
  constraint breakdown_gross_matches_units check (gross_paise = unit_selling_price_paise * quantity)
);

comment on table commerce.order_item_price_breakdowns is
  'Immutable price snapshot per item. Invoices, refunds, commissions and settlements read only from here.';
comment on constraint breakdown_total_closes on commerce.order_item_price_breakdowns is
  'Arithmetic closure check. A pricing bug fails the INSERT instead of silently charging the wrong amount.';

create index order_item_breakdowns_order_idx on commerce.order_item_price_breakdowns (order_id);

create trigger order_item_breakdowns_append_only
  before update or delete on commerce.order_item_price_breakdowns
  for each row execute function private.prevent_mutation();

-- -----------------------------------------------------------------------------
-- commerce.order_price_breakdowns — order-level totals, equally immutable.
-- -----------------------------------------------------------------------------
create table commerce.order_price_breakdowns (
  order_id                  uuid primary key references commerce.orders (id) on delete cascade,
  schema_version            smallint    not null default 1,
  currency                  public.currency_code not null default 'INR',

  items_gross_paise         public.paise not null check (items_gross_paise >= 0),
  seller_discount_paise     public.paise not null default 0,
  platform_discount_paise   public.paise not null default 0,
  coupon_discount_paise     public.paise not null default 0,
  promotion_discount_paise  public.paise not null default 0,
  bank_offer_discount_paise public.paise not null default 0,
  total_discount_paise      public.paise not null default 0,
  shipping_paise            public.paise not null default 0,
  cod_fee_paise             public.paise not null default 0,
  gift_wrap_paise           public.paise not null default 0,
  taxable_value_paise       public.paise not null default 0,
  cgst_paise                public.paise not null default 0,
  sgst_paise                public.paise not null default 0,
  igst_paise                public.paise not null default 0,
  cess_paise                public.paise not null default 0,
  total_tax_paise           public.paise not null default 0,
  total_payable_paise       public.paise not null check (total_payable_paise >= 0),
  -- Rounding applied to reach a whole-rupee charge, if the payment method requires it.
  rounding_adjustment_paise integer     not null default 0,
  applied_rules             jsonb       not null default '[]'::jsonb,
  computed_at               timestamptz not null default now(),

  constraint order_breakdown_total_closes check (
    total_payable_paise = items_gross_paise - total_discount_paise
                        + shipping_paise + cod_fee_paise + gift_wrap_paise
                        + rounding_adjustment_paise
  )
);

create trigger order_breakdowns_append_only
  before update or delete on commerce.order_price_breakdowns
  for each row execute function private.prevent_mutation();

-- -----------------------------------------------------------------------------
-- Status history — append-only, written by trigger so no caller can skip it.
-- -----------------------------------------------------------------------------
create table commerce.order_status_history (
  id           uuid primary key default private.uuid_generate_v7(),
  order_id     uuid        not null references commerce.orders (id) on delete cascade,
  from_status  text,
  to_status    text        not null,
  reason       text,
  actor_id     uuid        references identity.profiles (id) on delete set null,
  actor_type   text        not null default 'SYSTEM',
  request_id   text,
  trace_id     text,
  occurred_at  timestamptz not null default now()
);

create index order_status_history_order_idx on commerce.order_status_history (order_id, occurred_at desc);

create trigger order_status_history_append_only
  before update or delete on commerce.order_status_history
  for each row execute function private.prevent_mutation();

create table commerce.order_item_status_history (
  id            uuid primary key default private.uuid_generate_v7(),
  order_item_id uuid        not null references commerce.order_items (id) on delete cascade,
  order_id      uuid        not null references commerce.orders (id) on delete cascade,
  from_status   text,
  to_status     text        not null,
  reason        text,
  actor_id      uuid        references identity.profiles (id) on delete set null,
  actor_type    text        not null default 'SYSTEM',
  -- Location/context at transition time, useful for delivery disputes.
  context       jsonb       not null default '{}'::jsonb,
  request_id    text,
  trace_id      text,
  occurred_at   timestamptz not null default now()
);

create index order_item_status_history_item_idx  on commerce.order_item_status_history (order_item_id, occurred_at desc);
create index order_item_status_history_order_idx on commerce.order_item_status_history (order_id, occurred_at desc);

create trigger order_item_status_history_append_only
  before update or delete on commerce.order_item_status_history
  for each row execute function private.prevent_mutation();

-- -----------------------------------------------------------------------------
-- commerce.order_events — the customer-visible timeline, decoupled from internal
-- statuses so the UI copy can change without touching the state machine.
-- -----------------------------------------------------------------------------
create table commerce.order_events (
  id            uuid primary key default private.uuid_generate_v7(),
  order_id      uuid        not null references commerce.orders (id) on delete cascade,
  order_item_id uuid        references commerce.order_items (id) on delete cascade,
  event_type    text        not null,
  -- Localisation key plus parameters, so the timeline renders in the user's language.
  title_key     text        not null,
  description_key text,
  params        jsonb       not null default '{}'::jsonb,
  is_customer_visible boolean not null default true,
  icon          text,
  occurred_at   timestamptz not null default now()
);

create index order_events_order_idx on commerce.order_events (order_id, occurred_at desc);
create index order_events_item_idx  on commerce.order_events (order_item_id, occurred_at desc)
  where order_item_id is not null;

create trigger order_events_append_only
  before update or delete on commerce.order_events
  for each row execute function private.prevent_mutation();

-- =============================================================================
-- The transition guard (ADR 0012). This is the last line of defence: whichever
-- code path writes a status, an illegal transition is rejected here.
-- =============================================================================
create or replace function commerce.guard_order_item_transition()
returns trigger
language plpgsql
set search_path = commerce, private, pg_catalog
as $$
declare
  v_actor_type   text := coalesce(nullif(current_setting('novamart.actor_type', true), ''), 'SYSTEM');
  v_transition   commerce.order_status_transitions;
  v_from_rank    smallint;
  v_to_rank      smallint;
begin
  if new.status = old.status then
    return new;
  end if;

  select * into v_transition
    from commerce.order_status_transitions t
   where t.from_status = old.status
     and t.to_status = new.status
     and t.applies_to in ('ITEM', 'BOTH')
   limit 1;

  if v_transition.from_status is null then
    select rank into v_from_rank from commerce.order_status_ranks where status = old.status;
    select rank into v_to_rank   from commerce.order_status_ranks where status = new.status;

    raise exception 'Illegal order item transition % → % (item %)', old.status, new.status, old.item_number
      using errcode = 'NM002',
            hint = 'INVALID_STATE_TRANSITION',
            detail = format('from_rank=%s to_rank=%s', v_from_rank, v_to_rank);
  end if;

  if not (v_actor_type = any (v_transition.allowed_actor_types)) then
    raise exception 'Actor type % may not perform transition % → %', v_actor_type, old.status, new.status
      using errcode = 'NM002', hint = 'INVALID_STATE_TRANSITION';
  end if;

  if v_transition.requires_reason and coalesce(trim(new.status_reason), '') = '' then
    raise exception 'Transition % → % requires a reason', old.status, new.status
      using errcode = 'NM002', hint = 'INVALID_STATE_TRANSITION';
  end if;

  -- Maintain lifecycle timestamps so no caller has to remember them.
  if new.status = 'SHIPPED' and new.dispatched_at is null then
    new.dispatched_at := now();
  end if;
  if new.status = 'DELIVERED' then
    if new.delivered_at is null then
      new.delivered_at := now();
    end if;
    -- Return window starts at delivery, using the policy snapshotted at order time.
    if new.return_window_days > 0 and new.return_eligible_until is null then
      new.return_eligible_until := (new.delivered_at + (new.return_window_days || ' days')::interval)::date;
    end if;
  end if;
  if new.status = 'CANCELLED' and new.cancelled_at is null then
    new.cancelled_at := now();
    new.cancelled_quantity := new.quantity - new.returned_quantity;
  end if;

  return new;
end;
$$;

create trigger order_items_guard_transition
  before update of status on commerce.order_items
  for each row execute function commerce.guard_order_item_transition();

create or replace function commerce.guard_order_transition()
returns trigger
language plpgsql
set search_path = commerce, pg_catalog
as $$
declare
  v_actor_type text := coalesce(nullif(current_setting('novamart.actor_type', true), ''), 'SYSTEM');
  v_exists     boolean;
begin
  if new.status = old.status then
    return new;
  end if;

  select exists (
    select 1 from commerce.order_status_transitions t
     where t.from_status = old.status
       and t.to_status = new.status
       and t.applies_to in ('ORDER', 'BOTH')
       and v_actor_type = any (t.allowed_actor_types)
  ) into v_exists;

  if not v_exists then
    raise exception 'Illegal order transition % → % (order %) for actor %',
      old.status, new.status, old.order_number, v_actor_type
      using errcode = 'NM002', hint = 'INVALID_STATE_TRANSITION';
  end if;

  if new.status = 'CONFIRMED' and new.confirmed_at is null then
    new.confirmed_at := now();
  end if;

  return new;
end;
$$;

create trigger orders_guard_transition
  before update of status on commerce.orders
  for each row execute function commerce.guard_order_transition();

-- History recording, unconditional.
create or replace function commerce.record_order_item_status()
returns trigger
language plpgsql
set search_path = commerce, private, pg_catalog
as $$
begin
  insert into commerce.order_item_status_history (
    order_item_id, order_id, from_status, to_status, reason,
    actor_id, actor_type, request_id, trace_id
  ) values (
    new.id, new.order_id,
    case when tg_op = 'INSERT' then null else old.status end,
    new.status, new.status_reason,
    private.current_actor_id(),
    coalesce(nullif(current_setting('novamart.actor_type', true), ''), 'SYSTEM'),
    private.current_request_id(), private.current_trace_id()
  );
  return null;
end;
$$;

create trigger order_items_record_status
  after insert or update of status on commerce.order_items
  for each row execute function commerce.record_order_item_status();

create or replace function commerce.record_order_status()
returns trigger
language plpgsql
set search_path = commerce, private, pg_catalog
as $$
begin
  insert into commerce.order_status_history (
    order_id, from_status, to_status, reason, actor_id, actor_type, request_id, trace_id
  ) values (
    new.id,
    case when tg_op = 'INSERT' then null else old.status end,
    new.status, new.cancellation_reason,
    private.current_actor_id(),
    coalesce(nullif(current_setting('novamart.actor_type', true), ''), 'SYSTEM'),
    private.current_request_id(), private.current_trace_id()
  );
  return null;
end;
$$;

create trigger orders_record_status
  after insert or update of status on commerce.orders
  for each row execute function commerce.record_order_status();

-- -----------------------------------------------------------------------------
-- Roll up item statuses into the parent order's fulfillment_summary so list views
-- need no aggregation. Derived, never authoritative.
-- -----------------------------------------------------------------------------
create or replace function commerce.refresh_order_fulfillment_summary()
returns trigger
language plpgsql
set search_path = commerce, pg_catalog
as $$
declare
  v_order_id uuid := coalesce(new.order_id, old.order_id);
  v_total    integer;
  v_delivered integer;
  v_shipped  integer;
  v_cancelled integer;
  v_returned integer;
  v_summary  text;
begin
  select count(*),
         count(*) filter (where oi.status = 'DELIVERED'),
         count(*) filter (where oi.status in ('SHIPPED', 'OUT_FOR_DELIVERY')),
         count(*) filter (where oi.status = 'CANCELLED'),
         count(*) filter (where oi.status in ('RETURN_RECEIVED', 'RETURN_QC_COMPLETED', 'REFUNDED'))
    into v_total, v_delivered, v_shipped, v_cancelled, v_returned
    from commerce.order_items oi
   where oi.order_id = v_order_id;

  v_summary := case
    when v_total = 0                    then 'PENDING'
    when v_cancelled = v_total          then 'CANCELLED'
    when v_returned = v_total           then 'RETURNED'
    when v_delivered = v_total          then 'DELIVERED'
    when v_returned > 0                 then 'PARTIALLY_RETURNED'
    when v_cancelled > 0 and v_cancelled < v_total then 'PARTIALLY_CANCELLED'
    when v_delivered > 0                then 'PARTIALLY_DELIVERED'
    when v_shipped = v_total            then 'SHIPPED'
    when v_shipped > 0                  then 'PARTIALLY_SHIPPED'
    else 'PENDING'
  end;

  update commerce.orders o
     set fulfillment_summary = v_summary,
         completed_at = case
                          when v_summary in ('DELIVERED', 'CANCELLED', 'RETURNED')
                            then coalesce(o.completed_at, now())
                          else o.completed_at
                        end
   where o.id = v_order_id
     and o.fulfillment_summary is distinct from v_summary;

  return null;
end;
$$;

create trigger order_items_refresh_summary
  after insert or delete or update of status on commerce.order_items
  for each row execute function commerce.refresh_order_fulfillment_summary();
