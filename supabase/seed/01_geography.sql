-- =============================================================================
-- NovaMart seed — 01 Geography
--
-- All 36 states and union territories with their statutory GST state codes: place
-- of supply determines CGST+SGST vs IGST, so these codes are load-bearing for tax.
-- Cities and pincodes are a realistic operating subset; the full pincode master
-- (~19,000 rows) is loaded from the India Post dataset by scripts/load-pincodes.ts.
-- =============================================================================

insert into fulfillment.delivery_zones (code, name, description, default_sla_days, sort_order) values
  ('LOCAL',          'Local',            'Same city as the dispatching warehouse.',            2, 10),
  ('ZONAL',          'Zonal',            'Same state, different city.',                        3, 20),
  ('METRO_TO_METRO', 'Metro to metro',   'Between two metro cities.',                          3, 30),
  ('REST_OF_INDIA',  'Rest of India',    'Inter-state, non-metro destinations.',               5, 40),
  ('NORTH_EAST',     'North East',       'North-eastern states; longer transit and surcharges.', 8, 50),
  ('JAMMU_KASHMIR',  'J&K and Ladakh',   'Jammu & Kashmir and Ladakh.',                        9, 60),
  ('ISLANDS',        'Islands',          'Andaman & Nicobar and Lakshadweep.',                12, 70)
on conflict (code) do nothing;

insert into fulfillment.states (code, gst_state_code, name, name_hi, is_union_territory, region) values
  ('JK', '01', 'Jammu and Kashmir',                        'जम्मू और कश्मीर',   true,  'NORTH'),
  ('HP', '02', 'Himachal Pradesh',                         'हिमाचल प्रदेश',      false, 'NORTH'),
  ('PB', '03', 'Punjab',                                   'पंजाब',              false, 'NORTH'),
  ('CH', '04', 'Chandigarh',                               'चंडीगढ़',            true,  'NORTH'),
  ('UK', '05', 'Uttarakhand',                              'उत्तराखंड',          false, 'NORTH'),
  ('HR', '06', 'Haryana',                                  'हरियाणा',            false, 'NORTH'),
  ('DL', '07', 'Delhi',                                    'दिल्ली',             true,  'NORTH'),
  ('RJ', '08', 'Rajasthan',                                'राजस्थान',           false, 'NORTH'),
  ('UP', '09', 'Uttar Pradesh',                            'उत्तर प्रदेश',       false, 'CENTRAL'),
  ('BR', '10', 'Bihar',                                    'बिहार',              false, 'EAST'),
  ('SK', '11', 'Sikkim',                                   'सिक्किम',            false, 'NORTH_EAST'),
  ('AR', '12', 'Arunachal Pradesh',                        'अरुणाचल प्रदेश',     false, 'NORTH_EAST'),
  ('NL', '13', 'Nagaland',                                 'नागालैंड',           false, 'NORTH_EAST'),
  ('MN', '14', 'Manipur',                                  'मणिपुर',             false, 'NORTH_EAST'),
  ('MZ', '15', 'Mizoram',                                  'मिज़ोरम',            false, 'NORTH_EAST'),
  ('TR', '16', 'Tripura',                                  'त्रिपुरा',           false, 'NORTH_EAST'),
  ('ML', '17', 'Meghalaya',                                'मेघालय',             false, 'NORTH_EAST'),
  ('AS', '18', 'Assam',                                    'असम',                false, 'NORTH_EAST'),
  ('WB', '19', 'West Bengal',                              'पश्चिम बंगाल',       false, 'EAST'),
  ('JH', '20', 'Jharkhand',                                'झारखंड',             false, 'EAST'),
  ('OD', '21', 'Odisha',                                   'ओडिशा',              false, 'EAST'),
  ('CG', '22', 'Chhattisgarh',                             'छत्तीसगढ़',          false, 'CENTRAL'),
  ('MP', '23', 'Madhya Pradesh',                           'मध्य प्रदेश',        false, 'CENTRAL'),
  ('GJ', '24', 'Gujarat',                                  'गुजरात',             false, 'WEST'),
  ('DH', '26', 'Dadra and Nagar Haveli and Daman and Diu', null,                 true,  'WEST'),
  ('MH', '27', 'Maharashtra',                              'महाराष्ट्र',         false, 'WEST'),
  ('KA', '29', 'Karnataka',                                'कर्नाटक',            false, 'SOUTH'),
  ('GA', '30', 'Goa',                                      'गोवा',               false, 'WEST'),
  ('LD', '31', 'Lakshadweep',                              'लक्षद्वीप',          true,  'SOUTH'),
  ('KL', '32', 'Kerala',                                   'केरल',               false, 'SOUTH'),
  ('TN', '33', 'Tamil Nadu',                               'तमिल नाडु',          false, 'SOUTH'),
  ('PY', '34', 'Puducherry',                               'पुडुचेरी',           true,  'SOUTH'),
  ('AN', '35', 'Andaman and Nicobar Islands',              null,                 true,  'EAST'),
  ('TS', '36', 'Telangana',                                'तेलंगाना',           false, 'SOUTH'),
  ('AP', '37', 'Andhra Pradesh',                           'आंध्र प्रदेश',       false, 'SOUTH'),
  ('LA', '38', 'Ladakh',                                   'लद्दाख',             true,  'NORTH')
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Districts and cities for the initial operating footprint.
-- -----------------------------------------------------------------------------
insert into fulfillment.districts (state_code, name)
values
  ('KA', 'Bengaluru Urban'), ('KA', 'Mysuru'),
  ('MH', 'Mumbai Suburban'), ('MH', 'Pune'), ('MH', 'Nagpur'),
  ('DL', 'New Delhi'), ('DL', 'South West Delhi'),
  ('TN', 'Chennai'), ('TN', 'Coimbatore'),
  ('TS', 'Hyderabad'),
  ('WB', 'Kolkata'),
  ('GJ', 'Ahmedabad'), ('GJ', 'Surat'),
  ('RJ', 'Jaipur'),
  ('UP', 'Lucknow'), ('UP', 'Gautam Buddha Nagar'),
  ('HR', 'Gurugram'),
  ('KL', 'Ernakulam'),
  ('PB', 'Ludhiana'),
  ('MP', 'Indore'),
  ('AS', 'Kamrup Metropolitan'),
  ('BR', 'Patna')
