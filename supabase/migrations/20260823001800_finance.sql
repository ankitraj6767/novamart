-- =============================================================================
-- NovaMart — 0018 Finance: immutable seller ledger, commissions, fees,
--                  settlements, payouts, adjustments, invoices
--
-- The rule that governs this schema (brief §40): a seller's balance is
-- SUM(ledger entries). There is no mutable balance column anywhere, and every
-- settlement pins the exact ledger entry ids it consumed, so it is reproducible
-- years later.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- finance.seller_ledger — append-only, double-entry-flavoured single ledger.
-- Positive amounts are payable to the seller; negative amounts are deductions.
-- -----------------------------------------------------------------------------
create table finance.seller_ledger (
  id                    uuid primary key default private.uuid_generate_v7(),
  seller_id             uuid        not null references seller.sellers (id) on delete restrict,

  entry_type            text        not null
                          check (entry_type in ('SALE', 'COMMISSION', 'COMMISSION_GST', 'PLATFORM_FEE',
                                                 'CLOSING_FEE', 'PAYMENT_GATEWAY_FEE', 'FULFILMENT_FEE',
                                                 'SHIPPING_FEE', 'REVERSE_SHIPPING_FEE',
                                                 'TCS', 'TDS',
                                                 'SALE_REVERSAL', 'COMMISSION_REVERSAL',
                                                 'REFUND', 'RETURN_DEDUCTION', 'RTO_FEE',
                                                 'PENALTY', 'SLA_PENALTY', 'CANCELLATION_PENALTY',
                                                 'ADJUSTMENT_CREDIT', 'ADJUSTMENT_DEBIT',
                                                 'PROMOTION_FUNDING', 'ADVERTISING_FEE',
                                                 'STORAGE_FEE', 'SETTLEMENT_PAYOUT', 'OPENING_BALANCE')),
  -- Sign convention, asserted below, so a mis-signed entry cannot be inserted.
  direction             text        not null check (direction in ('CREDIT', 'DEBIT')),
  currency              public.currency_code not null default 'INR',
  amount_paise          public.paise not null,
  -- GST component of this entry, needed for the seller's input tax credit.
  tax_paise             public.paise not null default 0,

  -- What the entry relates to. At least one reference is required.
  order_id              uuid        references commerce.orders (id) on delete restrict,
  order_item_id         uuid        references commerce.order_items (id) on delete restrict,
  return_request_id     uuid        references returns.return_requests (id) on delete restrict,
  refund_id             uuid        references payments.refunds (id) on delete restrict,
  shipment_id           uuid        references fulfillment.shipments (id) on delete restrict,
  adjustment_id         uuid,
  settlement_id         uuid,
  payout_id             uuid,

  description           text        not null,
  -- The financial period this entry belongs to; settlements select by period.
  posting_date          date        not null default current_date,
  -- Entries are withheld from settlement until the hold expires (return window).
  available_for_settlement_on date not null default current_date,
  settlement_status     text        not null default 'UNSETTLED'
                          check (settlement_status in ('UNSETTLED', 'ON_HOLD', 'SETTLED', 'WRITTEN_OFF')),

  -- Idempotency: the same business event must not post twice.
  idempotency_key       text,
  source_event_id       uuid,
  created_by            uuid        references identity.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),

  constraint seller_ledger_reference_present check (
    order_id is not null or order_item_id is not null or return_request_id is not null
    or refund_id is not null or shipment_id is not null or adjustment_id is not null
    or settlement_id is not null or payout_id is not null or entry_type = 'OPENING_BALANCE'
  ),
  -- CREDIT entries are positive, DEBIT entries are negative. No exceptions.
  constraint seller_ledger_sign_matches_direction check (
    (direction = 'CREDIT' and amount_paise > 0) or (direction = 'DEBIT' and amount_paise < 0)
  )
);

comment on table finance.seller_ledger is
  'Append-only seller ledger. Balance is SUM(amount_paise); there is no balance column by design (brief §40).';
comment on column finance.seller_ledger.available_for_settlement_on is
  'Settlement hold: sale proceeds are withheld until the return window closes.';

