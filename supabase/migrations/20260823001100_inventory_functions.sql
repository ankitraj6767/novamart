-- =============================================================================
-- NovaMart — 0011 Inventory engine functions
--
-- The reservation path lives in the database, not the application, for one reason:
-- correctness under concurrency depends on lock acquisition order and on the
-- balance update being in the same statement as its guard. Expressing that in SQL
-- means every caller (API, worker, admin tool, test) gets identical semantics.
--
-- Custom SQLSTATEs raised here, mapped to API error codes:
--   NM001  INVENTORY_UNAVAILABLE
--   NM002  INVALID_STATE_TRANSITION
--   NM003  IDEMPOTENCY_CONFLICT
--   NM004  RESERVATION_EXPIRED
--   NM005  ADJUSTMENT_NOT_APPROVED
-- =============================================================================

-- -----------------------------------------------------------------------------
-- inventory.reserve_stock
--
-- Atomically reserves stock for a set of (sku, seller, warehouse, quantity) items.
-- Either every line is reserved or the whole call fails: a partially reserved cart
-- is worse than a rejected one.
--
-- Concurrency design:
--   * All target rows are locked in ONE statement ordered by (sku_id, warehouse_id).
--     A deterministic order across all callers makes deadlock impossible.
--   * The balance UPDATE carries its own guard (available_quantity >= quantity), so
--     even if the lock were somehow bypassed the update would be a no-op.
--   * CHECK constraints make a negative balance unrepresentable regardless.
--
-- p_items: [{"sku_id":"…","seller_id":"…","warehouse_id":"…","quantity":2}, …]
-- -----------------------------------------------------------------------------
create or replace function inventory.reserve_stock(
  p_items               jsonb,
  p_checkout_session_id uuid     default null,
  p_order_id            uuid     default null,
  p_user_id             uuid     default null,
  p_ttl                 interval default interval '15 minutes',
  p_idempotency_key     text     default null
)
returns setof inventory.inventory_reservations
language plpgsql
volatile
set search_path = inventory, catalog, private, pg_catalog
as $$
declare
  v_item        record;
  v_inv         inventory.warehouse_inventory;
  v_reservation inventory.inventory_reservations;
  v_expires_at  timestamptz := now() + p_ttl;
  v_updated     integer;
  v_existing    integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'reserve_stock requires a non-empty JSON array of items'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Idempotent replay: the same key returns the same holds rather than stacking new ones.
  if p_idempotency_key is not null then
    select count(*) into v_existing
      from inventory.inventory_reservations
     where idempotency_key = p_idempotency_key
       and status in ('ACTIVE', 'CONFIRMED', 'CONSUMED');

    if v_existing > 0 then
      return query
        select * from inventory.inventory_reservations
         where idempotency_key = p_idempotency_key
           and status in ('ACTIVE', 'CONFIRMED', 'CONSUMED')
         order by created_at;
      return;
    end if;
  end if;

  -- Lock every target balance row up front, in a globally consistent order.
  -- Nothing between here and COMMIT may call an external provider: the lock window
  -- must stay as short as possible.
  perform 1
    from (
      select r.sku_id, r.seller_id, r.warehouse_id
        from jsonb_to_recordset(p_items)
          as r(sku_id uuid, seller_id uuid, warehouse_id uuid, quantity integer)
       group by r.sku_id, r.seller_id, r.warehouse_id
    ) req
    join inventory.warehouse_inventory wi
      on wi.sku_id       = req.sku_id
     and wi.seller_id    = req.seller_id
     and wi.warehouse_id = req.warehouse_id
   order by wi.sku_id, wi.warehouse_id
     for update of wi;

  -- Reserve line by line, in the same deterministic order.
  for v_item in
    select r.sku_id, r.seller_id, r.warehouse_id, sum(r.quantity)::integer as quantity
      from jsonb_to_recordset(p_items)
        as r(sku_id uuid, seller_id uuid, warehouse_id uuid, quantity integer)
     group by r.sku_id, r.seller_id, r.warehouse_id
     order by r.sku_id, r.warehouse_id
  loop
    if v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'Requested quantity for SKU % must be positive', v_item.sku_id
        using errcode = 'invalid_parameter_value';
    end if;

    select * into v_inv
      from inventory.warehouse_inventory wi
     where wi.sku_id       = v_item.sku_id
       and wi.seller_id    = v_item.seller_id
       and wi.warehouse_id = v_item.warehouse_id;

    if not found then
      raise exception 'No inventory record for SKU % at warehouse % for seller %',
        v_item.sku_id, v_item.warehouse_id, v_item.seller_id
        using errcode = 'NM001',
              hint = 'INVENTORY_UNAVAILABLE';
    end if;

    if v_inv.available_quantity < v_item.quantity then
      raise exception 'Insufficient stock for SKU %: requested %, available %',
        v_item.sku_id, v_item.quantity, v_inv.available_quantity
        using errcode = 'NM001',
              hint = 'INVENTORY_UNAVAILABLE',
              detail = jsonb_build_object(
                'sku_id', v_item.sku_id,
                'warehouse_id', v_item.warehouse_id,
                'requested', v_item.quantity,
                'available', v_inv.available_quantity
              )::text;
    end if;

    -- Guarded move: available → reserved. The predicate is the second line of
    -- defence if the lock above were ever bypassed.
    update inventory.warehouse_inventory
       set available_quantity = available_quantity - v_item.quantity,
           reserved_quantity  = reserved_quantity  + v_item.quantity
     where id = v_inv.id
       and available_quantity >= v_item.quantity;

    get diagnostics v_updated = row_count;

    if v_updated = 0 then
      raise exception 'Concurrent modification while reserving SKU %', v_item.sku_id
        using errcode = 'NM001', hint = 'INVENTORY_UNAVAILABLE';
    end if;

    insert into inventory.inventory_reservations (
      warehouse_inventory_id, warehouse_id, sku_id, seller_id, listing_id,
      checkout_session_id, order_id, user_id, quantity, status,
      idempotency_key, expires_at
    ) values (
      v_inv.id, v_item.warehouse_id, v_item.sku_id, v_item.seller_id, v_inv.listing_id,
      p_checkout_session_id, p_order_id, p_user_id, v_item.quantity, 'ACTIVE',
      p_idempotency_key, v_expires_at
    )
    returning * into v_reservation;

    insert into inventory.inventory_ledger (
      warehouse_inventory_id, warehouse_id, sku_id, seller_id, movement_type,
      available_delta, reserved_delta,
      available_after, reserved_after, damaged_after, in_transit_after,
      reservation_id, order_id, actor_id, actor_type, request_id, trace_id
    ) values (
      v_inv.id, v_item.warehouse_id, v_item.sku_id, v_item.seller_id, 'SALE_RESERVATION',
      -v_item.quantity, v_item.quantity,
      v_inv.available_quantity - v_item.quantity,
      v_inv.reserved_quantity  + v_item.quantity,
      v_inv.damaged_quantity, v_inv.in_transit_quantity,
      v_reservation.id, p_order_id, p_user_id, 'SYSTEM',
      private.current_request_id(), private.current_trace_id()
    );

    return next v_reservation;
  end loop;

  return;