on conflict (state_code, name) do nothing;

insert into fulfillment.cities (district_id, state_code, name, tier, latitude, longitude)
select d.id, d.state_code, c.city, c.tier, c.lat, c.lon
  from (values
    ('KA', 'Bengaluru Urban',      'Bengaluru',  'METRO',  12.971599,  77.594566),
    ('KA', 'Mysuru',               'Mysuru',     'TIER_2', 12.295810,  76.639381),
    ('MH', 'Mumbai Suburban',      'Mumbai',     'METRO',  19.075984,  72.877656),
    ('MH', 'Pune',                 'Pune',       'METRO',  18.520430,  73.856744),
    ('MH', 'Nagpur',               'Nagpur',     'TIER_1', 21.145800,  79.088155),
    ('DL', 'New Delhi',            'New Delhi',  'METRO',  28.613939,  77.209021),
    ('DL', 'South West Delhi',     'Dwarka',     'METRO',  28.592210,  77.046021),
    ('TN', 'Chennai',              'Chennai',    'METRO',  13.082680,  80.270721),
    ('TN', 'Coimbatore',           'Coimbatore', 'TIER_1', 11.016844,  76.955832),
    ('TS', 'Hyderabad',            'Hyderabad',  'METRO',  17.385044,  78.486671),
    ('WB', 'Kolkata',              'Kolkata',    'METRO',  22.572646,  88.363895),
    ('GJ', 'Ahmedabad',            'Ahmedabad',  'METRO',  23.022505,  72.571362),
    ('GJ', 'Surat',                'Surat',      'TIER_1', 21.170240,  72.831061),
    ('RJ', 'Jaipur',               'Jaipur',     'TIER_1', 26.912434,  75.787270),
    ('UP', 'Lucknow',              'Lucknow',    'TIER_1', 26.846694,  80.946166),
    ('UP', 'Gautam Buddha Nagar',  'Noida',      'TIER_1', 28.535517,  77.391029),
    ('HR', 'Gurugram',             'Gurugram',   'TIER_1', 28.459497,  77.026638),
    ('KL', 'Ernakulam',            'Kochi',      'TIER_1',  9.931233,  76.267303),
    ('PB', 'Ludhiana',             'Ludhiana',   'TIER_2', 30.900965,  75.857276),
    ('MP', 'Indore',               'Indore',     'TIER_1', 22.719569,  75.857726),
    ('AS', 'Kamrup Metropolitan',  'Guwahati',   'TIER_2', 26.144518,  91.736237),
    ('BR', 'Patna',                'Patna',      'TIER_1', 25.594095,  85.137566)
  ) as c(state_code, district, city, tier, lat, lon)
  join fulfillment.districts d on d.state_code = c.state_code and d.name = c.district
