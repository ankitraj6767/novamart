-- =============================================================================
-- NovaMart — 0013 Commerce: cart, saved for later, wishlist, recently viewed,
--                  checkout sessions and price snapshots
--
-- Cart prices are advisory display values (brief §26). Checkout ignores them and
-- recomputes everything from the database.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- commerce.carts
-- Guest carts are keyed by an anonymous token and merged into the user cart on
-- login, so a customer never loses a cart by signing in.
-- -----------------------------------------------------------------------------
create table commerce.carts (
  id              uuid primary key default extensions.gen_random_uuid(),
  user_id         uuid        references identity.profiles (id) on delete cascade,
  -- Opaque client-generated token for pre-authentication carts.
  guest_token     text,
  status          text        not null default 'ACTIVE'
                    check (status in ('ACTIVE', 'CONVERTED', 'ABANDONED', 'MERGED')),
  currency        public.currency_code not null default 'INR',

  -- Delivery context, so the cart can show serviceability and delivery dates
  -- before an address is formally selected.
  delivery_pincode public.indian_pincode references fulfillment.pincodes (pincode) on delete set null,

  -- Advisory totals for display only, refreshed opportunistically. Checkout never
  -- reads these.
  items_count     integer     not null default 0 check (items_count >= 0),
  subtotal_paise  public.paise not null default 0 check (subtotal_paise >= 0),
  computed_at     timestamptz,

  -- Cart-level coupon intent. Validity is decided at checkout, not here.
  applied_coupon_code text,

  converted_order_id uuid,
  merged_into_cart_id uuid references commerce.carts (id) on delete set null,
  abandoned_at    timestamptz,
  last_activity_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint carts_owner_present check (user_id is not null or guest_token is not null)
);

comment on table commerce.carts is
  'Shopping cart. Totals here are display-only; the checkout engine recomputes from source (brief §26).';

-- One active cart per user, and one per guest token.
create unique index carts_active_user_idx  on commerce.carts (user_id)
  where user_id is not null and status = 'ACTIVE';
create unique index carts_active_guest_idx on commerce.carts (guest_token)
  where guest_token is not null and status = 'ACTIVE';
create index carts_abandoned_idx on commerce.carts (last_activity_at)
  where status = 'ACTIVE' and items_count > 0;

create trigger carts_set_updated_at
  before update on commerce.carts
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- commerce.cart_items
-- Snapshots the price the customer was shown, purely so checkout can tell them
-- "the price changed" instead of silently charging a different amount.
-- -----------------------------------------------------------------------------
create table commerce.cart_items (
  id                  uuid primary key default extensions.gen_random_uuid(),
  cart_id             uuid        not null references commerce.carts (id) on delete cascade,
  listing_id          uuid        not null references catalog.seller_listings (id) on delete cascade,
  sku_id              uuid        not null references catalog.skus (id) on delete cascade,
  seller_id           uuid        not null references seller.sellers (id) on delete cascade,
  quantity            integer     not null check (quantity between 1 and 100),

  -- Price as displayed when the item was added or last refreshed.
  displayed_price_paise public.paise not null check (displayed_price_paise >= 0),
  displayed_mrp_paise   public.paise not null check (displayed_mrp_paise >= 0),
  price_captured_at   timestamptz not null default now(),

  -- Set by the cart refresh job/endpoint so the UI can flag issues before checkout.
  availability_status text        not null default 'AVAILABLE'
                        check (availability_status in ('AVAILABLE', 'OUT_OF_STOCK', 'LOW_STOCK',
                                                        'PRICE_CHANGED', 'LISTING_INACTIVE',
                                                        'SELLER_UNAVAILABLE', 'NOT_SERVICEABLE',
                                                        'QUANTITY_LIMITED')),
  available_quantity  integer,

  -- Flash sale line, if the item was added from a live sale.
  flash_sale_item_id  uuid        references pricing.flash_sale_items (id) on delete set null,

  added_at            timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (cart_id, listing_id)
);

comment on column commerce.cart_items.displayed_price_paise is
  'What the customer was shown. Used only to detect and disclose price changes at checkout.';

create index cart_items_cart_idx    on commerce.cart_items (cart_id, added_at desc);
create index cart_items_listing_idx on commerce.cart_items (listing_id);
create index cart_items_sku_idx     on commerce.cart_items (sku_id);

create trigger cart_items_set_updated_at
  before update on commerce.cart_items
  for each row execute function private.set_updated_at();

