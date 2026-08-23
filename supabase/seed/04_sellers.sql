-- =============================================================================
-- NovaMart seed — 04 Sellers, tax profiles, bank accounts, warehouses
--
-- Three sellers in different states so inter-state GST (IGST) and intra-state
-- (CGST+SGST) are both exercised by the same customer. One is deliberately left
-- UNDER_REVIEW to prove that unapproved sellers cannot hold active listings.
-- =============================================================================

insert into seller.sellers (
  display_name, slug, legal_name, business_type,
  registered_address_line1, registered_city, registered_state_code, registered_pincode,
  primary_contact_name, primary_contact_email, primary_contact_phone,
  support_email, status, status_reason, approved_at, agreement_accepted_at, agreement_version,
  fulfillment_models, dispatch_sla_hours, settlement_cycle, settlement_hold_days,
  rating, rating_count, seller_score, onboarding_step
) values
  ('Aurex Official Store', 'aurex-official-store',
   'Aurex Devices Private Limited', 'PRIVATE_LIMITED',
   '14 Residency Road', 'Bengaluru', 'KA', '560001',
   'Priya Nair', 'seller.aurex@example.novamart.in', '919000000101',
   'support.aurex@example.novamart.in', 'APPROVED', null, now() - interval '90 days',
   now() - interval '90 days', 'v1.0',
   '{SELLER_FULFILLED,NOVAMART_FULFILLED}', 24, 'WEEKLY', 7,
   4.42, 12840, 88.50, 'COMPLETE'),

  ('Metro Gadget House', 'metro-gadget-house',
   'Metro Gadget House LLP', 'LLP',
   '221 Linking Road, Bandra West', 'Mumbai', 'MH', '400050',
   'Rohit Deshmukh', 'seller.metro@example.novamart.in', '919000000102',
   'support.metro@example.novamart.in', 'APPROVED', null, now() - interval '45 days',
   now() - interval '45 days', 'v1.0',
   '{SELLER_FULFILLED}', 48, 'WEEKLY', 10,
   4.05, 3120, 71.25, 'COMPLETE'),

  ('Trailhead Sports', 'trailhead-sports',
   'Trailhead Sports Private Limited', 'PRIVATE_LIMITED',
   '9 Anna Salai', 'Chennai', 'TN', '600001',
   'Deepa Krishnan', 'seller.trailhead@example.novamart.in', '919000000103',
   'support.trailhead@example.novamart.in', 'APPROVED', null, now() - interval '20 days',
   now() - interval '20 days', 'v1.0',
   '{SELLER_FULFILLED}', 48, 'FORTNIGHTLY', 10,
   3.88, 640, 62.00, 'COMPLETE'),

  -- Not approved: proves catalog.validate_listing() blocks activation.
  ('Pending Traders', 'pending-traders',
   'Pending Traders', 'SOLE_PROPRIETORSHIP',
   '4 Nehru Place', 'New Delhi', 'DL', '110001',
   'Amit Verma', 'seller.pending@example.novamart.in', '919000000104',
   null, 'UNDER_REVIEW', 'Awaiting GST certificate verification', null, null, null,
   '{SELLER_FULFILLED}', 48, 'WEEKLY', 7,
   null, 0, null, 'DOCUMENTS')
on conflict (slug) do nothing;

-- -----------------------------------------------------------------------------
-- Tax profiles. GSTIN embeds the PAN and the state code, and the CHECK constraints
-- on the table enforce that — these values are internally consistent on purpose.
-- -----------------------------------------------------------------------------
insert into seller.seller_tax_profiles
  (seller_id, pan, gstin, gst_registration_type, gst_state_code, legal_name_as_per_pan,
   tcs_applicable, pan_verified_at, gstin_verified_at)
select s.id, v.pan, v.gstin, 'REGULAR', v.state_code, v.legal_name, true,
       now() - interval '30 days', now() - interval '30 days'
  from (values
    ('aurex-official-store', 'AAACA1234A', '29AAACA1234A1Z5', '29', 'Aurex Devices Private Limited'),
    ('metro-gadget-house',   'AAFML5678B', '27AAFML5678B1Z2', '27', 'Metro Gadget House LLP'),
    ('trailhead-sports',     'AABCT9012C', '33AABCT9012C1Z8', '33', 'Trailhead Sports Private Limited')
  ) as v(slug, pan, gstin, state_code, legal_name)
  join seller.sellers s on s.slug = v.slug
on conflict (seller_id) do nothing;

-- -----------------------------------------------------------------------------
-- Bank accounts. Account numbers are stored encrypted with only last4 displayed;
-- the seed uses pgcrypto with a local-only key to keep the shape honest.
-- -----------------------------------------------------------------------------
insert into seller.seller_bank_accounts
  (seller_id, account_holder_name, account_number_encrypted, account_number_last4,
   account_number_hash, ifsc, bank_name, account_type, is_primary,
   verification_status, verification_method, verified_holder_name, name_match_score, verified_at)