create unique index seller_ledger_idempotency_idx on finance.seller_ledger (idempotency_key)
  where idempotency_key is not null;
create index seller_ledger_seller_idx      on finance.seller_ledger (seller_id, posting_date desc);
create index seller_ledger_order_idx       on finance.seller_ledger (order_id) where order_id is not null;
create index seller_ledger_order_item_idx  on finance.seller_ledger (order_item_id) where order_item_id is not null;
create index seller_ledger_settlement_idx  on finance.seller_ledger (settlement_id) where settlement_id is not null;
create index seller_ledger_type_idx        on finance.seller_ledger (entry_type, posting_date desc);
-- The settlement batch query: unsettled entries whose hold has expired.
create index seller_ledger_settleable_idx  on finance.seller_ledger (seller_id, available_for_settlement_on)
  where settlement_status = 'UNSETTLED';

-- Financial facts are immutable. Only settlement bookkeeping may change, and only
-- those two columns — enforced by column-level immutability rather than by
-- disabling the guard, so there is no window in which the ledger is writable.
create trigger seller_ledger_immutable_amounts
  before update on finance.seller_ledger
  for each row execute function private.allow_only_columns('{settlement_status,settlement_id,payout_id}');

create trigger seller_ledger_no_delete
  before delete on finance.seller_ledger
  for each row execute function private.prevent_delete();

-- The sanctioned settlement path. Marks entries settled or fails loudly if any
-- entry was already claimed by another settlement.
create or replace function finance.mark_ledger_settled(
  p_entry_ids     uuid[],
  p_settlement_id uuid
)
returns integer
language plpgsql
volatile
set search_path = finance, pg_catalog
as $$
declare
  v_count integer;
begin
  update finance.seller_ledger
     set settlement_status = 'SETTLED',
         settlement_id = p_settlement_id
   where id = any (p_entry_ids)
     and settlement_status = 'UNSETTLED';

  get diagnostics v_count = row_count;

  if v_count <> coalesce(array_length(p_entry_ids, 1), 0) then
    raise exception 'Expected to settle % ledger entries, settled % (some were already settled)',
      coalesce(array_length(p_entry_ids, 1), 0), v_count
      using errcode = 'NM007', hint = 'SETTLEMENT_NOT_READY';
  end if;

  return v_count;
end;
$$;

comment on function finance.mark_ledger_settled(uuid[], uuid) is
  'The only sanctioned path that updates ledger rows, and only their settlement bookkeeping columns.';