on conflict (district_id, name) do nothing;

-- -----------------------------------------------------------------------------
-- Pincodes. Real codes for the seeded cities, with realistic serviceability.
-- -----------------------------------------------------------------------------
insert into fulfillment.pincodes
  (pincode, city_id, district_id, state_code, zone_code, locality, is_serviceable,
   prepaid_available, cod_available, reverse_pickup_available, is_oda, default_sla_days, cod_limit_paise)
select p.pincode, c.id, c.district_id, c.state_code, p.zone, p.locality,
       true, true, p.cod, p.reverse, p.oda, p.sla, p.cod_limit
  from (values
    -- Bengaluru
    ('560001', 'Bengaluru',  'MG Road',            'LOCAL', true,  true,  false, 2,  2000000::bigint),
    ('560034', 'Bengaluru',  'Koramangala',        'LOCAL', true,  true,  false, 2,  2000000),
    ('560066', 'Bengaluru',  'Whitefield',         'LOCAL', true,  true,  false, 2,  2000000),
    ('560103', 'Bengaluru',  'Bellandur',          'LOCAL', true,  true,  false, 2,  2000000),
    ('560095', 'Bengaluru',  'Koramangala 8th Block','LOCAL', true, true, false, 2,  2000000),
    -- Mysuru
    ('570001', 'Mysuru',     'Mysuru City',        'ZONAL', true,  true,  false, 3,  1500000),
    -- Mumbai
    ('400001', 'Mumbai',     'Fort',               'LOCAL', true,  true,  false, 2,  2000000),
    ('400050', 'Mumbai',     'Bandra West',        'LOCAL', true,  true,  false, 2,  2000000),
    ('400076', 'Mumbai',     'Powai',              'LOCAL', true,  true,  false, 2,  2000000),
    ('400703', 'Mumbai',     'Airoli',             'LOCAL', true,  true,  false, 3,  2000000),
    -- Pune
    ('411001', 'Pune',       'Pune Camp',          'LOCAL', true,  true,  false, 2,  2000000),
    ('411057', 'Pune',       'Hinjewadi',          'LOCAL', true,  true,  false, 2,  2000000),
    -- Nagpur
    ('440001', 'Nagpur',     'Nagpur GPO',         'ZONAL', true,  true,  false, 3,  1500000),
    -- Delhi
    ('110001', 'New Delhi',  'Connaught Place',    'LOCAL', true,  true,  false, 2,  2000000),
    ('110016', 'New Delhi',  'Hauz Khas',          'LOCAL', true,  true,  false, 2,  2000000),
    ('110024', 'New Delhi',  'Lajpat Nagar',       'LOCAL', true,  true,  false, 2,  2000000),
    ('110075', 'Dwarka',     'Dwarka Sector 12',   'LOCAL', true,  true,  false, 2,  2000000),
    -- Chennai
    ('600001', 'Chennai',    'Parrys',             'LOCAL', true,  true,  false, 2,  2000000),
    ('600042', 'Chennai',    'Velachery',          'LOCAL', true,  true,  false, 2,  2000000),
    ('600096', 'Chennai',    'Perungudi',          'LOCAL', true,  true,  false, 2,  2000000),
    -- Coimbatore
    ('641001', 'Coimbatore', 'Coimbatore RS Puram','ZONAL', true,  true,  false, 3,  1500000),
    -- Hyderabad
    ('500001', 'Hyderabad',  'Afzalgunj',          'LOCAL', true,  true,  false, 2,  2000000),
    ('500032', 'Hyderabad',  'Gachibowli',         'LOCAL', true,  true,  false, 2,  2000000),
    ('500081', 'Hyderabad',  'Madhapur',           'LOCAL', true,  true,  false, 2,  2000000),
    -- Kolkata
    ('700001', 'Kolkata',    'BBD Bagh',           'LOCAL', true,  true,  false, 3,  1500000),
    ('700091', 'Kolkata',    'Salt Lake Sector V', 'LOCAL', true,  true,  false, 3,  1500000),
    -- Ahmedabad / Surat
    ('380001', 'Ahmedabad',  'Ahmedabad GPO',      'LOCAL', true,  true,  false, 3,  1500000),
    ('380015', 'Ahmedabad',  'Satellite',          'LOCAL', true,  true,  false, 3,  1500000),
    ('395003', 'Surat',      'Surat Nanpura',      'ZONAL', true,  true,  false, 3,  1500000),
    -- Jaipur
    ('302001', 'Jaipur',     'Jaipur GPO',         'REST_OF_INDIA', true, true, false, 4, 1000000),
    ('302017', 'Jaipur',     'Malviya Nagar',      'REST_OF_INDIA', true, true, false, 4, 1000000),
    -- Lucknow / Noida / Gurugram
    ('226001', 'Lucknow',    'Lucknow GPO',        'REST_OF_INDIA', true, true, false, 4, 1000000),
    ('201301', 'Noida',      'Noida Sector 1',     'REST_OF_INDIA', true, true, false, 3, 1500000),
    ('122001', 'Gurugram',   'Gurugram Civil Lines','REST_OF_INDIA', true, true, false, 3, 1500000),
    ('122018', 'Gurugram',   'Sector 47',          'REST_OF_INDIA', true, true, false, 3, 1500000),
    -- Kochi
    ('682001', 'Kochi',      'Fort Kochi',         'REST_OF_INDIA', true, true, false, 4, 1000000),
    ('682030', 'Kochi',      'Kakkanad',           'REST_OF_INDIA', true, true, false, 4, 1000000),
    -- Ludhiana / Indore
    ('141001', 'Ludhiana',   'Ludhiana GPO',       'REST_OF_INDIA', true, true, false, 4, 1000000),
    ('452001', 'Indore',     'Indore GPO',         'REST_OF_INDIA', true, true, false, 4, 1000000),
    -- Guwahati: north-east zone, ODA surcharge, no reverse pickup
    ('781001', 'Guwahati',   'Guwahati GPO',       'NORTH_EAST',    true, false, true,  8,  500000),
    -- Patna
    ('800001', 'Patna',      'Patna GPO',          'REST_OF_INDIA', true, true, false, 5, 1000000)
  ) as p(pincode, city, locality, zone, cod, reverse, oda, sla, cod_limit)
  join fulfillment.cities c on c.name = p.city
