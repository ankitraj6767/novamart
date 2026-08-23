-- =============================================================================
-- NovaMart — 0007 RBAC resolution functions
--
-- These functions are the single authorization decision point shared by RLS
-- policies and (mirrored by) the API guard. They read identity.user_roles —
-- never JWT user_metadata, which the user can write (ADR 0009).
--
-- All are SECURITY DEFINER with a pinned search_path so a malicious schema on the
-- caller's search_path cannot shadow the tables they read, and STABLE so Postgres
-- evaluates them once per statement rather than once per row.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Current principal. Wraps auth.uid() so non-Supabase callers (workers, jobs) can
-- present an actor through session config instead.
-- -----------------------------------------------------------------------------
create or replace function identity.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = identity, private, pg_catalog
as $$
  select coalesce(auth.uid(), private.current_actor_id());
$$;

comment on function identity.current_user_id() is
  'The acting principal: the Supabase JWT subject, or the API-supplied actor for service contexts.';

-- -----------------------------------------------------------------------------
-- Effective permission codes for a principal, honouring revocation and expiry.
-- -----------------------------------------------------------------------------
create or replace function identity.effective_permissions(p_user_id uuid)
returns setof text
language sql
stable
security definer
set search_path = identity, pg_catalog
as $$
  select distinct p.code
    from identity.user_roles ur
    join identity.role_permissions rp on rp.role_id = ur.role_id
    join identity.permissions p       on p.id = rp.permission_id
   where ur.user_id = p_user_id
     and ur.revoked_at is null
     and (ur.expires_at is null or ur.expires_at > now());
$$;

-- -----------------------------------------------------------------------------
-- Does the current principal hold a permission anywhere (global or any scope)?
-- Use for "may this actor reach this feature at all" checks. Row-level ownership
-- still has to be asserted separately.
-- -----------------------------------------------------------------------------
create or replace function identity.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = identity, pg_catalog
as $$
  select exists (
    select 1
      from identity.user_roles ur
      join identity.role_permissions rp on rp.role_id = ur.role_id
      join identity.permissions p       on p.id = rp.permission_id
     where ur.user_id = coalesce(auth.uid(), private.current_actor_id())
       and p.code = p_permission
       and ur.revoked_at is null
       and (ur.expires_at is null or ur.expires_at > now())
  );
$$;

comment on function identity.has_permission(text) is
  'True when the current principal holds the permission through any active role grant.';

-- -----------------------------------------------------------------------------
-- Permission held for a specific scope. A grant with no scope is global and
-- therefore satisfies any scope.
-- -----------------------------------------------------------------------------
create or replace function identity.has_scoped_permission(
  p_permission text,
  p_scope_type text,
  p_scope_id   uuid
)
returns boolean
language sql
stable
security definer
set search_path = identity, pg_catalog
as $$
  select exists (
    select 1
      from identity.user_roles ur
      join identity.role_permissions rp on rp.role_id = ur.role_id
      join identity.permissions p       on p.id = rp.permission_id
     where ur.user_id = coalesce(auth.uid(), private.current_actor_id())
       and p.code = p_permission
       and ur.revoked_at is null
       and (ur.expires_at is null or ur.expires_at > now())
       and (
             ur.scope_type is null                                    -- global grant
          or (ur.scope_type = p_scope_type and ur.scope_id = p_scope_id)
       )
  );
$$;

-- -----------------------------------------------------------------------------
-- Membership helpers used heavily by RLS. Kept separate from permission checks
-- because "belongs to this seller" and "may perform this action" are different
-- questions and conflating them is how tenants leak into each other.
-- -----------------------------------------------------------------------------
create or replace function identity.has_seller_scope(p_seller_id uuid)
returns boolean
language sql
stable
security definer
set search_path = identity, pg_catalog
as $$
  select exists (
    select 1
      from identity.user_roles ur
      join identity.roles r on r.id = ur.role_id
     where ur.user_id = coalesce(auth.uid(), private.current_actor_id())
       and ur.revoked_at is null
       and (ur.expires_at is null or ur.expires_at > now())
       and r.kind = 'SELLER'
       and ur.scope_type = 'seller'
       and ur.scope_id = p_seller_id
  );
$$;

comment on function identity.has_seller_scope(uuid) is
  'True when the current principal holds an active seller-scoped role for this seller.';

create or replace function identity.has_warehouse_scope(p_warehouse_id uuid)
returns boolean
language sql
stable
security definer
set search_path = identity, pg_catalog
as $$
  select exists (
    select 1
      from identity.user_roles ur
      join identity.roles r on r.id = ur.role_id
     where ur.user_id = coalesce(auth.uid(), private.current_actor_id())
       and ur.revoked_at is null
       and (ur.expires_at is null or ur.expires_at > now())
       and r.kind in ('WAREHOUSE', 'STAFF')
       and ur.scope_type = 'warehouse'
       and ur.scope_id = p_warehouse_id
  );
$$;

