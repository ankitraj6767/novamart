-- =============================================================================
-- NovaMart — 0021 Analytics and Risk: behavioural event stream, derived metrics,
--                  risk events/scores, fraud rules and cases
--
-- analytics.events is partitioned monthly from day one: it is the highest-volume
-- table in the platform and retro-partitioning a live table is painful.
-- Heavy BI never runs against this schema on the primary (brief §57); it is the
-- staging ground for export to a warehouse.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- analytics.events — the behavioural stream (brief §45)
-- -----------------------------------------------------------------------------
create table analytics.events (
  id               uuid        not null default private.uuid_generate_v7(),
  event_type       text        not null
                     check (event_type in ('IMPRESSION', 'PRODUCT_VIEW', 'CATEGORY_VIEW', 'SEARCH',
                                            'SEARCH_CLICK', 'SEARCH_NO_RESULTS', 'FILTER_APPLIED',
                                            'ADD_TO_CART', 'REMOVE_FROM_CART', 'CART_VIEW',
                                            'WISHLIST_ADD', 'WISHLIST_REMOVE',
                                            'CHECKOUT_STARTED', 'ADDRESS_SELECTED', 'PAYMENT_SELECTED',
                                            'COUPON_APPLIED', 'COUPON_FAILED',
                                            'PURCHASE', 'ORDER_CANCELLED', 'RETURN_REQUESTED',
                                            'REVIEW_SUBMITTED', 'BANNER_CLICK', 'SECTION_VIEW',
                                            'APP_OPEN', 'PUSH_OPENED', 'DEEP_LINK_OPENED',
                                            'PDP_SCROLL_DEPTH', 'VIDEO_PLAY')),

  user_id          uuid,
  -- Anonymous visitor identifier, so pre-login behaviour is attributable after login.
  anonymous_id     text,
  session_id       text,

  -- Subject of the event.
  product_id       uuid,
  sku_id           uuid,
  listing_id       uuid,
  seller_id        uuid,
  category_id      uuid,
  order_id         uuid,
  search_query     text,

  -- Where it happened, for attribution and surface-level analysis.
  surface          text        check (surface in ('HOME', 'CATEGORY', 'PLP', 'PDP', 'SEARCH', 'CART',
                                                   'CHECKOUT', 'ORDERS', 'WISHLIST', 'COLLECTION',
                                                   'CAMPAIGN', 'NOTIFICATION', 'DEEP_LINK')),
  -- Position within a list, needed to compute click-through by rank.
  position         smallint,
  -- Whether the impression/click was a sponsored placement.
  is_sponsored     boolean     not null default false,

  platform         text        check (platform in ('android', 'ios', 'web')),
  app_version      text,
  -- Coarse geo only. No precise location in the analytics stream.
  state_code       text,
  city             text,
  pincode          public.indian_pincode,

  quantity         integer,
  value_paise      public.paise,
  -- Event-specific payload; kept small and flat for cheap export.
  properties       jsonb       not null default '{}'::jsonb,

  request_id       text,
  trace_id         text,
  occurred_at      timestamptz not null default now(),

  primary key (id, occurred_at)
) partition by range (occurred_at);

comment on table analytics.events is
  'Behavioural event stream, partitioned monthly. Staging for warehouse export; never the target of BI queries on the primary.';

-- Partitions are created ahead of time by a scheduled job; these bootstrap the
-- current window so writes never fail for a missing partition.
create table analytics.events_2026_08 partition of analytics.events
  for values from ('2026-08-01') to ('2026-09-01');
create table analytics.events_2026_09 partition of analytics.events
  for values from ('2026-09-01') to ('2026-10-01');
create table analytics.events_2026_10 partition of analytics.events
  for values from ('2026-10-01') to ('2026-11-01');
create table analytics.events_2026_11 partition of analytics.events
  for values from ('2026-11-01') to ('2026-12-01');
create table analytics.events_2026_12 partition of analytics.events
  for values from ('2026-12-01') to ('2027-01-01');
create table analytics.events_2027_01 partition of analytics.events
  for values from ('2027-01-01') to ('2027-02-01');
-- Catch-all so a missing future partition degrades to a slow write, not an error.
create table analytics.events_default partition of analytics.events default;

create index events_user_idx      on analytics.events (user_id, occurred_at desc) where user_id is not null;
create index events_anon_idx      on analytics.events (anonymous_id, occurred_at desc) where anonymous_id is not null;
create index events_type_idx      on analytics.events (event_type, occurred_at desc);
create index events_product_idx   on analytics.events (product_id, event_type, occurred_at desc) where product_id is not null;
create index events_seller_idx    on analytics.events (seller_id, occurred_at desc) where seller_id is not null;
create index events_session_idx   on analytics.events (session_id, occurred_at) where session_id is not null;
create index events_search_idx    on analytics.events (occurred_at desc) where event_type in ('SEARCH', 'SEARCH_NO_RESULTS');

