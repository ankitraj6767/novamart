do $$
declare
  missing text;
begin
  select string_agg(format('%I.%I', n.nspname, c.relname), ', ' order by n.nspname, c.relname)
    into missing
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where c.relkind in ('r', 'p')
     and n.nspname in (
       'identity', 'seller', 'catalog', 'pricing', 'inventory', 'commerce',
       'payments', 'fulfillment', 'returns', 'finance', 'marketing', 'support',
       'analytics', 'risk', 'audit', 'platform', 'storage'
     )
     and not c.relrowsecurity;

  if missing is not null then
    raise exception 'RLS is disabled on: %', missing;
  end if;
end;
$$;

select
  'RLS_ASSERTION_PASS' as result,
  count(*)::int as protected_tables
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p')
  and n.nspname in (
    'identity', 'seller', 'catalog', 'pricing', 'inventory', 'commerce',
    'payments', 'fulfillment', 'returns', 'finance', 'marketing', 'support',
    'analytics', 'risk', 'audit', 'platform', 'storage'
  )
  and c.relrowsecurity;