on conflict (pincode) do nothing;

-- -----------------------------------------------------------------------------
-- Carriers and their serviceability. The mock carrier exists so local development
-- and E2E tests never call a real logistics API.
-- -----------------------------------------------------------------------------
insert into fulfillment.carriers
  (code, name, integration_type, supports_cod, supports_reverse, supports_qc_at_pickup,
   max_weight_grams, volumetric_divisor, average_delivery_days, on_time_rate, rto_rate, selection_priority,
   tracking_url_template)
values
  ('MOCK',       'NovaMart Mock Carrier', 'IN_HOUSE',   true, true, true,  50000, 5000, 2.0, 99.00, 0.50, 5,
   'http://localhost:4011/track/{awb}'),
  ('DELHIVERY',  'Delhivery',             'DIRECT',     true, true, true,  50000, 5000, 3.2, 92.50, 4.80, 10,
   'https://www.delhivery.com/track/package/{awb}'),
  ('BLUEDART',   'Blue Dart',             'DIRECT',     true, true, false, 30000, 5000, 2.4, 95.20, 3.10, 20,
   'https://www.bluedart.com/tracking/{awb}'),
  ('XPRESSBEES', 'XpressBees',            'DIRECT',     true, true, true,  30000, 5000, 3.5, 90.10, 5.60, 30,
   'https://www.xpressbees.com/track/{awb}'),
  ('ECOMEXPRESS','Ecom Express',          'DIRECT',     true, true, true,  25000, 5000, 3.8, 89.40, 6.20, 40,
   'https://ecomexpress.in/tracking/{awb}'),
  ('SHIPROCKET', 'Shiprocket',            'AGGREGATOR', true, true, true,  50000, 5000, 3.6, 90.80, 5.10, 50,
   'https://shiprocket.co/tracking/{awb}')
on conflict (code) do nothing;