create trigger events_append_only
  before update or delete on analytics.events
  for each row execute function private.prevent_mutation();

-- Creates next month's partition. Run monthly by scheduled-jobs.
create or replace function analytics.ensure_event_partition(p_month date default (current_date + interval '1 month')::date)
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

  return v_name;
end;
$$;

-- -----------------------------------------------------------------------------
-- Derived metric tables. Rebuilt by analytics-worker; safe to truncate and rebuild.
-- -----------------------------------------------------------------------------
create table analytics.daily_metrics (
  metric_date            date primary key,
  -- Traffic
  daily_active_users     integer not null default 0,
  new_users              integer not null default 0,
  sessions               integer not null default 0,
  product_views          bigint  not null default 0,
  searches               bigint  not null default 0,
  search_no_results      bigint  not null default 0,
  -- Funnel
  carts_created          integer not null default 0,
  checkouts_started      integer not null default 0,
  orders_placed          integer not null default 0,
  -- Money
  gmv_paise              public.paise not null default 0,
  nmv_paise              public.paise not null default 0,
  average_order_value_paise public.paise not null default 0,
  commission_paise       public.paise not null default 0,
  -- Quality
  conversion_rate        public.percentage,
  cart_abandonment_rate  public.percentage,
  cancellation_rate      public.percentage,
  return_rate            public.percentage,
  refund_rate            public.percentage,
  rto_rate               public.percentage,
  payment_success_rate   public.percentage,
  cod_share              public.percentage,
  repeat_purchase_rate   public.percentage,
  -- Operations
  on_time_delivery_rate  public.percentage,
  average_delivery_days  numeric(4, 1),
  active_sellers         integer not null default 0,
  new_sellers            integer not null default 0,
  computed_at            timestamptz not null default now()
);

comment on table analytics.daily_metrics is
  'Operational KPI rollup (brief §57). Rebuildable from the event stream and transactional tables.';

create table analytics.product_metrics (
  product_id           uuid        not null references catalog.products (id) on delete cascade,
  metric_date          date        not null,
  impressions          bigint      not null default 0,
  views                bigint      not null default 0,
  add_to_carts         integer     not null default 0,
  purchases            integer     not null default 0,
  units_sold           integer     not null default 0,
  gmv_paise            public.paise not null default 0,
  view_to_cart_rate    public.percentage,
  cart_to_order_rate   public.percentage,
  returns              integer     not null default 0,
  cancellations        integer     not null default 0,
  average_rating       numeric(3, 2),
  computed_at          timestamptz not null default now(),
  primary key (product_id, metric_date)
);

create index product_metrics_date_idx on analytics.product_metrics (metric_date desc, gmv_paise desc);

create table analytics.seller_metrics (
  seller_id             uuid        not null references seller.sellers (id) on delete cascade,
  metric_date           date        not null,
  orders                integer     not null default 0,
  units                 integer     not null default 0,
  gmv_paise             public.paise not null default 0,
  cancellations         integer     not null default 0,
  returns               integer     not null default 0,
  rto                   integer     not null default 0,
  on_time_dispatch_rate public.percentage,
  average_dispatch_hours numeric(6, 2),
  commission_paise      public.paise not null default 0,
  computed_at           timestamptz not null default now(),
  primary key (seller_id, metric_date)
);

create index seller_metrics_date_idx on analytics.seller_metrics (metric_date desc, gmv_paise desc);

-- Search analytics: what people look for and fail to find. Directly actionable for
-- catalog gaps and synonym curation.
create table analytics.search_queries (
  id                uuid primary key default private.uuid_generate_v7(),
  normalised_query  text        not null,
  metric_date       date        not null,
  search_count      integer     not null default 1,
  zero_result_count integer     not null default 0,
  click_count       integer     not null default 0,
  order_count       integer     not null default 0,
  click_through_rate public.percentage,
  conversion_rate   public.percentage,
  computed_at       timestamptz not null default now(),
  unique (normalised_query, metric_date)
);

create index search_queries_zero_result_idx on analytics.search_queries (metric_date desc, zero_result_count desc)
  where zero_result_count > 0;
create index search_queries_volume_idx on analytics.search_queries (metric_date desc, search_count desc);

