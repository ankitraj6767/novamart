-- =============================================================================
-- NovaMart — 0015 Payments: intents, attempts, transactions, webhook events,
--                  refunds, reconciliation, COD decisions
--
-- Rules encoded here:
--   * Card numbers are NEVER stored. Provider tokens and last4 only.
--   * A payment is successful only when a verified server-side provider state says
--     so (webhook or server fetch). Frontend callbacks are advisory (brief §33).
--   * Webhook idempotency is a UNIQUE constraint, not application logic (brief §34).
--   * Refunds can never exceed the captured amount (enforced by trigger + CHECK).
-- No client role has any access to this schema.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- payments.payment_intents — one per attempt to collect for an order.
-- A retried payment creates a new attempt, not a new intent.
-- -----------------------------------------------------------------------------
create table payments.payment_intents (
  id                    uuid primary key default private.uuid_generate_v7(),
  order_id              uuid        not null references commerce.orders (id) on delete restrict,
  user_id               uuid        not null references identity.profiles (id) on delete restrict,
  checkout_session_id   uuid        references commerce.checkout_sessions (id) on delete set null,

  provider              text        not null
                          check (provider in ('RAZORPAY', 'CASHFREE', 'COD', 'MOCK')),
  -- Provider's order/intent identifier.
  provider_intent_id    text,

  currency              public.currency_code not null default 'INR',
  -- The authoritative amount. Any provider event reporting a different amount is
  -- quarantined rather than trusted.
  amount_paise          public.paise not null check (amount_paise > 0),
  captured_paise        public.paise not null default 0 check (captured_paise >= 0),
  refunded_paise        public.paise not null default 0 check (refunded_paise >= 0),

  payment_method        text        not null
                          check (payment_method in ('UPI', 'CARD', 'NET_BANKING', 'WALLET',
                                                    'EMI', 'COD', 'PAY_LATER', 'GIFT_CARD')),

  status                text        not null default 'CREATED'
                          check (status in ('CREATED', 'PENDING', 'AUTHORISED', 'CAPTURED',
                                            'PARTIALLY_CAPTURED', 'FAILED', 'CANCELLED',
                                            'EXPIRED', 'REFUNDED', 'PARTIALLY_REFUNDED',
                                            'PENDING_COD', 'COD_COLLECTED')),
  failure_code          text,
  failure_reason        text,

  -- Applied bank offer, retained so the discount can be reconciled against the
  -- bank's settlement file.
  bank_offer_id         uuid        references pricing.bank_offers (id) on delete set null,
  bank_offer_discount_paise public.paise not null default 0,

  idempotency_key       text,
  -- Client-facing session token/URL, never a secret.
  client_session        jsonb       not null default '{}'::jsonb,

  expires_at            timestamptz,
  authorised_at         timestamptz,
  captured_at           timestamptz,
  failed_at             timestamptz,
  request_id            text,
  trace_id              text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint payment_intents_capture_within_amount check (captured_paise <= amount_paise),
  constraint payment_intents_refund_within_capture check (refunded_paise <= captured_paise),
  constraint payment_intents_failure_fields
    check (status <> 'FAILED' or failure_code is not null),
  constraint payment_intents_cod_provider
    check ((payment_method = 'COD') = (provider = 'COD'))
);

comment on table payments.payment_intents is
  'One intent per collection attempt for an order. amount_paise is authoritative; provider events must match it.';

create unique index payment_intents_provider_idx on payments.payment_intents (provider, provider_intent_id)
  where provider_intent_id is not null;
create unique index payment_intents_idempotency_idx on payments.payment_intents (idempotency_key)
  where idempotency_key is not null;
create index payment_intents_order_idx  on payments.payment_intents (order_id, created_at desc);
create index payment_intents_user_idx   on payments.payment_intents (user_id, created_at desc);
create index payment_intents_status_idx on payments.payment_intents (status, created_at desc);
-- Reconciliation sweeper: intents left hanging.
create index payment_intents_stale_idx  on payments.payment_intents (created_at)
  where status in ('CREATED', 'PENDING', 'AUTHORISED');