end;
$$;

comment on function inventory.reserve_stock(jsonb, uuid, uuid, uuid, interval, text) is
  'Atomically reserves stock for a set of lines. All-or-nothing. Locks rows in (sku_id, warehouse_id) order to prevent deadlocks.';

-- -----------------------------------------------------------------------------
-- inventory.release_reservation — returns held stock to available.
-- Idempotent: releasing an already-released hold is a no-op, not an error, because
-- the sweeper and the cancellation path legitimately race.
-- -----------------------------------------------------------------------------
create or replace function inventory.release_reservation(
  p_reservation_id uuid,
  p_reason         text default 'MANUAL_RELEASE'
)
returns boolean
language plpgsql
volatile
set search_path = inventory, private, pg_catalog
as $$
declare
  v_res inventory.inventory_reservations;
  v_inv inventory.warehouse_inventory;
begin
  -- Lock the reservation first, then the balance: consistent ordering with the
  -- sweeper, which does the same.
  select * into v_res
    from inventory.inventory_reservations
   where id = p_reservation_id
     for update;

  if not found then
    return false;
  end if;

  -- Already terminal: nothing to release.
  if v_res.status <> 'ACTIVE' then
    return false;
  end if;

  select * into v_inv
    from inventory.warehouse_inventory
   where id = v_res.warehouse_inventory_id
     for update;

  update inventory.warehouse_inventory
     set available_quantity = available_quantity + v_res.quantity,
         reserved_quantity  = reserved_quantity  - v_res.quantity
   where id = v_res.warehouse_inventory_id
     and reserved_quantity >= v_res.quantity;

  if not found then
    raise exception 'Reserved quantity underflow releasing reservation %', p_reservation_id
      using errcode = 'NM001';
  end if;

  update inventory.inventory_reservations
     set status = case when p_reason = 'EXPIRED' then 'EXPIRED' else 'RELEASED' end,
         released_at = now(),
         release_reason = p_reason
   where id = p_reservation_id;

  insert into inventory.inventory_ledger (
    warehouse_inventory_id, warehouse_id, sku_id, seller_id, movement_type,
    available_delta, reserved_delta,
    available_after, reserved_after, damaged_after, in_transit_after,
    reservation_id, order_id, reason, actor_type, request_id, trace_id
  ) values (
    v_inv.id, v_res.warehouse_id, v_res.sku_id, v_res.seller_id, 'RESERVATION_RELEASE',
    v_res.quantity, -v_res.quantity,
    v_inv.available_quantity + v_res.quantity,
    v_inv.reserved_quantity  - v_res.quantity,
    v_inv.damaged_quantity, v_inv.in_transit_quantity,
    v_res.id, v_res.order_id, p_reason, 'SYSTEM',
    private.current_request_id(), private.current_trace_id()
  );

  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- inventory.confirm_reservations — binds active holds to a created order and stops