revoke all on function finance.mark_ledger_settled(uuid[], uuid) from public, anon, authenticated;
grant execute on function finance.mark_ledger_settled(uuid[], uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Seller balance, always computed.
-- -----------------------------------------------------------------------------
create or replace function finance.seller_balance(p_seller_id uuid)
returns table (
  total_credits_paise    public.paise,
  total_debits_paise     public.paise,
  net_balance_paise      public.paise,
  unsettled_paise        public.paise,
  on_hold_paise          public.paise,
  settleable_now_paise   public.paise
)
language sql
stable
set search_path = finance, pg_catalog
as $$
  select
    coalesce(sum(amount_paise) filter (where direction = 'CREDIT'), 0),
    coalesce(sum(amount_paise) filter (where direction = 'DEBIT'), 0),
    coalesce(sum(amount_paise), 0),
    coalesce(sum(amount_paise) filter (where settlement_status = 'UNSETTLED'), 0),
    coalesce(sum(amount_paise) filter (where settlement_status = 'ON_HOLD'), 0),
    coalesce(sum(amount_paise) filter (
      where settlement_status = 'UNSETTLED' and available_for_settlement_on <= current_date), 0)
    from finance.seller_ledger
   where seller_id = p_seller_id;
$$;

-- -----------------------------------------------------------------------------
-- finance.commissions / platform_fees — derived detail rows for reporting.
-- The authoritative amounts remain in the order item price breakdown; these exist
-- so finance can query commission without joining through orders.
-- -----------------------------------------------------------------------------
create table finance.commissions (
  id                  uuid primary key default private.uuid_generate_v7(),
  order_item_id       uuid        not null unique references commerce.order_items (id) on delete restrict,
  order_id            uuid        not null references commerce.orders (id) on delete restrict,
  seller_id           uuid        not null references seller.sellers (id) on delete restrict,
  commission_rule_id  uuid        references pricing.commission_rules (id) on delete set null,
  taxable_base_paise  public.paise not null check (taxable_base_paise >= 0),
  commission_rate     public.percentage,
  commission_paise    public.paise not null check (commission_paise >= 0),
  gst_paise           public.paise not null default 0 check (gst_paise >= 0),
  total_paise         public.paise not null check (total_paise >= 0),
  reversed_paise      public.paise not null default 0 check (reversed_paise >= 0),
  ledger_entry_id     uuid        references finance.seller_ledger (id) on delete set null,
  posted_at           timestamptz not null default now(),
  constraint commissions_reversal_within_total check (reversed_paise <= total_paise)
);

create index commissions_seller_idx on finance.commissions (seller_id, posted_at desc);
create index commissions_order_idx  on finance.commissions (order_id);

create table finance.platform_fees (
  id                uuid primary key default private.uuid_generate_v7(),
  order_item_id     uuid        references commerce.order_items (id) on delete restrict,
  order_id          uuid        references commerce.orders (id) on delete restrict,
  seller_id         uuid        not null references seller.sellers (id) on delete restrict,
  fee_type          text        not null
                      check (fee_type in ('CLOSING_FEE', 'PAYMENT_GATEWAY_FEE', 'FULFILMENT_FEE',
                                          'SHIPPING_FEE', 'REVERSE_SHIPPING_FEE', 'STORAGE_FEE',
                                          'ADVERTISING_FEE', 'RTO_FEE', 'PENALTY')),
  amount_paise      public.paise not null check (amount_paise >= 0),
  gst_paise         public.paise not null default 0,
  total_paise       public.paise not null,
  description       text,
  ledger_entry_id   uuid        references finance.seller_ledger (id) on delete set null,
  posted_at         timestamptz not null default now()
);

create index platform_fees_seller_idx on finance.platform_fees (seller_id, posted_at desc);
create index platform_fees_type_idx   on finance.platform_fees (fee_type, posted_at desc);
create index platform_fees_order_idx  on finance.platform_fees (order_id) where order_id is not null;

-- -----------------------------------------------------------------------------
-- finance.seller_settlements — a batch that converts ledger entries into one
-- payable amount. Reproducible because settlement_items pins the entry ids.
-- -----------------------------------------------------------------------------
create table finance.seller_settlements (
  id                     uuid primary key default private.uuid_generate_v7(),
  settlement_reference   text        not null unique,
  seller_id              uuid        not null references seller.sellers (id) on delete restrict,

  period_start           date        not null,
  period_end             date        not null,
  settlement_cycle       text        not null,

  currency               public.currency_code not null default 'INR',
  gross_sales_paise      public.paise not null default 0,
  total_commission_paise public.paise not null default 0,
  total_fees_paise       public.paise not null default 0,
  total_tax_paise        public.paise not null default 0,
  total_refunds_paise    public.paise not null default 0,
  total_penalties_paise  public.paise not null default 0,
  total_adjustments_paise public.paise not null default 0,
  tcs_paise              public.paise not null default 0,
  tds_paise              public.paise not null default 0,
  -- The amount actually payable. Equals the sum of the included ledger entries.
  net_payable_paise      public.paise not null default 0,
  entry_count            integer     not null default 0,

  status                 text        not null default 'DRAFT'
                           check (status in ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PAYOUT_INITIATED',
                                             'PAID', 'PARTIALLY_PAID', 'FAILED', 'ON_HOLD', 'CANCELLED')),
  hold_reason            text,

  approved_by            uuid        references identity.profiles (id) on delete set null,
  approved_at            timestamptz,
  -- Settlement statement PDF for the seller.
  statement_storage_path text,

  generated_at           timestamptz not null default now(),
  paid_at                timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  unique (seller_id, period_start, period_end),
  constraint settlements_period_valid check (period_end >= period_start),
  constraint settlements_hold_reason check (status <> 'ON_HOLD' or hold_reason is not null),
  -- A negative net payable means the seller owes NovaMart; it carries forward
  -- rather than being paid out.
  constraint settlements_negative_not_payable
    check (net_payable_paise >= 0 or status in ('DRAFT', 'PENDING_APPROVAL', 'CANCELLED', 'ON_HOLD'))
);