create trigger payment_intents_set_updated_at
  before update on payments.payment_intents
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- payments.payment_attempts — one per user-visible try (UPI collect, card submit).
-- Keeping attempts separate from intents is what makes "payment failed, try again"
-- auditable rather than a mutated row.
-- -----------------------------------------------------------------------------
create table payments.payment_attempts (
  id                    uuid primary key default private.uuid_generate_v7(),
  payment_intent_id     uuid        not null references payments.payment_intents (id) on delete restrict,
  order_id              uuid        not null references commerce.orders (id) on delete restrict,
  attempt_number        smallint    not null check (attempt_number > 0),

  provider              text        not null,
  provider_payment_id   text,
  provider_reference    text,

  payment_method        text        not null,
  -- Instrument metadata that is safe to retain. NO card number, NO CVV, ever.
  instrument_type       text        check (instrument_type in ('UPI_INTENT', 'UPI_COLLECT', 'UPI_QR',
                                                               'CREDIT_CARD', 'DEBIT_CARD', 'PREPAID_CARD',
                                                               'NET_BANKING', 'WALLET', 'EMI',
                                                               'CARDLESS_EMI', 'PAY_LATER', 'COD')),
  card_network          text        check (card_network in ('VISA', 'MASTERCARD', 'RUPAY', 'AMEX',
                                                            'DINERS', 'DISCOVER', 'MAESTRO')),
  card_last4            text        check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  card_issuer           text,
  -- Provider-issued token for saved instruments. An opaque reference, not a PAN.
  instrument_token      text,
  upi_vpa_masked        text,
  bank_code             text,
  wallet_provider       text,
  emi_tenure_months     smallint,

  amount_paise          public.paise not null check (amount_paise > 0),
  status                text        not null default 'INITIATED'
                          check (status in ('INITIATED', 'PENDING', 'AUTHORISED', 'CAPTURED',
                                            'FAILED', 'CANCELLED', 'TIMED_OUT')),
  -- Provider error taxonomy, retained verbatim for support and provider disputes.
  provider_error_code   text,
  provider_error_description text,
  -- Whether the failure is worth retrying (issuer decline vs network timeout).
  is_retryable          boolean,

  -- How we learned the outcome. Frontend callbacks never decide success on their own.
  outcome_source        text        check (outcome_source in ('WEBHOOK', 'SERVER_FETCH',
                                                              'CLIENT_CALLBACK', 'RECONCILIATION')),
  verified_at           timestamptz,

  initiated_at          timestamptz not null default now(),
  completed_at          timestamptz,
  ip_address            inet,
  user_agent            text,
  request_id            text,
  trace_id              text,

  unique (payment_intent_id, attempt_number),
  -- A captured attempt must have been verified server-side.
  constraint payment_attempts_capture_verified
    check (status <> 'CAPTURED' or (outcome_source in ('WEBHOOK', 'SERVER_FETCH', 'RECONCILIATION')
                                    and verified_at is not null))
);

comment on constraint payment_attempts_capture_verified on payments.payment_attempts is
  'A capture must originate from a verified server-side source. Client callbacks alone can never mark money received.';

create unique index payment_attempts_provider_payment_idx
  on payments.payment_attempts (provider, provider_payment_id)
  where provider_payment_id is not null;
create index payment_attempts_intent_idx on payments.payment_attempts (payment_intent_id, attempt_number);
create index payment_attempts_order_idx  on payments.payment_attempts (order_id, initiated_at desc);
create index payment_attempts_status_idx on payments.payment_attempts (status, initiated_at desc);
create index payment_attempts_token_idx  on payments.payment_attempts (instrument_token)
  where instrument_token is not null;

