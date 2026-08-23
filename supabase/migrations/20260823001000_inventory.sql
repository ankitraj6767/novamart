-- =============================================================================
-- NovaMart — 0010 Inventory: warehouses, stock balances, immutable ledger,
--                  reservations, adjustments, transfers
--
-- The correctness requirement (brief §66): 100 units + 10,000 concurrent checkouts
-- must yield exactly 100 reservations. Four independent layers guarantee it:
--   1. SELECT ... FOR UPDATE in deterministic order (reserve_stock function)
--   2. A guarded UPDATE predicate (available_quantity >= requested)
--   3. CHECK constraints making negative stock unrepresentable
--   4. An immutable ledger that a reconciliation job compares against balances
-- =============================================================================

-- -----------------------------------------------------------------------------
-- inventory.warehouses
-- Covers seller pickup locations, NovaMart fulfilment centres and dark stores.
-- -----------------------------------------------------------------------------
create table inventory.warehouses (
  id                 uuid primary key default extensions.gen_random_uuid(),
  code               text        not null unique
                       constraint warehouses_code_shape check (code ~ '^[A-Z][A-Z0-9-]{2,31}$'),
  name               text        not null,
  -- NovaMart-operated fulfilment centres have no seller; seller pickup locations do.
  seller_id          uuid        references seller.sellers (id) on delete cascade,
  warehouse_type     text        not null
                       check (warehouse_type in ('SELLER_PICKUP', 'NOVAMART_FULFILMENT',
                                                  'DARK_STORE', 'RETURN_CENTRE', 'VIRTUAL')),

  contact_name       text,
  contact_phone      public.phone_e164,
  address_line1      text        not null,
  address_line2      text,
  landmark           text,
  city               text        not null,
  state_code         text        not null references fulfillment.states (code) on delete restrict,
  pincode            public.indian_pincode not null references fulfillment.pincodes (pincode) on delete restrict,
  latitude           numeric(9, 6),
  longitude          numeric(9, 6),

  -- GSTIN of the entity operating this location: invoices are raised from here, so
  -- the place of supply is determined by this warehouse's state, not the seller's HQ.
  gstin              public.gstin,

  -- Operating windows drive the delivery promise engine.
  operating_days     smallint[]  not null default '{1,2,3,4,5,6}'
                       constraint warehouses_operating_days_valid
                       check (operating_days <@ ARRAY[0,1,2,3,4,5,6]::smallint[]),
  pickup_cutoff_time time        not null default '15:00',
  processing_time_hours smallint  not null default 24 check (processing_time_hours between 0 and 168),

  -- Capacity signals used by the allocation engine to avoid overloading a node.
  daily_order_capacity integer   check (daily_order_capacity is null or daily_order_capacity > 0),
  -- Lower number wins when several nodes can serve the same order.
  allocation_priority smallint   not null default 100,

  is_active          boolean     not null default true,
  -- Temporarily excluded from allocation without losing its stock records.
  accepts_new_orders boolean     not null default true,
  supports_returns   boolean     not null default false,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint warehouses_seller_type_consistent
    check ((warehouse_type = 'SELLER_PICKUP') = (seller_id is not null)),
  constraint warehouses_latitude_range  check (latitude  is null or latitude  between -90  and 90),
  constraint warehouses_longitude_range check (longitude is null or longitude between -180 and 180)
);

comment on table inventory.warehouses is
  'Physical and virtual stock locations: seller pickup points, NovaMart fulfilment centres, dark stores, return centres.';
comment on column inventory.warehouses.gstin is
  'Invoices are raised from the dispatching warehouse, so its state determines place of supply for GST.';

create index warehouses_seller_idx   on inventory.warehouses (seller_id) where is_active;
create index warehouses_pincode_idx  on inventory.warehouses (pincode) where is_active;
create index warehouses_state_idx    on inventory.warehouses (state_code) where is_active;
create index warehouses_allocatable_idx on inventory.warehouses (allocation_priority)
  where is_active and accepts_new_orders;

create trigger warehouses_set_updated_at
  before update on inventory.warehouses
  for each row execute function private.set_updated_at();

-- Now that warehouses exist, complete the listing → default warehouse reference.
alter table catalog.seller_listings
  add constraint seller_listings_default_warehouse_fk
  foreign key (default_warehouse_id) references inventory.warehouses (id) on delete set null;

