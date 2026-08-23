-- =============================================================================
-- NovaMart — 0017 Returns: configurable reasons and policies, return requests,
--                  evidence, QC inspections, replacements
--
-- Eligibility is judged against the policy snapshotted on the order item at order
-- time, never against today's policy (brief §39, ADR 0010).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- returns.return_reasons — admin-configurable (brief §92: no code deploy needed)
-- -----------------------------------------------------------------------------
create table returns.return_reasons (
  id                      uuid primary key default extensions.gen_random_uuid(),
  code                    text        not null unique
                            constraint return_reasons_code_shape check (code ~ '^[A-Z][A-Z0-9_]*$'),
  label                   text        not null,
  label_hi                text,
  -- Grouping shown to the customer.
  category                text        not null
                            check (category in ('QUALITY', 'WRONG_ITEM', 'DAMAGED', 'MISSING',
                                                 'SIZE_FIT', 'CHANGED_MIND', 'BETTER_PRICE',
                                                 'LATE_DELIVERY', 'OTHER')),
  -- Who pays the reverse freight. Seller fault vs customer preference.
  fault_attribution       text        not null
                            check (fault_attribution in ('SELLER', 'CUSTOMER', 'CARRIER', 'PLATFORM', 'UNDETERMINED')),
  requires_evidence       boolean     not null default false,
  min_evidence_count      smallint    not null default 0,
  -- Reasons that skip QC and refund immediately (e.g. never delivered).
  auto_approve            boolean     not null default false,
  requires_qc             boolean     not null default true,
  -- Reasons only valid for certain resolutions.
  allowed_resolutions     text[]      not null default '{REFUND,REPLACEMENT}',
  display_order           smallint    not null default 100,
  is_active               boolean     not null default true,
  created_at              timestamptz not null default now()
);

create index return_reasons_active_idx on returns.return_reasons (display_order) where is_active;

-- -----------------------------------------------------------------------------
-- returns.return_policies — category and seller level, with effective dating.
-- The resolved policy is copied onto the order item at order time.
-- -----------------------------------------------------------------------------
create table returns.return_policies (
  id                       uuid primary key default extensions.gen_random_uuid(),
  name                     text        not null,
  scope_type               text        not null
                             check (scope_type in ('GLOBAL', 'CATEGORY', 'SELLER', 'SELLER_CATEGORY', 'PRODUCT')),
  category_id              uuid        references catalog.categories (id) on delete cascade,
  seller_id                uuid        references seller.sellers (id) on delete cascade,
  product_id               uuid        references catalog.products (id) on delete cascade,

  return_type              text        not null
                             check (return_type in ('REFUND_ONLY', 'REPLACEMENT_ONLY',
                                                     'REFUND_OR_REPLACEMENT', 'NON_RETURNABLE')),
  return_window_days       smallint    not null check (return_window_days between 0 and 90),
  replacement_window_days  smallint    check (replacement_window_days between 0 and 90),
  -- Which reasons are accepted under this policy.
  allowed_reason_codes     text[]      not null default '{}',
  requires_original_packaging boolean  not null default true,
  requires_all_accessories boolean     not null default true,
  requires_invoice         boolean     not null default false,
  -- Who bears reverse freight when the customer is at fault.
  customer_bears_reverse_freight boolean not null default false,
  reverse_freight_paise    public.paise not null default 0,
  -- Restocking fee for opened items, where legally permitted.
  restocking_fee_percentage public.percentage not null default 0,
  requires_qc              boolean     not null default true,
  -- Whether the item can be resold after passing QC.
  restock_on_pass          boolean     not null default true,

  priority                 smallint    not null default 100,
  effective_from           date        not null default current_date,
  effective_to             date,
  is_active                boolean     not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint return_policies_scope_fields check (
    (scope_type = 'GLOBAL')
 or (scope_type = 'CATEGORY'        and category_id is not null)
 or (scope_type = 'SELLER'          and seller_id   is not null)
 or (scope_type = 'SELLER_CATEGORY' and seller_id is not null and category_id is not null)
 or (scope_type = 'PRODUCT'         and product_id  is not null)
  ),
  constraint return_policies_non_returnable_window
    check (return_type <> 'NON_RETURNABLE' or return_window_days = 0),
  constraint return_policies_period_valid check (effective_to is null or effective_to >= effective_from)
);