-- -----------------------------------------------------------------------------
-- payments.payment_transactions — immutable financial event log.
-- Everything that moved money, in the order it happened.
-- -----------------------------------------------------------------------------
create table payments.payment_transactions (
  id                    uuid primary key default private.uuid_generate_v7(),
  payment_intent_id     uuid        not null references payments.payment_intents (id) on delete restrict,
  payment_attempt_id    uuid        references payments.payment_attempts (id) on delete restrict,
  order_id              uuid        not null references commerce.orders (id) on delete restrict,

  transaction_type      text        not null
                          check (transaction_type in ('AUTHORISATION', 'CAPTURE', 'VOID', 'REFUND',
                                                       'CHARGEBACK', 'CHARGEBACK_REVERSAL',
                                                       'COD_COLLECTION', 'SETTLEMENT_CREDIT')),
  provider              text        not null,
  provider_transaction_id text,
  currency              public.currency_code not null default 'INR',
  -- Signed: captures are positive, refunds and chargebacks negative.
  amount_paise          public.paise not null,
  -- Provider's own fee and tax on this transaction, needed for reconciliation.
  provider_fee_paise    public.paise not null default 0,
  provider_tax_paise    public.paise not null default 0,
  net_amount_paise      public.paise,

  status                text        not null
                          check (status in ('SUCCESS', 'FAILED', 'PENDING')),
  -- Raw provider payload with secrets stripped, for dispute evidence.
  provider_payload      jsonb       not null default '{}'::jsonb,
  -- The webhook or fetch that produced this record.
  source_event_id       uuid,
  occurred_at           timestamptz not null default now(),
  recorded_at           timestamptz not null default now(),

  constraint payment_transactions_amount_sign check (
    (transaction_type in ('REFUND', 'CHARGEBACK', 'VOID') and amount_paise <= 0)
 or (transaction_type not in ('REFUND', 'CHARGEBACK', 'VOID') and amount_paise >= 0)
  )
);

comment on table payments.payment_transactions is
  'Immutable money-movement log. Signed amounts: captures positive, refunds and chargebacks negative.';

create index payment_transactions_intent_idx on payments.payment_transactions (payment_intent_id, occurred_at);
create index payment_transactions_order_idx  on payments.payment_transactions (order_id, occurred_at);
create index payment_transactions_type_idx   on payments.payment_transactions (transaction_type, occurred_at desc);
create unique index payment_transactions_provider_idx
  on payments.payment_transactions (provider, provider_transaction_id, transaction_type)
  where provider_transaction_id is not null;

create trigger payment_transactions_append_only
  before update or delete on payments.payment_transactions
  for each row execute function private.prevent_mutation();

-- -----------------------------------------------------------------------------
-- payments.payment_webhook_events — the idempotency boundary (brief §34).
--
-- UNIQUE (provider, provider_event_id) means the same webhook delivered five times
-- is inserted once. Duplicate deliveries hit the constraint and are acknowledged
-- without reprocessing.
-- -----------------------------------------------------------------------------
create table payments.payment_webhook_events (
  id                    uuid primary key default private.uuid_generate_v7(),
  provider              text        not null,
  -- The provider's event identifier. This is the deduplication key.
  provider_event_id     text        not null,
  event_type            text        not null,

  provider_payment_id   text,
  provider_order_id     text,
  provider_refund_id    text,
  payment_intent_id     uuid        references payments.payment_intents (id) on delete set null,
  order_id              uuid        references commerce.orders (id) on delete set null,

  -- Signature verification result. An event is never processed unverified.
  signature_verified    boolean     not null default false,
  signature_header      text,
  -- Raw body retained for re-verification and dispute evidence.
  raw_payload           jsonb       not null,
  -- Amount reported by the provider, compared against the intent before acting.
  reported_amount_paise public.paise,
  amount_matched        boolean,

  processing_status     text        not null default 'RECEIVED'
                          check (processing_status in ('RECEIVED', 'PROCESSING', 'PROCESSED',
                                                        'IGNORED', 'FAILED', 'QUARANTINED')),
  processing_attempts   smallint    not null default 0,
  processing_error      text,
  processed_at          timestamptz,

  received_at           timestamptz not null default now(),
  -- Provider-side event timestamp, used for skew rejection and ordering.
  provider_timestamp    timestamptz,

  unique (provider, provider_event_id)
);