-- Register warehouses as grantable RBAC scopes so warehouse roles can be scoped.
create or replace function inventory.register_warehouse_scope()
returns trigger
language plpgsql
set search_path = inventory, identity, pg_catalog
as $$
begin
  insert into identity.resource_scopes (scope_type, scope_id, display_name, is_active)
  values ('warehouse', new.id, new.code || ' — ' || new.name, new.is_active)
  on conflict (scope_type, scope_id)
    do update set display_name = excluded.display_name, is_active = excluded.is_active;
  return null;
end;
$$;

create trigger warehouses_register_scope
  after insert or update of code, name, is_active on inventory.warehouses
  for each row execute function inventory.register_warehouse_scope();

-- Sellers are grantable scopes too.
create or replace function seller.register_seller_scope()
returns trigger
language plpgsql
set search_path = seller, identity, pg_catalog
as $$
begin
  insert into identity.resource_scopes (scope_type, scope_id, display_name, is_active)
  values ('seller', new.id, new.seller_code || ' — ' || new.display_name,
          new.status not in ('CLOSED', 'BLOCKED'))
  on conflict (scope_type, scope_id)
    do update set display_name = excluded.display_name, is_active = excluded.is_active;
  return null;
end;
$$;

create trigger sellers_register_scope
  after insert or update of display_name, status on seller.sellers
  for each row execute function seller.register_seller_scope();

-- -----------------------------------------------------------------------------
-- inventory.warehouse_inventory — the materialised balance per (warehouse, sku, seller)
--
-- Quantities are partitioned by intent so no single number has to mean several
-- things at once:
--   available  — sellable right now
--   reserved   — held for in-flight checkouts/orders
--   damaged    — physically present, not sellable
--   in_transit — inbound or in a transfer, not yet sellable here
-- -----------------------------------------------------------------------------
create table inventory.warehouse_inventory (
  id                  uuid primary key default extensions.gen_random_uuid(),
  warehouse_id        uuid        not null references inventory.warehouses (id) on delete restrict,
  sku_id              uuid        not null references catalog.skus (id) on delete restrict,
  seller_id           uuid        not null references seller.sellers (id) on delete restrict,
  -- Denormalised so a seller's stock view does not need to join listings.
  listing_id          uuid        references catalog.seller_listings (id) on delete set null,

  available_quantity  integer     not null default 0,
  reserved_quantity   integer     not null default 0,
  damaged_quantity    integer     not null default 0,
  in_transit_quantity integer     not null default 0,

  -- Physical total for cycle-count reconciliation: available + reserved + damaged.
  physical_quantity   integer     generated always as
                        (available_quantity + reserved_quantity + damaged_quantity) stored,

  -- Replenishment signals surfaced in the seller console.
  reorder_point       integer     check (reorder_point is null or reorder_point >= 0),
  reorder_quantity    integer     check (reorder_quantity is null or reorder_quantity > 0),
  -- Stock the seller deliberately withholds from sale (display units, samples).
  blocked_quantity    integer     not null default 0,

  bin_location        text,
  -- Optimistic concurrency counter, maintained alongside the pessimistic locking.
  version             bigint      not null default 1,

  last_counted_at     timestamptz,
  last_received_at    timestamptz,
  last_sold_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (warehouse_id, sku_id, seller_id),

  -- The constraints that make overselling unrepresentable, whatever the app does.
  constraint wh_inventory_available_non_negative  check (available_quantity  >= 0),
  constraint wh_inventory_reserved_non_negative   check (reserved_quantity   >= 0),
  constraint wh_inventory_damaged_non_negative    check (damaged_quantity    >= 0),
  constraint wh_inventory_in_transit_non_negative check (in_transit_quantity >= 0),
  constraint wh_inventory_blocked_non_negative    check (blocked_quantity    >= 0),
  -- Sanity ceiling: catches unit-conversion bugs (grams entered as units, etc.).
  constraint wh_inventory_available_sane          check (available_quantity  <= 10000000)
);

comment on table inventory.warehouse_inventory is
  'Materialised stock balance per (warehouse, SKU, seller). The ledger is the audit trail; this is the fast read.';
comment on column inventory.warehouse_inventory.physical_quantity is
  'Generated: available + reserved + damaged. Compared against cycle counts during reconciliation.';

create index wh_inventory_sku_idx       on inventory.warehouse_inventory (sku_id)
  where available_quantity > 0;
create index wh_inventory_seller_idx    on inventory.warehouse_inventory (seller_id, warehouse_id);
create index wh_inventory_warehouse_idx on inventory.warehouse_inventory (warehouse_id);
create index wh_inventory_listing_idx   on inventory.warehouse_inventory (listing_id)
  where listing_id is not null;