select s.id, v.holder,
       extensions.pgp_sym_encrypt(v.account_number, 'local-development-key-only'),
       right(v.account_number, 4),
       encode(extensions.digest(v.account_number || v.ifsc, 'sha256'), 'hex'),
       v.ifsc, v.bank, 'CURRENT', true,
       'VERIFIED', 'PENNY_DROP', v.holder, 100.00, now() - interval '30 days'
  from (values
    ('aurex-official-store', 'Aurex Devices Private Limited',    '918273645510', 'HDFC0000123', 'HDFC Bank'),
    ('metro-gadget-house',   'Metro Gadget House LLP',           '507182934620', 'ICIC0000456', 'ICICI Bank'),
    ('trailhead-sports',     'Trailhead Sports Private Limited', '331029384730', 'SBIN0000789', 'State Bank of India')
  ) as v(slug, holder, account_number, ifsc, bank)
  join seller.sellers s on s.slug = v.slug
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Warehouses. Locations are spread so fulfilment.resolve_zone() produces LOCAL,
-- ZONAL and REST_OF_INDIA outcomes for a Bengaluru customer.
-- -----------------------------------------------------------------------------
insert into inventory.warehouses (
  code, name, seller_id, warehouse_type, contact_name, contact_phone,
  address_line1, city, state_code, pincode, gstin,
  pickup_cutoff_time, processing_time_hours, allocation_priority, supports_returns
)
select v.code, v.name, s.id, 'SELLER_PICKUP', v.contact, v.phone,
       v.address, v.city, v.state_code, v.pincode, t.gstin,
       v.cutoff::time, v.processing_hours, v.priority, true
  from (values
    ('WH-AUREX-BLR', 'Aurex Fulfilment — Bengaluru', 'aurex-official-store',
     'Priya Nair', '919000000101', 'Plot 42, Bommasandra Industrial Area', 'Bengaluru', 'KA', '560034', '16:00', 12, 10),
    ('WH-AUREX-DEL', 'Aurex Fulfilment — Delhi NCR', 'aurex-official-store',
     'Priya Nair', '919000000101', 'Sector 63, Noida', 'Noida', 'UP', '201301', '15:00', 24, 20),
    ('WH-METRO-MUM', 'Metro Warehouse — Mumbai', 'metro-gadget-house',
     'Rohit Deshmukh', '919000000102', 'Unit 7, Andheri MIDC', 'Mumbai', 'MH', '400050', '14:00', 24, 10),
    ('WH-TRAIL-CHN', 'Trailhead Depot — Chennai', 'trailhead-sports',
     'Deepa Krishnan', '919000000103', '18 Guindy Industrial Estate', 'Chennai', 'TN', '600001', '15:00', 24, 10)
  ) as v(code, name, slug, contact, phone, address, city, state_code, pincode, cutoff, processing_hours, priority)
  join seller.sellers s on s.slug = v.slug
  left join seller.seller_tax_profiles t on t.seller_id = s.id
on conflict (code) do nothing;

-- Note: there is no separate seller_warehouses join table. inventory.warehouses
-- carries seller_id directly, with a CHECK that a SELLER_PICKUP warehouse always has
-- one and a NovaMart fulfilment centre never does.

-- -----------------------------------------------------------------------------
-- Seller performance. Buy Box scoring reads these, so the winner is decided by real
-- quality signals rather than price alone (brief §29).
-- -----------------------------------------------------------------------------
insert into seller.seller_performance (
  seller_id, orders_count, units_sold, gmv_paise,
  on_time_dispatch_rate, on_time_delivery_rate, seller_cancellation_rate,
  return_rate, rto_rate, average_dispatch_hours, average_rating, score, tier
)
select s.id, v.orders, v.units, v.gmv, v.dispatch_rate, v.delivery_rate, v.cancel_rate,
       v.return_rate, v.rto_rate, v.dispatch_hours, v.rating, v.score, v.tier
  from (values
    ('aurex-official-store', 12840, 15220, 182400000000::bigint, 98.40, 95.10, 0.80, 4.20, 2.10, 9.5,  4.42, 88.50, 'PLATINUM'),
    ('metro-gadget-house',    3120,  3640,  28900000000,          91.20, 88.70, 4.60, 9.80, 6.40, 26.0, 4.05, 71.25, 'SILVER'),
    ('trailhead-sports',       640,   980,   4200000000,          86.50, 83.20, 7.10, 18.40, 9.80, 34.5, 3.88, 62.00, 'BRONZE')
  ) as v(slug, orders, units, gmv, dispatch_rate, delivery_rate, cancel_rate, return_rate, rto_rate, dispatch_hours, rating, score, tier)
  join seller.sellers s on s.slug = v.slug
on conflict (seller_id) do update
  set score = excluded.score, tier = excluded.tier,
      seller_cancellation_rate = excluded.seller_cancellation_rate,
      return_rate = excluded.return_rate,
      on_time_dispatch_rate = excluded.on_time_dispatch_rate;