comment on table payments.payment_webhook_events is
  'Webhook ingress log. UNIQUE (provider, provider_event_id) is the idempotency guarantee (brief §34).';
comment on column payments.payment_webhook_events.amount_matched is
  'False means the provider reported a different amount than the intent: quarantine and alert, never trust.';

create index payment_webhook_events_status_idx  on payments.payment_webhook_events (processing_status, received_at)
  where processing_status in ('RECEIVED', 'PROCESSING', 'FAILED');
create index payment_webhook_events_intent_idx  on payments.payment_webhook_events (payment_intent_id)
  where payment_intent_id is not null;
create index payment_webhook_events_order_idx   on payments.payment_webhook_events (order_id)
  where order_id is not null;
create index payment_webhook_events_received_idx on payments.payment_webhook_events (received_at desc);
create index payment_webhook_events_quarantine_idx on payments.payment_webhook_events (received_at desc)
  where processing_status = 'QUARANTINED';

-- Payload and identity are immutable; only processing bookkeeping may change.
create trigger payment_webhook_events_immutable
  before update on payments.payment_webhook_events
  for each row execute function private.allow_only_columns(
    '{processing_status,processing_attempts,processing_error,processed_at,payment_intent_id,order_id,amount_matched}'
  );

create trigger payment_webhook_events_no_delete
  before delete on payments.payment_webhook_events
  for each row execute function private.prevent_delete();

-- -----------------------------------------------------------------------------
-- payments.refunds — one per refund decision (brief §35)
-- -----------------------------------------------------------------------------
create table payments.refunds (
  id                    uuid primary key default private.uuid_generate_v7(),
  refund_reference      text        not null unique,
  payment_intent_id     uuid        not null references payments.payment_intents (id) on delete restrict,
  order_id              uuid        not null references commerce.orders (id) on delete restrict,
  -- Item-level refunds are the norm in a multi-seller order.
  order_item_id         uuid        references commerce.order_items (id) on delete restrict,
  return_request_id     uuid,
  user_id               uuid        not null references identity.profiles (id) on delete restrict,

  refund_type           text        not null
                          check (refund_type in ('FULL', 'PARTIAL', 'ITEM_CANCELLATION',
                                                  'ITEM_RETURN', 'SHIPPING_ONLY', 'GOODWILL',
                                                  'FAILED_FULFILMENT', 'RTO', 'LOST_IN_TRANSIT',
                                                  'PRICE_ADJUSTMENT')),
  reason_code           text        not null,
  reason_notes          text,

  currency              public.currency_code not null default 'INR',
  amount_paise          public.paise not null check (amount_paise > 0),
  -- Breakdown so the customer sees exactly what is coming back.
  item_amount_paise     public.paise not null default 0,
  shipping_amount_paise public.paise not null default 0,
  tax_amount_paise      public.paise not null default 0,

  -- Where the money goes. COD orders have no original instrument to reverse to.
  refund_mode           text        not null default 'ORIGINAL_INSTRUMENT'
                          check (refund_mode in ('ORIGINAL_INSTRUMENT', 'BANK_TRANSFER',
                                                  'UPI', 'WALLET_CREDIT', 'GIFT_CARD')),
  -- For COD refunds: verified bank details supplied by the customer.
  beneficiary_details   jsonb,

  status                text        not null default 'PENDING'
                          check (status in ('PENDING', 'APPROVAL_REQUIRED', 'APPROVED', 'PROCESSING',
                                            'COMPLETED', 'FAILED', 'CANCELLED')),
  -- Refunds above a configurable threshold need explicit approval.
  requires_approval     boolean     not null default false,
  approved_by           uuid        references identity.profiles (id) on delete set null,
  approved_at           timestamptz,
  rejection_reason      text,

  -- Who absorbs the refund: reversed from the seller's ledger, or platform-funded.
  borne_by              text        not null default 'SELLER'
                          check (borne_by in ('SELLER', 'PLATFORM', 'CARRIER', 'SHARED')),

  initiated_by          uuid        references identity.profiles (id) on delete set null,
  initiated_by_type     text        not null default 'SYSTEM'
                          check (initiated_by_type in ('CUSTOMER', 'SELLER', 'SUPPORT', 'SYSTEM')),
  idempotency_key       text,

  -- Expected credit date communicated to the customer.
  expected_completion_date date,
  completed_at          timestamptz,
  failed_at             timestamptz,
  failure_code          text,
  failure_reason        text,

  request_id            text,
  trace_id              text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint refunds_amount_components check (
    amount_paise = item_amount_paise + shipping_amount_paise
    or item_amount_paise = 0
  ),
  constraint refunds_approval_fields
    check (status <> 'APPROVED' or (approved_by is not null and approved_at is not null)),
  constraint refunds_failure_fields check (status <> 'FAILED' or failure_code is not null),
  constraint refunds_cod_needs_beneficiary
    check (refund_mode <> 'BANK_TRANSFER' or beneficiary_details is not null)
);