-- the expiry clock. Called inside the checkout transaction, after the order exists.
-- -----------------------------------------------------------------------------
create or replace function inventory.confirm_reservations(
  p_reservation_ids uuid[],
  p_order_id        uuid
)
returns integer
language plpgsql
volatile
set search_path = inventory, pg_catalog
as $$
declare
  v_count integer;
begin
  update inventory.inventory_reservations
     set status = 'CONFIRMED',
         order_id = p_order_id,
         confirmed_at = now(),
         -- Confirmed holds outlive the checkout window: payment may still be pending.
         expires_at = greatest(expires_at, now() + interval '24 hours')
   where id = any (p_reservation_ids)
     and status = 'ACTIVE';

  get diagnostics v_count = row_count;

  if v_count <> coalesce(array_length(p_reservation_ids, 1), 0) then
    raise exception 'Expected to confirm % reservations, confirmed %',
      coalesce(array_length(p_reservation_ids, 1), 0), v_count
      using errcode = 'NM004', hint = 'RESERVATION_EXPIRED';
  end if;

  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- inventory.consume_reservation — the reservation becomes a sale.
-- Called when the shipment is dispatched: stock physically leaves the warehouse,
-- so reserved decreases and nothing returns to available.
-- -----------------------------------------------------------------------------
create or replace function inventory.consume_reservation(
  p_reservation_id uuid,
  p_shipment_id    uuid default null
)
returns boolean
language plpgsql
volatile
set search_path = inventory, private, pg_catalog
as $$
declare
  v_res inventory.inventory_reservations;
  v_inv inventory.warehouse_inventory;
begin
  select * into v_res
    from inventory.inventory_reservations
   where id = p_reservation_id
     for update;

  if not found then
    return false;
  end if;

  if v_res.status = 'CONSUMED' then
    return false;  -- idempotent
  end if;

  if v_res.status not in ('ACTIVE', 'CONFIRMED') then
    raise exception 'Reservation % is % and cannot be consumed', p_reservation_id, v_res.status
      using errcode = 'NM002', hint = 'INVALID_STATE_TRANSITION';
  end if;

  select * into v_inv
    from inventory.warehouse_inventory
   where id = v_res.warehouse_inventory_id
     for update;

  update inventory.warehouse_inventory
     set reserved_quantity = reserved_quantity - v_res.quantity,
         last_sold_at = now()
   where id = v_res.warehouse_inventory_id
     and reserved_quantity >= v_res.quantity;

  if not found then
    raise exception 'Reserved quantity underflow consuming reservation %', p_reservation_id
      using errcode = 'NM001';
  end if;

  update inventory.inventory_reservations
     set status = 'CONSUMED', consumed_at = now()
   where id = p_reservation_id;

  insert into inventory.inventory_ledger (
    warehouse_inventory_id, warehouse_id, sku_id, seller_id, movement_type,
    reserved_delta,
    available_after, reserved_after, damaged_after, in_transit_after,
    reservation_id, order_id, order_item_id, shipment_id, actor_type, request_id, trace_id
  ) values (
    v_inv.id, v_res.warehouse_id, v_res.sku_id, v_res.seller_id, 'SALE',
    -v_res.quantity,
    v_inv.available_quantity,
    v_inv.reserved_quantity - v_res.quantity,
    v_inv.damaged_quantity, v_inv.in_transit_quantity,
    v_res.id, v_res.order_id, v_res.order_item_id, p_shipment_id, 'WORKER',
    private.current_request_id(), private.current_trace_id()
  );

  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- inventory.release_expired_reservations — the sweeper (scheduled job).