comment on table finance.seller_settlements is
  'Settlement batches. Every settlement is reproducible from the exact ledger entries in settlement_items.';

create index settlements_seller_idx on finance.seller_settlements (seller_id, period_end desc);
create index settlements_status_idx on finance.seller_settlements (status, generated_at desc);
create index settlements_queue_idx  on finance.seller_settlements (generated_at)
  where status in ('PENDING_APPROVAL', 'APPROVED');

create trigger seller_settlements_set_updated_at
  before update on finance.seller_settlements
  for each row execute function private.set_updated_at();

create or replace function finance.assign_settlement_reference()
returns trigger
language plpgsql
set search_path = finance, private, pg_catalog
as $$
begin
  if new.settlement_reference is null then
    new.settlement_reference := private.next_reference('ST', 'private.settlement_reference_seq');
  end if;
  return new;
end;
$$;

create trigger seller_settlements_assign_reference
  before insert on finance.seller_settlements
  for each row execute function finance.assign_settlement_reference();

-- -----------------------------------------------------------------------------
-- finance.settlement_items — pins the exact ledger entries. This is what makes a
-- settlement auditable and reproducible.
-- -----------------------------------------------------------------------------
create table finance.settlement_items (
  id              uuid primary key default extensions.gen_random_uuid(),
  settlement_id   uuid        not null references finance.seller_settlements (id) on delete cascade,
  ledger_entry_id uuid        not null references finance.seller_ledger (id) on delete restrict,
  amount_paise    public.paise not null,
  created_at      timestamptz not null default now(),
  -- A ledger entry can belong to exactly one settlement, ever.
  unique (ledger_entry_id)
);

comment on constraint settlement_items_ledger_entry_id_key on finance.settlement_items is
  'A ledger entry may be settled exactly once. This constraint prevents double payout.';

create index settlement_items_settlement_idx on finance.settlement_items (settlement_id);

-- -----------------------------------------------------------------------------
-- finance.seller_payouts — the bank transfer.
-- -----------------------------------------------------------------------------
create table finance.seller_payouts (
  id                    uuid primary key default private.uuid_generate_v7(),
  payout_reference      text        not null unique,
  settlement_id         uuid        references finance.seller_settlements (id) on delete restrict,
  seller_id             uuid        not null references seller.sellers (id) on delete restrict,
  bank_account_id       uuid        not null references seller.seller_bank_accounts (id) on delete restrict,

  currency              public.currency_code not null default 'INR',
  amount_paise          public.paise not null check (amount_paise > 0),

  provider              text        not null default 'RAZORPAYX'
                          check (provider in ('RAZORPAYX', 'CASHFREE_PAYOUTS', 'MANUAL_BANK_TRANSFER', 'MOCK')),
  provider_payout_id    text,
  payout_mode           text        check (payout_mode in ('IMPS', 'NEFT', 'RTGS', 'UPI')),
  utr_number            text,

  status                text        not null default 'PENDING'
                          check (status in ('PENDING', 'QUEUED', 'PROCESSING', 'PAID',
                                            'FAILED', 'REVERSED', 'CANCELLED')),
  failure_code          text,
  failure_reason        text,
  retry_count           smallint    not null default 0,

  idempotency_key       text,
  initiated_by          uuid        references identity.profiles (id) on delete set null,
  initiated_at          timestamptz,
  paid_at               timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint payouts_failure_fields check (status <> 'FAILED' or failure_code is not null),
  constraint payouts_paid_fields check (status <> 'PAID' or paid_at is not null)
);

create unique index payouts_idempotency_idx on finance.seller_payouts (idempotency_key)
  where idempotency_key is not null;
