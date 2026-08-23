-- =============================================================================
-- NovaMart — 0006 Identity: profiles, devices, preferences, RBAC, addresses
--
-- Supabase Auth owns credentials and token issuance. This schema owns everything
-- authorization depends on. JWT user_metadata is NEVER consulted (ADR 0009).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- identity.profiles — 1:1 with auth.users
-- -----------------------------------------------------------------------------
create table identity.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  -- Denormalised from auth.users for joins and support search. Kept in sync by trigger.
  email                public.email_address,
  phone                public.phone_e164,
  full_name            text,
  display_name         text,
  avatar_url           text,
  date_of_birth        date
                         constraint profiles_dob_sane
                         check (date_of_birth is null
                                or (date_of_birth > current_date - interval '120 years'
                                    and date_of_birth < current_date - interval '13 years')),
  gender               text check (gender in ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY')),
  preferred_locale     public.locale_code not null default 'en-IN',

  account_status       text        not null default 'ACTIVE'
                         check (account_status in ('ACTIVE', 'RESTRICTED', 'SUSPENDED', 'BLOCKED',
                                                    'DELETION_REQUESTED', 'DELETED')),
  status_reason        text,
  status_changed_at    timestamptz,
  status_changed_by    uuid,

  email_verified_at    timestamptz,
  phone_verified_at    timestamptz,

  -- Lifecycle signals used by marketing segments and the risk engine.
  first_order_at       timestamptz,
  last_order_at        timestamptz,
  lifetime_order_count integer     not null default 0 check (lifetime_order_count >= 0),
  lifetime_gmv_paise   public.paise not null default 0 check (lifetime_gmv_paise >= 0),

  -- Cached risk snapshot. analytics.risk_scores is the authority.
  risk_tier            text        not null default 'STANDARD'
                         check (risk_tier in ('TRUSTED', 'STANDARD', 'ELEVATED', 'HIGH')),

  referral_code        text unique,
  referred_by          uuid references identity.profiles (id) on delete set null,

  -- Right-to-erasure support: PII is scrubbed while financial records survive.
  anonymised_at        timestamptz,
  deletion_requested_at timestamptz,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- A non-ACTIVE account must say why: support and the customer both need the reason.
  constraint profiles_status_reason_present
    check (account_status = 'ACTIVE' or status_reason is not null)
);

comment on table identity.profiles is
  'NovaMart-owned user profile, 1:1 with auth.users. Authorization lives in user_roles, not here.';
comment on column identity.profiles.risk_tier is
  'Cached tier for fast checkout decisions. analytics.risk_scores remains the source of truth.';

create unique index profiles_email_unique_idx on identity.profiles (email)
  where email is not null and anonymised_at is null;
create unique index profiles_phone_unique_idx on identity.profiles (phone)
  where phone is not null and anonymised_at is null;
create index profiles_status_idx     on identity.profiles (account_status)
  where account_status <> 'ACTIVE';
create index profiles_created_idx    on identity.profiles (created_at desc);
create index profiles_risk_idx       on identity.profiles (risk_tier)
  where risk_tier in ('ELEVATED', 'HIGH');
create index profiles_referred_by_idx on identity.profiles (referred_by) where referred_by is not null;
-- Support-desk fuzzy search on name.
create index profiles_name_trgm_idx  on identity.profiles using gin (full_name extensions.gin_trgm_ops);

create trigger profiles_set_updated_at
  before update on identity.profiles
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Provision a profile whenever Supabase Auth creates a user. Runs as SECURITY
-- DEFINER because auth.users triggers execute in the auth service's context.
-- -----------------------------------------------------------------------------
create or replace function identity.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = identity, public, pg_catalog
as $$
begin
  insert into identity.profiles (id, email, phone, full_name, email_verified_at, phone_verified_at)
  values (
    new.id,
    -- Cast defensively: auth.users may hold values our stricter domains reject.
    case when new.email is not null and new.email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
         then new.email::public.email_address end,
    case when new.phone is not null and new.phone ~ '^[1-9][0-9]{7,14}$'
         then new.phone::public.phone_e164 end,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name',
                         new.raw_user_meta_data ->> 'name', '')), ''),
    new.email_confirmed_at,
    new.phone_confirmed_at
  )
  on conflict (id) do nothing;

  -- Every new principal is a CUSTOMER by default. Elevated roles are granted
  -- explicitly, never inferred from sign-up metadata.
  insert into identity.user_roles (user_id, role_id, granted_by, grant_reason)
  select new.id, r.id, new.id, 'Automatic grant on registration'
    from identity.roles r
   where r.code = 'CUSTOMER'
  on conflict do nothing;

  insert into identity.user_preferences (user_id) values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- Keep the denormalised contact columns aligned with auth.users.
