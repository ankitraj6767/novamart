-- =============================================================================
-- NovaMart seed — 08 Test customers
--
-- Inserted directly into auth.users so identity.handle_new_auth_user() fires and
-- provisions the profile, the CUSTOMER role grant and preferences — the same path a
-- real registration takes.
--
-- Fixed UUIDs so tests and local tooling can mint a JWT for a known subject.
-- Local development only: the password hash is a throwaway value.
-- =============================================================================

-- The token columns are set to '' rather than left NULL on purpose. GoTrue scans them
-- into non-nullable Go strings, so a NULL confirmation_token makes every sign-in fail
-- with "Database error querying schema" — the account looks fine in the table and is
-- simply unusable. Supabase's own signup path writes '' here.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
  phone_change_token, reauthentication_token, email_change, phone_change
)
select '00000000-0000-0000-0000-000000000000'::uuid,
       v.id::uuid, 'authenticated', 'authenticated', v.email,
       extensions.crypt('NovaMart#Local1', extensions.gen_salt('bf')),
       now() - interval '60 days', v.phone, now() - interval '60 days',
       '{"provider":"phone","providers":["phone","email"]}'::jsonb,
       jsonb_build_object('full_name', v.full_name),
       now() - interval '60 days', now() - interval '60 days',
       '', '', '', '', '', '', '', ''
  from (values
    ('11111111-1111-4111-8111-111111111111', 'ananya.iyer@example.novamart.in',  '919000000001', 'Ananya Iyer'),
    ('22222222-2222-4222-8222-222222222222', 'rahul.mehta@example.novamart.in',  '919000000002', 'Rahul Mehta'),
    ('33333333-3333-4333-8333-333333333333', 'fatima.sheikh@example.novamart.in','919000000003', 'Fatima Sheikh')
  ) as v(id, email, phone, full_name)
 where not exists (select 1 from auth.users u where u.id = v.id::uuid);

-- Identities, so Supabase Auth treats these as fully provisioned accounts.
insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'phone', u.phone,
                          'email_verified', true, 'phone_verified', true),
       'phone', now() - interval '60 days', now() - interval '60 days', now() - interval '60 days'
  from auth.users u
 where u.email like '%@example.novamart.in'
   and not exists (
     select 1 from auth.identities i where i.user_id = u.id and i.provider = 'phone'
   );

-- -----------------------------------------------------------------------------
-- Addresses. Bengaluru, Mumbai and Guwahati deliberately: intra-state GST,
-- inter-state GST, and a north-east pincode with no COD and no reverse pickup.
-- -----------------------------------------------------------------------------
insert into identity.addresses (
  user_id, label, recipient_name, recipient_phone, address_line1, address_line2,
  landmark, locality, city, state_code, pincode, latitude, longitude,
  delivery_instructions, is_default, is_verified
)
select v.user_id::uuid, v.label, v.name, v.phone, v.line1, v.line2,
       v.landmark, v.locality, v.city, v.state_code, v.pincode, v.lat, v.lon,
       v.instructions, v.is_default, true
  from (values
    ('11111111-1111-4111-8111-111111111111', 'HOME', 'Ananya Iyer', '919000000001',
     '402, Brigade Palm Springs', '7th Block Koramangala', 'Near Forum Mall', 'Koramangala',
     'Bengaluru', 'KA', '560034', 12.934533, 77.626579, 'Call on arrival; gate code 4402', true),
    ('11111111-1111-4111-8111-111111111111', 'WORK', 'Ananya Iyer', '919000000001',
     'Aurex Tower, 4th Floor', 'Outer Ring Road', 'Opposite Bellandur Lake', 'Bellandur',
     'Bengaluru', 'KA', '560103', 12.925453, 77.678131, 'Reception will accept', false),
    ('22222222-2222-4222-8222-222222222222', 'HOME', 'Rahul Mehta', '919000000002',
     '1204, Sea Breeze Apartments', 'Hill Road, Bandra West', 'Near St Andrews Church', 'Bandra West',
     'Mumbai', 'MH', '400050', 19.054999, 72.840576, 'Leave with security if unavailable', true),
    ('33333333-3333-4333-8333-333333333333', 'HOME', 'Fatima Sheikh', '919000000003',
     'House 12, Zoo Road Tiniali', 'RG Baruah Road', 'Near Assam State Zoo', 'Zoo Road',
     'Guwahati', 'AS', '781001', 26.163486, 91.783562, null, true)
  ) as v(user_id, label, name, phone, line1, line2, landmark, locality, city, state_code, pincode, lat, lon, instructions, is_default)
 where exists (select 1 from identity.profiles p where p.id = v.user_id::uuid)
   and not exists (
     select 1 from identity.addresses a
      where a.user_id = v.user_id::uuid and a.pincode = v.pincode and a.label = v.label
   );

