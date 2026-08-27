-- Delivery OTPs are short-lived challenges. Only the HMAC is stored; the raw code is
-- delivered out-of-band to the customer and is never returned by this API.
create table fulfillment.delivery_otp_challenges (
  id                 uuid primary key default private.uuid_generate_v7(),
  shipment_id        uuid not null references fulfillment.shipments (id) on delete cascade,
  requested_by       uuid not null references identity.profiles (id) on delete restrict,
  otp_hash           text not null,
  expires_at         timestamptz not null,
  attempt_count      smallint not null default 0 check (attempt_count >= 0 and attempt_count <= 10),
  consumed_at        timestamptz,
  created_at         timestamptz not null default now()
);

create index delivery_otp_challenges_active_idx
  on fulfillment.delivery_otp_challenges (shipment_id, created_at desc)
  where consumed_at is null;

alter table fulfillment.delivery_otp_challenges enable row level security;

comment on table fulfillment.delivery_otp_challenges is
  'Short-lived delivery OTP challenge; raw OTP values never persist.';