create index return_policies_lookup_idx   on returns.return_policies (scope_type, priority) where is_active;
create index return_policies_category_idx on returns.return_policies (category_id) where is_active;
create index return_policies_seller_idx   on returns.return_policies (seller_id) where is_active;

create trigger return_policies_set_updated_at
  before update on returns.return_policies
  for each row execute function private.set_updated_at();

-- Resolves the applicable policy, most specific first. Called at order creation to
-- snapshot the policy onto the order item.
create or replace function returns.resolve_policy(
  p_seller_id   uuid,
  p_category_id uuid,
  p_product_id  uuid,
  p_as_of       date default current_date
)
returns returns.return_policies
language sql
stable
set search_path = returns, catalog, pg_catalog
as $$
  select p.*
    from returns.return_policies p
   where p.is_active
     and p.effective_from <= p_as_of
     and (p.effective_to is null or p.effective_to >= p_as_of)
     and (
           (p.scope_type = 'PRODUCT'         and p.product_id = p_product_id)
        or (p.scope_type = 'SELLER_CATEGORY' and p.seller_id = p_seller_id
              and p.category_id in (select cc.ancestor_id from catalog.category_closure cc
                                     where cc.descendant_id = p_category_id))
        or (p.scope_type = 'SELLER'          and p.seller_id = p_seller_id)
        or (p.scope_type = 'CATEGORY'
              and p.category_id in (select cc.ancestor_id from catalog.category_closure cc
                                     where cc.descendant_id = p_category_id))
        or (p.scope_type = 'GLOBAL')
     )
   order by
     case p.scope_type
       when 'PRODUCT'         then 1
       when 'SELLER_CATEGORY' then 2
       when 'SELLER'          then 3
       when 'CATEGORY'        then 4
       else 5
     end,
     p.priority,
     p.effective_from desc
   limit 1;
$$;

-- -----------------------------------------------------------------------------
-- returns.return_requests
-- -----------------------------------------------------------------------------
create table returns.return_requests (
  id                       uuid primary key default private.uuid_generate_v7(),
  return_reference         text        not null unique,
  order_id                 uuid        not null references commerce.orders (id) on delete restrict,
  user_id                  uuid        not null references identity.profiles (id) on delete restrict,
  seller_id                uuid        not null references seller.sellers (id) on delete restrict,

  request_type             text        not null
                             check (request_type in ('RETURN', 'REPLACEMENT', 'EXCHANGE')),
  resolution_requested     text        not null
                             check (resolution_requested in ('REFUND', 'REPLACEMENT', 'EXCHANGE', 'REPAIR')),
  resolution_granted       text        check (resolution_granted in ('REFUND', 'REPLACEMENT', 'EXCHANGE',
                                                                      'REPAIR', 'REJECTED', 'PARTIAL_REFUND')),

  reason_code              text        not null,
  reason_details           text,
  -- Free-text description from the customer, shown to QC and the seller.
  customer_comments        text,

  status                   text        not null default 'REQUESTED'
                             check (status in ('REQUESTED', 'AUTO_APPROVED', 'PENDING_APPROVAL',
                                               'APPROVED', 'REJECTED', 'PICKUP_SCHEDULED',
                                               'PICKED_UP', 'IN_TRANSIT', 'RECEIVED',
                                               'QC_IN_PROGRESS', 'QC_PASSED', 'QC_FAILED',
                                               'REFUND_INITIATED', 'REPLACEMENT_CREATED',
                                               'COMPLETED', 'CANCELLED')),
  status_reason            text,

  -- Eligibility snapshot: why this request was permitted, for dispute defence.
  eligibility_snapshot     jsonb       not null default '{}'::jsonb,

  -- Reverse logistics
  reverse_shipment_id      uuid,
  pickup_address           jsonb,
  pickup_scheduled_date    date,
  picked_up_at             timestamptz,
  received_at              timestamptz,

  -- Money
  refund_id                uuid        references payments.refunds (id) on delete set null,
  refund_amount_paise      public.paise,
  reverse_freight_paise    public.paise not null default 0,
  restocking_fee_paise     public.paise not null default 0,
  -- Who ends up paying: derived from the reason's fault attribution and QC outcome.
  cost_borne_by            text        check (cost_borne_by in ('SELLER', 'CUSTOMER', 'CARRIER', 'PLATFORM')),

  replacement_order_id     uuid,

  approved_by              uuid        references identity.profiles (id) on delete set null,
  approved_at              timestamptz,
  rejected_by              uuid        references identity.profiles (id) on delete set null,
  rejected_at              timestamptz,
  rejection_reason         text,
  completed_at             timestamptz,
  cancelled_at             timestamptz,

  -- Abuse detection: how many returns this customer has raised recently.
  customer_return_count_90d integer,
  risk_flags               text[]      not null default '{}',

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint return_requests_rejection_reason
    check (status <> 'REJECTED' or rejection_reason is not null),
  constraint return_requests_approval_fields
    check (status not in ('APPROVED', 'AUTO_APPROVED') or approved_at is not null)
);

