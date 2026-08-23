-- ============================================================================
-- Checkout gift intent, and RLS on analytics partitions.
--
-- Two unrelated but small corrections found while building the checkout vertical.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Gift intent belongs on the checkout session.
--
-- commerce.orders already carries is_gift / gift_message, but the checkout session
-- had nowhere to hold the intent between the customer choosing it and the order
-- being created. Without this the flag could only be passed at place-order time,
-- which means it is absent from the quote the customer confirms and from the
-- gift-wrap charge in the price snapshot.
-- ----------------------------------------------------------------------------
alter table commerce.checkout_sessions
  add column if not exists is_gift      boolean not null default false,
  add column if not exists gift_message text;

alter table commerce.checkout_sessions
  drop constraint if exists checkout_sessions_gift_message_check;

alter table commerce.checkout_sessions
  add constraint checkout_sessions_gift_message_check
  check (gift_message is null or length(gift_message) <= 300);

comment on column commerce.checkout_sessions.is_gift is
  'Carried into commerce.orders.is_gift when the order is created.';

-- ----------------------------------------------------------------------------
-- 2. RLS on analytics.events partitions.
--
-- Postgres applies the parent partitioned table''s policies only when a query goes
-- THROUGH the parent. A query naming a partition directly is governed by that
-- partition''s own policies, so a partition with RLS disabled is an unpoliced copy
-- of the same rows.
--
-- This is currently not reachable: only service_role holds grants on analytics.events
-- and its partitions, and anon/authenticated hold none. It is fixed anyway because the
-- protection must not depend on nobody ever adding a grant, and because
-- ensure_event_partition() creates next month''s partition unpoliced every month.
-- ----------------------------------------------------------------------------
do $$
declare
  v_partition record;
begin
  for v_partition in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_inherits i on i.inhrelid = c.oid
      join pg_class parent on parent.oid = i.inhparent
     where n.nspname = 'analytics'
       and parent.relname = 'events'
       and not c.relrowsecurity
  loop
    execute format('alter table analytics.%I enable row level security', v_partition.relname);
    execute format('alter table analytics.%I force row level security', v_partition.relname);
  end loop;
end;
$$;

-- Recreate the partition factory so every future partition is created policed.
--
-- The signature, volatility, search_path and (absent) SECURITY DEFINER are preserved
-- exactly as migration 20260823002100 declared them. Dropping the parameter default
-- would make CREATE OR REPLACE fail outright, and quietly promoting this to SECURITY
-- DEFINER would widen the privileges of a function that creates tables.
create or replace function analytics.ensure_event_partition(
  p_month date default (current_date + interval '1 month')::date
)
returns text
language plpgsql
volatile
set search_path = analytics, pg_catalog
as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_name  text := 'events_' || to_char(v_start, 'YYYY_MM');
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'analytics' and c.relname = v_name) then
    return v_name;
  end if;

  execute format(
    'create table analytics.%I partition of analytics.events for values from (%L) to (%L)',
    v_name, v_start, v_end
  );

  -- A partition inherits neither RLS nor grants from its parent, so both are set
  -- explicitly. FORCE also subjects the table owner to the policies.
  execute format('alter table analytics.%I enable row level security', v_name);
  execute format('alter table analytics.%I force row level security', v_name);

  return v_name;
end;
$$;

-- CREATE OR REPLACE keeps the existing ACL, but the revoke from migration
-- 20260823002600 is restated so the grant posture is readable here rather than only
-- inferable from an earlier file.
revoke execute on function analytics.ensure_event_partition(date) from anon, authenticated;

comment on function analytics.ensure_event_partition(date) is
  'Creates a monthly partition of analytics.events with RLS enabled and forced. '
  'RLS is set per partition because a partition does not inherit it from the parent, '
  'and a direct query against a partition bypasses the parent''s policies.';

-- ----------------------------------------------------------------------------
-- 3. COD partial-prepay threshold.
--
-- payment.cod_partial_prepay_percentage already defines HOW MUCH to collect up front,
-- but nothing defined ABOVE WHAT VALUE to ask for it. Without a configured threshold
-- the rule would have to be hardcoded in the checkout engine, which is exactly what
-- brief §84 forbids.
-- ----------------------------------------------------------------------------
insert into platform.platform_settings (
  key, value, value_type, category, label, description,
  is_public, is_sensitive, default_value
) values (
  'payment.cod_prepay_threshold_paise',
  '500000'::jsonb,
  'number',
  'payment',
  'COD partial prepay threshold',
  'Order value above which an unproven customer is asked to prepay part of a cash-on-delivery order. '
  'Set high enough not to add friction to ordinary baskets; the loss it guards against is RTO on high-value cash orders.',
  false,
  false,
  '500000'::jsonb
)
on conflict (key) do nothing;
