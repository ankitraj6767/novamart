-- =============================================================================
-- NovaMart — 0020 Support: SLA policies, tickets, messages, attachments, macros
-- =============================================================================

create table support.sla_policies (
  id                      uuid primary key default extensions.gen_random_uuid(),
  code                    text        not null unique,
  name                    text        not null,
  priority                text        not null check (priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  -- Business minutes, measured against support operating hours.
  first_response_minutes  integer     not null check (first_response_minutes > 0),
  resolution_minutes      integer     not null check (resolution_minutes > 0),
  -- Escalate automatically at this fraction of the resolution target.
  escalate_at_percentage  smallint    not null default 80 check (escalate_at_percentage between 1 and 100),
  operating_hours         jsonb       not null default '{"mon_fri":"09:00-21:00","sat":"10:00-18:00","sun":"closed"}'::jsonb,
  is_active               boolean     not null default true,
  created_at              timestamptz not null default now()
);

create table support.ticket_categories (
  id             uuid primary key default extensions.gen_random_uuid(),
  code           text        not null unique,
  name           text        not null,
  parent_id      uuid        references support.ticket_categories (id) on delete restrict,
  -- Which audience raises this category of issue.
  audience       text        not null check (audience in ('CUSTOMER', 'SELLER', 'DELIVERY', 'INTERNAL')),
  sla_policy_id  uuid        references support.sla_policies (id) on delete set null,
  -- Team that owns tickets in this category.
  default_queue  text        not null default 'GENERAL',
  requires_order boolean     not null default false,
  display_order  smallint    not null default 100,
  is_active      boolean     not null default true,
  created_at     timestamptz not null default now()
);

create index ticket_categories_audience_idx on support.ticket_categories (audience, display_order)
  where is_active;

-- -----------------------------------------------------------------------------
-- support.support_tickets
-- -----------------------------------------------------------------------------
create table support.support_tickets (
  id                    uuid primary key default private.uuid_generate_v7(),
  ticket_reference      text        not null unique,

  -- The requester. Exactly one of these identities applies.
  requester_type        text        not null
                          check (requester_type in ('CUSTOMER', 'SELLER', 'DELIVERY_AGENT', 'INTERNAL')),
  requester_id          uuid        references identity.profiles (id) on delete set null,
  seller_id             uuid        references seller.sellers (id) on delete set null,
  -- Contact details for unauthenticated/help-centre submissions.
  contact_email         public.email_address,
  contact_phone         public.phone_e164,

  category_id           uuid        references support.ticket_categories (id) on delete set null,
  subject               text        not null check (length(trim(subject)) between 3 and 200),
  description           text        not null,

  -- What the ticket is about; drives contextual tooling for the agent.
  order_id              uuid        references commerce.orders (id) on delete set null,
  order_item_id         uuid        references commerce.order_items (id) on delete set null,
  return_request_id     uuid        references returns.return_requests (id) on delete set null,
  shipment_id           uuid        references fulfillment.shipments (id) on delete set null,
  payment_intent_id     uuid        references payments.payment_intents (id) on delete set null,
  refund_id             uuid        references payments.refunds (id) on delete set null,

  status                text        not null default 'OPEN'
                          check (status in ('OPEN', 'PENDING_AGENT', 'PENDING_CUSTOMER',
                                            'PENDING_SELLER', 'PENDING_THIRD_PARTY', 'ESCALATED',
                                            'RESOLVED', 'CLOSED', 'REOPENED')),
  priority              text        not null default 'NORMAL'
                          check (priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  sentiment             text        check (sentiment in ('POSITIVE', 'NEUTRAL', 'NEGATIVE', 'ANGRY')),

  queue                 text        not null default 'GENERAL',
  assigned_to           uuid        references identity.profiles (id) on delete set null,
  assigned_at           timestamptz,
  assigned_team         text,

  sla_policy_id         uuid        references support.sla_policies (id) on delete set null,
  first_response_due_at timestamptz,
  resolution_due_at     timestamptz,
  first_responded_at    timestamptz,
  resolved_at           timestamptz,
  closed_at             timestamptz,
  -- SLA outcome, computed on resolution so reporting needs no recalculation.
  first_response_breached boolean   not null default false,
  resolution_breached   boolean     not null default false,

  escalation_level      smallint    not null default 0 check (escalation_level between 0 and 3),
  escalated_at          timestamptz,
  escalated_to          uuid        references identity.profiles (id) on delete set null,
  escalation_reason     text,

  resolution_code       text,
  resolution_notes      text,
  -- Customer satisfaction after resolution.
  csat_score            smallint    check (csat_score is null or csat_score between 1 and 5),
  csat_comment          text,
  csat_submitted_at     timestamptz,

  reopen_count          smallint    not null default 0,
  message_count         integer     not null default 0,
  tags                  text[]      not null default '{}',
  channel               text        not null default 'APP'
                          check (channel in ('APP', 'WEB', 'EMAIL', 'PHONE', 'WHATSAPP', 'CHAT', 'INTERNAL')),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint tickets_requester_present check (
    requester_id is not null or contact_email is not null or contact_phone is not null
  ),
  constraint tickets_seller_requester check (requester_type <> 'SELLER' or seller_id is not null),
  constraint tickets_resolution_fields
    check (status not in ('RESOLVED', 'CLOSED') or resolution_code is not null),
  constraint tickets_escalation_fields
    check (escalation_level = 0 or escalation_reason is not null)
);

comment on table support.support_tickets is
  'Support tickets with SLA tracking, escalation and full order/payment/return context for the agent.';

create index tickets_requester_idx  on support.support_tickets (requester_id, created_at desc);
create index tickets_seller_idx     on support.support_tickets (seller_id, created_at desc) where seller_id is not null;
create index tickets_assigned_idx   on support.support_tickets (assigned_to, status)
  where status not in ('RESOLVED', 'CLOSED');
create index tickets_queue_idx      on support.support_tickets (queue, priority, created_at)
  where status not in ('RESOLVED', 'CLOSED');
create index tickets_order_idx      on support.support_tickets (order_id) where order_id is not null;
create index tickets_status_idx     on support.support_tickets (status, updated_at desc);
-- SLA breach monitors.
create index tickets_first_response_due_idx on support.support_tickets (first_response_due_at)
  where first_responded_at is null and status not in ('RESOLVED', 'CLOSED');
create index tickets_resolution_due_idx on support.support_tickets (resolution_due_at)
  where resolved_at is null and status not in ('RESOLVED', 'CLOSED');
create index tickets_escalated_idx  on support.support_tickets (escalated_at desc) where escalation_level > 0;
create index tickets_reference_trgm_idx on support.support_tickets using gin (ticket_reference extensions.gin_trgm_ops);
create index tickets_subject_trgm_idx on support.support_tickets using gin (subject extensions.gin_trgm_ops);

create trigger support_tickets_set_updated_at
  before update on support.support_tickets
  for each row execute function private.set_updated_at();

create or replace function support.assign_ticket_reference()
returns trigger
language plpgsql
set search_path = support, private, pg_catalog
as $$
begin
  if new.ticket_reference is null then
    new.ticket_reference := private.next_reference('TK', 'private.ticket_reference_seq');
  end if;
  return new;
end;
$$;

create trigger support_tickets_assign_reference
  before insert on support.support_tickets
  for each row execute function support.assign_ticket_reference();

-- -----------------------------------------------------------------------------
-- support.support_messages — the conversation, including internal notes.
-- -----------------------------------------------------------------------------
create table support.support_messages (
  id             uuid primary key default private.uuid_generate_v7(),
  ticket_id      uuid        not null references support.support_tickets (id) on delete cascade,
  sender_type    text        not null
                   check (sender_type in ('CUSTOMER', 'SELLER', 'AGENT', 'SYSTEM', 'BOT')),
  sender_id      uuid        references identity.profiles (id) on delete set null,
  sender_name    text,
  body           text        not null,
  -- Internal notes are never shown to the requester.
  is_internal    boolean     not null default false,
  -- Macro used to compose this reply, for quality analysis.
  macro_id       uuid,
  -- Email threading identifiers when the channel is email.
  email_message_id text,
  in_reply_to    uuid        references support.support_messages (id) on delete set null,
  read_by_requester_at timestamptz,
  created_at     timestamptz not null default now()
);

create index support_messages_ticket_idx on support.support_messages (ticket_id, created_at);
create index support_messages_public_idx on support.support_messages (ticket_id, created_at)
  where not is_internal;

-- Keep the ticket's message count and first-response timestamp accurate.
create or replace function support.on_support_message()
returns trigger
language plpgsql
set search_path = support, pg_catalog
as $$
begin
  update support.support_tickets t
     set message_count = t.message_count + 1,
         first_responded_at = case
           when t.first_responded_at is null and new.sender_type = 'AGENT' and not new.is_internal
             then new.created_at
           else t.first_responded_at
         end,
         first_response_breached = case
           when t.first_responded_at is null and new.sender_type = 'AGENT' and not new.is_internal
             then (t.first_response_due_at is not null and new.created_at > t.first_response_due_at)
           else t.first_response_breached
         end,
         -- An agent reply awaits the customer; a customer reply awaits the agent.
         status = case
           when t.status in ('RESOLVED', 'CLOSED') then 'REOPENED'
           when new.sender_type = 'AGENT' and not new.is_internal then 'PENDING_CUSTOMER'
           when new.sender_type in ('CUSTOMER', 'SELLER') then 'PENDING_AGENT'
           else t.status
         end,
         updated_at = now()
   where t.id = new.ticket_id;

  return null;
end;
$$;

create trigger support_messages_update_ticket
  after insert on support.support_messages
  for each row execute function support.on_support_message();

-- -----------------------------------------------------------------------------
-- support.support_attachments — private bucket only.
-- -----------------------------------------------------------------------------
create table support.support_attachments (
  id              uuid primary key default extensions.gen_random_uuid(),
  ticket_id       uuid        not null references support.support_tickets (id) on delete cascade,
  message_id      uuid        references support.support_messages (id) on delete cascade,
  uploaded_by     uuid        references identity.profiles (id) on delete set null,
  uploaded_by_type text       not null default 'CUSTOMER',
  storage_bucket  text        not null default 'support-private'
                    check (storage_bucket = 'support-private'),
  storage_path    text        not null,
  original_filename text,
  mime_type       text        not null
                    check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp',
                                          'text/plain', 'video/mp4')),
  file_size_bytes integer     not null check (file_size_bytes between 1 and 26214400),
  content_hash    text,
  -- Attachments are scanned before an agent can open them.
  scan_status     text        not null default 'PENDING'
                    check (scan_status in ('PENDING', 'CLEAN', 'INFECTED', 'FAILED')),
  created_at      timestamptz not null default now()
);