create unique index payouts_provider_idx on finance.seller_payouts (provider, provider_payout_id)
  where provider_payout_id is not null;
create index payouts_seller_idx     on finance.seller_payouts (seller_id, created_at desc);
create index payouts_settlement_idx on finance.seller_payouts (settlement_id);
create index payouts_status_idx     on finance.seller_payouts (status, created_at desc);
create index payouts_stuck_idx      on finance.seller_payouts (initiated_at)
  where status in ('QUEUED', 'PROCESSING');

create trigger seller_payouts_set_updated_at
  before update on finance.seller_payouts
  for each row execute function private.set_updated_at();

create or replace function finance.assign_payout_reference()
returns trigger
language plpgsql
set search_path = finance, private, pg_catalog
as $$
begin
  if new.payout_reference is null then
    new.payout_reference := private.next_reference('PO', 'private.payout_reference_seq');
  end if;
  return new;
end;
$$;

create trigger seller_payouts_assign_reference
  before insert on finance.seller_payouts
  for each row execute function finance.assign_payout_reference();

alter table finance.seller_ledger
  add constraint seller_ledger_settlement_fk
  foreign key (settlement_id) references finance.seller_settlements (id) on delete set null;

alter table finance.seller_ledger
  add constraint seller_ledger_payout_fk
  foreign key (payout_id) references finance.seller_payouts (id) on delete set null;

-- -----------------------------------------------------------------------------
-- finance.financial_adjustments — manual corrections. Approval-gated and audited,
-- because this is the one place a human can move money by hand.
-- -----------------------------------------------------------------------------
create table finance.financial_adjustments (
  id                  uuid primary key default private.uuid_generate_v7(),
  seller_id           uuid        not null references seller.sellers (id) on delete restrict,
  adjustment_type     text        not null
                        check (adjustment_type in ('GOODWILL_CREDIT', 'FEE_WAIVER', 'PENALTY',
                                                    'RECOVERY', 'CORRECTION', 'PROMOTION_REIMBURSEMENT',
                                                    'CHARGEBACK_RECOVERY', 'WRITE_OFF')),
  direction           text        not null check (direction in ('CREDIT', 'DEBIT')),
  amount_paise        public.paise not null check (amount_paise > 0),
  currency            public.currency_code not null default 'INR',

  order_id            uuid        references commerce.orders (id) on delete set null,
  order_item_id       uuid        references commerce.order_items (id) on delete set null,
  support_ticket_id   uuid,

  reason              text        not null check (length(trim(reason)) >= 15),
  supporting_documents text[]     not null default '{}',

  status              text        not null default 'PENDING_APPROVAL'
                        check (status in ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'POSTED', 'CANCELLED')),
  requested_by        uuid        not null references identity.profiles (id) on delete restrict,
  approved_by         uuid        references identity.profiles (id) on delete set null,
  approved_at         timestamptz,
  rejection_reason    text,
  ledger_entry_id     uuid        references finance.seller_ledger (id) on delete set null,
  posted_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Segregation of duties on money movement.
  constraint adjustments_no_self_approval check (approved_by is null or approved_by <> requested_by),
  constraint adjustments_approved_fields
    check (status <> 'APPROVED' or (approved_by is not null and approved_at is not null)),
  constraint adjustments_rejection_reason check (status <> 'REJECTED' or rejection_reason is not null),
  constraint adjustments_posted_fields
    check (status <> 'POSTED' or (ledger_entry_id is not null and posted_at is not null))
);

comment on constraint adjustments_no_self_approval on finance.financial_adjustments is
  'The requester cannot approve their own financial adjustment. Segregation of duties.';

create index financial_adjustments_seller_idx on finance.financial_adjustments (seller_id, created_at desc);
create index financial_adjustments_queue_idx  on finance.financial_adjustments (created_at)
  where status = 'PENDING_APPROVAL';

create trigger financial_adjustments_set_updated_at
  before update on finance.financial_adjustments
  for each row execute function private.set_updated_at();

alter table finance.seller_ledger
  add constraint seller_ledger_adjustment_fk
  foreign key (adjustment_id) references finance.financial_adjustments (id) on delete set null;