comment on table payments.refunds is
  'Refund decisions. Every attempt is recorded separately in refund_attempts; provider status is reconciled.';

create unique index refunds_idempotency_idx on payments.refunds (idempotency_key)
  where idempotency_key is not null;
create index refunds_intent_idx   on payments.refunds (payment_intent_id, created_at desc);
create index refunds_order_idx    on payments.refunds (order_id, created_at desc);
create index refunds_item_idx     on payments.refunds (order_item_id) where order_item_id is not null;
create index refunds_user_idx     on payments.refunds (user_id, created_at desc);
create index refunds_status_idx   on payments.refunds (status, created_at desc);
create index refunds_approval_queue_idx on payments.refunds (created_at)
  where status = 'APPROVAL_REQUIRED';
create index refunds_stuck_idx    on payments.refunds (created_at)
  where status in ('APPROVED', 'PROCESSING');

create trigger refunds_set_updated_at
  before update on payments.refunds
  for each row execute function private.set_updated_at();

create or replace function payments.assign_refund_reference()
returns trigger
language plpgsql
set search_path = payments, private, pg_catalog
as $$
begin
  if new.refund_reference is null then
    new.refund_reference := 'RF' || lpad(nextval('private.payout_reference_seq')::text, 9, '0');
  end if;
  return new;
end;
$$;

create trigger refunds_assign_reference
  before insert on payments.refunds
  for each row execute function payments.assign_refund_reference();

-- -----------------------------------------------------------------------------
-- The guard that makes over-refunding impossible: the sum of live refunds for an
-- intent may never exceed what was captured. Checked under the intent's row lock.
-- -----------------------------------------------------------------------------
create or replace function payments.assert_refund_within_capture()
returns trigger
language plpgsql
set search_path = payments, pg_catalog
as $$
declare
  v_captured  public.paise;
  v_existing  public.paise;