-- Every seeded pincode is serviceable by the mock carrier (for tests) and by
-- Delhivery (the launch default), with the pincode's own SLA.
insert into fulfillment.carrier_serviceability
  (carrier_id, pincode, prepaid_available, cod_available, reverse_available, sla_days, cod_limit_paise, is_oda, oda_surcharge_paise)
select c.id, p.pincode, true, p.cod_available, p.reverse_pickup_available,
       p.default_sla_days, p.cod_limit_paise, p.is_oda,
       case when p.is_oda then 7500 else 0 end
  from fulfillment.pincodes p
  cross join fulfillment.carriers c
 where c.code in ('MOCK', 'DELHIVERY')
on conflict (carrier_id, pincode) do nothing;

-- Blue Dart covers metros only, faster and pricier.
insert into fulfillment.carrier_serviceability
  (carrier_id, pincode, prepaid_available, cod_available, reverse_available, sla_days, cod_limit_paise)
select c.id, p.pincode, true, p.cod_available, true, greatest(p.default_sla_days - 1, 1), p.cod_limit_paise
  from fulfillment.pincodes p
  join fulfillment.cities ct on ct.id = p.city_id
  cross join fulfillment.carriers c
 where c.code = 'BLUEDART' and ct.tier = 'METRO'
on conflict (carrier_id, pincode) do nothing;

-- -----------------------------------------------------------------------------
-- Rate cards. Zone-based slabs, as Indian courier pricing actually works.
-- -----------------------------------------------------------------------------
insert into fulfillment.carrier_rate_cards
  (carrier_id, name, shipment_mode, direction, cod_fee_paise, cod_fee_percentage,
   insurance_percentage, fuel_surcharge_percentage, gst_rate)
select c.id, c.name || ' — Surface Forward', 'SURFACE', 'FORWARD', 3500, 1.500, 0.100, 8.000, 18.000
  from fulfillment.carriers c
 where c.code in ('MOCK', 'DELHIVERY', 'BLUEDART', 'XPRESSBEES', 'ECOMEXPRESS', 'SHIPROCKET')
on conflict do nothing;

insert into fulfillment.carrier_rate_cards
  (carrier_id, name, shipment_mode, direction, cod_fee_paise, cod_fee_percentage,
   insurance_percentage, fuel_surcharge_percentage, gst_rate)
select c.id, c.name || ' — Surface Reverse', 'SURFACE', 'REVERSE', 0, 0, 0.100, 8.000, 18.000
  from fulfillment.carriers c
 where c.code in ('MOCK', 'DELHIVERY', 'XPRESSBEES', 'ECOMEXPRESS')
on conflict do nothing;

-- Slabs: 500 g base plus 500 g steps, priced by zone.
insert into fulfillment.carrier_rate_slabs
  (rate_card_id, zone_code, base_weight_grams, base_charge_paise, additional_step_grams, additional_charge_paise, min_charge_paise)
select rc.id, z.code, 500, z.base, 500, z.step, z.base
  from fulfillment.carrier_rate_cards rc
  cross join (values
    ('LOCAL',          3200::bigint, 2600::bigint),
    ('ZONAL',          4200,         3400),
    ('METRO_TO_METRO', 4800,         3800),
    ('REST_OF_INDIA',  5600,         4600),
    ('NORTH_EAST',     8400,         7200),
    ('JAMMU_KASHMIR',  9200,         7800),
    ('ISLANDS',       11500,        10200)
  ) as z(code, base, step)
 where rc.direction = 'FORWARD'
on conflict (rate_card_id, zone_code, base_weight_grams) do nothing;

-- Reverse legs are typically dearer than forward for the same zone.
insert into fulfillment.carrier_rate_slabs
  (rate_card_id, zone_code, base_weight_grams, base_charge_paise, additional_step_grams, additional_charge_paise, min_charge_paise)
select rc.id, z.code, 500, z.base, 500, z.step, z.base
  from fulfillment.carrier_rate_cards rc
  cross join (values
    ('LOCAL',          4000::bigint, 3200::bigint),
    ('ZONAL',          5200,         4200),
    ('METRO_TO_METRO', 5800,         4600),
    ('REST_OF_INDIA',  6800,         5600),
    ('NORTH_EAST',    10200,         8600),
    ('JAMMU_KASHMIR', 11000,         9200),
    ('ISLANDS',       13500,        11800)
  ) as z(code, base, step)
 where rc.direction = 'REVERSE'
on conflict (rate_card_id, zone_code, base_weight_grams) do nothing;