-- Low-stock alerting.
create index wh_inventory_reorder_idx   on inventory.warehouse_inventory (seller_id)
  where reorder_point is not null and available_quantity <= reorder_point;
-- Sellable lookup for the PDP/checkout path: sku → any node with stock.
create index wh_inventory_sellable_idx  on inventory.warehouse_inventory (sku_id, seller_id, warehouse_id)
  where available_quantity > 0;

create trigger warehouse_inventory_set_updated_at
  before update on inventory.warehouse_inventory
  for each row execute function private.set_updated_at();

-- Bump the optimistic version on every quantity change.
create or replace function inventory.bump_inventory_version()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.available_quantity  is distinct from old.available_quantity
  or new.reserved_quantity   is distinct from old.reserved_quantity
  or new.damaged_quantity    is distinct from old.damaged_quantity
  or new.in_transit_quantity is distinct from old.in_transit_quantity
  or new.blocked_quantity    is distinct from old.blocked_quantity then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

create trigger warehouse_inventory_bump_version
  before update on inventory.warehouse_inventory
  for each row execute function inventory.bump_inventory_version();

-- -----------------------------------------------------------------------------
-- inventory.inventory_ledger — immutable movement log (brief §24)
--
-- Every quantity change writes a row here. Balances are reproducible by replaying
-- the ledger; the reconciliation job asserts ledger sums equal materialised
-- balances and alerts on any drift.
-- -----------------------------------------------------------------------------
create table inventory.inventory_ledger (
  id                  uuid        primary key default private.uuid_generate_v7(),
  warehouse_inventory_id uuid     not null references inventory.warehouse_inventory (id) on delete restrict,
  warehouse_id        uuid        not null references inventory.warehouses (id) on delete restrict,
  sku_id              uuid        not null references catalog.skus (id) on delete restrict,
  seller_id           uuid        not null references seller.sellers (id) on delete restrict,

  movement_type       text        not null
                        check (movement_type in ('PURCHASE_RECEIPT', 'SALE_RESERVATION', 'SALE',
                                                  'RESERVATION_RELEASE', 'CANCELLATION', 'RETURN_RECEIPT',
                                                  'RETURN_RESTOCK', 'DAMAGE', 'DAMAGE_WRITE_OFF',
                                                  'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT_INCREASE',
                                                  'ADJUSTMENT_DECREASE', 'CYCLE_COUNT_CORRECTION',
                                                  'BLOCK', 'UNBLOCK', 'RTO_RECEIPT')),

  -- Signed deltas per bucket. Their sum across a movement must be internally
  -- consistent (e.g. a reservation is -available/+reserved and nets to zero).
  available_delta     integer     not null default 0,
  reserved_delta      integer     not null default 0,
  damaged_delta       integer     not null default 0,
  in_transit_delta    integer     not null default 0,
  blocked_delta       integer     not null default 0,

  -- Post-movement balances, captured so a point-in-time balance needs no replay.
  available_after     integer     not null check (available_after  >= 0),
  reserved_after      integer     not null check (reserved_after   >= 0),
  damaged_after       integer     not null check (damaged_after    >= 0),
  in_transit_after    integer     not null check (in_transit_after >= 0),

  -- What caused the movement. Nullable because different movements have different
  -- causes; the CHECK below enforces that a cause is always present.
  reservation_id      uuid,
  order_id            uuid,
  order_item_id       uuid,
  return_request_id   uuid,
  transfer_id         uuid,
  adjustment_id       uuid,
  shipment_id         uuid,

  reason              text,
  reference           text,
  actor_id            uuid        references identity.profiles (id) on delete set null,
  actor_type          text        not null default 'SYSTEM'
                        check (actor_type in ('SYSTEM', 'SELLER', 'WAREHOUSE', 'STAFF', 'WORKER')),
  request_id          text,
  trace_id            text,
  occurred_at         timestamptz not null default now(),

  -- A movement that changes nothing is a bug, not a no-op worth recording.
  constraint inventory_ledger_has_effect check (
    available_delta <> 0 or reserved_delta <> 0 or damaged_delta <> 0
    or in_transit_delta <> 0 or blocked_delta <> 0
  ),
  -- Every movement must be attributable to something.
  constraint inventory_ledger_has_cause check (
    reservation_id is not null or order_id is not null or return_request_id is not null
    or transfer_id is not null or adjustment_id is not null or shipment_id is not null
    or reason is not null
  )
);