-- -----------------------------------------------------------------------------
-- finance.invoices — tax invoices and credit notes.
-- Numbering must be gapless and sequential per seller per financial year under GST.
-- -----------------------------------------------------------------------------
create table finance.invoices (
  id                      uuid primary key default private.uuid_generate_v7(),
  invoice_number          text        not null,
  invoice_type            text        not null
                            check (invoice_type in ('TAX_INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE',
                                                     'COMMISSION_INVOICE', 'PROFORMA')),
  -- GST financial year, e.g. '2026-27'. Numbering resets each year.
  financial_year          text        not null check (financial_year ~ '^[0-9]{4}-[0-9]{2}$'),

  order_id                uuid        references commerce.orders (id) on delete restrict,
  order_item_ids          uuid[]      not null default '{}',
  shipment_id             uuid        references fulfillment.shipments (id) on delete set null,
  seller_id               uuid        not null references seller.sellers (id) on delete restrict,
  user_id                 uuid        references identity.profiles (id) on delete restrict,
  -- Credit notes reference the invoice they reverse.
  original_invoice_id     uuid        references finance.invoices (id) on delete restrict,

  invoice_date            date        not null default current_date,
  -- Snapshot of both parties as they were: statutory requirement.
  seller_details          jsonb       not null,
  buyer_details           jsonb       not null,
  place_of_supply_state_code text     not null,
  is_reverse_charge       boolean     not null default false,

  taxable_value_paise     public.paise not null,
  cgst_paise              public.paise not null default 0,
  sgst_paise              public.paise not null default 0,
  igst_paise              public.paise not null default 0,
  cess_paise              public.paise not null default 0,
  total_tax_paise         public.paise not null default 0,
  total_amount_paise      public.paise not null,
  amount_in_words         text,

  -- Line items snapshot, so the invoice never depends on live catalog data.
  line_items              jsonb       not null,

  storage_bucket          text        not null default 'invoices-private',
  storage_path            text,
  -- Optional e-invoice IRN for sellers above the turnover threshold.
  irn                     text,
  irn_generated_at        timestamptz,
  qr_code_data            text,

  status                  text        not null default 'GENERATED'
                            check (status in ('DRAFT', 'GENERATED', 'CANCELLED', 'AMENDED')),
  cancellation_reason     text,
  created_at              timestamptz not null default now(),

  unique (seller_id, financial_year, invoice_number),
  constraint invoices_tax_total check (total_tax_paise = cgst_paise + sgst_paise + igst_paise + cess_paise),
  constraint invoices_total check (total_amount_paise = taxable_value_paise + total_tax_paise),
  constraint invoices_credit_note_has_original
    check (invoice_type <> 'CREDIT_NOTE' or original_invoice_id is not null)
);

comment on table finance.invoices is
  'Tax invoices and credit notes. Party and line-item details are snapshotted: statutory documents must not change.';

create index invoices_order_idx    on finance.invoices (order_id) where order_id is not null;
create index invoices_seller_idx   on finance.invoices (seller_id, invoice_date desc);
create index invoices_user_idx     on finance.invoices (user_id, invoice_date desc) where user_id is not null;
create index invoices_type_idx     on finance.invoices (invoice_type, invoice_date desc);
create index invoices_number_trgm_idx on finance.invoices using gin (invoice_number extensions.gin_trgm_ops);

-- Invoices are immutable once generated; corrections are credit notes.
create or replace function finance.guard_invoice_immutability()
returns trigger
language plpgsql
set search_path = finance, pg_catalog
as $$
begin
  if old.status = 'GENERATED' and new.status not in ('CANCELLED', 'AMENDED') then
    raise exception 'Invoice % is immutable; issue a credit note instead', old.invoice_number
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger invoices_guard_immutability
  before update on finance.invoices
  for each row execute function finance.guard_invoice_immutability();

create trigger invoices_no_delete
  before delete on finance.invoices
  for each row execute function private.prevent_delete();