begin
  -- Lock the intent so two concurrent refunds cannot both pass the check.
  select captured_paise into v_captured
    from payments.payment_intents
   where id = new.payment_intent_id
     for update;

  if v_captured is null then
    raise exception 'Payment intent % not found', new.payment_intent_id using errcode = 'foreign_key_violation';
  end if;

  select coalesce(sum(r.amount_paise), 0) into v_existing
    from payments.refunds r
   where r.payment_intent_id = new.payment_intent_id
     and r.status not in ('FAILED', 'CANCELLED')
     and (tg_op = 'INSERT' or r.id <> new.id);

  if v_existing + new.amount_paise > v_captured then
    raise exception
      'Refund of % would exceed captured amount % (already refunded %)',
      new.amount_paise, v_captured, v_existing
      using errcode = 'NM006', hint = 'REFUND_AMOUNT_EXCEEDS_CAPTURED';
  end if;

  -- Item-level guard: never refund more than the item's payable amount.
  if new.order_item_id is not null then
    if new.amount_paise > (
      select b.total_payable_paise - oi.refunded_paise
        from commerce.order_items oi
        join commerce.order_item_price_breakdowns b on b.order_item_id = oi.id
       where oi.id = new.order_item_id
    ) then
      raise exception 'Refund exceeds remaining refundable amount for item %', new.order_item_id
        using errcode = 'NM006', hint = 'REFUND_AMOUNT_EXCEEDS_CAPTURED';
    end if;
  end if;

  return new;
end;
$$;

create trigger refunds_assert_within_capture
  before insert or update of amount_paise on payments.refunds
  for each row execute function payments.assert_refund_within_capture();

-- -----------------------------------------------------------------------------
-- payments.refund_attempts — every provider call, including the failed ones.
-- -----------------------------------------------------------------------------
create table payments.refund_attempts (
  id                    uuid primary key default private.uuid_generate_v7(),
  refund_id             uuid        not null references payments.refunds (id) on delete restrict,
  attempt_number        smallint    not null check (attempt_number > 0),
  provider              text        not null,
  provider_refund_id    text,
  amount_paise          public.paise not null check (amount_paise > 0),
  status                text        not null default 'INITIATED'
                          check (status in ('INITIATED', 'PENDING', 'SUCCESS', 'FAILED')),
  provider_error_code   text,
  provider_error_description text,
  provider_payload      jsonb       not null default '{}'::jsonb,
  outcome_source        text        check (outcome_source in ('WEBHOOK', 'SERVER_FETCH', 'RECONCILIATION')),
  initiated_at          timestamptz not null default now(),
  completed_at          timestamptz,
  unique (refund_id, attempt_number)
);

create unique index refund_attempts_provider_idx on payments.refund_attempts (provider, provider_refund_id)
  where provider_refund_id is not null;
create index refund_attempts_refund_idx on payments.refund_attempts (refund_id, attempt_number);

-- -----------------------------------------------------------------------------
-- payments.saved_payment_instruments — tokenised instruments only.
-- RBI tokenisation rules require network/issuer tokens; NovaMart stores the token
-- reference and display metadata, never the PAN.
-- -----------------------------------------------------------------------------
create table payments.saved_payment_instruments (
  id                uuid primary key default extensions.gen_random_uuid(),
  user_id           uuid        not null references identity.profiles (id) on delete cascade,
  provider          text        not null,
  instrument_type   text        not null
                      check (instrument_type in ('CARD', 'UPI_VPA', 'WALLET', 'NET_BANKING')),
  -- Provider/network token. Opaque; useless without the provider's key.
  provider_token    text        not null,
  display_name      text,
  card_network      text,
  card_last4        text        check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  card_issuer       text,
  card_expiry_month smallint    check (card_expiry_month is null or card_expiry_month between 1 and 12),
  card_expiry_year  smallint    check (card_expiry_year is null or card_expiry_year between 2020 and 2100),
  upi_vpa_masked    text,
  is_default        boolean     not null default false,
  -- Explicit consent record, required for tokenisation.
  consent_given_at  timestamptz not null default now(),
  last_used_at      timestamptz,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  unique (user_id, provider, provider_token)
);

comment on table payments.saved_payment_instruments is
  'Tokenised instruments. Card numbers and CVVs are never stored, in any form.';

create unique index saved_instruments_default_idx on payments.saved_payment_instruments (user_id)
  where is_default and deleted_at is null;
create index saved_instruments_user_idx on payments.saved_payment_instruments (user_id)
  where deleted_at is null;