-- Every seller the principal can act for. Used by seller-console list queries so
-- RLS does not need a correlated subquery per row.
create or replace function identity.my_seller_ids()
returns setof uuid
language sql
stable
security definer
set search_path = identity, pg_catalog
as $$
  select distinct ur.scope_id
    from identity.user_roles ur
    join identity.roles r on r.id = ur.role_id
   where ur.user_id = coalesce(auth.uid(), private.current_actor_id())
     and ur.revoked_at is null
     and (ur.expires_at is null or ur.expires_at > now())
     and r.kind = 'SELLER'
     and ur.scope_type = 'seller'
     and ur.scope_id is not null;
$$;

create or replace function identity.my_warehouse_ids()
returns setof uuid
language sql
stable
security definer
set search_path = identity, pg_catalog
as $$
  select distinct ur.scope_id
    from identity.user_roles ur
    join identity.roles r on r.id = ur.role_id
   where ur.user_id = coalesce(auth.uid(), private.current_actor_id())
     and ur.revoked_at is null
     and (ur.expires_at is null or ur.expires_at > now())
     and ur.scope_type = 'warehouse'
     and ur.scope_id is not null;
$$;

-- -----------------------------------------------------------------------------
-- Role membership. Prefer permission checks in policies; this exists for coarse
-- console gating and for staff-vs-customer distinctions.
-- -----------------------------------------------------------------------------
create or replace function identity.has_role(p_role_code text)
returns boolean
language sql
stable
security definer
set search_path = identity, pg_catalog
as $$
  select exists (
    select 1
      from identity.user_roles ur
      join identity.roles r on r.id = ur.role_id
     where ur.user_id = coalesce(auth.uid(), private.current_actor_id())
       and r.code = p_role_code
       and ur.revoked_at is null
       and (ur.expires_at is null or ur.expires_at > now())
  );
$$;

create or replace function identity.is_staff()
returns boolean
language sql
stable
security definer
set search_path = identity, pg_catalog
as $$
  select exists (
    select 1
      from identity.user_roles ur
      join identity.roles r on r.id = ur.role_id
     where ur.user_id = coalesce(auth.uid(), private.current_actor_id())
       and r.kind in ('STAFF', 'SUPPORT')
       and ur.revoked_at is null
       and (ur.expires_at is null or ur.expires_at > now())
  );
$$;

-- Highest rank held. The grant guard uses this to block privilege escalation.
create or replace function identity.max_role_rank(p_user_id uuid)
returns smallint
language sql
stable
security definer
set search_path = identity, pg_catalog
as $$
  select coalesce(max(r.rank), -1)::smallint
    from identity.user_roles ur
    join identity.roles r on r.id = ur.role_id
   where ur.user_id = p_user_id
     and ur.revoked_at is null
     and (ur.expires_at is null or ur.expires_at > now());
$$;