comment on table returns.return_requests is
  'Return/replacement requests. eligibility_snapshot records why the request was permitted at the time.';

create index return_requests_order_idx  on returns.return_requests (order_id);
create index return_requests_user_idx   on returns.return_requests (user_id, created_at desc);
create index return_requests_seller_idx on returns.return_requests (seller_id, created_at desc);
create index return_requests_status_idx on returns.return_requests (status, created_at desc);
create index return_requests_queue_idx  on returns.return_requests (created_at)
  where status in ('REQUESTED', 'PENDING_APPROVAL');
create index return_requests_qc_queue_idx on returns.return_requests (received_at)
  where status in ('RECEIVED', 'QC_IN_PROGRESS');
create index return_requests_reference_trgm_idx
  on returns.return_requests using gin (return_reference extensions.gin_trgm_ops);

create trigger return_requests_set_updated_at
  before update on returns.return_requests
  for each row execute function private.set_updated_at();

create or replace function returns.assign_return_reference()
returns trigger
language plpgsql
set search_path = returns, private, pg_catalog
as $$
begin
  if new.return_reference is null then
    new.return_reference := private.next_reference('RT', 'private.return_reference_seq');
  end if;
  return new;
end;
$$;

create trigger return_requests_assign_reference
  before insert on returns.return_requests
  for each row execute function returns.assign_return_reference();

-- -----------------------------------------------------------------------------
-- returns.return_items
-- -----------------------------------------------------------------------------
create table returns.return_items (
  id                    uuid primary key default extensions.gen_random_uuid(),
  return_request_id     uuid        not null references returns.return_requests (id) on delete cascade,
  order_item_id         uuid        not null references commerce.order_items (id) on delete restrict,
  sku_id                uuid        not null references catalog.skus (id) on delete restrict,
  quantity              integer     not null check (quantity > 0),
  reason_code           text        not null,
  reason_details        text,
  -- Refundable amount for this line, taken from the immutable price breakdown.
  refundable_paise      public.paise not null check (refundable_paise >= 0),
  approved_refund_paise public.paise,
  qc_outcome            text        check (qc_outcome in ('PASS', 'FAIL', 'PARTIAL')),
  qc_grade              text        check (qc_grade in ('A_RESELLABLE', 'B_OPEN_BOX', 'C_REFURBISH',
                                                        'D_SCRAP', 'NOT_AS_DESCRIBED')),
  restocked_quantity    integer     not null default 0 check (restocked_quantity >= 0),
  scrapped_quantity     integer     not null default 0 check (scrapped_quantity >= 0),
  created_at            timestamptz not null default now(),
  unique (return_request_id, order_item_id),
  constraint return_items_disposition_within_quantity
    check (restocked_quantity + scrapped_quantity <= quantity)
);