comment on table inventory.inventory_ledger is
  'Immutable stock movement log. Never change stock without writing here (brief §24).';

create index inventory_ledger_inventory_idx on inventory.inventory_ledger (warehouse_inventory_id, occurred_at desc);
create index inventory_ledger_sku_idx       on inventory.inventory_ledger (sku_id, occurred_at desc);
create index inventory_ledger_seller_idx    on inventory.inventory_ledger (seller_id, occurred_at desc);
create index inventory_ledger_order_idx     on inventory.inventory_ledger (order_id) where order_id is not null;
create index inventory_ledger_order_item_idx on inventory.inventory_ledger (order_item_id) where order_item_id is not null;
create index inventory_ledger_reservation_idx on inventory.inventory_ledger (reservation_id) where reservation_id is not null;
create index inventory_ledger_type_idx      on inventory.inventory_ledger (movement_type, occurred_at desc);
create index inventory_ledger_occurred_idx  on inventory.inventory_ledger (occurred_at desc);

create trigger inventory_ledger_append_only
  before update or delete on inventory.inventory_ledger
  for each row execute function private.prevent_mutation();

-- -----------------------------------------------------------------------------
-- inventory.inventory_reservations — time-bounded holds (brief §25)
--
-- A reservation is not a sale. It expires, and the sweeper releases it exactly
-- once (guarded by the status transition).
-- -----------------------------------------------------------------------------
create table inventory.inventory_reservations (
  id                  uuid primary key default private.uuid_generate_v7(),
  warehouse_inventory_id uuid     not null references inventory.warehouse_inventory (id) on delete restrict,
  warehouse_id        uuid        not null references inventory.warehouses (id) on delete restrict,
  sku_id              uuid        not null references catalog.skus (id) on delete restrict,
  seller_id           uuid        not null references seller.sellers (id) on delete restrict,
  listing_id          uuid        references catalog.seller_listings (id) on delete set null,

  -- The checkout session that created the hold; the order once one exists.
  checkout_session_id uuid,
  order_id            uuid,
  order_item_id       uuid,
  user_id             uuid        references identity.profiles (id) on delete set null,

  quantity            integer     not null check (quantity > 0),

  status              text        not null default 'ACTIVE'
                        check (status in ('ACTIVE', 'CONFIRMED', 'RELEASED', 'EXPIRED', 'CONSUMED')),
  -- Idempotency handle so a retried checkout reuses its own hold instead of
  -- stacking a second one.
  idempotency_key     text,

  expires_at          timestamptz not null,
  confirmed_at        timestamptz,
  released_at         timestamptz,
  release_reason      text        check (release_reason in ('EXPIRED', 'CHECKOUT_ABANDONED',
                                                            'PAYMENT_FAILED', 'ORDER_CANCELLED',
                                                            'MANUAL_RELEASE', 'REPLACED')),
  consumed_at         timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint reservations_expiry_future check (expires_at > created_at),
  constraint reservations_release_reason
    check (status not in ('RELEASED', 'EXPIRED') or release_reason is not null),
  constraint reservations_confirmed_has_order
    check (status not in ('CONFIRMED', 'CONSUMED') or order_id is not null)
);

comment on table inventory.inventory_reservations is
  'Time-bounded stock holds. ACTIVE holds count against available_quantity; expiry releases them.';

-- The sweeper's query: only ACTIVE rows matter, so the index stays small.
create index reservations_expiry_idx    on inventory.inventory_reservations (expires_at)
  where status = 'ACTIVE';
create index reservations_inventory_idx on inventory.inventory_reservations (warehouse_inventory_id)
  where status = 'ACTIVE';
create index reservations_order_idx     on inventory.inventory_reservations (order_id)
  where order_id is not null;
create index reservations_checkout_idx  on inventory.inventory_reservations (checkout_session_id)
  where checkout_session_id is not null;
create index reservations_user_idx      on inventory.inventory_reservations (user_id, created_at desc);
create unique index reservations_idempotency_idx
  on inventory.inventory_reservations (idempotency_key, sku_id, warehouse_id)
  where idempotency_key is not null and status in ('ACTIVE', 'CONFIRMED', 'CONSUMED');