create index support_attachments_ticket_idx  on support.support_attachments (ticket_id);
create index support_attachments_message_idx on support.support_attachments (message_id) where message_id is not null;

-- -----------------------------------------------------------------------------
-- support.ticket_status_history — append-only
-- -----------------------------------------------------------------------------
create table support.ticket_status_history (
  id           uuid primary key default private.uuid_generate_v7(),
  ticket_id    uuid        not null references support.support_tickets (id) on delete cascade,
  from_status  text,
  to_status    text        not null,
  from_assignee uuid,
  to_assignee  uuid,
  reason       text,
  actor_id     uuid        references identity.profiles (id) on delete set null,
  occurred_at  timestamptz not null default now()
);

create index ticket_status_history_ticket_idx on support.ticket_status_history (ticket_id, occurred_at desc);

create trigger ticket_status_history_append_only
  before update or delete on support.ticket_status_history
  for each row execute function private.prevent_mutation();

create or replace function support.record_ticket_status()
returns trigger
language plpgsql
set search_path = support, private, pg_catalog
as $$
begin
  if tg_op = 'INSERT'
     or new.status is distinct from old.status
     or new.assigned_to is distinct from old.assigned_to then
    insert into support.ticket_status_history (
      ticket_id, from_status, to_status, from_assignee, to_assignee, reason, actor_id
    ) values (
      new.id,
      case when tg_op = 'INSERT' then null else old.status end,
      new.status,
      case when tg_op = 'INSERT' then null else old.assigned_to end,
      new.assigned_to,
      coalesce(new.escalation_reason, new.resolution_notes),
      private.current_actor_id()
    );
  end if;
  return null;