-- Keep the cart's advisory counters aligned with its lines.
create or replace function commerce.refresh_cart_totals()
returns trigger
language plpgsql
set search_path = commerce, pg_catalog
as $$
declare
  v_cart_id uuid := coalesce(new.cart_id, old.cart_id);
begin
  update commerce.carts c
     set items_count = coalesce(agg.item_count, 0),
         subtotal_paise = coalesce(agg.subtotal, 0),
         computed_at = now(),
         last_activity_at = now()
    from (
      select sum(ci.quantity)::integer as item_count,
             sum(ci.displayed_price_paise * ci.quantity)::bigint as subtotal
        from commerce.cart_items ci
       where ci.cart_id = v_cart_id
    ) agg
   where c.id = v_cart_id;

  return null;
end;
$$;

create trigger cart_items_refresh_totals
  after insert or delete or update of quantity, displayed_price_paise on commerce.cart_items
  for each row execute function commerce.refresh_cart_totals();

-- -----------------------------------------------------------------------------
-- commerce.saved_for_later
-- -----------------------------------------------------------------------------
create table commerce.saved_for_later (
  id           uuid primary key default extensions.gen_random_uuid(),
  user_id      uuid        not null references identity.profiles (id) on delete cascade,
  listing_id   uuid        not null references catalog.seller_listings (id) on delete cascade,
  sku_id       uuid        not null references catalog.skus (id) on delete cascade,
  quantity     integer     not null default 1 check (quantity between 1 and 100),
  saved_at     timestamptz not null default now(),
  unique (user_id, listing_id)
);

create index saved_for_later_user_idx on commerce.saved_for_later (user_id, saved_at desc);

