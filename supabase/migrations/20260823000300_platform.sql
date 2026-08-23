-- =============================================================================
-- NovaMart — 0003 Platform: settings, feature flags, integrations, app versions,
--                  transactional outbox, idempotency keys, consumer offsets.
--
-- This schema is what makes NovaMart "fully dynamic": business rules that change
-- without a deploy live here, not in code constants.
-- Never exposed to client roles.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- platform.platform_settings
-- Typed key/value business configuration. `value` is jsonb so a setting can be a
-- scalar, a list or a nested policy object; `value_type` keeps it honest.
-- -----------------------------------------------------------------------------
create table platform.platform_settings (
  key                text primary key
                       constraint platform_settings_key_shape
                       check (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
  value              jsonb        not null,
  value_type         text         not null
                       check (value_type in ('string', 'number', 'boolean', 'object', 'array')),
  category           text         not null
                       check (category in ('commerce', 'checkout', 'payment', 'shipping', 'returns',
                                           'seller', 'finance', 'support', 'security', 'notification',
                                           'catalog', 'search', 'general')),
  label              text         not null,
  description        text         not null,
  -- Whether the setting may be read by unauthenticated clients through the api schema.
  is_public          boolean      not null default false,
  -- Settings marked sensitive are redacted in admin list views and require
  -- reauthentication to change.
  is_sensitive       boolean      not null default false,
  -- JSON Schema fragment used by the admin UI to render and validate the editor.
  validation_schema  jsonb,
  default_value      jsonb        not null,
  updated_by         uuid,
  created_at         timestamptz  not null default now(),
  updated_at         timestamptz  not null default now()
);

comment on table platform.platform_settings is
  'Runtime business configuration. Changing a value here changes behaviour without a deploy.';

create index platform_settings_category_idx on platform.platform_settings (category);
create index platform_settings_public_idx   on platform.platform_settings (key) where is_public;

create trigger platform_settings_set_updated_at
  before update on platform.platform_settings
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- platform.feature_flags + targeting rules
-- Evaluation order: kill switch → rules by priority (first match wins) →
-- percentage rollout on a stable hash → default_value.
-- -----------------------------------------------------------------------------
create table platform.feature_flags (
  key                 text primary key
                        constraint feature_flags_key_shape check (key ~ '^[A-Z][A-Z0-9_]*$'),
  name                text        not null,
  description         text        not null,
  -- false disables the feature for everyone regardless of rules (kill switch).
  is_enabled          boolean     not null default false,
  default_value       boolean     not null default false,
  -- 0..100. Applied to principals that match no explicit rule.
  rollout_percentage  smallint    not null default 0
                        check (rollout_percentage between 0 and 100),
  -- Salt keeps the same user from landing in the same bucket for every flag.
  rollout_salt        text        not null default extensions.gen_random_uuid()::text,
  owner_team          text,
  -- Flags are meant to be temporary; this surfaces stale ones in the admin UI.
  expected_removal_at date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid
);

comment on table platform.feature_flags is
  'Feature flags with kill switch, targeting rules and percentage rollout.';

create trigger feature_flags_set_updated_at
  before update on platform.feature_flags
  for each row execute function private.set_updated_at();

create table platform.feature_flag_rules (
  id            uuid primary key default extensions.gen_random_uuid(),
  flag_key      text        not null references platform.feature_flags (key) on delete cascade,
  -- Lower priority evaluates first; first matching rule decides the outcome.
  priority      smallint    not null default 100,
  attribute     text        not null
                  check (attribute in ('user_id', 'user_segment', 'platform', 'app_version',
                                        'region', 'state_code', 'pincode', 'seller_id',
                                        'category_id', 'role')),
  operator      text        not null
                  check (operator in ('eq', 'in', 'not_in', 'gte', 'lte', 'matches')),
  comparand     jsonb       not null,
  outcome       boolean     not null,
  description   text,
  created_at    timestamptz not null default now(),
  unique (flag_key, priority, attribute, operator, comparand)
);

create index feature_flag_rules_flag_idx on platform.feature_flag_rules (flag_key, priority);

-- -----------------------------------------------------------------------------
-- platform.integration_settings
-- Per-environment provider wiring. Secrets are NEVER stored here: only the name
-- of the secret in the secret manager. The database must not become a keystore.
-- -----------------------------------------------------------------------------
create table platform.integration_settings (
  id                  uuid primary key default extensions.gen_random_uuid(),
  integration_type    text        not null
                        check (integration_type in ('PAYMENT_GATEWAY', 'SHIPPING_CARRIER', 'SMS',
                                                     'EMAIL', 'WHATSAPP', 'PUSH', 'SEARCH',
                                                     'KYC_VERIFICATION', 'BANK_VERIFICATION',
                                                     'ANALYTICS', 'STORAGE_CDN')),
  provider_code       text        not null,
  display_name        text        not null,
  environment         text        not null
                        check (environment in ('local', 'development', 'staging', 'production')),
  is_enabled          boolean     not null default false,
  -- Among enabled providers of a type, the lowest priority is primary; the rest
  -- are failover targets.
  priority            smallint    not null default 100,
  -- Non-secret configuration only (base URLs, channel ids, timeouts, feature toggles).
  configuration       jsonb       not null default '{}'::jsonb,
  -- Names/paths of secrets in the secret manager, e.g. {"api_key":"RAZORPAY_KEY_SECRET"}.
  secret_references   jsonb       not null default '{}'::jsonb,
  webhook_path        text,
  health_status       text        not null default 'UNKNOWN'
                        check (health_status in ('UNKNOWN', 'HEALTHY', 'DEGRADED', 'DOWN')),
  health_checked_at   timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (integration_type, provider_code, environment)
);

comment on column platform.integration_settings.secret_references is
  'References to secret-manager entries. Actual secret values must never be stored in the database.';

-- Guard: catch an accidental secret paste into the non-secret configuration blob.
alter table platform.integration_settings
  add constraint integration_settings_no_inline_secrets
  check (
    not (configuration::text ~* '(secret|password|private_key|access_token|api_key)\s*"?\s*:\s*"[^"]{8,}')
  );

create index integration_settings_type_env_idx
  on platform.integration_settings (integration_type, environment, priority)
  where is_enabled;

create trigger integration_settings_set_updated_at
  before update on platform.integration_settings
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- platform.app_version_policies
-- Drives force-update / soft-update / maintenance behaviour in the Flutter apps.
-- -----------------------------------------------------------------------------
create table platform.app_version_policies (
  id                    uuid primary key default extensions.gen_random_uuid(),
  app                   text        not null
                          check (app in ('customer', 'seller', 'delivery', 'warehouse')),
  platform              text        not null check (platform in ('android', 'ios')),
  minimum_version       text        not null,
  latest_version        text        not null,
  -- Below minimum_version the app blocks; between minimum and latest it nudges.
  force_update_message  text        not null default 'Update NovaMart to continue shopping securely.',
  soft_update_message   text        not null default 'A new version of NovaMart is available.',
  store_url             text        not null,
  maintenance_mode      boolean     not null default false,
  maintenance_message   text,
  maintenance_until     timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (app, platform),
  constraint app_version_maintenance_message_present
    check (not maintenance_mode or maintenance_message is not null)
);

create trigger app_version_policies_set_updated_at
  before update on platform.app_version_policies
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- platform.outbox_events — the transactional outbox (ADR 0005)
--
-- Written in the SAME transaction as the domain change that produced it. A
-- dispatcher claims rows with FOR UPDATE SKIP LOCKED and publishes them.
-- Payload columns are immutable; only dispatch bookkeeping may change.
-- -----------------------------------------------------------------------------
create table platform.outbox_events (
  id               uuid        primary key default private.uuid_generate_v7(),
  event_type       text        not null
                     constraint outbox_event_type_shape check (event_type ~ '^[A-Z][A-Z0-9_]*$'),
  event_version    smallint    not null default 1,
  aggregate_type   text        not null,
  aggregate_id     uuid        not null,
  -- Events for the same partition_key are published in creation order.
  partition_key    text        not null,
  payload          jsonb       not null,
  metadata         jsonb       not null default '{}'::jsonb,
  actor_id         uuid,
  request_id       text,
  trace_id         text,
  status           text        not null default 'PENDING'
                     check (status in ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED', 'DEAD_LETTER')),
  attempts         smallint    not null default 0,
  max_attempts     smallint    not null default 8,
  available_at     timestamptz not null default now(),
  locked_at        timestamptz,
  locked_by        text,
  published_at     timestamptz,
  last_error       text,
  occurred_at      timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

comment on table platform.outbox_events is
  'Transactional outbox. Domain code never publishes directly to a queue; it inserts here.';

-- The dispatcher's claim query. Partial index keeps it tiny: published rows are
-- excluded, so the index size tracks the backlog, not the history.
create index outbox_events_claim_idx
  on platform.outbox_events (available_at, created_at)
  where status in ('PENDING', 'FAILED');

create index outbox_events_partition_idx on platform.outbox_events (partition_key, created_at);
create index outbox_events_aggregate_idx on platform.outbox_events (aggregate_type, aggregate_id, created_at);
create index outbox_events_type_idx      on platform.outbox_events (event_type, created_at desc);
create index outbox_events_dead_idx      on platform.outbox_events (created_at desc) where status = 'DEAD_LETTER';
-- Stuck-row detector: PROCESSING rows whose lock is older than the visibility timeout.
create index outbox_events_stuck_idx     on platform.outbox_events (locked_at) where status = 'PROCESSING';

-- Payload and identity are immutable; only dispatch state may be updated.
create trigger outbox_events_immutable_payload
  before update on platform.outbox_events
  for each row execute function private.allow_only_columns(
    '{status,attempts,available_at,locked_at,locked_by,published_at,last_error}'
  );

create trigger outbox_events_no_delete
  before delete on platform.outbox_events
  for each row execute function private.prevent_delete();

-- -----------------------------------------------------------------------------
-- platform.consumer_offsets — consumer-side idempotency for at-least-once delivery.
-- A consumer records (consumer_name, event_id) before/with its side effect; the
-- unique constraint makes reprocessing a no-op.
-- -----------------------------------------------------------------------------
create table platform.consumer_offsets (
  consumer_name  text        not null,
  event_id       uuid        not null references platform.outbox_events (id) on delete cascade,
  processed_at   timestamptz not null default now(),
  duration_ms    integer,
  outcome        text        not null default 'SUCCESS'
                   check (outcome in ('SUCCESS', 'SKIPPED', 'FAILED')),
  error_message  text,
  primary key (consumer_name, event_id)
);

comment on table platform.consumer_offsets is
  'Idempotency ledger for event consumers. (consumer_name, event_id) uniqueness makes replay safe.';

create index consumer_offsets_processed_idx on platform.consumer_offsets (consumer_name, processed_at desc);

-- -----------------------------------------------------------------------------
-- platform.idempotency_keys — request-level idempotency (API_CONVENTIONS §7)
--
-- request_fingerprint is a hash of the canonicalised request body. Replay with the
-- same fingerprint returns the stored response; a different fingerprint is a
-- client bug and is rejected.
-- -----------------------------------------------------------------------------
create table platform.idempotency_keys (
  id                   uuid        primary key default private.uuid_generate_v7(),
  scope                text        not null,
  idempotency_key      text        not null,
  actor_id             uuid,
  request_fingerprint  text        not null,
  status               text        not null default 'IN_PROGRESS'
                         check (status in ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
  response_status      smallint,
  response_body        jsonb,
  -- Set once the operation produces a durable resource, for cheap cross-checks.
  resource_type        text,
  resource_id          uuid,
  locked_at            timestamptz not null default now(),
  completed_at         timestamptz,
  expires_at           timestamptz not null default now() + interval '30 days',
  created_at           timestamptz not null default now(),
  unique (scope, idempotency_key)
);

comment on table platform.idempotency_keys is
  'Request idempotency. The UNIQUE (scope, idempotency_key) constraint is the actual guarantee; application code is only the fast path.';

create index idempotency_keys_expiry_idx  on platform.idempotency_keys (expires_at);
create index idempotency_keys_actor_idx   on platform.idempotency_keys (actor_id, created_at desc);
create index idempotency_keys_stuck_idx   on platform.idempotency_keys (locked_at) where status = 'IN_PROGRESS';

-- -----------------------------------------------------------------------------
-- platform.scheduled_job_runs — observability for cron work (sweeps, settlements,
-- reconciliation). Lets the runbook answer "did the reservation sweeper run?".
-- -----------------------------------------------------------------------------
create table platform.scheduled_job_runs (
  id             uuid        primary key default private.uuid_generate_v7(),
  job_name       text        not null,
  status         text        not null default 'RUNNING'
                   check (status in ('RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED')),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  duration_ms    integer,
  items_scanned  integer     not null default 0,
  items_affected integer     not null default 0,
  error_message  text,
  details        jsonb       not null default '{}'::jsonb,
  trace_id       text
);

create index scheduled_job_runs_job_idx on platform.scheduled_job_runs (job_name, started_at desc);
-- Only one run of a given job may be in flight at a time.
create unique index scheduled_job_runs_single_active_idx
  on platform.scheduled_job_runs (job_name) where status = 'RUNNING';

-- -----------------------------------------------------------------------------
-- Outbox helper: claim a batch atomically. Encapsulated in SQL so every worker
-- language uses identical, correct locking semantics.
-- -----------------------------------------------------------------------------
create or replace function platform.claim_outbox_batch(
  p_worker_id  text,
  p_batch_size int default 100
)
returns setof platform.outbox_events
language sql
volatile
set search_path = platform, pg_catalog
as $$
  update platform.outbox_events o
     set status    = 'PROCESSING',
         attempts  = o.attempts + 1,
         locked_at = now(),
         locked_by = p_worker_id
   where o.id in (
     select c.id
       from platform.outbox_events c
      where c.status in ('PENDING', 'FAILED')
        and c.available_at <= now()
      order by c.created_at
      for update skip locked
      limit p_batch_size
   )
  returning o.*;
$$;

comment on function platform.claim_outbox_batch(text, int) is
  'Atomically claims a batch of publishable outbox rows using FOR UPDATE SKIP LOCKED.';

-- Marks a claimed row published.
create or replace function platform.complete_outbox_event(p_event_id uuid)
returns void
language sql
volatile
set search_path = platform, pg_catalog
as $$
  update platform.outbox_events
     set status = 'PUBLISHED', published_at = now(), locked_at = null, locked_by = null, last_error = null
   where id = p_event_id;
$$;

-- Records a failure and schedules the retry with exponential backoff plus jitter,
-- or parks the row in DEAD_LETTER once attempts are exhausted.
create or replace function platform.fail_outbox_event(p_event_id uuid, p_error text)
returns void
language plpgsql
volatile
set search_path = platform, pg_catalog
as $$
declare
  v_attempts     smallint;
  v_max_attempts smallint;
  v_backoff      interval;
begin
  select attempts, max_attempts into v_attempts, v_max_attempts
    from platform.outbox_events where id = p_event_id;

  if v_attempts is null then
    return;
  end if;

  if v_attempts >= v_max_attempts then
    update platform.outbox_events
       set status = 'DEAD_LETTER', last_error = p_error, locked_at = null, locked_by = null
     where id = p_event_id;
    return;
  end if;

  -- 2^attempts seconds, capped at 1 hour, with up to 25% jitter to avoid thundering herds.
  v_backoff := least(power(2, v_attempts) * interval '1 second', interval '1 hour')
               * (1 + random() * 0.25);

  update platform.outbox_events
     set status       = 'FAILED',
         last_error   = p_error,
         available_at = now() + v_backoff,
         locked_at    = null,
         locked_by    = null
   where id = p_event_id;
end;
$$;

-- Recovers rows abandoned by a crashed worker.
create or replace function platform.requeue_stuck_outbox_events(p_visibility_timeout interval default interval '5 minutes')
returns integer
language sql
volatile
set search_path = platform, pg_catalog
as $$
  with reclaimed as (
    update platform.outbox_events
       set status = 'FAILED',
           last_error = coalesce(last_error, 'Worker lock expired; requeued by sweeper'),
           available_at = now(),
           locked_at = null,
           locked_by = null
     where status = 'PROCESSING'
       and locked_at < now() - p_visibility_timeout
    returning 1
  )
  select count(*)::int from reclaimed;
$$;