--
-- SKIP LOCKED lets several sweeper instances run concurrently without contending,
-- and guarantees an abandoned checkout cannot hold stock indefinitely.
-- -----------------------------------------------------------------------------
create or replace function inventory.release_expired_reservations(p_batch_size integer default 500)
returns integer
language plpgsql
volatile
set search_path = inventory, pg_catalog
as $$
declare
  v_id       uuid;
  v_released integer := 0;
begin
  for v_id in
    select id
      from inventory.inventory_reservations
     where status = 'ACTIVE'
       and expires_at <= now()
     order by expires_at
     limit p_batch_size
       for update skip locked
  loop
    if inventory.release_reservation(v_id, 'EXPIRED') then
      v_released := v_released + 1;
    end if;
  end loop;

  return v_released;
end;
$$;

comment on function inventory.release_expired_reservations(integer) is
  'Scheduled sweeper. Releases holds past expires_at so abandoned checkouts cannot lock up stock.';

-- -----------------------------------------------------------------------------
-- inventory.receive_stock — inbound receipt (purchase, seller upload, transfer in)
-- -----------------------------------------------------------------------------
create or replace function inventory.receive_stock(
  p_warehouse_id uuid,
  p_sku_id       uuid,
  p_seller_id    uuid,
  p_quantity     integer,
  p_movement_type text default 'PURCHASE_RECEIPT',
  p_reference    text default null,
  p_reason       text default null,
  p_transfer_id  uuid default null
)
returns inventory.warehouse_inventory
language plpgsql
volatile
set search_path = inventory, catalog, private, pg_catalog
as $$
declare
  v_inv inventory.warehouse_inventory;
begin
  if p_quantity <= 0 then
    raise exception 'Receipt quantity must be positive' using errcode = 'invalid_parameter_value';
  end if;

  if p_movement_type not in ('PURCHASE_RECEIPT', 'TRANSFER_IN', 'RETURN_RESTOCK', 'RTO_RECEIPT') then
    raise exception 'Movement type % is not an inbound receipt', p_movement_type
      using errcode = 'invalid_parameter_value';
  end if;

  -- Create the balance row on first receipt; lock it if it already exists.
  insert into inventory.warehouse_inventory (warehouse_id, sku_id, seller_id, available_quantity)
  values (p_warehouse_id, p_sku_id, p_seller_id, 0)
  on conflict (warehouse_id, sku_id, seller_id) do nothing;

  select * into v_inv
    from inventory.warehouse_inventory
   where warehouse_id = p_warehouse_id and sku_id = p_sku_id and seller_id = p_seller_id
     for update;

  update inventory.warehouse_inventory
     set available_quantity = available_quantity + p_quantity,
         last_received_at = now()
   where id = v_inv.id
  returning * into v_inv;

  insert into inventory.inventory_ledger (
    warehouse_inventory_id, warehouse_id, sku_id, seller_id, movement_type,
    available_delta,
    available_after, reserved_after, damaged_after, in_transit_after,
    transfer_id, reason, reference, actor_id, actor_type, request_id, trace_id
  ) values (
    v_inv.id, p_warehouse_id, p_sku_id, p_seller_id, p_movement_type,
    p_quantity,
    v_inv.available_quantity, v_inv.reserved_quantity, v_inv.damaged_quantity, v_inv.in_transit_quantity,
    p_transfer_id, coalesce(p_reason, 'Inbound receipt'), p_reference,
    private.current_actor_id(), 'WAREHOUSE',
    private.current_request_id(), private.current_trace_id()
  );

  return v_inv;
end;
$$;

-- -----------------------------------------------------------------------------
-- inventory.apply_adjustment — applies an APPROVED adjustment exactly once.
-- Separating "approve" from "apply" means a mistaken approval can still be caught
-- before it moves stock, and the applied transition is idempotent.
-- -----------------------------------------------------------------------------
create or replace function inventory.apply_adjustment(p_adjustment_id uuid)
returns inventory.warehouse_inventory
language plpgsql
volatile
set search_path = inventory, private, pg_catalog
as $$
declare
  v_adj inventory.inventory_adjustments;
  v_inv inventory.warehouse_inventory;
  v_movement text;