-- Gapless per-seller, per-financial-year numbering under a lock.
create table finance.invoice_sequences (
  seller_id      uuid   not null references seller.sellers (id) on delete cascade,
  financial_year text   not null,
  invoice_type   text   not null,
  last_number    integer not null default 0 check (last_number >= 0),
  prefix         text   not null default 'INV',
  primary key (seller_id, financial_year, invoice_type)
);

create or replace function finance.next_invoice_number(
  p_seller_id      uuid,
  p_financial_year text,
  p_invoice_type   text default 'TAX_INVOICE'
)
returns text
language plpgsql
volatile
set search_path = finance, seller, pg_catalog
as $$
declare
  v_next   integer;
  v_prefix text;
  v_code   text;
begin
  select seller_code into v_code from seller.sellers where id = p_seller_id;

  insert into finance.invoice_sequences (seller_id, financial_year, invoice_type, last_number, prefix)
  values (p_seller_id, p_financial_year, p_invoice_type, 0,
          case p_invoice_type when 'CREDIT_NOTE' then 'CN'
                              when 'DEBIT_NOTE'  then 'DN'
                              else 'INV' end)
  on conflict (seller_id, financial_year, invoice_type) do nothing;

  -- Row lock serialises concurrent invoice generation, guaranteeing no gaps.
  update finance.invoice_sequences
     set last_number = last_number + 1
   where seller_id = p_seller_id
     and financial_year = p_financial_year
     and invoice_type = p_invoice_type
  returning last_number, prefix into v_next, v_prefix;

  return v_prefix || '/' || coalesce(v_code, 'NM') || '/' || p_financial_year || '/' ||
         lpad(v_next::text, 6, '0');
end;
$$;

comment on function finance.next_invoice_number(uuid, text, text) is
  'Gapless sequential invoice numbering per seller per financial year, as GST requires.';

revoke all on function finance.next_invoice_number(uuid, text, text) from public, anon, authenticated;
grant execute on function finance.next_invoice_number(uuid, text, text) to service_role;

-- -----------------------------------------------------------------------------
-- Post the full set of ledger entries for a delivered order item.
-- One function so sale, commission, fees and taxes are always posted together and
-- idempotently.
-- -----------------------------------------------------------------------------
create or replace function finance.post_order_item_earnings(
  p_order_item_id uuid,
  p_hold_days     integer default null
)
returns integer
language plpgsql
volatile
set search_path = finance, commerce, seller, catalog, pg_catalog
as $$
declare
  v_item      commerce.order_items;
  v_bd        commerce.order_item_price_breakdowns;
  v_seller    seller.sellers;
  v_hold_days integer;
  v_available date;
  v_posted    integer := 0;
  v_key       text;