-- -----------------------------------------------------------------------------
-- payments.cod_eligibility_decisions — append-only record of COD engine output
-- (brief §36). Support must be able to explain why COD was refused.
-- -----------------------------------------------------------------------------
create table payments.cod_eligibility_decisions (
  id                  uuid primary key default private.uuid_generate_v7(),
  user_id             uuid        not null references identity.profiles (id) on delete cascade,
  checkout_session_id uuid        references commerce.checkout_sessions (id) on delete set null,
  order_id            uuid        references commerce.orders (id) on delete set null,

  decision            text        not null
                        check (decision in ('COD_ALLOWED', 'COD_BLOCKED', 'COD_PARTIAL_PREPAY')),
  prepay_amount_paise public.paise,
  -- Every signal the engine considered, with its contribution.
  signals             jsonb       not null default '{}'::jsonb,
  reason_codes        text[]      not null default '{}',
  risk_score          numeric(5, 2),

  cart_value_paise    public.paise not null,
  pincode             public.indian_pincode not null,
  decided_at          timestamptz not null default now(),

  constraint cod_decision_prepay_present
    check (decision <> 'COD_PARTIAL_PREPAY' or prepay_amount_paise is not null)
);

create index cod_decisions_user_idx    on payments.cod_eligibility_decisions (user_id, decided_at desc);
create index cod_decisions_session_idx on payments.cod_eligibility_decisions (checkout_session_id)
  where checkout_session_id is not null;
create index cod_decisions_blocked_idx on payments.cod_eligibility_decisions (decided_at desc)
  where decision <> 'COD_ALLOWED';

create trigger cod_decisions_append_only
  before update or delete on payments.cod_eligibility_decisions
  for each row execute function private.prevent_mutation();

-- -----------------------------------------------------------------------------
-- payments.payment_reconciliation — daily settlement-file matching.
-- The provider's file is the counterparty's truth; NovaMart's ledger is ours.
-- Differences are incidents, not rounding.
-- -----------------------------------------------------------------------------
create table payments.payment_reconciliation (
  id                     uuid primary key default private.uuid_generate_v7(),
  provider               text        not null,
  reconciliation_date    date        not null,
  -- Provider settlement/payout identifier the file belongs to.
  provider_settlement_id text,

  status                 text        not null default 'IN_PROGRESS'
                           check (status in ('IN_PROGRESS', 'MATCHED', 'DISCREPANCIES_FOUND',
                                              'RESOLVED', 'FAILED')),

  provider_transaction_count integer not null default 0,
  provider_gross_paise   public.paise not null default 0,
  provider_fee_paise     public.paise not null default 0,
  provider_net_paise     public.paise not null default 0,

  novamart_transaction_count integer not null default 0,
  novamart_gross_paise   public.paise not null default 0,

  matched_count          integer     not null default 0,
  unmatched_provider_count integer   not null default 0,
  unmatched_novamart_count integer   not null default 0,
  amount_variance_paise  public.paise not null default 0,

  source_file_path       text,
  notes                  text,
  resolved_by            uuid        references identity.profiles (id) on delete set null,
  resolved_at            timestamptz,
  started_at             timestamptz not null default now(),
  completed_at           timestamptz,
  unique (provider, reconciliation_date, provider_settlement_id)
);

create index payment_reconciliation_date_idx on payments.payment_reconciliation (reconciliation_date desc);
create index payment_reconciliation_open_idx on payments.payment_reconciliation (reconciliation_date desc)
  where status in ('IN_PROGRESS', 'DISCREPANCIES_FOUND');