create index return_items_request_idx    on returns.return_items (return_request_id);
create index return_items_order_item_idx on returns.return_items (order_item_id);
create index return_items_sku_idx        on returns.return_items (sku_id);

-- -----------------------------------------------------------------------------
-- returns.return_evidence — customer photos/videos, private bucket only.
-- -----------------------------------------------------------------------------
create table returns.return_evidence (
  id                uuid primary key default extensions.gen_random_uuid(),
  return_request_id uuid        not null references returns.return_requests (id) on delete cascade,
  return_item_id    uuid        references returns.return_items (id) on delete cascade,
  evidence_type     text        not null
                      check (evidence_type in ('PHOTO', 'VIDEO', 'INVOICE', 'PACKAGING_PHOTO',
                                                'SERIAL_PHOTO', 'QC_PHOTO', 'UNBOXING_VIDEO')),
  uploaded_by_type  text        not null default 'CUSTOMER'
                      check (uploaded_by_type in ('CUSTOMER', 'SELLER', 'WAREHOUSE', 'SUPPORT', 'DELIVERY_AGENT')),
  uploaded_by       uuid        references identity.profiles (id) on delete set null,
  storage_bucket    text        not null default 'returns-private'
                      check (storage_bucket = 'returns-private'),
  storage_path      text        not null,
  mime_type         text        not null,
  file_size_bytes   integer     not null check (file_size_bytes between 1 and 26214400),
  content_hash      text,
  caption           text,
  created_at        timestamptz not null default now()
);

create index return_evidence_request_idx on returns.return_evidence (return_request_id);
create index return_evidence_item_idx    on returns.return_evidence (return_item_id)
  where return_item_id is not null;
-- Same photo reused across returns is an abuse signal.
create index return_evidence_hash_idx    on returns.return_evidence (content_hash)
  where content_hash is not null;

-- -----------------------------------------------------------------------------
-- returns.return_inspections — QC outcome. Determines refund, restock and who pays.
-- -----------------------------------------------------------------------------
create table returns.return_inspections (
  id                    uuid primary key default extensions.gen_random_uuid(),
  return_request_id     uuid        not null unique references returns.return_requests (id) on delete cascade,
  warehouse_id          uuid        references inventory.warehouses (id) on delete set null,
  inspected_by          uuid        references identity.profiles (id) on delete set null,

  outcome               text        not null
                          check (outcome in ('PASS', 'FAIL', 'PARTIAL_PASS')),
  -- Structured checklist rather than free text, so QC decisions are comparable.
  checklist             jsonb       not null default '{}'::jsonb,
  item_matches_order    boolean     not null,
  original_packaging_present boolean not null,
  all_accessories_present    boolean not null,
  serial_number_matches boolean,
  physical_damage_found boolean     not null default false,
  usage_signs_found     boolean     not null default false,
  counterfeit_suspected boolean     not null default false,

  grade                 text        check (grade in ('A_RESELLABLE', 'B_OPEN_BOX', 'C_REFURBISH',
                                                     'D_SCRAP', 'NOT_AS_DESCRIBED')),
  -- Deductions applied to the refund, with the reason recorded.
  deduction_paise       public.paise not null default 0 check (deduction_paise >= 0),
  deduction_reason      text,
  notes                 text,
  inspected_at          timestamptz not null default now(),

  constraint inspections_deduction_reason
    check (deduction_paise = 0 or deduction_reason is not null),
  constraint inspections_fail_has_grade
    check (outcome = 'PASS' or grade is not null)
);

create index return_inspections_warehouse_idx on returns.return_inspections (warehouse_id, inspected_at desc);
create index return_inspections_counterfeit_idx on returns.return_inspections (inspected_at desc)
  where counterfeit_suspected;

