-- =============================================================================
-- NovaMart — 0019 Marketing: campaigns, homepage CMS, banners, collections,
--                  notification templates and deliveries
--
-- The storefront homepage is entirely data-driven (brief §48). No section, banner
-- or carousel is hardcoded in any client.
-- =============================================================================

create table marketing.campaigns (
  id             uuid primary key default extensions.gen_random_uuid(),
  code           text        not null unique,
  name           text        not null,
  description    text,
  campaign_type  text        not null
                   check (campaign_type in ('SALE_EVENT', 'BRAND_DAY', 'CATEGORY_PUSH', 'SEASONAL',
                                             'NEW_USER', 'WIN_BACK', 'CLEARANCE', 'FESTIVAL')),
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  status         text        not null default 'DRAFT'
                   check (status in ('DRAFT', 'SCHEDULED', 'LIVE', 'PAUSED', 'ENDED', 'CANCELLED')),
  -- Landing page slug, so a campaign is reachable at a stable SEO URL.
  landing_slug   public.url_slug,
  theme          jsonb       not null default '{}'::jsonb,
  budget_paise   public.paise,
  spent_paise    public.paise not null default 0,
  owner_id       uuid        references identity.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint campaigns_period_valid check (ends_at > starts_at)
);

create index campaigns_live_idx on marketing.campaigns (starts_at, ends_at)
  where status in ('SCHEDULED', 'LIVE');
create unique index campaigns_slug_idx on marketing.campaigns (landing_slug) where landing_slug is not null;