create table payments.payment_reconciliation_items (
  id                     uuid primary key default private.uuid_generate_v7(),
  reconciliation_id      uuid        not null references payments.payment_reconciliation (id) on delete cascade,
  provider_payment_id    text,
  payment_intent_id      uuid        references payments.payment_intents (id) on delete set null,
  order_id               uuid        references commerce.orders (id) on delete set null,
  match_status           text        not null
                           check (match_status in ('MATCHED', 'AMOUNT_MISMATCH', 'MISSING_IN_NOVAMART',
                                                    'MISSING_AT_PROVIDER', 'STATUS_MISMATCH', 'DUPLICATE')),
  provider_amount_paise  public.paise,
  novamart_amount_paise  public.paise,
  variance_paise         public.paise,
  provider_status        text,
  novamart_status        text,
  provider_fee_paise     public.paise,
  resolution             text,
  resolved_at            timestamptz,
  created_at             timestamptz not null default now()
);

create index reconciliation_items_run_idx on payments.payment_reconciliation_items (reconciliation_id, match_status);
create index reconciliation_items_unmatched_idx on payments.payment_reconciliation_items (reconciliation_id)
  where match_status <> 'MATCHED';
create index reconciliation_items_intent_idx on payments.payment_reconciliation_items (payment_intent_id)
  where payment_intent_id is not null;

-- -----------------------------------------------------------------------------
-- Keep the intent's captured/refunded totals derived from the transaction log so
-- they can never drift from the immutable record.
-- -----------------------------------------------------------------------------
create or replace function payments.refresh_intent_totals()
returns trigger
language plpgsql
set search_path = payments, pg_catalog
as $$
declare
  v_captured public.paise;
  v_refunded public.paise;
begin
  select coalesce(sum(t.amount_paise) filter (
           where t.transaction_type in ('CAPTURE', 'COD_COLLECTION') and t.status = 'SUCCESS'), 0),
         coalesce(-sum(t.amount_paise) filter (
           where t.transaction_type in ('REFUND', 'CHARGEBACK') and t.status = 'SUCCESS'), 0)
    into v_captured, v_refunded
    from payments.payment_transactions t
   where t.payment_intent_id = new.payment_intent_id;

  update payments.payment_intents pi
     set captured_paise = v_captured,
         refunded_paise = v_refunded,
         captured_at = case when v_captured > 0 then coalesce(pi.captured_at, now()) else pi.captured_at end,
         status = case
                    when v_refunded > 0 and v_refunded >= v_captured then 'REFUNDED'
                    when v_refunded > 0                              then 'PARTIALLY_REFUNDED'
                    when v_captured >= pi.amount_paise               then 'CAPTURED'
                    when v_captured > 0                              then 'PARTIALLY_CAPTURED'
                    else pi.status
                  end
   where pi.id = new.payment_intent_id;

  return null;
end;
$$;

create trigger payment_transactions_refresh_intent
  after insert on payments.payment_transactions
  for each row execute function payments.refresh_intent_totals();

-- Complete the deferred reference from inventory ledger to orders now that
-- commerce.orders exists.
alter table inventory.inventory_ledger
  add constraint inventory_ledger_order_fk
  foreign key (order_id) references commerce.orders (id) on delete set null;

alter table inventory.inventory_ledger
  add constraint inventory_ledger_order_item_fk
  foreign key (order_item_id) references commerce.order_items (id) on delete set null;

alter table inventory.inventory_reservations
  add constraint reservations_order_fk
  foreign key (order_id) references commerce.orders (id) on delete set null;

alter table inventory.inventory_reservations
  add constraint reservations_order_item_fk
  foreign key (order_item_id) references commerce.order_items (id) on delete set null;

alter table inventory.inventory_reservations
  add constraint reservations_checkout_session_fk
  foreign key (checkout_session_id) references commerce.checkout_sessions (id) on delete set null;

alter table commerce.carts
  add constraint carts_converted_order_fk
  foreign key (converted_order_id) references commerce.orders (id) on delete set null;

alter table commerce.checkout_sessions
  add constraint checkout_sessions_order_fk
  foreign key (order_id) references commerce.orders (id) on delete set null;

alter table pricing.coupon_redemptions
  add constraint coupon_redemptions_order_fk
  foreign key (order_id) references commerce.orders (id) on delete restrict;
