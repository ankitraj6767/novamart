-- =============================================================================
-- NovaMart — 0008 Seller: businesses, seller users, KYC, bank, tax, warehouses
--
-- Onboarding lifecycle (brief §43):
--   DRAFT → DOCUMENTS_PENDING → UNDER_REVIEW → {ACTION_REQUIRED | APPROVED | REJECTED}
--   APPROVED → {SUSPENDED | BLOCKED} → APPROVED
-- A seller may only hold active listings while APPROVED.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- seller.sellers
-- -----------------------------------------------------------------------------
create table seller.sellers (
  id                    uuid primary key default extensions.gen_random_uuid(),
  -- Human-facing seller code (SL100001) used in support and seller communications.
  seller_code           text        not null unique,

  -- Storefront identity, shown to customers.
  display_name          text        not null check (length(trim(display_name)) between 3 and 120),
  slug                  public.url_slug not null unique,
  logo_url              text,
  about                 text,

  -- Registered legal entity, used on invoices. Distinct from display_name.
  legal_name            text        not null check (length(trim(legal_name)) between 3 and 200),
  business_type         text        not null
                          check (business_type in ('SOLE_PROPRIETORSHIP', 'PARTNERSHIP', 'LLP',
                                                    'PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'HUF',
                                                    'TRUST', 'SOCIETY', 'INDIVIDUAL')),
  registered_address_line1 text,
  registered_address_line2 text,
  registered_city       text,
  registered_state_code text        references fulfillment.states (code) on delete restrict,
  registered_pincode    public.indian_pincode,

  primary_contact_name  text        not null,
  primary_contact_email public.email_address not null,
  primary_contact_phone public.phone_e164 not null,
  support_email         public.email_address,
  support_phone         public.phone_e164,

  status                text        not null default 'DRAFT'
                          check (status in ('DRAFT', 'DOCUMENTS_PENDING', 'UNDER_REVIEW',
                                            'ACTION_REQUIRED', 'APPROVED', 'REJECTED',
                                            'SUSPENDED', 'BLOCKED', 'CLOSED')),
  status_reason         text,
  status_changed_at     timestamptz,
  status_changed_by     uuid        references identity.profiles (id) on delete set null,
  approved_at           timestamptz,
  approved_by           uuid        references identity.profiles (id) on delete set null,

  -- Which fulfilment models this seller is enabled for (brief §82).
  fulfillment_models    text[]      not null default '{SELLER_FULFILLED}'
                          check (fulfillment_models <@ ARRAY['SELLER_FULFILLED', 'NOVAMART_FULFILLED',
                                                              'WAREHOUSE_FULFILLED', 'DROPSHIP']
                                 and array_length(fulfillment_models, 1) >= 1),

  -- Commission override; NULL means fall back to category/platform rules.
  default_commission_percentage public.percentage,

  -- Operational commitments. Breaching these feeds the seller score.
  dispatch_sla_hours    smallint    not null default 48 check (dispatch_sla_hours between 2 and 168),
  -- Seller-declared holiday/vacation window: listings stay visible but undeliverable.
  vacation_from         date,
  vacation_to           date,

  -- Rolling performance snapshot. seller.seller_performance holds the detail.
  rating                numeric(3, 2) check (rating is null or rating between 0 and 5),
  rating_count          integer     not null default 0 check (rating_count >= 0),
  seller_score          numeric(5, 2) check (seller_score is null or seller_score between 0 and 100),

  -- Settlement configuration.
  settlement_cycle      text        not null default 'WEEKLY'
                          check (settlement_cycle in ('DAILY', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY')),
  settlement_hold_days  smallint    not null default 7 check (settlement_hold_days between 0 and 45),

  agreement_accepted_at timestamptz,
  agreement_version     text,

  onboarding_step       text        not null default 'BUSINESS_DETAILS'
                          check (onboarding_step in ('BUSINESS_DETAILS', 'TAX_DETAILS', 'BANK_DETAILS',
                                                      'PICKUP_ADDRESS', 'DOCUMENTS', 'AGREEMENT', 'COMPLETE')),

  created_by            uuid        references identity.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint sellers_status_reason_present
    check (status in ('DRAFT', 'APPROVED') or status_reason is not null),
  constraint sellers_approved_fields
    check (status <> 'APPROVED' or (approved_at is not null and agreement_accepted_at is not null)),
  constraint sellers_vacation_range
    check (vacation_from is null or vacation_to is null or vacation_to >= vacation_from)
);

comment on table seller.sellers is
  'Seller businesses. Listings are sellable only while status = APPROVED and not on vacation.';
comment on column seller.sellers.fulfillment_models is
  'Fulfilment models the seller is enabled for. Drives warehouse allocation and commission rules.';

create index sellers_status_idx        on seller.sellers (status);
create index sellers_pending_review_idx on seller.sellers (created_at)
  where status in ('UNDER_REVIEW', 'DOCUMENTS_PENDING', 'ACTION_REQUIRED');
create index sellers_state_idx         on seller.sellers (registered_state_code);
create index sellers_score_idx         on seller.sellers (seller_score desc nulls last) where status = 'APPROVED';
create index sellers_name_trgm_idx     on seller.sellers using gin (display_name extensions.gin_trgm_ops);
create index sellers_legal_name_trgm_idx on seller.sellers using gin (legal_name extensions.gin_trgm_ops);

create trigger sellers_set_updated_at
  before update on seller.sellers
  for each row execute function private.set_updated_at();

-- Assign the seller code on insert so callers never have to.
create or replace function seller.assign_seller_code()
returns trigger
language plpgsql
set search_path = seller, private, pg_catalog
as $$
begin
  if new.seller_code is null then
    new.seller_code := 'SL' || lpad(nextval('private.seller_reference_seq')::text, 6, '0');
  end if;
  if new.slug is null then
    new.slug := private.slugify(new.display_name);
  end if;
  return new;
end;
$$;

create trigger sellers_assign_code
  before insert on seller.sellers
  for each row execute function seller.assign_seller_code();

-- Note: NOT NULL on seller_code/slug is checked after BEFORE-INSERT triggers run,
-- so callers may omit both and the trigger fills them.

-- -----------------------------------------------------------------------------
-- seller.seller_status_history — append-only lifecycle trail
-- -----------------------------------------------------------------------------
create table seller.seller_status_history (
  id           uuid primary key default private.uuid_generate_v7(),
  seller_id    uuid        not null references seller.sellers (id) on delete cascade,
  from_status  text,
  to_status    text        not null,
  reason       text,
  -- Checklist of what the reviewer verified, for regulatory defensibility.
  review_notes jsonb       not null default '{}'::jsonb,
  changed_by   uuid        references identity.profiles (id) on delete set null,
  occurred_at  timestamptz not null default now()
);

create index seller_status_history_seller_idx on seller.seller_status_history (seller_id, occurred_at desc);

create trigger seller_status_history_append_only
  before update or delete on seller.seller_status_history
  for each row execute function private.prevent_mutation();

-- Record every status change automatically: no code path can skip the trail.
create or replace function seller.record_status_change()
returns trigger
language plpgsql
set search_path = seller, private, pg_catalog
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into seller.seller_status_history (seller_id, from_status, to_status, reason, changed_by)
    values (new.id,
            case when tg_op = 'INSERT' then null else old.status end,
            new.status, new.status_reason,
            coalesce(new.status_changed_by, private.current_actor_id()));
  end if;
  return new;
end;
$$;

create trigger sellers_record_status_change
  after insert or update of status on seller.sellers
  for each row execute function seller.record_status_change();

-- -----------------------------------------------------------------------------
-- seller.seller_users — which principals may act for which seller.
-- The role grant itself lives in identity.user_roles (scope_type='seller').
-- This table carries the membership/invitation lifecycle.
-- -----------------------------------------------------------------------------
create table seller.seller_users (
  id            uuid primary key default extensions.gen_random_uuid(),
  seller_id     uuid        not null references seller.sellers (id) on delete cascade,
  user_id       uuid        references identity.profiles (id) on delete cascade,
  -- Invitations exist before the invitee has an account.
  invited_email public.email_address,
  invited_phone public.phone_e164,
  role_code     text        not null
                  check (role_code in ('SELLER_OWNER', 'SELLER_ADMIN', 'SELLER_CATALOG_MANAGER',
                                        'SELLER_ORDER_MANAGER', 'SELLER_FINANCE_MANAGER')),
  status        text        not null default 'INVITED'
                  check (status in ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED')),
  -- Hash of the invitation token; the raw token is emailed and never stored.
  invite_token_hash text,
  invite_expires_at timestamptz,
  invited_by    uuid        references identity.profiles (id) on delete set null,
  accepted_at   timestamptz,
  removed_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint seller_users_identity_present
    check (user_id is not null or invited_email is not null or invited_phone is not null),
  constraint seller_users_active_has_user
    check (status <> 'ACTIVE' or user_id is not null)
);

create unique index seller_users_member_unique_idx
  on seller.seller_users (seller_id, user_id)
  where user_id is not null and status <> 'REMOVED';
create unique index seller_users_invite_unique_idx
  on seller.seller_users (seller_id, invited_email)
  where invited_email is not null and status = 'INVITED';
create index seller_users_user_idx  on seller.seller_users (user_id) where status = 'ACTIVE';
create index seller_users_seller_idx on seller.seller_users (seller_id) where status <> 'REMOVED';

-- Exactly one owner per seller: the accountable party for finance and agreements.
create unique index seller_users_single_owner_idx
  on seller.seller_users (seller_id)
  where role_code = 'SELLER_OWNER' and status = 'ACTIVE';

create trigger seller_users_set_updated_at
  before update on seller.seller_users
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- seller.seller_documents — KYC. Storage paths point at kyc-private only.
-- Document numbers are stored encrypted; only a masked form is ever displayed.
-- -----------------------------------------------------------------------------
create table seller.seller_documents (
  id                 uuid primary key default extensions.gen_random_uuid(),
  seller_id          uuid        not null references seller.sellers (id) on delete cascade,
  document_type      text        not null
                       check (document_type in ('PAN_CARD', 'GST_CERTIFICATE', 'AADHAAR',
                                                 'CANCELLED_CHEQUE', 'BANK_STATEMENT',
                                                 'INCORPORATION_CERTIFICATE', 'PARTNERSHIP_DEED',
                                                 'ADDRESS_PROOF', 'TRADEMARK_CERTIFICATE',
                                                 'BRAND_AUTHORISATION', 'FSSAI_LICENSE',
                                                 'BIS_CERTIFICATE', 'SIGNATURE', 'OTHER')),
  -- Supabase Storage object path. MUST be inside a private bucket.
  storage_bucket     text        not null default 'kyc-private'
                       check (storage_bucket in ('kyc-private', 'documents-private')),
  storage_path        text        not null,
  original_filename   text,
  mime_type           text        not null
                       check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  file_size_bytes     integer     not null check (file_size_bytes between 1 and 10485760),
  -- SHA-256 of the file: detects re-uploads of the same forged document across sellers.
  content_hash        text        not null,

  -- Encrypted document number (pgcrypto, key held outside the database).
  document_number_encrypted bytea,
  -- Display-safe masked value, e.g. 'ABCDE****F'.
  document_number_masked    text,

  verification_status text        not null default 'PENDING'
                       check (verification_status in ('PENDING', 'IN_REVIEW', 'VERIFIED',
                                                       'REJECTED', 'EXPIRED', 'RESUBMIT_REQUESTED')),
  rejection_reason    text,
  verified_by         uuid        references identity.profiles (id) on delete set null,
  verified_at         timestamptz,
  -- Third-party verification result (NSDL PAN, GST portal) without the raw response.
  external_verification jsonb    not null default '{}'::jsonb,
  expires_at          date,

  uploaded_by         uuid        references identity.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint seller_documents_rejection_reason
    check (verification_status <> 'REJECTED' or rejection_reason is not null),
  constraint seller_documents_verified_fields
    check (verification_status <> 'VERIFIED' or (verified_by is not null and verified_at is not null))
);

comment on table seller.seller_documents is
  'KYC documents. Objects live only in private buckets; access is logged in audit.data_access_logs.';

-- One active document per type per seller; superseded versions are kept.
create unique index seller_documents_active_type_idx
  on seller.seller_documents (seller_id, document_type)
  where verification_status in ('PENDING', 'IN_REVIEW', 'VERIFIED');
create index seller_documents_seller_idx on seller.seller_documents (seller_id);
create index seller_documents_queue_idx  on seller.seller_documents (created_at)
  where verification_status in ('PENDING', 'IN_REVIEW');
-- Same file uploaded by different sellers is a fraud signal.
create index seller_documents_hash_idx   on seller.seller_documents (content_hash);
create index seller_documents_expiry_idx on seller.seller_documents (expires_at)
  where expires_at is not null and verification_status = 'VERIFIED';

create trigger seller_documents_set_updated_at
  before update on seller.seller_documents
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- seller.seller_tax_profiles — GST/PAN. Drives invoice generation and TCS.
-- -----------------------------------------------------------------------------
create table seller.seller_tax_profiles (
  seller_id           uuid primary key references seller.sellers (id) on delete cascade,
  pan                 public.pan_number not null,
  gstin               public.gstin,
  -- Sellers below the GST threshold, or composition dealers, invoice differently.
  gst_registration_type text      not null default 'REGULAR'
                          check (gst_registration_type in ('REGULAR', 'COMPOSITION', 'UNREGISTERED', 'EXEMPT')),
  -- Place of business state; determines CGST/SGST vs IGST against the customer.
  gst_state_code      text        not null references fulfillment.states (gst_state_code) on delete restrict,
  legal_name_as_per_pan text      not null,
  trade_name_as_per_gst text,
  -- Additional GSTINs where the seller ships from multiple states.
  additional_gstins   jsonb       not null default '[]'::jsonb,
  tan                 text,
  -- Tax collected at source under section 194-O.
  tcs_applicable      boolean     not null default true,
  pan_verified_at     timestamptz,
  gstin_verified_at   timestamptz,
  verification_source jsonb       not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint seller_tax_gstin_required
    check (gst_registration_type in ('UNREGISTERED', 'EXEMPT') or gstin is not null),
  -- The GSTIN must embed the declared state code and PAN. Catches typos and forgeries.
  constraint seller_tax_gstin_matches_state
    check (gstin is null or substring(gstin::text from 1 for 2) = gst_state_code),
  constraint seller_tax_gstin_matches_pan
    check (gstin is null or substring(gstin::text from 3 for 10) = pan::text)
);

comment on constraint seller_tax_gstin_matches_pan on seller.seller_tax_profiles is
  'A GSTIN embeds the PAN at characters 3-12. Mismatch means the data is wrong or forged.';

create unique index seller_tax_pan_idx   on seller.seller_tax_profiles (pan);
create unique index seller_tax_gstin_idx on seller.seller_tax_profiles (gstin) where gstin is not null;

create trigger seller_tax_profiles_set_updated_at
  before update on seller.seller_tax_profiles
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- seller.seller_bank_accounts — payout destinations.
-- Account numbers are encrypted; only last4 is displayed anywhere.
-- -----------------------------------------------------------------------------
create table seller.seller_bank_accounts (
  id                       uuid primary key default extensions.gen_random_uuid(),
  seller_id                uuid        not null references seller.sellers (id) on delete cascade,
  account_holder_name      text        not null,
  account_number_encrypted bytea       not null,
  account_number_last4     text        not null check (account_number_last4 ~ '^[0-9]{4}$'),
  -- Deterministic HMAC used only to detect duplicate accounts across sellers.
  account_number_hash      text        not null,
  ifsc                     public.ifsc_code not null,
  bank_name                text        not null,
  branch_name              text,
  account_type             text        not null default 'CURRENT'
                             check (account_type in ('SAVINGS', 'CURRENT')),
  upi_vpa                  text,

  is_primary               boolean     not null default false,
  verification_status      text        not null default 'PENDING'
                             check (verification_status in ('PENDING', 'IN_PROGRESS', 'VERIFIED',
                                                             'FAILED', 'REJECTED')),
  -- Penny-drop verification outcome, minus any sensitive payload.
  verification_method      text
                             check (verification_method in ('PENNY_DROP', 'DOCUMENT', 'MANUAL')),
  verification_reference   text,
  verification_response    jsonb       not null default '{}'::jsonb,
  -- Name returned by the bank; a mismatch against PAN name blocks payouts.
  verified_holder_name     text,
  name_match_score         numeric(5, 2),
  verified_at              timestamptz,
  failure_reason           text,

  deleted_at               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint seller_bank_verified_fields
    check (verification_status <> 'VERIFIED' or verified_at is not null)
);

comment on column seller.seller_bank_accounts.account_number_hash is
  'HMAC of the account number. Used only to detect the same bank account across multiple sellers (fraud signal).';

-- One primary account per seller; payouts only ever target the primary.
create unique index seller_bank_primary_idx
  on seller.seller_bank_accounts (seller_id)
  where is_primary and deleted_at is null;
create index seller_bank_seller_idx on seller.seller_bank_accounts (seller_id) where deleted_at is null;
create index seller_bank_hash_idx   on seller.seller_bank_accounts (account_number_hash) where deleted_at is null;
create index seller_bank_queue_idx  on seller.seller_bank_accounts (created_at)
  where verification_status in ('PENDING', 'IN_PROGRESS');

create trigger seller_bank_accounts_set_updated_at
  before update on seller.seller_bank_accounts
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- seller.seller_performance — rolling metrics projection, rebuilt by a worker.
-- Read by the Buy Box engine, seller scorecards and admin risk views.
-- -----------------------------------------------------------------------------
create table seller.seller_performance (
  seller_id                  uuid primary key references seller.sellers (id) on delete cascade,
  window_days                smallint    not null default 30,

  orders_count                integer    not null default 0,
  units_sold                  integer    not null default 0,
  gmv_paise                   public.paise not null default 0,

  -- The metrics that actually decide Buy Box position and seller standing.
  on_time_dispatch_rate       public.percentage,
  on_time_delivery_rate       public.percentage,
  seller_cancellation_rate    public.percentage,
  return_rate                 public.percentage,
  rto_rate                    public.percentage,
  defect_rate                 public.percentage,
  average_dispatch_hours      numeric(6, 2),
  average_rating              numeric(3, 2),
  negative_feedback_rate      public.percentage,
  support_escalation_rate     public.percentage,

  -- Composite 0..100 score derived from the rates above by the scoring worker.
  score                       numeric(5, 2) check (score is null or score between 0 and 100),
  tier                        text not null default 'NEW'
                                check (tier in ('NEW', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'AT_RISK')),

  computed_at                 timestamptz not null default now(),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index seller_performance_score_idx on seller.seller_performance (score desc nulls last);
create index seller_performance_tier_idx  on seller.seller_performance (tier);

create trigger seller_performance_set_updated_at
  before update on seller.seller_performance
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Is this seller allowed to transact right now? Single predicate reused by the
-- sellable-listing view, checkout validation and the Buy Box engine.
-- -----------------------------------------------------------------------------
create or replace function seller.is_transactable(p_seller_id uuid)
returns boolean
language sql
stable
set search_path = seller, pg_catalog
as $$
  select exists (
    select 1
      from seller.sellers s
     where s.id = p_seller_id
       and s.status = 'APPROVED'
       and (s.vacation_from is null or s.vacation_to is null
            or current_date not between s.vacation_from and s.vacation_to)
  );
$$;

comment on function seller.is_transactable(uuid) is
  'True when the seller is APPROVED and not on vacation. Reused by listings, checkout and Buy Box.';