create or replace function identity.sync_auth_user_contact()
returns trigger
language plpgsql
security definer
set search_path = identity, public, pg_catalog
as $$
begin
  update identity.profiles p
     set email = case when new.email is not null
                       and new.email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
                      then new.email::public.email_address else p.email end,
         phone = case when new.phone is not null and new.phone ~ '^[1-9][0-9]{7,14}$'
                      then new.phone::public.phone_e164 else p.phone end,
         email_verified_at = coalesce(new.email_confirmed_at, p.email_verified_at),
         phone_verified_at = coalesce(new.phone_confirmed_at, p.phone_verified_at)
   where p.id = new.id
     and p.anonymised_at is null;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- identity.roles / permissions / role_permissions / user_roles
-- The authorization model (ADR 0009). Roles are rows, not claims.
-- -----------------------------------------------------------------------------
create table identity.roles (
  id            uuid primary key default extensions.gen_random_uuid(),
  code          text        not null unique
                  constraint roles_code_shape check (code ~ '^[A-Z][A-Z0-9_]*$'),
  name          text        not null,
  description   text        not null,
  -- kind determines which console a principal may reach and which scope applies.
  kind          text        not null
                  check (kind in ('CUSTOMER', 'SELLER', 'WAREHOUSE', 'DELIVERY', 'SUPPORT', 'STAFF')),
  -- Scope requirement: seller roles must be scoped to a seller, warehouse roles
  -- to a warehouse. NULL means the role is global.
  required_scope_type text
                  check (required_scope_type in ('seller', 'warehouse', 'region', 'category')),
  -- Roles that may only be granted by SUPER_ADMIN and require MFA at grant time.
  is_privileged  boolean    not null default false,
  -- System roles cannot be deleted or renamed through the admin UI.
  is_system      boolean    not null default false,
  -- Higher rank cannot be granted by a lower-ranked actor (prevents escalation).
  rank           smallint   not null default 0 check (rank between 0 and 1000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column identity.roles.rank is
  'Escalation guard: an actor may only grant roles with a rank strictly below their own highest rank.';

create index roles_kind_idx on identity.roles (kind);

create trigger roles_set_updated_at
  before update on identity.roles
  for each row execute function private.set_updated_at();

create table identity.permissions (
  id           uuid primary key default extensions.gen_random_uuid(),
  code         text        not null unique
                 constraint permissions_code_shape check (code ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  resource     text        not null,
  action       text        not null,
  description  text        not null,
  -- Permissions flagged sensitive require a reason on every use and always audit.
  is_sensitive boolean     not null default false,
  requires_reason boolean  not null default false,
  requires_mfa    boolean  not null default false,
  created_at   timestamptz not null default now(),
  unique (resource, action)
);

comment on table identity.permissions is
  'Permission catalogue. Codes are resource.action, e.g. refund.approve.';

create index permissions_resource_idx  on identity.permissions (resource);
create index permissions_sensitive_idx on identity.permissions (code) where is_sensitive;

create table identity.role_permissions (
  role_id       uuid not null references identity.roles (id) on delete cascade,
  permission_id uuid not null references identity.permissions (id) on delete cascade,
  granted_at    timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create index role_permissions_permission_idx on identity.role_permissions (permission_id);

-- Catalogue of grantable resource scopes. Referenced loosely (by type + id) rather
-- than by foreign key, because scopes point into several different schemas.
create table identity.resource_scopes (
  scope_type   text not null check (scope_type in ('seller', 'warehouse', 'region', 'category')),
  scope_id     uuid not null,
  display_name text not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  primary key (scope_type, scope_id)
);

comment on table identity.resource_scopes is
  'Registry of grantable scopes. Deliberately not FK-constrained: scopes span multiple schemas.';

create table identity.user_roles (
  id            uuid primary key default extensions.gen_random_uuid(),
  user_id       uuid        not null references identity.profiles (id) on delete cascade,
  role_id       uuid        not null references identity.roles (id) on delete restrict,
  scope_type    text        check (scope_type in ('seller', 'warehouse', 'region', 'category')),
  scope_id      uuid,
  granted_by    uuid        references identity.profiles (id) on delete set null,
  grant_reason  text,
  -- Time-bounded grants: temporary elevation expires without anyone remembering.
  expires_at    timestamptz,
  revoked_at    timestamptz,
  revoked_by    uuid        references identity.profiles (id) on delete set null,
  revoke_reason text,
  created_at    timestamptz not null default now(),

  -- Either both scope columns are present or neither is.
  constraint user_roles_scope_pair
    check ((scope_type is null and scope_id is null) or (scope_type is not null and scope_id is not null)),
  constraint user_roles_revocation_complete
    check ((revoked_at is null and revoked_by is null) or (revoked_at is not null))
);

comment on table identity.user_roles is
  'Role grants, optionally scoped to a seller/warehouse/region/category and optionally time-bounded.';

-- One active grant per (user, role, scope). Revoked rows are retained for audit,
-- so the uniqueness is partial.
create unique index user_roles_active_unique_idx
  on identity.user_roles (user_id, role_id, coalesce(scope_type, ''), coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where revoked_at is null;

create index user_roles_user_idx    on identity.user_roles (user_id) where revoked_at is null;
create index user_roles_role_idx    on identity.user_roles (role_id) where revoked_at is null;
create index user_roles_scope_idx   on identity.user_roles (scope_type, scope_id) where revoked_at is null;
create index user_roles_expiry_idx  on identity.user_roles (expires_at)
  where revoked_at is null and expires_at is not null;

-- Enforce the role's scope requirement so a seller-scoped role cannot be granted globally.
create or replace function identity.validate_user_role_scope()
returns trigger
language plpgsql
set search_path = identity, pg_catalog
as $$
declare
  v_required text;
  v_code     text;
begin
  select required_scope_type, code into v_required, v_code
    from identity.roles where id = new.role_id;

  if v_required is not null and (new.scope_type is distinct from v_required or new.scope_id is null) then
    raise exception 'Role % must be granted with a % scope', v_code, v_required
      using errcode = 'check_violation';
  end if;

  if v_required is null and new.scope_type is not null then
    raise exception 'Role % is global and cannot be scoped', v_code
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger user_roles_validate_scope
  before insert or update on identity.user_roles
  for each row execute function identity.validate_user_role_scope();

-- Attach the auth.users triggers now that user_roles and preferences exist.
-- (user_preferences is created below; the trigger only fires at runtime.)

-- -----------------------------------------------------------------------------
-- identity.user_devices — push targets, session binding, risk signals
-- -----------------------------------------------------------------------------
create table identity.user_devices (
  id                uuid primary key default extensions.gen_random_uuid(),
  user_id           uuid        not null references identity.profiles (id) on delete cascade,
  -- Stable client-generated installation identifier.
  device_identifier text        not null,
  platform          text        not null check (platform in ('android', 'ios', 'web')),
  app               text        not null
                      check (app in ('customer', 'seller', 'delivery', 'warehouse', 'web')),
  app_version       text,
  os_version        text,
  device_model      text,
  device_name       text,
  push_token        text,
  push_provider     text default 'FCM' check (push_provider in ('FCM', 'APNS', 'WEB_PUSH')),
  push_enabled      boolean     not null default true,
  -- Risk signals recorded, never used as a hard block on their own.
  is_rooted         boolean     not null default false,
  is_emulator       boolean     not null default false,
  is_trusted        boolean     not null default false,
  biometric_enabled boolean     not null default false,
  last_seen_at      timestamptz not null default now(),
  last_ip           inet,
  revoked_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, device_identifier, app)
);

comment on table identity.user_devices is
  'Registered devices per user: push delivery targets, session binding and device risk signals.';

create index user_devices_user_idx  on identity.user_devices (user_id) where revoked_at is null;
create index user_devices_push_idx  on identity.user_devices (user_id)
  where push_enabled and push_token is not null and revoked_at is null;
create unique index user_devices_push_token_idx on identity.user_devices (push_token)
  where push_token is not null and revoked_at is null;
create index user_devices_seen_idx  on identity.user_devices (last_seen_at desc);

create trigger user_devices_set_updated_at
  before update on identity.user_devices
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- identity.user_preferences — communication and shopping preferences (brief §47)
-- -----------------------------------------------------------------------------
create table identity.user_preferences (
  user_id                  uuid primary key references identity.profiles (id) on delete cascade,

  -- Channel opt-ins. Transactional messages ignore these; marketing respects them.
  push_marketing           boolean not null default true,
  push_transactional       boolean not null default true,
  email_marketing          boolean not null default true,
  email_transactional      boolean not null default true,
  sms_marketing            boolean not null default false,
  sms_transactional        boolean not null default true,
  whatsapp_marketing       boolean not null default false,
  whatsapp_transactional   boolean not null default true,

  -- Category-level notification interests, e.g. {"price_drop":true,"back_in_stock":true}
  notification_topics      jsonb   not null default
    '{"order_updates":true,"price_drop":true,"back_in_stock":true,"deals":true,"recommendations":true}'::jsonb,

  preferred_language       public.locale_code not null default 'en-IN',
  currency                 public.currency_code not null default 'INR',
  -- Default delivery pincode used before an address is selected.
  default_pincode          public.indian_pincode references fulfillment.pincodes (pincode) on delete set null,

  -- Privacy toggles surfaced in the app's privacy settings.
  personalised_ads         boolean not null default true,
  personalised_recommendations boolean not null default true,
  save_search_history      boolean not null default true,

  quiet_hours_start        time,
  quiet_hours_end          time,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint user_preferences_quiet_hours_pair
    check ((quiet_hours_start is null) = (quiet_hours_end is null))
);

create trigger user_preferences_set_updated_at
  before update on identity.user_preferences
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- identity.addresses
-- Soft-deleted because orders reference historical addresses; commerce keeps its
-- own immutable snapshot as well (ADR 0010).
-- -----------------------------------------------------------------------------
create table identity.addresses (
  id                uuid primary key default extensions.gen_random_uuid(),
  user_id           uuid        not null references identity.profiles (id) on delete cascade,

  label             text        not null default 'HOME'
                      check (label in ('HOME', 'WORK', 'OTHER')),
  recipient_name    text        not null check (length(trim(recipient_name)) between 2 and 120),
  recipient_phone   public.phone_e164 not null,
  alternate_phone   public.phone_e164,

  address_line1     text        not null check (length(trim(address_line1)) between 3 and 200),
  address_line2     text,
  landmark          text,
  locality          text,
  city              text        not null,
  district          text,
  state_code        text        not null references fulfillment.states (code) on delete restrict,
  pincode           public.indian_pincode not null references fulfillment.pincodes (pincode) on delete restrict,
  country_code      text        not null default 'IN' check (country_code = 'IN'),

  -- Captured from device geolocation when the user confirms on a map. Improves
  -- delivery success in areas with weak addressing.
  latitude          numeric(9, 6),
  longitude         numeric(9, 6),
  -- Free-text guidance for the delivery partner ("gate code", "call on arrival").
  delivery_instructions text,

  is_default        boolean     not null default false,
  -- Set once a shipment is successfully delivered here.
  is_verified       boolean     not null default false,
  delivery_success_count integer not null default 0 check (delivery_success_count >= 0),
  delivery_failure_count integer not null default 0 check (delivery_failure_count >= 0),

  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint addresses_latitude_range  check (latitude  is null or latitude  between -90  and 90),
  constraint addresses_longitude_range check (longitude is null or longitude between -180 and 180)
);

comment on table identity.addresses is
  'Customer address book. Soft-deleted: orders and shipments reference history.';

-- Exactly one default address per user among live rows.
create unique index addresses_single_default_idx
  on identity.addresses (user_id) where is_default and deleted_at is null;

create index addresses_user_idx    on identity.addresses (user_id) where deleted_at is null;
create index addresses_pincode_idx on identity.addresses (pincode) where deleted_at is null;

create trigger addresses_set_updated_at
  before update on identity.addresses
  for each row execute function private.set_updated_at();

-- Promoting an address to default demotes the previous one, atomically.
create or replace function identity.enforce_single_default_address()
returns trigger
language plpgsql
set search_path = identity, pg_catalog
as $$
begin
  if new.is_default then
    update identity.addresses
       set is_default = false
     where user_id = new.user_id
       and id <> new.id
       and is_default
       and deleted_at is null;
  end if;
  return new;
end;
$$;

create trigger addresses_enforce_single_default
  after insert or update of is_default on identity.addresses
  for each row when (new.is_default) execute function identity.enforce_single_default_address();

-- A deleted address must not remain the default.
create or replace function identity.clear_default_on_soft_delete()
returns trigger
language plpgsql
set search_path = identity, pg_catalog
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    new.is_default := false;
  end if;
  return new;
end;
$$;

create trigger addresses_clear_default_on_delete
  before update of deleted_at on identity.addresses
  for each row execute function identity.clear_default_on_soft_delete();

-- -----------------------------------------------------------------------------
-- Wire the auth.users triggers now that every table they touch exists.
-- -----------------------------------------------------------------------------
drop trigger if exists novamart_on_auth_user_created on auth.users;
create trigger novamart_on_auth_user_created
  after insert on auth.users
  for each row execute function identity.handle_new_auth_user();

drop trigger if exists novamart_on_auth_user_contact_changed on auth.users;
create trigger novamart_on_auth_user_contact_changed
  after update of email, phone, email_confirmed_at, phone_confirmed_at on auth.users
  for each row execute function identity.sync_auth_user_contact();