-- -----------------------------------------------------------------------------
-- A seller user, scoped to Aurex. Demonstrates that seller access is a scoped role
-- grant rather than a flag on the account.
-- -----------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
  phone_change_token, reauthentication_token, email_change, phone_change
)
select '00000000-0000-0000-0000-000000000000'::uuid,
       '44444444-4444-4444-8444-444444444444'::uuid, 'authenticated', 'authenticated',
       'priya.nair@example.novamart.in',
       extensions.crypt('NovaMart#Local1', extensions.gen_salt('bf')),
       now() - interval '90 days',
       '{"provider":"email","providers":["email"]}'::jsonb,
       '{"full_name":"Priya Nair"}'::jsonb,
       now() - interval '90 days', now() - interval '90 days',
       '', '', '', '', '', '', '', ''
 where not exists (
   select 1 from auth.users u where u.id = '44444444-4444-4444-8444-444444444444'::uuid
 );

insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
select u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now()
  from auth.users u
 where u.id = '44444444-4444-4444-8444-444444444444'::uuid
   and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

insert into seller.seller_users (seller_id, user_id, role_code, status, accepted_at)
select s.id, '44444444-4444-4444-8444-444444444444'::uuid, 'SELLER_OWNER', 'ACTIVE', now()
  from seller.sellers s
 where s.slug = 'aurex-official-store'
   and exists (select 1 from identity.profiles p where p.id = '44444444-4444-4444-8444-444444444444'::uuid)
on conflict do nothing;

-- The scoped role grant. granted_by is null so identity.guard_role_grant() treats this
-- as a system/bootstrap grant rather than an escalation attempt.
insert into identity.user_roles (user_id, role_id, scope_type, scope_id, grant_reason)
select '44444444-4444-4444-8444-444444444444'::uuid, r.id, 'seller', s.id,
       'Seed: owner of Aurex Official Store'
  from identity.roles r
  cross join seller.sellers s
 where r.code = 'SELLER_OWNER'
   and s.slug = 'aurex-official-store'
   and exists (select 1 from identity.profiles p where p.id = '44444444-4444-4444-8444-444444444444'::uuid)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- A staff operator, so admin endpoints and audited reads can be exercised locally.
-- -----------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
  phone_change_token, reauthentication_token, email_change, phone_change
)
select '00000000-0000-0000-0000-000000000000'::uuid,
       '55555555-5555-4555-8555-555555555555'::uuid, 'authenticated', 'authenticated',
       'ops.admin@example.novamart.in',
       extensions.crypt('NovaMart#Local1', extensions.gen_salt('bf')),
       now() - interval '120 days',
       '{"provider":"email","providers":["email"]}'::jsonb,
       '{"full_name":"Operations Admin"}'::jsonb,
       now() - interval '120 days', now() - interval '120 days',
       '', '', '', '', '', '', '', ''
 where not exists (
   select 1 from auth.users u where u.id = '55555555-5555-4555-8555-555555555555'::uuid
 );

insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
select u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now()
  from auth.users u
 where u.id = '55555555-5555-4555-8555-555555555555'::uuid
   and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

insert into identity.user_roles (user_id, role_id, grant_reason)
select '55555555-5555-4555-8555-555555555555'::uuid, r.id, 'Seed: local operations administrator'
  from identity.roles r
 where r.code = 'OPERATIONS_MANAGER'
   and exists (select 1 from identity.profiles p where p.id = '55555555-5555-4555-8555-555555555555'::uuid)
on conflict do nothing;

-- Recently viewed, so the personalised homepage section has content.
insert into commerce.recently_viewed (user_id, product_id, view_count, last_viewed_at)
select '11111111-1111-4111-8111-111111111111'::uuid, p.id, 3, now() - interval '2 hours'
  from catalog.products p
 where p.slug in ('aurex-pulse-9-pro-5g', 'soniq-aura-anc-wireless-headphones')
   and exists (select 1 from identity.profiles pr where pr.id = '11111111-1111-4111-8111-111111111111'::uuid)
on conflict (user_id, product_id) do nothing;