-- -----------------------------------------------------------------------------
-- returns.return_status_history — append-only
-- -----------------------------------------------------------------------------
create table returns.return_status_history (
  id                uuid primary key default private.uuid_generate_v7(),
  return_request_id uuid        not null references returns.return_requests (id) on delete cascade,
  from_status       text,
  to_status         text        not null,
  reason            text,
  actor_id          uuid        references identity.profiles (id) on delete set null,
  actor_type        text        not null default 'SYSTEM',
  occurred_at       timestamptz not null default now()
);

create index return_status_history_request_idx on returns.return_status_history (return_request_id, occurred_at desc);

create trigger return_status_history_append_only
  before update or delete on returns.return_status_history
  for each row execute function private.prevent_mutation();

create or replace function returns.record_return_status()
returns trigger
language plpgsql
set search_path = returns, private, pg_catalog
as $$
begin
  insert into returns.return_status_history (
    return_request_id, from_status, to_status, reason, actor_id, actor_type
  ) values (
    new.id,
    case when tg_op = 'INSERT' then null else old.status end,
    new.status, new.status_reason,
    private.current_actor_id(),
    coalesce(nullif(current_setting('novamart.actor_type', true), ''), 'SYSTEM')
  );
  return null;
end;
$$;

create trigger return_requests_record_status
  after insert or update of status on returns.return_requests
  for each row execute function returns.record_return_status();

