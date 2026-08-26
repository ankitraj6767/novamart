-- A paid order changes its reservation from ACTIVE to CONFIRMED. Cancellation is
-- allowed before dispatch, so both states must return stock to sellable inventory.
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
  select * into v_res
    from inventory.inventory_reservations
   where id = p_reservation_id
     for update;

  if not found then
    return false;
  end if;

  -- ACTIVE is an unpaid hold; CONFIRMED is a paid order awaiting dispatch. Both
  -- are still physically reserved and both are safe to release before shipment.
  if v_res.status not in ('ACTIVE', 'CONFIRMED') then
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
    v_inv.reserved_quantity - v_res.quantity,
    v_inv.damaged_quantity, v_inv.in_transit_quantity,
    v_res.id, v_res.order_id, p_reason, 'SYSTEM',
    private.current_request_id(), private.current_trace_id()
  );

  return true;
end;
$$;

comment on function inventory.release_reservation(uuid, text) is
  'Idempotently releases ACTIVE or CONFIRMED holds before dispatch; terminal holds are no-ops.';
