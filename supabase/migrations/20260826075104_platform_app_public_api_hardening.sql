-- NovaMart completion hardening.
-- Additive constraints for the new shipment and customer experience write paths.

alter table fulfillment.shipments
  add column if not exists idempotency_key text;

create unique index if not exists shipments_idempotency_idx
  on fulfillment.shipments (idempotency_key)
  where idempotency_key is not null;

alter table returns.return_requests
  add column if not exists idempotency_key text;

create unique index if not exists return_requests_idempotency_idx
  on returns.return_requests (idempotency_key)
  where idempotency_key is not null;

-- PostgreSQL NULLs do not collide in a normal unique constraint. This partial index
-- prevents duplicate default-variant wishlist entries while preserving multi-variant lists.
create unique index if not exists wishlist_items_default_variant_idx
  on commerce.wishlist_items (wishlist_id, product_id)
  where variant_id is null;

-- Storage upsert requires SELECT + INSERT + UPDATE. The API still derives every path and
-- checks ownership before issuing the signed upload target.
drop policy if exists "seller users update their own private objects" on storage.objects;

create policy "seller users update their own private objects"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'seller-private'
    and (storage.foldername(name))[1] = 'seller'
    and identity.has_seller_scope(((storage.foldername(name))[2])::uuid)
  )
  with check (
    bucket_id = 'seller-private'
    and (storage.foldername(name))[1] = 'seller'
    and identity.has_seller_scope(((storage.foldername(name))[2])::uuid)
  );

comment on index fulfillment.shipments_idempotency_idx is
  'A shipment create request can be retried without creating a second carrier handoff.';

comment on index returns.return_requests_idempotency_idx is
  'A return request can be retried without opening duplicate post-purchase workflows.';

-- Transfer operations are database functions so both endpoints and future workers use the
-- same row locks and ledger movements.
create or replace function inventory.dispatch_transfer(p_transfer_id uuid)
returns integer
language plpgsql
volatile
set search_path = inventory, private, pg_catalog
as $$
declare
  v_transfer inventory.inventory_transfers;
  v_item record;
  v_source inventory.warehouse_inventory;
  v_count integer := 0;
begin
  select * into v_transfer from inventory.inventory_transfers where id = p_transfer_id for update;
  if v_transfer.id is null then raise exception 'Transfer % not found', p_transfer_id using errcode = 'no_data_found'; end if;
  if v_transfer.status not in ('DRAFT', 'APPROVED') then raise exception 'Transfer % is %', p_transfer_id, v_transfer.status using errcode = 'NM002', hint = 'INVALID_STATE_TRANSITION'; end if;

  for v_item in select * from inventory.inventory_transfer_items where transfer_id = p_transfer_id order by sku_id loop
    select * into v_source from inventory.warehouse_inventory
     where warehouse_id = v_transfer.source_warehouse_id and sku_id = v_item.sku_id and seller_id = v_transfer.seller_id
     for update;
    if v_source.id is null or v_source.available_quantity < v_item.quantity_requested then
      raise exception 'Insufficient stock for SKU %', v_item.sku_id using errcode = 'NM001', hint = 'INVENTORY_UNAVAILABLE';
    end if;
    update inventory.warehouse_inventory set available_quantity = available_quantity - v_item.quantity_requested, in_transit_quantity = in_transit_quantity + v_item.quantity_requested where id = v_source.id returning * into v_source;
    insert into inventory.inventory_ledger (warehouse_inventory_id, warehouse_id, sku_id, seller_id, movement_type, available_delta, in_transit_delta, available_after, reserved_after, damaged_after, in_transit_after, transfer_id, reason, actor_id, actor_type, request_id, trace_id)
    values (v_source.id, v_transfer.source_warehouse_id, v_item.sku_id, v_transfer.seller_id, 'TRANSFER_OUT', -v_item.quantity_requested, v_item.quantity_requested, v_source.available_quantity, v_source.reserved_quantity, v_source.damaged_quantity, v_source.in_transit_quantity, p_transfer_id, coalesce(v_transfer.reason, 'Warehouse transfer'), private.current_actor_id(), 'WAREHOUSE', private.current_request_id(), private.current_trace_id());
    update inventory.inventory_transfer_items set quantity_dispatched = quantity_requested where id = v_item.id;
    v_count := v_count + 1;
  end loop;
  update inventory.inventory_transfers set status = 'IN_TRANSIT', dispatched_at = now() where id = p_transfer_id;
  return v_count;
end;
$$;

create or replace function inventory.receive_transfer(p_transfer_id uuid)
returns integer
language plpgsql
volatile
set search_path = inventory, private, pg_catalog
as $$
declare
  v_transfer inventory.inventory_transfers;
  v_item record;
  v_source inventory.warehouse_inventory;
  v_pending integer;
  v_count integer := 0;
begin
  select * into v_transfer from inventory.inventory_transfers where id = p_transfer_id for update;
  if v_transfer.id is null then raise exception 'Transfer % not found', p_transfer_id using errcode = 'no_data_found'; end if;
  if v_transfer.status not in ('IN_TRANSIT', 'DISPATCHED', 'PARTIALLY_RECEIVED') then raise exception 'Transfer % is %', p_transfer_id, v_transfer.status using errcode = 'NM002', hint = 'INVALID_STATE_TRANSITION'; end if;

  for v_item in select * from inventory.inventory_transfer_items where transfer_id = p_transfer_id order by sku_id loop
    v_pending := v_item.quantity_dispatched - v_item.quantity_received - v_item.quantity_damaged;
    if v_pending <= 0 then continue; end if;
    select * into v_source from inventory.warehouse_inventory where warehouse_id = v_transfer.source_warehouse_id and sku_id = v_item.sku_id and seller_id = v_transfer.seller_id for update;
    if v_source.id is null or v_source.in_transit_quantity < v_pending then raise exception 'Transfer transit balance is invalid for SKU %', v_item.sku_id using errcode = 'NM001', hint = 'INVENTORY_UNAVAILABLE'; end if;
    update inventory.warehouse_inventory set in_transit_quantity = in_transit_quantity - v_pending where id = v_source.id returning * into v_source;
    insert into inventory.inventory_ledger (warehouse_inventory_id, warehouse_id, sku_id, seller_id, movement_type, in_transit_delta, available_after, reserved_after, damaged_after, in_transit_after, transfer_id, reason, actor_id, actor_type, request_id, trace_id)
    values (v_source.id, v_transfer.source_warehouse_id, v_item.sku_id, v_transfer.seller_id, 'TRANSFER_OUT', -v_pending, v_source.available_quantity, v_source.reserved_quantity, v_source.damaged_quantity, v_source.in_transit_quantity, p_transfer_id, 'Transfer received at destination', private.current_actor_id(), 'WAREHOUSE', private.current_request_id(), private.current_trace_id());
    perform inventory.receive_stock(v_transfer.target_warehouse_id, v_item.sku_id, v_transfer.seller_id, v_pending, 'TRANSFER_IN', v_transfer.transfer_reference, 'Warehouse transfer received', p_transfer_id);
    update inventory.inventory_transfer_items set quantity_received = quantity_dispatched where id = v_item.id;
    v_count := v_count + 1;
  end loop;
  update inventory.inventory_transfers set status = 'RECEIVED', received_at = now() where id = p_transfer_id;
  return v_count;
end;
$$;

revoke all on function inventory.dispatch_transfer(uuid) from public, anon, authenticated;
revoke all on function inventory.receive_transfer(uuid) from public, anon, authenticated;
grant execute on function inventory.dispatch_transfer(uuid) to service_role;
grant execute on function inventory.receive_transfer(uuid) to service_role;