begin
  select * into v_item from commerce.order_items where id = p_order_item_id;
  if v_item.id is null then
    raise exception 'Order item % not found', p_order_item_id using errcode = 'no_data_found';
  end if;

  select * into v_bd from commerce.order_item_price_breakdowns where order_item_id = p_order_item_id;
  if v_bd.order_item_id is null then
    raise exception 'No price breakdown for order item %', p_order_item_id using errcode = 'no_data_found';
  end if;

  select * into v_seller from seller.sellers where id = v_item.seller_id;

  -- Proceeds are held until the return window closes, so a refund does not chase a
  -- payout that has already left.
  v_hold_days := coalesce(p_hold_days, v_seller.settlement_hold_days, 7);
  v_available := (coalesce(v_item.delivered_at, now()) + (v_hold_days || ' days')::interval)::date;

  v_key := 'earnings:' || p_order_item_id::text;

  -- Gross sale value credited to the seller.
  insert into finance.seller_ledger (
    seller_id, entry_type, direction, amount_paise, tax_paise,
    order_id, order_item_id, description, available_for_settlement_on, idempotency_key
  ) values (
    v_item.seller_id, 'SALE', 'CREDIT', v_bd.total_payable_paise, v_bd.total_tax_paise,
    v_item.order_id, p_order_item_id,
    format('Sale of %s (%s)', v_item.product_title, v_item.item_number),
    v_available, v_key || ':sale'
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing;
  v_posted := v_posted + 1;

  -- Commission, debited.
  if v_bd.commission_paise > 0 then
    insert into finance.seller_ledger (
      seller_id, entry_type, direction, amount_paise, tax_paise,
      order_id, order_item_id, description, available_for_settlement_on, idempotency_key
    ) values (
      v_item.seller_id, 'COMMISSION', 'DEBIT', -v_bd.commission_paise, v_bd.commission_gst_paise,
      v_item.order_id, p_order_item_id,
      format('Commission on %s', v_item.item_number),
      v_available, v_key || ':commission'
    )
    on conflict (idempotency_key) where idempotency_key is not null do nothing;
    v_posted := v_posted + 1;
  end if;

  -- GST on NovaMart's commission, debited separately for input tax credit clarity.
  if v_bd.commission_gst_paise > 0 then
    insert into finance.seller_ledger (
      seller_id, entry_type, direction, amount_paise,
      order_id, order_item_id, description, available_for_settlement_on, idempotency_key
    ) values (
      v_item.seller_id, 'COMMISSION_GST', 'DEBIT', -v_bd.commission_gst_paise,
      v_item.order_id, p_order_item_id,
      format('GST on commission for %s', v_item.item_number),
      v_available, v_key || ':commission_gst'
    )
    on conflict (idempotency_key) where idempotency_key is not null do nothing;
    v_posted := v_posted + 1;
  end if;

  if v_bd.platform_fee_paise > 0 then
    insert into finance.seller_ledger (
      seller_id, entry_type, direction, amount_paise,
      order_id, order_item_id, description, available_for_settlement_on, idempotency_key
    ) values (
      v_item.seller_id, 'PLATFORM_FEE', 'DEBIT', -v_bd.platform_fee_paise,
      v_item.order_id, p_order_item_id,
      format('Platform fee for %s', v_item.item_number),
      v_available, v_key || ':platform_fee'
    )
    on conflict (idempotency_key) where idempotency_key is not null do nothing;
    v_posted := v_posted + 1;
  end if;

  if v_bd.payment_gateway_fee_paise > 0 then
    insert into finance.seller_ledger (
      seller_id, entry_type, direction, amount_paise,
      order_id, order_item_id, description, available_for_settlement_on, idempotency_key
    ) values (
      v_item.seller_id, 'PAYMENT_GATEWAY_FEE', 'DEBIT', -v_bd.payment_gateway_fee_paise,
      v_item.order_id, p_order_item_id,
      format('Payment gateway fee for %s', v_item.item_number),
      v_available, v_key || ':pg_fee'
    )
    on conflict (idempotency_key) where idempotency_key is not null do nothing;
    v_posted := v_posted + 1;
  end if;

  if v_bd.fulfillment_fee_paise > 0 then
    insert into finance.seller_ledger (
      seller_id, entry_type, direction, amount_paise,
      order_id, order_item_id, description, available_for_settlement_on, idempotency_key
    ) values (
      v_item.seller_id, 'FULFILMENT_FEE', 'DEBIT', -v_bd.fulfillment_fee_paise,
      v_item.order_id, p_order_item_id,
      format('Fulfilment fee for %s', v_item.item_number),
      v_available, v_key || ':fulfilment_fee'
    )
    on conflict (idempotency_key) where idempotency_key is not null do nothing;
    v_posted := v_posted + 1;
  end if;

  -- Commission detail row for finance reporting.
  insert into finance.commissions (
    order_item_id, order_id, seller_id, commission_rule_id, taxable_base_paise,
    commission_rate, commission_paise, gst_paise, total_paise
  ) values (
    p_order_item_id, v_item.order_id, v_item.seller_id, v_bd.commission_rule_id,
    v_bd.taxable_value_paise, v_bd.commission_rate, v_bd.commission_paise,
    v_bd.commission_gst_paise, v_bd.commission_paise + v_bd.commission_gst_paise
  )
  on conflict (order_item_id) do nothing;

  return v_posted;
end;
$$;

revoke all on function finance.post_order_item_earnings(uuid, integer) from public, anon, authenticated;
grant execute on function finance.post_order_item_earnings(uuid, integer) to service_role;