-- -----------------------------------------------------------------------------
-- Account standing. A suspended account keeps read access to its own history but
-- must not be able to transact; policies consult this.
-- -----------------------------------------------------------------------------
create or replace function identity.is_account_active(p_user_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = identity, pg_catalog
as $$
  select exists (
    select 1
      from identity.profiles p
     where p.id = coalesce(p_user_id, auth.uid(), private.current_actor_id())
       and p.account_status = 'ACTIVE'
       and p.anonymised_at is null
  );
$$;

-- -----------------------------------------------------------------------------
-- Privilege escalation guard on role grants.
--
-- Rules enforced here rather than only in the API, because a compromised or buggy
-- privileged connection is exactly the case the API guard cannot cover:
--   1. Nobody may grant a role ranked at or above their own highest rank.
--   2. Privileged roles may only be granted by SUPER_ADMIN.
--   3. Nobody may grant a role to themselves.
-- The system context (no actor set, i.e. migrations/seed/bootstrap) is exempt.
-- -----------------------------------------------------------------------------
create or replace function identity.guard_role_grant()
returns trigger
language plpgsql
security definer
set search_path = identity, private, pg_catalog
as $$
declare
  v_actor        uuid := coalesce(auth.uid(), private.current_actor_id());
  v_actor_rank   smallint;
  v_target_rank  smallint;
  v_target_code  text;
  v_privileged   boolean;
begin
  -- Bootstrap/seed/system path: no acting principal, nothing to escalate from.
  if v_actor is null then
    return new;
  end if;

  select rank, code, is_privileged
    into v_target_rank, v_target_code, v_privileged
    from identity.roles where id = new.role_id;

  v_actor_rank := identity.max_role_rank(v_actor);

  -- Self-grant is never legitimate: someone else must authorise elevation.
  if new.user_id = v_actor and v_target_rank > 0 then
    raise exception 'A principal cannot grant role % to themselves', v_target_code
      using errcode = 'insufficient_privilege';
  end if;

  if v_privileged and not identity.has_role('SUPER_ADMIN') then
    raise exception 'Role % may only be granted by SUPER_ADMIN', v_target_code
      using errcode = 'insufficient_privilege';
  end if;

  if v_target_rank >= v_actor_rank then
    raise exception 'Cannot grant role % (rank %): actor rank is %',
      v_target_code, v_target_rank, v_actor_rank
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger user_roles_guard_grant
  before insert on identity.user_roles
  for each row execute function identity.guard_role_grant();

-- -----------------------------------------------------------------------------
-- Role grants and revocations are always audited, by the database, so no code
-- path can grant a role silently.
-- -----------------------------------------------------------------------------
create or replace function identity.audit_role_change()
returns trigger
language plpgsql
security definer
set search_path = identity, audit, private, pg_catalog
as $$
declare
  v_role_code text;
begin
  select code into v_role_code from identity.roles
   where id = coalesce(new.role_id, old.role_id);

  if tg_op = 'INSERT' then
    insert into audit.audit_logs (
      actor_id, actor_type, action, resource_type, resource_id,
      new_value, reason, severity, request_id, trace_id
    ) values (
      coalesce(new.granted_by, private.current_actor_id()), 'STAFF', 'role.grant',
      'identity.user_roles', new.id,
      jsonb_build_object('user_id', new.user_id, 'role', v_role_code,
                         'scope_type', new.scope_type, 'scope_id', new.scope_id,
                         'expires_at', new.expires_at),
      new.grant_reason, 'WARNING',
      private.current_request_id(), private.current_trace_id()
    );
  elsif tg_op = 'UPDATE' and new.revoked_at is not null and old.revoked_at is null then
    insert into audit.audit_logs (
      actor_id, actor_type, action, resource_type, resource_id,
      old_value, new_value, reason, severity, request_id, trace_id
    ) values (
      coalesce(new.revoked_by, private.current_actor_id()), 'STAFF', 'role.revoke',
      'identity.user_roles', new.id,
      jsonb_build_object('user_id', old.user_id, 'role', v_role_code,
                         'scope_type', old.scope_type, 'scope_id', old.scope_id),
      jsonb_build_object('revoked_at', new.revoked_at),
      new.revoke_reason, 'WARNING',
      private.current_request_id(), private.current_trace_id()
    );
  end if;

  return new;
end;
$$;

create trigger user_roles_audit
  after insert or update of revoked_at on identity.user_roles
  for each row execute function identity.audit_role_change();

-- -----------------------------------------------------------------------------
-- Account status changes are audited too (suspension, blocking, restoration).
-- -----------------------------------------------------------------------------
create or replace function identity.audit_profile_status_change()
returns trigger
language plpgsql
security definer
set search_path = identity, audit, private, pg_catalog
as $$
begin
  if new.account_status is distinct from old.account_status then
    insert into audit.audit_logs (
      actor_id, actor_type, action, resource_type, resource_id,
      old_value, new_value, reason, severity, request_id, trace_id
    ) values (
      coalesce(new.status_changed_by, private.current_actor_id()), 'STAFF',
      'customer.status_change', 'identity.profiles', new.id,
      jsonb_build_object('account_status', old.account_status),
      jsonb_build_object('account_status', new.account_status),
      new.status_reason,
      case when new.account_status in ('SUSPENDED', 'BLOCKED') then 'WARNING' else 'NOTICE' end,
      private.current_request_id(), private.current_trace_id()
    );
  end if;
  return new;
end;
$$;

create trigger profiles_audit_status
  after update of account_status on identity.profiles
  for each row execute function identity.audit_profile_status_change();

-- -----------------------------------------------------------------------------
-- Grants: RLS policies invoke these as the calling (client) role, so anon and
-- authenticated need EXECUTE. They are SECURITY DEFINER and read-only, and each
-- one answers only "what may the CURRENT principal do", so they leak nothing.
-- -----------------------------------------------------------------------------
grant execute on function identity.current_user_id()                        to anon, authenticated, service_role;
grant execute on function identity.has_permission(text)                     to anon, authenticated, service_role;
grant execute on function identity.has_scoped_permission(text, text, uuid)  to anon, authenticated, service_role;
grant execute on function identity.has_seller_scope(uuid)                   to anon, authenticated, service_role;
grant execute on function identity.has_warehouse_scope(uuid)                to anon, authenticated, service_role;
grant execute on function identity.my_seller_ids()                          to anon, authenticated, service_role;
grant execute on function identity.my_warehouse_ids()                       to anon, authenticated, service_role;
grant execute on function identity.has_role(text)                           to anon, authenticated, service_role;
grant execute on function identity.is_staff()                               to anon, authenticated, service_role;
grant execute on function identity.is_account_active(uuid)                  to anon, authenticated, service_role;

-- effective_permissions and max_role_rank take an arbitrary user id, so they stay
-- server-side only: a client must not be able to enumerate another user's rights.
revoke all on function identity.effective_permissions(uuid) from public, anon, authenticated;
revoke all on function identity.max_role_rank(uuid)         from public, anon, authenticated;
grant execute on function identity.effective_permissions(uuid) to service_role;
grant execute on function identity.max_role_rank(uuid)         to service_role;