-- -----------------------------------------------------------------------------
-- commerce.wishlists — named lists, shareable
-- -----------------------------------------------------------------------------
create table commerce.wishlists (
  id           uuid primary key default extensions.gen_random_uuid(),
  user_id      uuid        not null references identity.profiles (id) on delete cascade,
  name         text        not null default 'My Wishlist',
  is_default   boolean     not null default true,
  is_public    boolean     not null default false,
  -- Opaque token for public sharing; regenerating it revokes old links.
  share_token  text,
  items_count  integer     not null default 0 check (items_count >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index wishlists_default_idx on commerce.wishlists (user_id) where is_default;
create unique index wishlists_share_token_idx on commerce.wishlists (share_token)
  where share_token is not null;
create index wishlists_user_idx on commerce.wishlists (user_id);

create trigger wishlists_set_updated_at
  before update on commerce.wishlists
  for each row execute function private.set_updated_at();

create table commerce.wishlist_items (
  id                uuid primary key default extensions.gen_random_uuid(),
  wishlist_id       uuid        not null references commerce.wishlists (id) on delete cascade,
  product_id        uuid        not null references catalog.products (id) on delete cascade,
  -- Optional: the specific variant/listing the customer liked.
  variant_id        uuid        references catalog.product_variants (id) on delete set null,
  listing_id        uuid        references catalog.seller_listings (id) on delete set null,
  -- Price when wishlisted, so "price dropped since you saved it" is truthful.
  price_when_added_paise public.paise,
  notify_on_price_drop   boolean not null default true,
  notify_on_back_in_stock boolean not null default true,
  note              text,
  added_at          timestamptz not null default now(),
  unique (wishlist_id, product_id, variant_id)
);

create index wishlist_items_wishlist_idx on commerce.wishlist_items (wishlist_id, added_at desc);
create index wishlist_items_product_idx  on commerce.wishlist_items (product_id);
-- Drives the price-drop notification job.
create index wishlist_items_price_watch_idx on commerce.wishlist_items (listing_id)
  where notify_on_price_drop and listing_id is not null;

create or replace function commerce.refresh_wishlist_count()
returns trigger
language plpgsql
set search_path = commerce, pg_catalog
as $$
declare
  v_id uuid := coalesce(new.wishlist_id, old.wishlist_id);
begin
  update commerce.wishlists w
     set items_count = (select count(*) from commerce.wishlist_items wi where wi.wishlist_id = v_id)
   where w.id = v_id;
  return null;
end;
$$;

create trigger wishlist_items_refresh_count
  after insert or delete on commerce.wishlist_items
  for each row execute function commerce.refresh_wishlist_count();

-- -----------------------------------------------------------------------------
-- commerce.recently_viewed — capped per user by a trigger so it cannot grow without
-- bound for heavy browsers.
-- -----------------------------------------------------------------------------
create table commerce.recently_viewed (
  id           uuid primary key default extensions.gen_random_uuid(),
  user_id      uuid        not null references identity.profiles (id) on delete cascade,
  product_id   uuid        not null references catalog.products (id) on delete cascade,
  variant_id   uuid        references catalog.product_variants (id) on delete set null,
  view_count   integer     not null default 1 check (view_count > 0),
  first_viewed_at timestamptz not null default now(),
  last_viewed_at  timestamptz not null default now(),
  unique (user_id, product_id)
);

create index recently_viewed_user_idx on commerce.recently_viewed (user_id, last_viewed_at desc);

create or replace function commerce.trim_recently_viewed()
returns trigger
language plpgsql
set search_path = commerce, pg_catalog
as $$
begin
  delete from commerce.recently_viewed rv
   where rv.user_id = new.user_id
     and rv.id not in (
       select id from commerce.recently_viewed
        where user_id = new.user_id
        order by last_viewed_at desc
        limit 50
     );
  return null;
end;
$$;

create trigger recently_viewed_trim
  after insert on commerce.recently_viewed
  for each row execute function commerce.trim_recently_viewed();

-- -----------------------------------------------------------------------------
-- commerce.checkout_sessions
-- A short-lived, server-authoritative snapshot of everything the customer is about
-- to buy and pay. Single-use: the same session cannot produce two orders.
-- -----------------------------------------------------------------------------
create table commerce.checkout_sessions (
  id                    uuid primary key default private.uuid_generate_v7(),
  user_id               uuid        not null references identity.profiles (id) on delete cascade,
  cart_id               uuid        references commerce.carts (id) on delete set null,

  status                text        not null default 'INITIATED'
                          check (status in ('INITIATED', 'ADDRESS_SELECTED', 'DELIVERY_SELECTED',
                                            'OFFERS_APPLIED', 'PAYMENT_PENDING', 'COMPLETED',
                                            'EXPIRED', 'ABANDONED', 'FAILED')),

  -- Snapshot of the delivery address (identity.addresses may change later).
  shipping_address_id   uuid        references identity.addresses (id) on delete set null,
  billing_address_id    uuid        references identity.addresses (id) on delete set null,
  shipping_address_snapshot jsonb,
  delivery_pincode      public.indian_pincode references fulfillment.pincodes (pincode) on delete set null,

  -- Authoritative amounts computed by the pricing engine. The client is told these;
  -- it never proposes them.
  currency              public.currency_code not null default 'INR',
  items_subtotal_paise      public.paise not null default 0 check (items_subtotal_paise >= 0),
  seller_discount_paise     public.paise not null default 0 check (seller_discount_paise >= 0),
  platform_discount_paise   public.paise not null default 0 check (platform_discount_paise >= 0),
  coupon_discount_paise     public.paise not null default 0 check (coupon_discount_paise >= 0),
  promotion_discount_paise  public.paise not null default 0 check (promotion_discount_paise >= 0),
  bank_offer_discount_paise public.paise not null default 0 check (bank_offer_discount_paise >= 0),
  shipping_paise            public.paise not null default 0 check (shipping_paise >= 0),
  cod_fee_paise             public.paise not null default 0 check (cod_fee_paise >= 0),
  gift_wrap_paise           public.paise not null default 0 check (gift_wrap_paise >= 0),
  tax_paise                 public.paise not null default 0 check (tax_paise >= 0),
  total_payable_paise       public.paise not null default 0 check (total_payable_paise >= 0),

  applied_coupon_id     uuid        references pricing.coupons (id) on delete set null,
  applied_bank_offer_id uuid        references pricing.bank_offers (id) on delete set null,
  -- Full audit of which rules fired, for support and dispute resolution.
  applied_rules         jsonb       not null default '[]'::jsonb,

  payment_method        text        check (payment_method in ('UPI', 'CARD', 'NET_BANKING', 'WALLET',
                                                              'EMI', 'COD', 'PAY_LATER', 'GIFT_CARD')),
  -- Output of the COD engine (brief §36) with its reasoning, so support can explain.
  cod_decision          text        check (cod_decision in ('COD_ALLOWED', 'COD_BLOCKED', 'COD_PARTIAL_PREPAY')),
  cod_prepay_paise      public.paise,
  cod_decision_reasons  text[]      not null default '{}',

  -- Delivery promise shown to the customer, per seller group.
  delivery_promise      jsonb       not null default '{}'::jsonb,

  idempotency_key       text,
  order_id              uuid,
  expires_at            timestamptz not null default now() + interval '30 minutes',
  completed_at          timestamptz,
  failure_code          text,
  failure_message       text,

  client_platform       text        check (client_platform in ('android', 'ios', 'web')),
  client_version        text,
  ip_address            inet,
  request_id            text,
  trace_id              text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint checkout_sessions_completed_has_order
    check (status <> 'COMPLETED' or order_id is not null),
  constraint checkout_sessions_cod_prepay
    check (cod_decision is distinct from 'COD_PARTIAL_PREPAY' or cod_prepay_paise is not null)
);

comment on table commerce.checkout_sessions is
  'Server-authoritative checkout snapshot. Single-use; totals here are the only amounts the client may pay.';

create unique index checkout_sessions_idempotency_idx on commerce.checkout_sessions (user_id, idempotency_key)
  where idempotency_key is not null;
create index checkout_sessions_user_idx    on commerce.checkout_sessions (user_id, created_at desc);
create index checkout_sessions_expiry_idx  on commerce.checkout_sessions (expires_at)
  where status in ('INITIATED', 'ADDRESS_SELECTED', 'DELIVERY_SELECTED', 'OFFERS_APPLIED', 'PAYMENT_PENDING');
create index checkout_sessions_order_idx   on commerce.checkout_sessions (order_id) where order_id is not null;
-- Funnel analytics.
create index checkout_sessions_status_idx  on commerce.checkout_sessions (status, created_at desc);

create trigger checkout_sessions_set_updated_at
  before update on commerce.checkout_sessions
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- commerce.checkout_items — the lines as validated and priced at checkout time.
-- -----------------------------------------------------------------------------
create table commerce.checkout_items (
  id                     uuid primary key default extensions.gen_random_uuid(),
  checkout_session_id    uuid        not null references commerce.checkout_sessions (id) on delete cascade,
  listing_id             uuid        not null references catalog.seller_listings (id) on delete restrict,
  sku_id                 uuid        not null references catalog.skus (id) on delete restrict,
  seller_id              uuid        not null references seller.sellers (id) on delete restrict,
  -- The fulfilment node chosen by the allocation engine.
  warehouse_id           uuid        references inventory.warehouses (id) on delete set null,
  reservation_id         uuid        references inventory.inventory_reservations (id) on delete set null,

  quantity               integer     not null check (quantity > 0),
  mrp_paise              public.paise not null check (mrp_paise > 0),
  selling_price_paise    public.paise not null check (selling_price_paise > 0),
  line_total_paise       public.paise not null check (line_total_paise >= 0),

  -- Whether this line passed every validation gate.
  validation_status      text        not null default 'VALID'
                           check (validation_status in ('VALID', 'OUT_OF_STOCK', 'PRICE_CHANGED',
                                                         'LISTING_INACTIVE', 'NOT_SERVICEABLE',
                                                         'QUANTITY_EXCEEDED', 'RESTRICTED')),
  validation_message     text,

  created_at             timestamptz not null default now(),
  unique (checkout_session_id, listing_id)
);

create index checkout_items_session_idx     on commerce.checkout_items (checkout_session_id);
create index checkout_items_reservation_idx on commerce.checkout_items (reservation_id)
  where reservation_id is not null;

-- -----------------------------------------------------------------------------
-- commerce.checkout_price_snapshots — append-only record of each pricing run.
-- A customer disputing a total can be answered exactly, including which run of the
-- pricing engine produced it.
-- -----------------------------------------------------------------------------
create table commerce.checkout_price_snapshots (
  id                  uuid primary key default private.uuid_generate_v7(),
  checkout_session_id uuid        not null references commerce.checkout_sessions (id) on delete cascade,
  -- Increments on every recomputation within the session.
  revision            smallint    not null default 1,
  -- Complete engine input and output, versioned so the shape can evolve.
  schema_version      smallint    not null default 1,
  breakdown           jsonb       not null,
  total_payable_paise public.paise not null,
  computed_at         timestamptz not null default now(),
  unique (checkout_session_id, revision)
);

create trigger checkout_price_snapshots_append_only
  before update or delete on commerce.checkout_price_snapshots
  for each row execute function private.prevent_mutation();