-- -----------------------------------------------------------------------------
-- returns.reverse_shipments — pickup leg, separate from forward shipments because
-- pickups fail differently (customer unavailable, item not ready, QC at doorstep).
-- -----------------------------------------------------------------------------
create table returns.reverse_shipments (
  id                    uuid primary key default private.uuid_generate_v7(),
  return_request_id     uuid        not null references returns.return_requests (id) on delete cascade,
  shipment_id           uuid        references fulfillment.shipments (id) on delete set null,
  carrier_id            uuid        references fulfillment.carriers (id) on delete restrict,
  awb_number            text,
  status                text        not null default 'CREATED'
                          check (status in ('CREATED', 'PICKUP_SCHEDULED', 'PICKUP_ATTEMPTED',
                                            'PICKED_UP', 'IN_TRANSIT', 'DELIVERED_TO_WAREHOUSE',
                                            'PICKUP_FAILED', 'CANCELLED')),
  -- Doorstep QC result where the carrier supports it: catches obvious mismatches
  -- before the item ships back.
  doorstep_qc_performed boolean     not null default false,
  doorstep_qc_passed    boolean,
  doorstep_qc_notes     text,
  pickup_attempts       smallint    not null default 0,
  pickup_scheduled_date date,
  picked_up_at          timestamptz,
  delivered_at          timestamptz,
  freight_paise         public.paise,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index reverse_shipments_request_idx on returns.reverse_shipments (return_request_id);
create index reverse_shipments_status_idx  on returns.reverse_shipments (status, created_at desc);
create unique index reverse_shipments_awb_idx on returns.reverse_shipments (carrier_id, awb_number)
  where awb_number is not null;

create trigger reverse_shipments_set_updated_at
  before update on returns.reverse_shipments
  for each row execute function private.set_updated_at();

alter table returns.return_requests
  add constraint return_requests_reverse_shipment_fk
  foreign key (reverse_shipment_id) references returns.reverse_shipments (id) on delete set null;

-- -----------------------------------------------------------------------------
-- returns.replacement_orders — links the original item to its replacement order.
-- -----------------------------------------------------------------------------
create table returns.replacement_orders (
  id                     uuid primary key default extensions.gen_random_uuid(),
  return_request_id      uuid        not null references returns.return_requests (id) on delete restrict,
  original_order_id      uuid        not null references commerce.orders (id) on delete restrict,
  original_order_item_id uuid        not null references commerce.order_items (id) on delete restrict,
  replacement_order_id   uuid        not null references commerce.orders (id) on delete restrict,
  replacement_order_item_id uuid     references commerce.order_items (id) on delete set null,
  -- Replacements are zero-value orders; any price difference is handled separately.
  price_difference_paise public.paise not null default 0,
  difference_settlement  text        check (difference_settlement in ('WAIVED', 'CHARGED', 'REFUNDED')),
  created_at             timestamptz not null default now(),
  unique (return_request_id)
);

create index replacement_orders_original_idx    on returns.replacement_orders (original_order_id);
create index replacement_orders_replacement_idx on returns.replacement_orders (replacement_order_id);

alter table returns.return_requests
  add constraint return_requests_replacement_order_fk
  foreign key (replacement_order_id) references commerce.orders (id) on delete set null;

alter table payments.refunds
  add constraint refunds_return_request_fk
  foreign key (return_request_id) references returns.return_requests (id) on delete set null;

alter table inventory.inventory_ledger
  add constraint inventory_ledger_return_fk
  foreign key (return_request_id) references returns.return_requests (id) on delete set null;

-- -----------------------------------------------------------------------------
-- Eligibility check. Uses the policy snapshot on the order item, so a policy change
-- today cannot retroactively remove a customer's return right.
-- -----------------------------------------------------------------------------
create or replace function returns.check_eligibility(
  p_order_item_id uuid,
  p_reason_code   text default null
)
returns table (
  is_eligible        boolean,
  block_reason       text,
  return_type        text,
  window_closes_on   date,
  days_remaining     integer,
  requires_evidence  boolean
)
language plpgsql
stable
set search_path = returns, commerce, pg_catalog
as $$
declare
  v_item   commerce.order_items;
  v_reason returns.return_reasons;
  v_open   integer;
begin
  select * into v_item from commerce.order_items where id = p_order_item_id;

  if v_item.id is null then
    return query select false, 'ITEM_NOT_FOUND', null::text, null::date, null::integer, false;
    return;
  end if;

  if v_item.status <> 'DELIVERED' then
    return query select false, 'ITEM_NOT_DELIVERED', v_item.return_type, null::date, null::integer, false;
    return;
  end if;

  if v_item.return_type = 'NON_RETURNABLE' or v_item.return_window_days = 0 then
    return query select false, 'NON_RETURNABLE', v_item.return_type, null::date, null::integer, false;
    return;
  end if;

  if v_item.return_eligible_until is null then
    return query select false, 'RETURN_WINDOW_UNKNOWN', v_item.return_type, null::date, null::integer, false;
    return;
  end if;

  if v_item.return_eligible_until < current_date then
    return query select false, 'RETURN_WINDOW_CLOSED', v_item.return_type,
                        v_item.return_eligible_until, 0, false;
    return;
  end if;

  -- Already fully returned.
  if v_item.returned_quantity >= v_item.quantity then
    return query select false, 'ALREADY_RETURNED', v_item.return_type,
                        v_item.return_eligible_until, null::integer, false;
    return;
  end if;

  -- An open request blocks a duplicate one.
  select count(*) into v_open
    from returns.return_requests rr
    join returns.return_items ri on ri.return_request_id = rr.id
   where ri.order_item_id = p_order_item_id
     and rr.status not in ('REJECTED', 'CANCELLED', 'COMPLETED');

  if v_open > 0 then
    return query select false, 'RETURN_ALREADY_IN_PROGRESS', v_item.return_type,
                        v_item.return_eligible_until, null::integer, false;
    return;
  end if;

  if p_reason_code is not null then
    select * into v_reason from returns.return_reasons where code = p_reason_code and is_active;
    if v_reason.id is null then
      return query select false, 'INVALID_REASON', v_item.return_type,
                          v_item.return_eligible_until, null::integer, false;
      return;
    end if;
  end if;

  return query select true, null::text, v_item.return_type, v_item.return_eligible_until,
                      (v_item.return_eligible_until - current_date)::integer,
                      coalesce(v_reason.requires_evidence, false);
end;
$$;

comment on function returns.check_eligibility(uuid, text) is
  'Return eligibility from the policy snapshotted on the order item at order time (ADR 0010).';
