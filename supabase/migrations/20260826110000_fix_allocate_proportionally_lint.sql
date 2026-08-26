-- Keep the largest-remainder allocator strongly typed. Explicit array initialisers
-- avoid PostgreSQL's unknown/text inference and make `supabase db lint` clean.
create or replace function private.allocate_proportionally(total public.paise, weights bigint[])
returns bigint[]
language plpgsql
immutable
strict
parallel safe
set search_path = pg_catalog
as $$
declare
  weight_sum     numeric := 0::numeric;
  allocations    bigint[] := array[]::bigint[];
  remainders     numeric[] := array[]::numeric[];
  allocated      bigint := 0::bigint;
  leftover       bigint;
  remainder_index integer;
  exact_share    numeric;
  base_share     bigint;
  order_idx      integer[];
begin
  if array_length(weights, 1) is null then
    return array[]::bigint[];
  end if;

  select sum(weight)::numeric into weight_sum from unnest(weights) as u(weight);

  if weight_sum = 0 then
    allocations := array_fill(0::bigint, array[array_length(weights, 1)]);
    allocations[1] := total;
    return allocations;
  end if;

  for loop_index in 1 .. array_length(weights, 1) loop
    exact_share := (total::numeric * weights[loop_index]) / weight_sum;
    base_share := floor(exact_share)::bigint;
    allocations := allocations || base_share;
    remainders := remainders || (exact_share - base_share);
    allocated := allocated + base_share;
  end loop;

  leftover := total - allocated;

  select array_agg(idx::integer order by rem desc, idx asc)
    into order_idx
    from unnest(remainders) with ordinality as t(rem, idx);

  remainder_index := 1;
  while leftover > 0 and remainder_index <= array_length(order_idx, 1) loop
    allocations[order_idx[remainder_index]] := allocations[order_idx[remainder_index]] + 1;
    leftover := leftover - 1;
    remainder_index := remainder_index + 1;
  end loop;

  return allocations;
end;
$$;