begin
  select * into v_adj
    from inventory.inventory_adjustments
   where id = p_adjustment_id
     for update;

  if not found then
    raise exception 'Adjustment % not found', p_adjustment_id using errcode = 'no_data_found';
  end if;

  if v_adj.status = 'APPLIED' then
    select * into v_inv from inventory.warehouse_inventory where id = v_adj.warehouse_inventory_id;
    return v_inv;  -- idempotent
  end if;

  if v_adj.status <> 'APPROVED' then
    raise exception 'Adjustment % is % and cannot be applied', p_adjustment_id, v_adj.status
      using errcode = 'NM005', hint = 'ADJUSTMENT_NOT_APPROVED';
  end if;

  select * into v_inv
    from inventory.warehouse_inventory
   where id = v_adj.warehouse_inventory_id
     for update;

  v_movement := case
    when v_adj.adjustment_type = 'CYCLE_COUNT' then 'CYCLE_COUNT_CORRECTION'
    when v_adj.adjustment_type = 'DAMAGE'      then 'DAMAGE'
    when v_adj.quantity_delta > 0              then 'ADJUSTMENT_INCREASE'
    else 'ADJUSTMENT_DECREASE'
  end;

  if v_adj.target_bucket = 'AVAILABLE' then
    update inventory.warehouse_inventory
       set available_quantity = available_quantity + v_adj.quantity_delta
     where id = v_inv.id
       and available_quantity + v_adj.quantity_delta >= 0
    returning * into v_inv;
  elsif v_adj.target_bucket = 'DAMAGED' then
    -- Moving units into the damaged bucket takes them out of available.
    update inventory.warehouse_inventory
       set damaged_quantity   = damaged_quantity + v_adj.quantity_delta,
           available_quantity = available_quantity - v_adj.quantity_delta
     where id = v_inv.id
       and damaged_quantity + v_adj.quantity_delta >= 0
       and available_quantity - v_adj.quantity_delta >= 0
    returning * into v_inv;
  else
    update inventory.warehouse_inventory
       set blocked_quantity   = blocked_quantity + v_adj.quantity_delta,
           available_quantity = available_quantity - v_adj.quantity_delta
     where id = v_inv.id
       and blocked_quantity + v_adj.quantity_delta >= 0
       and available_quantity - v_adj.quantity_delta >= 0
    returning * into v_inv;
  end if;

  if not found then
    raise exception 'Adjustment % would drive a quantity negative', p_adjustment_id
      using errcode = 'NM001', hint = 'INVENTORY_UNAVAILABLE';
  end if;

  insert into inventory.inventory_ledger (
    warehouse_inventory_id, warehouse_id, sku_id, seller_id, movement_type,
    available_delta, damaged_delta, blocked_delta,
    available_after, reserved_after, damaged_after, in_transit_after,
    adjustment_id, reason, actor_id, actor_type, request_id, trace_id
  ) values (
    v_inv.id, v_adj.warehouse_id, v_adj.sku_id, v_adj.seller_id, v_movement,
    case when v_adj.target_bucket = 'AVAILABLE' then v_adj.quantity_delta else -v_adj.quantity_delta end,
    case when v_adj.target_bucket = 'DAMAGED'   then v_adj.quantity_delta else 0 end,
    case when v_adj.target_bucket = 'BLOCKED'   then v_adj.quantity_delta else 0 end,
    v_inv.available_quantity, v_inv.reserved_quantity, v_inv.damaged_quantity, v_inv.in_transit_quantity,
    v_adj.id, v_adj.reason, coalesce(v_adj.approved_by, private.current_actor_id()), 'STAFF',
    private.current_request_id(), private.current_trace_id()
  );

  update inventory.inventory_adjustments
     set status = 'APPLIED',
         applied_at = now(),
         quantity_after = case v_adj.target_bucket
                            when 'AVAILABLE' then v_inv.available_quantity
                            when 'DAMAGED'   then v_inv.damaged_quantity
                            else v_inv.blocked_quantity
                          end
   where id = p_adjustment_id;

  return v_inv;
end;
$$;

