-- =============================================================================
-- NovaMart — 0002 Shared domain types, helper functions and guard triggers
--
-- Domain types live in `public` deliberately: every role already has USAGE on
-- `public`, and types are not exposed by PostgREST (only tables/views/functions are).
-- Keeping them here avoids per-schema type duplication.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Domain types — validation that cannot be forgotten by application code
-- -----------------------------------------------------------------------------

-- Money. Always an integer count of paise (ADR 0004). Signed, because ledger
-- entries and adjustments are legitimately negative. Non-negativity is asserted
-- per column with CHECK constraints where it applies.
create domain public.paise as bigint;
comment on domain public.paise is 'Monetary amount as an integer count of paise (1 INR = 100 paise). Never use floats for money.';

-- Percentage with three decimal places: 18.000, 2.500, 0.750.
create domain public.percentage as numeric(6, 3)
  constraint percentage_range check (value >= 0 and value <= 100);

create domain public.email_address as extensions.citext
  constraint email_shape check (value ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- E.164 without the leading '+', stored canonically (Indian mobiles: 91XXXXXXXXXX).
create domain public.phone_e164 as text
  constraint phone_shape check (value ~ '^[1-9][0-9]{7,14}$');

create domain public.indian_pincode as text
  constraint pincode_shape check (value ~ '^[1-9][0-9]{5}$');

-- Permanent Account Number: 5 letters, 4 digits, 1 letter.
create domain public.pan_number as text
  constraint pan_shape check (value ~ '^[A-Z]{5}[0-9]{4}[A-Z]$');

-- GSTIN: 2-digit state code, 10-char PAN, entity number, Z, checksum.
create domain public.gstin as text
  constraint gstin_shape check (value ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$');

create domain public.ifsc_code as text
  constraint ifsc_shape check (value ~ '^[A-Z]{4}0[A-Z0-9]{6}$');

-- HSN (goods) or SAC (services) code used for GST classification.
create domain public.hsn_code as text
  constraint hsn_shape check (value ~ '^[0-9]{4,8}$');

create domain public.url_slug as text
  constraint slug_shape check (value ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and length(value) between 2 and 160);

create domain public.currency_code as text
  constraint currency_shape check (value ~ '^[A-Z]{3}$');

create domain public.locale_code as text
  constraint locale_shape check (value ~ '^[a-z]{2}(-[A-Z]{2})?$');

create domain public.non_negative_int as integer
  constraint non_negative check (value >= 0);

create domain public.positive_int as integer
  constraint positive check (value > 0);

-- -----------------------------------------------------------------------------
-- UUID v7 — time-ordered identifiers for high-volume, append-heavy tables
-- (orders, events, ledger). Time ordering keeps B-tree inserts local instead of
-- scattering them across the index like UUID v4 does.
--
-- Layout per RFC 9562: 48-bit big-endian unix_ts_ms | version 7 | 12 random bits
-- | variant 10xx | 60 random bits.
-- -----------------------------------------------------------------------------
create or replace function private.uuid_generate_v7()
returns uuid
language sql
volatile
parallel safe
set search_path = private, extensions, pg_catalog
as $$
  select (
       lpad(to_hex((extract(epoch from clock_timestamp()) * 1000)::bigint), 12, '0')
    || '7'
    || substr(encode(extensions.gen_random_bytes(2), 'hex'), 1, 3)
    || to_hex(8 + floor(random() * 4)::int)
    || substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 15)
  )::uuid;
$$;

comment on function private.uuid_generate_v7() is
  'RFC 9562 UUID v7: time-ordered primary keys for append-heavy tables.';

-- -----------------------------------------------------------------------------
-- updated_at maintenance. Applied as a BEFORE UPDATE trigger so no application
-- code can forget it.
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Append-only guards. Attached to ledgers, audit logs, snapshots and event
-- tables. These raise for EVERY role including service_role: immutability that a
-- privileged connection can bypass is not immutability.
-- -----------------------------------------------------------------------------
create or replace function private.prevent_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception
    'Table %.% is append-only: % is not permitted. Post a compensating entry instead.',
    tg_table_schema, tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

comment on function private.prevent_mutation() is
  'Blocks UPDATE/DELETE on append-only tables (ledgers, audit, snapshots, event streams).';

create or replace function private.prevent_delete()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception
    'Rows in %.% cannot be deleted. Use the soft-delete or status column instead.',
    tg_table_schema, tg_table_name
    using errcode = 'restrict_violation';
end;
$$;

-- Allows a narrow set of columns to change on an otherwise append-only table
-- (used by the outbox, where only dispatch bookkeeping may be updated).
create or replace function private.allow_only_columns()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  allowed    text[] := tg_argv[0]::text[];
  col        text;
  old_json   jsonb := to_jsonb(old);
  new_json   jsonb := to_jsonb(new);
begin
  for col in select jsonb_object_keys(old_json) loop
    if (old_json -> col) is distinct from (new_json -> col) and not (col = any (allowed)) then
      raise exception 'Column %.%.% is immutable', tg_table_schema, tg_table_name, col
        using errcode = 'restrict_violation';
    end if;
  end loop;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Slug generation. Deterministic, ASCII-folded, safe for URLs and SEO.
-- -----------------------------------------------------------------------------
create or replace function private.slugify(input text)
returns text
language sql
immutable
strict
parallel safe
set search_path = extensions, pg_catalog
as $$
  select trim(both '-' from
           regexp_replace(
             regexp_replace(lower(extensions.unaccent(input)), '[^a-z0-9]+', '-', 'g'),
             '-{2,}', '-', 'g'
           )
         );
$$;

-- -----------------------------------------------------------------------------
-- Human-facing reference numbers (order NM…, return RT…, shipment SH…).
-- Backed by sequences so they are gap-tolerant but never duplicated. These are
-- display identifiers only; UUIDs remain the primary keys.
-- -----------------------------------------------------------------------------
create sequence if not exists private.order_reference_seq       start with 100000001;
create sequence if not exists private.return_reference_seq      start with 100000001;
create sequence if not exists private.shipment_reference_seq    start with 100000001;
create sequence if not exists private.settlement_reference_seq  start with 100000001;
create sequence if not exists private.invoice_reference_seq     start with 100000001;
create sequence if not exists private.ticket_reference_seq      start with 100000001;
create sequence if not exists private.seller_reference_seq      start with 100001;
create sequence if not exists private.payout_reference_seq      start with 100000001;

create or replace function private.next_reference(prefix text, seq regclass)
returns text
language sql
volatile
set search_path = pg_catalog
as $$
  select prefix || lpad(nextval(seq)::text, 9, '0');
$$;

comment on function private.next_reference(text, regclass) is
  'Builds a human-facing reference such as NM100000001. Display identifier only, never a foreign key.';

-- -----------------------------------------------------------------------------
-- Money helpers
-- -----------------------------------------------------------------------------

-- Half-up rounding of a paise amount after a percentage application.
create or replace function private.apply_percentage(amount public.paise, pct public.percentage)
returns public.paise
language sql
immutable
strict
parallel safe
set search_path = pg_catalog
as $$
  select floor((amount::numeric * pct / 100) + 0.5)::bigint::public.paise;
$$;

-- Extracts the tax component from a tax-inclusive amount (Indian MRP convention).
create or replace function private.tax_from_inclusive(inclusive_amount public.paise, gst_rate public.percentage)
returns public.paise
language sql
immutable
strict
parallel safe
set search_path = pg_catalog
as $$
  select floor((inclusive_amount::numeric * gst_rate / (100 + gst_rate)) + 0.5)::bigint::public.paise;
$$;

comment on function private.tax_from_inclusive(public.paise, public.percentage) is
  'GST component of a tax-inclusive amount. Indian retail prices are quoted inclusive of GST.';

-- Distributes a total across weights so the parts sum EXACTLY to the total
-- (largest-remainder method). Used to allocate order-level discounts and shipping
-- across items without losing or inventing paise.
create or replace function private.allocate_proportionally(total public.paise, weights bigint[])
returns bigint[]
language plpgsql
immutable
strict
parallel safe
set search_path = pg_catalog
as $$
declare
  weight_sum   numeric := 0;
  allocations  bigint[] := '{}';
  remainders   numeric[] := '{}';
  allocated    bigint := 0;
  leftover     bigint;
  i            int;
  exact        numeric;
  base         bigint;
  order_idx    int[];
begin
  if array_length(weights, 1) is null then
    return '{}';
  end if;

  select sum(w) into weight_sum from unnest(weights) as w;

  -- Degenerate case: no weights to distribute against. Give everything to the first slot.
  if weight_sum = 0 then
    allocations := array_fill(0::bigint, array[array_length(weights, 1)]);
    allocations[1] := total;
    return allocations;
  end if;

  for i in 1 .. array_length(weights, 1) loop
    exact := (total::numeric * weights[i]) / weight_sum;
    base := floor(exact)::bigint;
    allocations := allocations || base;
    remainders := remainders || (exact - base);
    allocated := allocated + base;
  end loop;

  leftover := total - allocated;

  -- Hand the remaining paise to the largest fractional remainders, deterministically.
  select array_agg(idx order by rem desc, idx asc)
    into order_idx
    from unnest(remainders) with ordinality as t(rem, idx);

  i := 1;
  while leftover > 0 and i <= array_length(order_idx, 1) loop
    allocations[order_idx[i]] := allocations[order_idx[i]] + 1;
    leftover := leftover - 1;
    i := i + 1;
  end loop;

  return allocations;
end;
$$;

comment on function private.allocate_proportionally(public.paise, bigint[]) is
  'Largest-remainder allocation: splits a paise total across weights so the parts sum exactly to the total.';

-- -----------------------------------------------------------------------------
-- Request context. The API sets these per transaction so triggers can record who
-- did what without every statement passing an actor column.
-- -----------------------------------------------------------------------------
create or replace function private.current_actor_id()
returns uuid
language plpgsql
stable
set search_path = pg_catalog
as $$
declare
  ctx text;
begin
  -- Prefer the authenticated Supabase user; fall back to the API-provided actor.
  begin
    ctx := current_setting('request.jwt.claim.sub', true);
  exception when others then
    ctx := null;
  end;

  if ctx is null or ctx = '' then
    ctx := current_setting('novamart.actor_id', true);
  end if;

  if ctx is null or ctx = '' then
    return null;
  end if;

  return ctx::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create or replace function private.current_request_id()
returns text
language sql
stable
set search_path = pg_catalog
as $$
  select nullif(current_setting('novamart.request_id', true), '');
$$;

create or replace function private.current_trace_id()
returns text
language sql
stable
set search_path = pg_catalog
as $$
  select nullif(current_setting('novamart.trace_id', true), '');
$$;