create trigger campaigns_set_updated_at
  before update on marketing.campaigns
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- marketing.home_sections — the homepage, as data (brief §48).
-- Drag-and-drop ordering in the admin writes `position`; audience targeting and a
-- scheduling window make campaign switchovers a config change, not a deploy.
-- -----------------------------------------------------------------------------
create table marketing.home_sections (
  id                uuid primary key default extensions.gen_random_uuid(),
  code              text        not null unique,
  section_type      text        not null
                      check (section_type in ('HERO_BANNER', 'CATEGORY_GRID', 'PRODUCT_CAROUSEL',
                                               'DEALS_STRIP', 'BRAND_STRIP', 'SELLER_SPOTLIGHT',
                                               'FLASH_SALE', 'CAMPAIGN_BANNER', 'RECOMMENDED',
                                               'RECENTLY_VIEWED', 'VIDEO', 'RICH_CONTENT',
                                               'COLLECTION_GRID', 'COUNTDOWN', 'TOP_SELLING')),
  title             text,
  title_hi          text,
  subtitle          text,
  -- Section-specific configuration: source, filters, item limits, layout, CTA.
  -- Validated against a JSON Schema held in platform.platform_settings.
  configuration     jsonb       not null default '{}'::jsonb,
  position          integer     not null default 100,

  -- Which surfaces show this section.
  surfaces          text[]      not null default '{web,android,ios}'
                      constraint home_sections_surfaces_valid
                      check (surfaces <@ ARRAY['web', 'android', 'ios']),
  -- Audience targeting: NULL/empty means everyone.
  audience_segments text[]      not null default '{}',
  audience_states   text[]      not null default '{}',
  audience_city_tiers text[]    not null default '{}',
  min_app_version   text,

  campaign_id       uuid        references marketing.campaigns (id) on delete set null,
  starts_at         timestamptz,
  ends_at           timestamptz,
  status            text        not null default 'DRAFT'
                      check (status in ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED')),

  -- Impression/click counters for section-level performance.
  impressions_24h   bigint      not null default 0,
  clicks_24h        bigint      not null default 0,

  created_by        uuid        references identity.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint home_sections_window_valid check (ends_at is null or starts_at is null or ends_at > starts_at)
);

comment on table marketing.home_sections is
  'The homepage as data: type, config, position, schedule and audience. Clients render whatever this returns.';

create index home_sections_active_idx on marketing.home_sections (position)
  where status = 'ACTIVE';
create index home_sections_campaign_idx on marketing.home_sections (campaign_id) where campaign_id is not null;
create index home_sections_window_idx on marketing.home_sections (starts_at, ends_at)
  where status = 'ACTIVE';

create trigger home_sections_set_updated_at
  before update on marketing.home_sections
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- marketing.banners
-- -----------------------------------------------------------------------------
create table marketing.banners (
  id                uuid primary key default extensions.gen_random_uuid(),
  home_section_id   uuid        references marketing.home_sections (id) on delete cascade,
  campaign_id       uuid        references marketing.campaigns (id) on delete cascade,
  title             text,
  alt_text          text        not null,
  -- Separate assets per form factor: one image scaled badly is a poor storefront.
  image_url_desktop text,
  image_url_mobile  text        not null,
  image_url_tablet  text,
  background_color  text        check (background_color is null or background_color ~ '^#[0-9A-Fa-f]{6}$'),
  -- Deep link target, resolved by both web routes and Flutter deep links (brief §78).
  link_type         text        not null default 'NONE'
                      check (link_type in ('NONE', 'PRODUCT', 'CATEGORY', 'BRAND', 'SELLER',
                                            'COLLECTION', 'SEARCH', 'CAMPAIGN', 'FLASH_SALE',
                                            'EXTERNAL_URL', 'IN_APP_ROUTE')),
  link_target       text,
  cta_label         text,
  position          integer     not null default 100,
  starts_at         timestamptz,
  ends_at           timestamptz,
  status            text        not null default 'DRAFT'
                      check (status in ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED')),
  impressions       bigint      not null default 0,
  clicks            bigint      not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint banners_link_target_present check (link_type = 'NONE' or link_target is not null)
);

create index banners_section_idx on marketing.banners (home_section_id, position) where status = 'ACTIVE';
create index banners_campaign_idx on marketing.banners (campaign_id) where campaign_id is not null;

create trigger banners_set_updated_at
  before update on marketing.banners
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- marketing.collections — curated or rule-based product groupings.
-- -----------------------------------------------------------------------------
create table marketing.collections (
  id              uuid primary key default extensions.gen_random_uuid(),
  slug            public.url_slug not null unique,
  name            text        not null,
  description     text,
  banner_url      text,
  -- MANUAL collections list products explicitly; DYNAMIC ones evaluate a rule set.
  collection_type text        not null default 'MANUAL'
                    check (collection_type in ('MANUAL', 'DYNAMIC')),
  -- Rule for dynamic collections: category/brand/price/rating/discount filters.
  rules           jsonb       not null default '{}'::jsonb,
  max_items       smallint    not null default 50,
  sort_strategy   text        not null default 'MANUAL'
                    check (sort_strategy in ('MANUAL', 'POPULARITY', 'PRICE_ASC', 'PRICE_DESC',
                                              'DISCOUNT_DESC', 'NEWEST', 'RATING_DESC')),
  seo_title       text,
  seo_description text,
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index collections_active_idx on marketing.collections (slug) where is_active;

create trigger collections_set_updated_at
  before update on marketing.collections
  for each row execute function private.set_updated_at();

create table marketing.collection_items (
  id            uuid primary key default extensions.gen_random_uuid(),
  collection_id uuid        not null references marketing.collections (id) on delete cascade,
  product_id    uuid        not null references catalog.products (id) on delete cascade,
  position      integer     not null default 100,
  -- Editorially pinned items stay at the top regardless of sort strategy.
  is_pinned     boolean     not null default false,
  added_at      timestamptz not null default now(),
  unique (collection_id, product_id)
);

create index collection_items_collection_idx on marketing.collection_items (collection_id, position);
create index collection_items_product_idx     on marketing.collection_items (product_id);

-- -----------------------------------------------------------------------------
-- marketing.notification_templates (brief §47)
-- Channel-specific bodies with placeholder validation, plus DLT registration for
-- Indian SMS compliance.
-- -----------------------------------------------------------------------------
create table marketing.notification_templates (
  id                 uuid primary key default extensions.gen_random_uuid(),
  code               text        not null
                       constraint notification_template_code_shape check (code ~ '^[A-Z][A-Z0-9_]*$'),
  channel            text        not null
                       check (channel in ('PUSH', 'EMAIL', 'SMS', 'WHATSAPP', 'IN_APP')),
  locale             public.locale_code not null default 'en-IN',

  -- Which domain event triggers this template.
  trigger_event      text        not null,
  category           text        not null
                       check (category in ('TRANSACTIONAL', 'MARKETING', 'SECURITY', 'OPERATIONAL')),

  subject            text,
  title              text,
  body               text        not null,
  -- Placeholders the body expects, validated before send so a template change
  -- cannot produce "Hello {{name}}" in production.
  required_params    text[]      not null default '{}',
  -- Deep link opened when the notification is tapped.
  deep_link_template text,
  image_url          text,

  -- Indian SMS regulation: DLT template and entity registration.
  dlt_template_id    text,
  dlt_entity_id      text,
  sender_id          text,

  -- WhatsApp Business template name and namespace.
  whatsapp_template_name text,

  is_active          boolean     not null default true,
  -- Transactional messages ignore marketing opt-outs and quiet hours.
  respects_preferences boolean   not null default true,
  respects_quiet_hours boolean   not null default true,
  priority           text        not null default 'NORMAL'
                       check (priority in ('LOW', 'NORMAL', 'HIGH', 'CRITICAL')),
  -- Throttle: at most N of this template per user per window.
  max_per_user_per_day smallint,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (code, channel, locale),

  constraint notification_templates_sms_needs_dlt
    check (channel <> 'SMS' or category <> 'MARKETING' or dlt_template_id is not null),
  constraint notification_templates_email_needs_subject
    check (channel <> 'EMAIL' or subject is not null)
);

comment on constraint notification_templates_sms_needs_dlt on marketing.notification_templates is
  'Indian TRAI/DLT rules require a registered template id for commercial SMS.';

create index notification_templates_event_idx on marketing.notification_templates (trigger_event, channel)
  where is_active;

create trigger notification_templates_set_updated_at
  before update on marketing.notification_templates
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- marketing.notifications — the delivery record per recipient per channel.
-- -----------------------------------------------------------------------------
create table marketing.notifications (
  id                uuid primary key default private.uuid_generate_v7(),
  user_id           uuid        not null references identity.profiles (id) on delete cascade,
  template_id       uuid        references marketing.notification_templates (id) on delete set null,
  template_code     text        not null,
  channel           text        not null,
  locale            public.locale_code not null default 'en-IN',

  -- Rendered content, retained so support can see exactly what the user received.
  subject           text,
  title             text,
  body              text        not null,
  deep_link         text,
  image_url         text,
  params            jsonb       not null default '{}'::jsonb,

  -- What this notification is about, for grouping in the notification centre.
  related_type      text,
  related_id        uuid,
  category          text        not null default 'TRANSACTIONAL',

  status            text        not null default 'QUEUED'
                      check (status in ('QUEUED', 'SUPPRESSED', 'SENDING', 'SENT', 'DELIVERED',
                                        'READ', 'CLICKED', 'FAILED', 'BOUNCED')),
  -- Why a notification was not sent: opt-out, quiet hours, throttle, no token.
  suppression_reason text,

  provider          text,
  provider_message_id text,
  provider_response jsonb,
  failure_code      text,
  failure_reason    text,
  attempts          smallint    not null default 0,

  -- Idempotency: one notification per (user, template, related entity).
  idempotency_key   text,

  scheduled_for     timestamptz not null default now(),
  sent_at           timestamptz,
  delivered_at      timestamptz,
  read_at           timestamptz,
  clicked_at        timestamptz,
  created_at        timestamptz not null default now(),

  constraint notifications_suppression_reason
    check (status <> 'SUPPRESSED' or suppression_reason is not null)
);

create unique index notifications_idempotency_idx on marketing.notifications (idempotency_key)
  where idempotency_key is not null;
create index notifications_user_idx    on marketing.notifications (user_id, created_at desc);
create index notifications_unread_idx  on marketing.notifications (user_id, created_at desc)
  where channel = 'IN_APP' and read_at is null;
create index notifications_queue_idx   on marketing.notifications (scheduled_for)
  where status = 'QUEUED';
create index notifications_status_idx   on marketing.notifications (status, created_at desc);
create index notifications_related_idx  on marketing.notifications (related_type, related_id)
  where related_id is not null;
create unique index notifications_provider_idx on marketing.notifications (provider, provider_message_id)
  where provider_message_id is not null;

-- -----------------------------------------------------------------------------
-- marketing.customer_segments — targeting definitions used by promotions, CMS
-- audiences and notification campaigns.
-- -----------------------------------------------------------------------------
create table marketing.customer_segments (
  id              uuid primary key default extensions.gen_random_uuid(),
  code            text        not null unique
                    constraint segment_code_shape check (code ~ '^[A-Z][A-Z0-9_]*$'),
  name            text        not null,
  description     text,
  -- STATIC segments are materialised member lists; DYNAMIC ones evaluate rules.
  segment_type    text        not null default 'DYNAMIC'
                    check (segment_type in ('STATIC', 'DYNAMIC')),
  rules           jsonb       not null default '{}'::jsonb,
  member_count    integer     not null default 0,
  last_computed_at timestamptz,
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger customer_segments_set_updated_at
  before update on marketing.customer_segments
  for each row execute function private.set_updated_at();

create table marketing.customer_segment_members (
  segment_id  uuid        not null references marketing.customer_segments (id) on delete cascade,
  user_id     uuid        not null references identity.profiles (id) on delete cascade,
  added_at    timestamptz not null default now(),
  expires_at  timestamptz,
  primary key (segment_id, user_id)
);

create index segment_members_user_idx on marketing.customer_segment_members (user_id);

-- -----------------------------------------------------------------------------
-- marketing.search_synonyms — admin-managed search vocabulary (brief §92).
-- Pushed to Typesense by the indexer; the database remains the source of truth.
-- -----------------------------------------------------------------------------
create table marketing.search_synonyms (
  id            uuid primary key default extensions.gen_random_uuid(),
  root_term     text        not null,
  synonyms      text[]      not null check (array_length(synonyms, 1) >= 1),
  -- ONE_WAY: searching root also matches synonyms, not the reverse.
  synonym_type  text        not null default 'MULTI_WAY'
                  check (synonym_type in ('ONE_WAY', 'MULTI_WAY')),
  locale        public.locale_code not null default 'en-IN',
  is_active     boolean     not null default true,
  synced_at     timestamptz,
  created_by    uuid        references identity.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (root_term, locale)
);

create index search_synonyms_active_idx on marketing.search_synonyms (locale) where is_active;

-- Curated results: pin specific products for a query ("iphone" → the current model).
create table marketing.search_curations (
  id             uuid primary key default extensions.gen_random_uuid(),
  query          text        not null,
  locale         public.locale_code not null default 'en-IN',
  pinned_product_ids uuid[]  not null default '{}',
  hidden_product_ids uuid[]  not null default '{}',
  redirect_url   text,
  is_active      boolean     not null default true,
  created_at     timestamptz not null default now(),
  unique (query, locale)
);

create index search_curations_active_idx on marketing.search_curations (lower(query)) where is_active;