end;
$$;

create trigger support_tickets_record_status
  after insert or update of status, assigned_to on support.support_tickets
  for each row execute function support.record_ticket_status();

-- -----------------------------------------------------------------------------
-- support.macros — canned responses with placeholders and optional side effects.
-- -----------------------------------------------------------------------------
create table support.macros (
  id             uuid primary key default extensions.gen_random_uuid(),
  code           text        not null unique,
  name           text        not null,
  category_id    uuid        references support.ticket_categories (id) on delete set null,
  body           text        not null,
  locale         public.locale_code not null default 'en-IN',
  required_params text[]     not null default '{}',
  -- Actions applied when the macro is used: set status, priority, tags, queue.
  actions        jsonb       not null default '{}'::jsonb,
  usage_count    integer     not null default 0,
  is_active      boolean     not null default true,
  created_by     uuid        references identity.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index macros_category_idx on support.macros (category_id) where is_active;

create trigger macros_set_updated_at
  before update on support.macros
  for each row execute function private.set_updated_at();

alter table support.support_messages
  add constraint support_messages_macro_fk
  foreign key (macro_id) references support.macros (id) on delete set null;

-- -----------------------------------------------------------------------------
-- support.help_articles — self-service help centre, admin managed.
-- -----------------------------------------------------------------------------
create table support.help_articles (
  id              uuid primary key default extensions.gen_random_uuid(),
  slug            public.url_slug not null unique,
  category_id     uuid        references support.ticket_categories (id) on delete set null,
  audience        text        not null default 'CUSTOMER'
                    check (audience in ('CUSTOMER', 'SELLER', 'DELIVERY', 'ALL')),
  title           text        not null,
  -- Sanitised HTML; see SECURITY_MODEL §7.
  body_html       text        not null,
  summary         text,
  locale          public.locale_code not null default 'en-IN',
  tags            text[]      not null default '{}',
  display_order   smallint    not null default 100,
  view_count      integer     not null default 0,
  helpful_count   integer     not null default 0,
  not_helpful_count integer   not null default 0,
  status          text        not null default 'DRAFT'
                    check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  seo_title       text,
  seo_description text,
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index help_articles_published_idx on support.help_articles (audience, display_order)
  where status = 'PUBLISHED';
create index help_articles_search_idx on support.help_articles using gin (title extensions.gin_trgm_ops);

create trigger help_articles_set_updated_at
  before update on support.help_articles
  for each row execute function private.set_updated_at();

-- Complete the deferred reference from finance.
alter table finance.financial_adjustments
  add constraint financial_adjustments_ticket_fk
  foreign key (support_ticket_id) references support.support_tickets (id) on delete set null;