create trigger inventory_reservations_set_updated_at
  before update on inventory.inventory_reservations
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- inventory.inventory_adjustments — deliberate, approved corrections.
-- Two-step (requested → approved) because a single mistyped adjustment is
-- indistinguishable from theft after the fact.
-- -----------------------------------------------------------------------------
create table inventory.inventory_adjustments (
  id                  uuid primary key default private.uuid_generate_v7(),
  warehouse_inventory_id uuid     not null references inventory.warehouse_inventory (id) on delete restrict,
  warehouse_id        uuid        not null references inventory.warehouses (id) on delete restrict,
  sku_id              uuid        not null references catalog.skus (id) on delete restrict,
  seller_id           uuid        not null references seller.sellers (id) on delete restrict,

  adjustment_type     text        not null
                        check (adjustment_type in ('CYCLE_COUNT', 'DAMAGE', 'THEFT', 'EXPIRY',
                                                    'FOUND', 'DATA_CORRECTION', 'WRITE_OFF',
                                                    'SUPPLIER_SHORTAGE', 'QC_REJECT')),
  quantity_delta      integer     not null check (quantity_delta <> 0),
  target_bucket       text        not null default 'AVAILABLE'
                        check (target_bucket in ('AVAILABLE', 'DAMAGED', 'BLOCKED')),

  quantity_before     integer     not null check (quantity_before >= 0),
  quantity_after      integer     check (quantity_after is null or quantity_after >= 0),

  reason              text        not null check (length(trim(reason)) >= 10),
  evidence_urls       text[]      not null default '{}',
  -- Cost impact, needed for the seller's books when stock is written off.
  cost_impact_paise   public.paise,

  status              text        not null default 'PENDING_APPROVAL'
                        check (status in ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'APPLIED')),
  requested_by        uuid        not null references identity.profiles (id) on delete restrict,
  approved_by         uuid        references identity.profiles (id) on delete set null,
  approved_at         timestamptz,
  rejection_reason    text,
  applied_at          timestamptz,
  idempotency_key     text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Self-approval defeats the purpose of an approval step.
  constraint adjustments_no_self_approval check (approved_by is null or approved_by <> requested_by),
  constraint adjustments_approved_fields
    check (status <> 'APPROVED' or (approved_by is not null and approved_at is not null)),
  constraint adjustments_rejection_reason
    check (status <> 'REJECTED' or rejection_reason is not null),
  constraint adjustments_applied_fields
    check (status <> 'APPLIED' or (applied_at is not null and quantity_after is not null))
);

comment on constraint adjustments_no_self_approval on inventory.inventory_adjustments is
  'Segregation of duties: the requester cannot approve their own stock adjustment.';

create index adjustments_inventory_idx on inventory.inventory_adjustments (warehouse_inventory_id, created_at desc);
create index adjustments_queue_idx     on inventory.inventory_adjustments (created_at)
  where status = 'PENDING_APPROVAL';
create index adjustments_seller_idx    on inventory.inventory_adjustments (seller_id, created_at desc);
create unique index adjustments_idempotency_idx on inventory.inventory_adjustments (idempotency_key)
  where idempotency_key is not null;

create trigger inventory_adjustments_set_updated_at
  before update on inventory.inventory_adjustments
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- inventory.inventory_transfers — stock movement between warehouses.
-- Quantity sits in in_transit at neither end's available balance while moving.
-- -----------------------------------------------------------------------------
create table inventory.inventory_transfers (
  id                    uuid primary key default private.uuid_generate_v7(),
  transfer_reference    text        not null unique,
  seller_id             uuid        not null references seller.sellers (id) on delete restrict,
  source_warehouse_id   uuid        not null references inventory.warehouses (id) on delete restrict,
  target_warehouse_id   uuid        not null references inventory.warehouses (id) on delete restrict,

  status                text        not null default 'DRAFT'
                          check (status in ('DRAFT', 'APPROVED', 'DISPATCHED', 'IN_TRANSIT',
                                            'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')),
  reason                text,
  carrier_name          text,
  tracking_reference    text,

  dispatched_at         timestamptz,
  expected_arrival_at   timestamptz,
  received_at           timestamptz,
  cancelled_at          timestamptz,
  cancellation_reason   text,

  created_by            uuid        references identity.profiles (id) on delete set null,
  approved_by           uuid        references identity.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint transfers_distinct_warehouses check (source_warehouse_id <> target_warehouse_id),
  constraint transfers_cancellation_reason check (status <> 'CANCELLED' or cancellation_reason is not null)
);

create index transfers_source_idx on inventory.inventory_transfers (source_warehouse_id, created_at desc);
create index transfers_target_idx on inventory.inventory_transfers (target_warehouse_id, created_at desc);
create index transfers_seller_idx on inventory.inventory_transfers (seller_id, created_at desc);
create index transfers_open_idx   on inventory.inventory_transfers (created_at)
  where status in ('APPROVED', 'DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED');

