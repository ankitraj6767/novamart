-- One reservation attempt of a single unit. Failures are expected and swallowed:
-- the point of the test is that the SUCCESSES are capped at the available stock.
--
-- Wrapped in a transaction with a short lock_timeout so a pathological wait fails
-- fast rather than hanging the test, exactly as the API is configured to behave.
set lock_timeout = '10s';
set statement_timeout = '15s';

do $$
declare
  v_sku       uuid;
  v_seller    uuid;
  v_warehouse uuid;
begin
  select sk.id, wi.seller_id, wi.warehouse_id
    into v_sku, v_seller, v_warehouse
    from catalog.skus sk
    join inventory.warehouse_inventory wi on wi.sku_id = sk.id
   where sk.sku_code = 'TEST-CONCURRENCY-001'
   limit 1;

  perform inventory.reserve_stock(
    jsonb_build_array(jsonb_build_object(
      'sku_id', v_sku, 'seller_id', v_seller, 'warehouse_id', v_warehouse, 'quantity', 1
    )),
    null, null, null, interval '30 minutes', null
  );
exception
  -- NM001 is INVENTORY_UNAVAILABLE: the expected outcome once stock runs out.
  when sqlstate 'NM001' then null;
  -- Lock timeout under heavy contention is also an acceptable failure mode.
  when lock_not_available then null;
  when others then
    raise notice 'Unexpected failure: % %', sqlstate, sqlerrm;
end;
$$;
