-- =============================================================================
-- Assertions for the oversell test. Any failure raises, so the shell script's exit
-- code is the test result.
-- =============================================================================

do $$
declare
  v_available    integer;
  v_reserved     integer;
  v_physical     integer;
  v_reservations integer;
  v_units        integer;
  v_ledger_avail integer;
  v_ledger_resv  integer;
  v_drift        integer;
begin
  select wi.available_quantity, wi.reserved_quantity, wi.physical_quantity
    into v_available, v_reserved, v_physical
    from inventory.warehouse_inventory wi
    join catalog.skus sk on sk.id = wi.sku_id
   where sk.sku_code = 'TEST-CONCURRENCY-001';

  select count(*), coalesce(sum(quantity), 0)
    into v_reservations, v_units
    from inventory.inventory_reservations r
    join catalog.skus sk on sk.id = r.sku_id
   where sk.sku_code = 'TEST-CONCURRENCY-001'
     and r.status = 'ACTIVE';

  select coalesce(sum(l.available_delta), 0), coalesce(sum(l.reserved_delta), 0)
    into v_ledger_avail, v_ledger_resv
    from inventory.inventory_ledger l
    join catalog.skus sk on sk.id = l.sku_id
   where sk.sku_code = 'TEST-CONCURRENCY-001';

  raise notice '--- Oversell test results ---';
  raise notice 'available_quantity      = %', v_available;
  raise notice 'reserved_quantity       = %', v_reserved;
  raise notice 'physical_quantity       = %', v_physical;
  raise notice 'active reservations     = %', v_reservations;
  raise notice 'reserved units          = %', v_units;
  raise notice 'ledger available sum    = %', v_ledger_avail;
  raise notice 'ledger reserved sum     = %', v_ledger_resv;

  -- 1. The defining requirement: never more than the stock that existed.
  if v_units > 100 then
    raise exception 'OVERSOLD: % units reserved from 100 available', v_units;
  end if;

  -- 2. With more attempts than stock, every unit must be taken.
  if v_units <> 100 then
    raise exception 'UNDER-RESERVED: expected exactly 100 units reserved, got %', v_units;
  end if;

  -- 3. Balances must be internally consistent.
  if v_available <> 0 then
    raise exception 'Expected available_quantity = 0, got %', v_available;
  end if;

  if v_reserved <> 100 then
    raise exception 'Expected reserved_quantity = 100, got %', v_reserved;
  end if;

  -- 4. Physical stock must be unchanged: a reservation moves units between buckets,
  --    it does not create or destroy them.
  if v_physical <> 100 then
    raise exception 'Physical quantity changed: expected 100, got %', v_physical;
  end if;

  -- 5. The ledger must reconcile with the materialised balance to the unit.
  if v_ledger_avail <> v_available then
    raise exception 'Ledger drift on available: ledger %, balance %', v_ledger_avail, v_available;
  end if;

  if v_ledger_resv <> v_reserved then
    raise exception 'Ledger drift on reserved: ledger %, balance %', v_ledger_resv, v_reserved;
  end if;

  -- 6. The platform-wide reconciliation function must report no drift at all.
  select count(*) into v_drift from inventory.reconcile_balances();
  if v_drift <> 0 then
    raise exception 'reconcile_balances() reported % drifting rows', v_drift;
  end if;

  raise notice 'PASS: exactly 100 units reserved, balances and ledger reconcile.';
end;
$$;