create trigger inventory_transfers_set_updated_at
  before update on inventory.inventory_transfers
  for each row execute function private.set_updated_at();

create or replace function inventory.assign_transfer_reference()
returns trigger
language plpgsql
set search_path = inventory, private, pg_catalog
as $$
begin
  if new.transfer_reference is null then
    new.transfer_reference := 'TR' || to_char(now(), 'YYMM') ||
                              lpad((extract(epoch from clock_timestamp())::bigint % 1000000)::text, 6, '0');
  end if;
  return new;
end;
$$;

create trigger inventory_transfers_assign_reference
  before insert on inventory.inventory_transfers
  for each row execute function inventory.assign_transfer_reference();

create table inventory.inventory_transfer_items (
  id                  uuid primary key default extensions.gen_random_uuid(),
  transfer_id         uuid        not null references inventory.inventory_transfers (id) on delete cascade,
  sku_id              uuid        not null references catalog.skus (id) on delete restrict,
  quantity_requested  integer     not null check (quantity_requested > 0),
  quantity_dispatched integer     not null default 0 check (quantity_dispatched >= 0),
  quantity_received   integer     not null default 0 check (quantity_received >= 0),
  quantity_damaged    integer     not null default 0 check (quantity_damaged >= 0),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (transfer_id, sku_id),
  -- Cannot receive more than was dispatched, or dispatch more than requested.
  constraint transfer_items_dispatch_within_request check (quantity_dispatched <= quantity_requested),
  constraint transfer_items_receipt_within_dispatch
    check (quantity_received + quantity_damaged <= quantity_dispatched)
);

create index transfer_items_transfer_idx on inventory.inventory_transfer_items (transfer_id);
create index transfer_items_sku_idx      on inventory.inventory_transfer_items (sku_id);

create trigger inventory_transfer_items_set_updated_at
  before update on inventory.inventory_transfer_items
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- inventory.stock_counts — cycle counting (warehouse app workflow, brief §15)
-- -----------------------------------------------------------------------------
create table inventory.stock_counts (
  id               uuid primary key default private.uuid_generate_v7(),
  warehouse_id     uuid        not null references inventory.warehouses (id) on delete restrict,
  count_type       text        not null default 'CYCLE'
                     check (count_type in ('CYCLE', 'FULL', 'SPOT', 'INVESTIGATION')),
  status           text        not null default 'IN_PROGRESS'
                     check (status in ('IN_PROGRESS', 'PENDING_REVIEW', 'RECONCILED', 'CANCELLED')),
  bin_filter       text,
  counted_by       uuid        references identity.profiles (id) on delete set null,
  reviewed_by      uuid        references identity.profiles (id) on delete set null,
  started_at       timestamptz not null default now(),
  completed_at     timestamptz,
  reconciled_at    timestamptz,
  lines_counted    integer     not null default 0,
  lines_with_variance integer  not null default 0,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index stock_counts_warehouse_idx on inventory.stock_counts (warehouse_id, started_at desc);
create index stock_counts_open_idx      on inventory.stock_counts (started_at)
  where status in ('IN_PROGRESS', 'PENDING_REVIEW');

create trigger stock_counts_set_updated_at
  before update on inventory.stock_counts
  for each row execute function private.set_updated_at();

create table inventory.stock_count_lines (
  id                  uuid primary key default extensions.gen_random_uuid(),
  stock_count_id      uuid        not null references inventory.stock_counts (id) on delete cascade,
  warehouse_inventory_id uuid     not null references inventory.warehouse_inventory (id) on delete restrict,
  sku_id              uuid        not null references catalog.skus (id) on delete restrict,
  -- System belief at the moment of counting.
  expected_quantity   integer     not null check (expected_quantity >= 0),
  counted_quantity    integer     not null check (counted_quantity >= 0),
  variance            integer     generated always as (counted_quantity - expected_quantity) stored,
  bin_location        text,
  scanned_barcode     text,
  notes               text,
  adjustment_id       uuid        references inventory.inventory_adjustments (id) on delete set null,
  counted_at          timestamptz not null default now(),
  unique (stock_count_id, warehouse_inventory_id)
);

create index stock_count_lines_count_idx on inventory.stock_count_lines (stock_count_id);
create index stock_count_lines_variance_idx on inventory.stock_count_lines (stock_count_id)
  where counted_quantity <> expected_quantity;