-- -----------------------------------------------------------------------------
-- inventory.reconcile_balances
--
-- Replays the ledger and compares it against materialised balances. Any non-empty
-- result is an incident: it means a code path changed stock without a ledger entry
-- (or vice versa). Run by a scheduled job with alerting on row count > 0.
-- -----------------------------------------------------------------------------
create or replace function inventory.reconcile_balances(p_seller_id uuid default null)
returns table (
  warehouse_inventory_id uuid,
  warehouse_id           uuid,
  sku_id                 uuid,
  seller_id              uuid,
  balance_available      integer,
  ledger_available       integer,
  available_drift        integer,
  balance_reserved       integer,
  ledger_reserved        integer,
  reserved_drift         integer
)
language sql
stable
set search_path = inventory, pg_catalog
as $$
  with ledger_totals as (
    select l.warehouse_inventory_id,
           sum(l.available_delta)::integer as available_sum,
           sum(l.reserved_delta)::integer  as reserved_sum
      from inventory.inventory_ledger l
     group by l.warehouse_inventory_id
  )
  select wi.id, wi.warehouse_id, wi.sku_id, wi.seller_id,
         wi.available_quantity,
         coalesce(lt.available_sum, 0),
         wi.available_quantity - coalesce(lt.available_sum, 0),
         wi.reserved_quantity,
         coalesce(lt.reserved_sum, 0),
         wi.reserved_quantity - coalesce(lt.reserved_sum, 0)
    from inventory.warehouse_inventory wi
    left join ledger_totals lt on lt.warehouse_inventory_id = wi.id
   where (p_seller_id is null or wi.seller_id = p_seller_id)
     and (wi.available_quantity <> coalesce(lt.available_sum, 0)
          or wi.reserved_quantity <> coalesce(lt.reserved_sum, 0));
$$;

comment on function inventory.reconcile_balances(uuid) is
  'Returns rows where the materialised balance disagrees with the ledger. Any output is an incident.';

-- -----------------------------------------------------------------------------
-- inventory.available_for_sku — total sellable units across nodes for a SKU.
-- Used by the PDP ("In stock") and by the search indexer.
-- -----------------------------------------------------------------------------
create or replace function inventory.available_for_sku(p_sku_id uuid, p_seller_id uuid default null)
returns integer
language sql
stable
set search_path = inventory, pg_catalog
as $$
  select coalesce(sum(wi.available_quantity), 0)::integer
    from inventory.warehouse_inventory wi
    join inventory.warehouses w on w.id = wi.warehouse_id
   where wi.sku_id = p_sku_id
     and (p_seller_id is null or wi.seller_id = p_seller_id)
     and w.is_active
     and w.accepts_new_orders;
$$;

-- -----------------------------------------------------------------------------
-- Function privileges: the reservation engine is server-only. A client must never
-- be able to move stock, even with a valid JWT.
-- -----------------------------------------------------------------------------
revoke all on function inventory.reserve_stock(jsonb, uuid, uuid, uuid, interval, text)   from public, anon, authenticated;
revoke all on function inventory.release_reservation(uuid, text)                          from public, anon, authenticated;
revoke all on function inventory.confirm_reservations(uuid[], uuid)                       from public, anon, authenticated;
revoke all on function inventory.consume_reservation(uuid, uuid)                          from public, anon, authenticated;
revoke all on function inventory.release_expired_reservations(integer)                    from public, anon, authenticated;
revoke all on function inventory.receive_stock(uuid, uuid, uuid, integer, text, text, text, uuid) from public, anon, authenticated;
revoke all on function inventory.apply_adjustment(uuid)                                   from public, anon, authenticated;
revoke all on function inventory.reconcile_balances(uuid)                                 from public, anon, authenticated;

grant execute on function inventory.reserve_stock(jsonb, uuid, uuid, uuid, interval, text)   to service_role;
grant execute on function inventory.release_reservation(uuid, text)                          to service_role;
grant execute on function inventory.confirm_reservations(uuid[], uuid)                       to service_role;
grant execute on function inventory.consume_reservation(uuid, uuid)                          to service_role;
grant execute on function inventory.release_expired_reservations(integer)                    to service_role;
grant execute on function inventory.receive_stock(uuid, uuid, uuid, integer, text, text, text, uuid) to service_role;
grant execute on function inventory.apply_adjustment(uuid)                                   to service_role;
grant execute on function inventory.reconcile_balances(uuid)                                 to service_role;
grant execute on function inventory.available_for_sku(uuid, uuid)                            to service_role, authenticated, anon;