-- -----------------------------------------------------------------------------
-- Recommendation support: co-purchase and co-view affinities, rebuilt nightly.
-- Powers "frequently bought together" and "customers also viewed" (brief §45).
-- -----------------------------------------------------------------------------
create table analytics.product_affinities (
  product_id         uuid        not null references catalog.products (id) on delete cascade,
  related_product_id uuid        not null references catalog.products (id) on delete cascade,
  affinity_type      text        not null
                       check (affinity_type in ('BOUGHT_TOGETHER', 'ALSO_VIEWED', 'ALSO_BOUGHT', 'SIMILAR')),
  -- Co-occurrence count and a normalised score (lift or cosine similarity).
  co_occurrence_count integer    not null default 0,
  score              numeric(8, 6) not null default 0,
  computed_at        timestamptz not null default now(),
  primary key (product_id, related_product_id, affinity_type),
  constraint affinities_distinct_products check (product_id <> related_product_id)
);

create index product_affinities_lookup_idx
  on analytics.product_affinities (product_id, affinity_type, score desc);

-- =============================================================================
-- Risk and fraud (brief §50)
-- =============================================================================

-- Rules are data so the fraud team can tune thresholds without a deploy.
create table analytics.fraud_rules (
  id                  uuid primary key default extensions.gen_random_uuid(),
  code                text        not null unique
                        constraint fraud_rule_code_shape check (code ~ '^[A-Z][A-Z0-9_]*$'),
  name                text        not null,
  description         text        not null,
  category            text        not null
                        check (category in ('COD_ABUSE', 'RETURN_ABUSE', 'REFUND_ABUSE',
                                             'COUPON_ABUSE', 'FAKE_REVIEW', 'FAKE_ACCOUNT',
                                             'ACCOUNT_TAKEOVER', 'SELLER_MANIPULATION',
                                             'PAYMENT_FRAUD', 'DEVICE_ABUSE', 'VELOCITY')),
  -- Which entity the rule scores.
  subject_type        text        not null
                        check (subject_type in ('USER', 'SELLER', 'ORDER', 'DEVICE', 'ADDRESS',
                                                 'PAYMENT_INSTRUMENT', 'REVIEW')),
  -- Declarative condition evaluated by the risk engine.
  conditions          jsonb       not null,
  -- Contribution to the subject's risk score when the rule fires.
  score_weight        numeric(6, 2) not null,
  -- What happens automatically when the rule fires.
  action              text        not null default 'FLAG'
                        check (action in ('FLAG', 'REVIEW', 'BLOCK_COD', 'REQUIRE_PREPAY',
                                           'BLOCK_CHECKOUT', 'SUSPEND_ACCOUNT', 'OPEN_CASE',
                                           'BLOCK_COUPON', 'HOLD_SETTLEMENT')),
  severity            text        not null default 'MEDIUM'
                        check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  -- Rules start in shadow mode: they score and log but take no action.
  is_shadow_mode      boolean     not null default true,
  is_active           boolean     not null default true,
  trigger_count_24h   integer     not null default 0,
  false_positive_count integer    not null default 0,
  created_by          uuid        references identity.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on column analytics.fraud_rules.is_shadow_mode is
  'Shadow mode scores and logs without acting. Every new rule starts here so false positives are measured first.';

create index fraud_rules_active_idx on analytics.fraud_rules (category, subject_type) where is_active;

create trigger fraud_rules_set_updated_at
  before update on analytics.fraud_rules
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- analytics.risk_events — append-only record of every rule firing.
-- -----------------------------------------------------------------------------
create table analytics.risk_events (
  id                uuid primary key default private.uuid_generate_v7(),
  rule_id           uuid        references analytics.fraud_rules (id) on delete set null,
  rule_code         text        not null,
  category          text        not null,
  severity          text        not null,

  subject_type      text        not null,
  subject_id        uuid,
  -- Non-UUID subjects: device identifier, masked instrument, address hash.
  subject_key       text,

  user_id           uuid        references identity.profiles (id) on delete set null,
  seller_id         uuid        references seller.sellers (id) on delete set null,
  order_id          uuid        references commerce.orders (id) on delete set null,

  score_contribution numeric(6, 2) not null default 0,
  -- The signal values that caused the rule to fire, for analyst review.
  evidence          jsonb       not null default '{}'::jsonb,
  action_taken      text        not null default 'NONE',
  was_shadow_mode   boolean     not null default true,

  ip_address        inet,
  device_id         text,
  request_id        text,
  trace_id          text,
  occurred_at       timestamptz not null default now()
);

create index risk_events_user_idx    on analytics.risk_events (user_id, occurred_at desc) where user_id is not null;
create index risk_events_seller_idx  on analytics.risk_events (seller_id, occurred_at desc) where seller_id is not null;
create index risk_events_order_idx   on analytics.risk_events (order_id) where order_id is not null;
create index risk_events_rule_idx    on analytics.risk_events (rule_code, occurred_at desc);
create index risk_events_subject_idx on analytics.risk_events (subject_type, subject_id, occurred_at desc);
create index risk_events_severity_idx on analytics.risk_events (occurred_at desc)
  where severity in ('HIGH', 'CRITICAL');

create trigger risk_events_append_only
  before update or delete on analytics.risk_events
  for each row execute function private.prevent_mutation();

-- -----------------------------------------------------------------------------
-- analytics.risk_scores — current standing per subject. Mutable projection.
-- -----------------------------------------------------------------------------
create table analytics.risk_scores (
  subject_type      text        not null,
  subject_id        uuid,
  subject_key       text        not null,
  score             numeric(6, 2) not null default 0,
  tier              text        not null default 'STANDARD'
                      check (tier in ('TRUSTED', 'STANDARD', 'ELEVATED', 'HIGH', 'BLOCKED')),
  -- Behavioural counters the engine uses as inputs.
  cod_orders_count       integer not null default 0,
  cod_rto_count          integer not null default 0,
  cancellation_count_90d integer not null default 0,
  return_count_90d       integer not null default 0,
  refund_count_90d       integer not null default 0,
  coupon_redemptions_90d integer not null default 0,
  distinct_devices_30d   integer not null default 0,
  distinct_addresses_90d integer not null default 0,
  failed_payment_count_7d integer not null default 0,
  -- Restrictions currently applied.
  restrictions      text[]      not null default '{}',
  last_event_at     timestamptz,
  computed_at       timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (subject_type, subject_key)
);

create index risk_scores_tier_idx    on analytics.risk_scores (tier) where tier in ('ELEVATED', 'HIGH', 'BLOCKED');
create index risk_scores_subject_idx on analytics.risk_scores (subject_id) where subject_id is not null;

create trigger risk_scores_set_updated_at
  before update on analytics.risk_scores
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- analytics.fraud_cases — investigation workflow for the fraud team.
-- -----------------------------------------------------------------------------
create table analytics.fraud_cases (
  id                uuid primary key default private.uuid_generate_v7(),
  case_reference    text        not null unique,
  category          text        not null,
  priority          text        not null default 'MEDIUM'
                      check (priority in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status            text        not null default 'OPEN'
                      check (status in ('OPEN', 'INVESTIGATING', 'AWAITING_INFO', 'CONFIRMED_FRAUD',
                                        'FALSE_POSITIVE', 'RESOLVED', 'CLOSED')),

  subject_type      text        not null,
  subject_id        uuid,
  subject_key       text,
  user_id           uuid        references identity.profiles (id) on delete set null,
  seller_id         uuid        references seller.sellers (id) on delete set null,

  -- Risk events that opened or were attached to this case.
  triggering_event_ids uuid[]   not null default '{}',
  total_score       numeric(6, 2),
  estimated_loss_paise public.paise,

  summary           text        not null,
  investigation_notes text,
  -- Actions taken, appended as the investigation progresses.
  actions_taken     jsonb       not null default '[]'::jsonb,
  outcome           text,
  outcome_reason    text,

  assigned_to       uuid        references identity.profiles (id) on delete set null,
  opened_by         uuid        references identity.profiles (id) on delete set null,
  opened_at         timestamptz not null default now(),
  resolved_at       timestamptz,
  resolved_by       uuid        references identity.profiles (id) on delete set null,
  updated_at        timestamptz not null default now(),

  constraint fraud_cases_resolution_fields
    check (status not in ('CONFIRMED_FRAUD', 'FALSE_POSITIVE', 'RESOLVED', 'CLOSED')
           or (outcome is not null and resolved_at is not null))
);

create index fraud_cases_status_idx   on analytics.fraud_cases (status, priority, opened_at)
  where status not in ('RESOLVED', 'CLOSED');
create index fraud_cases_assigned_idx on analytics.fraud_cases (assigned_to, status);
create index fraud_cases_user_idx     on analytics.fraud_cases (user_id) where user_id is not null;
create index fraud_cases_seller_idx   on analytics.fraud_cases (seller_id) where seller_id is not null;

create trigger fraud_cases_set_updated_at
  before update on analytics.fraud_cases
  for each row execute function private.set_updated_at();

create or replace function analytics.assign_fraud_case_reference()
returns trigger
language plpgsql
set search_path = analytics, pg_catalog
as $$
begin
  if new.case_reference is null then
    new.case_reference := 'FC' || to_char(now(), 'YYMM') ||
                          lpad((extract(epoch from clock_timestamp())::bigint % 100000)::text, 5, '0');
  end if;
  return new;
end;
$$;

create trigger fraud_cases_assign_reference
  before insert on analytics.fraud_cases
  for each row execute function analytics.assign_fraud_case_reference();
