-- =============================================================================
-- NovaMart seed — 00 Platform configuration
--
-- These rows make the platform functional without a deploy: business rules, feature
-- flags, app version policy, tax slabs, commission defaults, return policy and Buy
-- Box weights. Resolution functions raise if a GLOBAL fallback is missing, so the
-- global rules here are load-bearing, not decorative.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- platform.platform_settings
-- -----------------------------------------------------------------------------
insert into platform.platform_settings (key, value, value_type, category, label, description, is_public, default_value) values
  ('commerce.min_order_value_paise',        '9900',   'number',  'commerce', 'Minimum order value',            'Orders below this are blocked at checkout.', true,  '9900'),
  ('commerce.free_shipping_threshold_paise','49900',  'number',  'commerce', 'Free shipping threshold',        'Cart value at or above which shipping is free.', true, '49900'),
  ('commerce.max_cart_items',              '50',     'number',  'commerce', 'Maximum cart lines',             'Distinct listings permitted in one cart.', true, '50'),
  ('commerce.max_quantity_per_item',       '10',     'number',  'commerce', 'Maximum quantity per line',      'Default per-line cap; a listing may set a lower cap.', true, '10'),

  ('checkout.reservation_ttl_minutes',     '15',     'number',  'checkout', 'Stock reservation TTL',          'Minutes an unpaid checkout may hold stock.', false, '15'),
  ('checkout.session_ttl_minutes',         '30',     'number',  'checkout', 'Checkout session TTL',           'Minutes before a checkout session expires.', false, '30'),
  ('checkout.price_change_tolerance_paise','0',      'number',  'checkout', 'Price change tolerance',         'Paise of price drift accepted without re-confirmation.', false, '0'),

  ('payment.cod_max_order_value_paise',    '2000000','number',  'payment',  'COD order ceiling',              'Maximum order value eligible for cash on delivery.', true, '2000000'),
  ('payment.cod_fee_paise',                '4900',   'number',  'payment',  'COD handling fee',               'Fee added to COD orders.', true, '4900'),
  ('payment.cod_partial_prepay_percentage','20',     'number',  'payment',  'COD partial prepay share',       'Share of order value prepaid when COD risk is elevated.', false, '20'),
  ('payment.retry_window_minutes',         '60',     'number',  'payment',  'Payment retry window',           'Minutes a customer may retry payment on an unpaid order.', false, '60'),
  ('payment.refund_auto_approve_limit_paise','500000','number', 'payment',  'Refund auto-approval limit',     'Refunds at or below this amount skip manual approval.', false, '500000'),

  ('returns.default_window_days',          '7',      'number',  'returns',  'Default return window',          'Fallback when no category policy applies.', true, '7'),
  ('returns.max_returns_per_user_90d',     '10',     'number',  'returns',  'Return volume threshold',        'Returns in 90 days before the abuse rule fires.', false, '10'),
  ('returns.reverse_pickup_attempts',      '3',      'number',  'returns',  'Reverse pickup attempts',        'Pickup attempts before a return is cancelled.', false, '3'),

  ('shipping.default_sla_days',            '5',      'number',  'shipping', 'Default delivery SLA',           'Fallback transit days when no carrier SLA is known.', true, '5'),
  ('shipping.ndr_max_attempts',            '3',      'number',  'shipping', 'Delivery attempts before RTO',   'Failed attempts after which a shipment is returned to origin.', false, '3'),

  ('seller.default_dispatch_sla_hours',    '48',     'number',  'seller',   'Default dispatch SLA',           'Hours a seller has to dispatch a confirmed order.', false, '48'),
  ('seller.settlement_hold_days',          '7',      'number',  'seller',   'Settlement hold period',         'Days sale proceeds are held after delivery.', false, '7'),
  ('seller.min_seller_score_for_buybox',   '40',     'number',  'seller',   'Buy Box minimum score',          'Sellers below this score are excluded from the Buy Box.', false, '40'),
  ('seller.auto_suspend_cancellation_rate','15',     'number',  'seller',   'Auto-suspend cancellation rate', 'Cancellation rate that triggers review for suspension.', false, '15'),

  ('support.first_response_minutes',       '240',    'number',  'support',  'Default first response SLA',     'Business minutes to first agent response.', false, '240'),
  ('support.resolution_minutes',           '2880',   'number',  'support',  'Default resolution SLA',         'Business minutes to resolution.', false, '2880'),

  ('security.max_addresses_per_user',      '15',     'number',  'security', 'Address book limit',             'Addresses a customer may store.', false, '15'),
  ('security.otp_max_attempts',            '5',      'number',  'security', 'OTP attempt limit',              'Failed OTP attempts before lockout.', false, '5'),
  ('security.session_idle_minutes_staff',  '30',     'number',  'security', 'Staff session idle timeout',      'Minutes of inactivity before a staff session ends.', false, '30'),

  ('catalog.min_product_images',           '3',      'number',  'catalog',  'Minimum product images',         'Images required before a product can be submitted.', false, '3'),
  ('catalog.moderation_sla_hours',         '24',     'number',  'catalog',  'Moderation SLA',                 'Hours to moderate a submitted product.', false, '24'),

  ('search.results_per_page',              '24',     'number',  'search',   'Search page size',               'Results per page on PLP and search.', true, '24'),
  ('search.max_facet_values',              '20',     'number',  'search',   'Facet value limit',              'Values shown per facet before "show more".', true, '20'),

  ('general.support_phone',                '"1800-000-6682"', 'string', 'general', 'Support phone',           'Customer care number shown in apps.', true, '"1800-000-6682"'),
  ('general.support_email',                '"care@novamart.in"', 'string', 'general', 'Support email',        'Customer care email shown in apps.', true, '"care@novamart.in"'),
  ('general.currency',                     '"INR"',  'string',  'general',  'Platform currency',              'ISO currency code.', true, '"INR"'),
  ('general.supported_locales',            '["en-IN","hi-IN"]', 'array', 'general', 'Supported locales',      'Locales the clients may request.', true, '["en-IN","hi-IN"]')
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- platform.feature_flags (brief §49)
-- -----------------------------------------------------------------------------
insert into platform.feature_flags (key, name, description, is_enabled, default_value, rollout_percentage, owner_team) values
  ('COD_ENABLED',          'Cash on delivery',        'Master switch for COD across the platform.',                true,  true,  100, 'payments'),
  ('UPI_ENABLED',          'UPI payments',            'UPI collect and intent flows.',                             true,  true,  100, 'payments'),
  ('EMI_ENABLED',          'EMI payments',            'Card and cardless EMI at checkout.',                        true,  false, 100, 'payments'),
  ('FLASH_SALE_ENABLED',   'Flash sales',             'Time-boxed, quantity-limited deals.',                       true,  true,  100, 'growth'),
  ('SELLER_ADS_ENABLED',   'Sponsored listings',      'Seller-funded sponsored placements in search and PLP.',     false, false, 0,   'ads'),
  ('AI_ASSISTANT_ENABLED', 'Nova AI assistant',       'Grounded shopping assistant. Off until core commerce is stable.', false, false, 0, 'discovery'),
  ('NEW_CHECKOUT_ENABLED', 'New checkout flow',       'Progressive rollout of the redesigned checkout.',           false, false, 0,   'checkout'),
  ('REVIEWS_MEDIA_ENABLED','Review photos and video', 'Customer media on reviews.',                                true,  true,  100, 'trust'),
  ('WISHLIST_SHARING',     'Shareable wishlists',     'Public wishlist links.',                                    true,  false, 50,  'growth'),
  ('VOICE_SEARCH_ENABLED', 'Voice search',            'Speech-to-text search in the mobile apps.',                 true,  false, 25,  'discovery'),
  ('MULTI_WAREHOUSE_ALLOCATION', 'Multi-node allocation', 'Split a single order item across warehouses.',          false, false, 0,   'fulfilment')
on conflict (key) do nothing;

-- Targeting example: EMI only above a meaningful order value, and never for COD.
insert into platform.feature_flag_rules (flag_key, priority, attribute, operator, comparand, outcome, description)
select 'EMI_ENABLED', 10, 'user_segment', 'in', '["PREMIUM","REPEAT_BUYER"]'::jsonb, true,
       'EMI enabled for premium and repeat buyers first'
where not exists (
  select 1 from platform.feature_flag_rules where flag_key = 'EMI_ENABLED' and priority = 10
);

-- -----------------------------------------------------------------------------
-- platform.app_version_policies (brief §83)
-- -----------------------------------------------------------------------------
insert into platform.app_version_policies (app, platform, minimum_version, latest_version, store_url) values
  ('customer',  'android', '1.0.0', '1.0.0', 'https://play.google.com/store/apps/details?id=in.novamart.customer'),
  ('customer',  'ios',     '1.0.0', '1.0.0', 'https://apps.apple.com/in/app/novamart/id0000000001'),
  ('seller',    'android', '1.0.0', '1.0.0', 'https://play.google.com/store/apps/details?id=in.novamart.seller'),
  ('seller',    'ios',     '1.0.0', '1.0.0', 'https://apps.apple.com/in/app/novamart-seller/id0000000002'),
  ('delivery',  'android', '1.0.0', '1.0.0', 'https://play.google.com/store/apps/details?id=in.novamart.delivery'),
  ('delivery',  'ios',     '1.0.0', '1.0.0', 'https://apps.apple.com/in/app/novamart-delivery/id0000000003'),
  ('warehouse', 'android', '1.0.0', '1.0.0', 'https://play.google.com/store/apps/details?id=in.novamart.warehouse'),
  ('warehouse', 'ios',     '1.0.0', '1.0.0', 'https://apps.apple.com/in/app/novamart-warehouse/id0000000004')
on conflict (app, platform) do nothing;

-- -----------------------------------------------------------------------------
-- platform.integration_settings — local development wiring. Secrets are referenced
-- by name only; the values live in the secret manager.
-- -----------------------------------------------------------------------------
insert into platform.integration_settings
  (integration_type, provider_code, display_name, environment, is_enabled, priority, configuration, secret_references, webhook_path)
values
  ('PAYMENT_GATEWAY', 'MOCK',       'Mock Gateway',    'local', true,  10,
    '{"base_url":"http://localhost:4010","auto_succeed":true}'::jsonb, '{}'::jsonb, '/api/v1/webhooks/payments/mock'),
  ('PAYMENT_GATEWAY', 'RAZORPAY',   'Razorpay',        'local', false, 20,
    '{"base_url":"https://api.razorpay.com/v1","currency":"INR","capture":"automatic"}'::jsonb,
    '{"key_id":"RAZORPAY_KEY_ID","key_secret":"RAZORPAY_KEY_SECRET","webhook_secret":"RAZORPAY_WEBHOOK_SECRET"}'::jsonb,
    '/api/v1/webhooks/payments/razorpay'),
  ('SHIPPING_CARRIER','MOCK',       'Mock Carrier',    'local', true,  10,
    '{"base_url":"http://localhost:4011","auto_deliver_after_hours":2}'::jsonb, '{}'::jsonb,
    '/api/v1/webhooks/shipping/mock'),
  ('SHIPPING_CARRIER','SHIPROCKET', 'Shiprocket',      'local', false, 20,
    '{"base_url":"https://apiv2.shiprocket.in/v1/external"}'::jsonb,
    '{"email":"SHIPROCKET_EMAIL","password":"SHIPROCKET_PASSWORD"}'::jsonb,
    '/api/v1/webhooks/shipping/shiprocket'),
  ('SMS',             'MOCK',       'Mock SMS',        'local', true,  10, '{}'::jsonb, '{}'::jsonb, null),
  ('EMAIL',           'MOCK',       'Mock Email',      'local', true,  10, '{"catch_all":"http://localhost:54324"}'::jsonb, '{}'::jsonb, null),
  ('PUSH',            'FCM',        'Firebase Cloud Messaging', 'local', false, 10,
    '{}'::jsonb, '{"service_account":"FCM_SERVICE_ACCOUNT_JSON_BASE64"}'::jsonb, null),
  ('SEARCH',          'TYPESENSE',  'Typesense',       'local', true,  10,
    '{"host":"127.0.0.1","port":8108,"protocol":"http"}'::jsonb,
    '{"admin_api_key":"TYPESENSE_ADMIN_API_KEY"}'::jsonb, null)
on conflict (integration_type, provider_code, environment) do nothing;

-- -----------------------------------------------------------------------------
-- pricing.tax_rules — GST slabs by HSN. Real HSN codes for the seeded catalogue.
-- -----------------------------------------------------------------------------
insert into pricing.tax_rules (hsn_code, description, gst_rate, effective_from, notification_reference) values
  ('8517', 'Telephone sets including smartphones',                18, '2024-04-01', 'Notification 1/2017-CT(R) Sch III'),
  ('8471', 'Automatic data processing machines (laptops, tablets)',18, '2024-04-01', 'Notification 1/2017-CT(R) Sch III'),
  ('8518', 'Headphones, earphones and speakers',                  18, '2024-04-01', 'Notification 1/2017-CT(R) Sch III'),
  ('9102', 'Wrist watches and smart watches',                     18, '2024-04-01', 'Notification 1/2017-CT(R) Sch III'),
  ('8528', 'Television sets and monitors',                        18, '2024-04-01', 'Notification 1/2017-CT(R) Sch III'),
  ('8450', 'Household washing machines',                          18, '2024-04-01', 'Notification 1/2017-CT(R) Sch III'),
  ('8418', 'Refrigerators and freezers',                          18, '2024-04-01', 'Notification 1/2017-CT(R) Sch III'),
  ('3304', 'Beauty and skin care preparations',                   18, '2024-04-01', 'Notification 1/2017-CT(R) Sch III'),
  ('4202', 'Trunks, suitcases, handbags and backpacks',           18, '2024-04-01', 'Notification 1/2017-CT(R) Sch III'),
  ('9503', 'Toys, puzzles and games',                             12, '2024-04-01', 'Notification 1/2017-CT(R) Sch II'),
  ('4901', 'Printed books',                                        0, '2024-04-01', 'Notification 2/2017-CT(R) — exempt'),
  ('2106', 'Food preparations not elsewhere specified',            18, '2024-04-01', 'Notification 1/2017-CT(R) Sch III')
on conflict do nothing;

-- Apparel and footwear carry a price-threshold slab: 5% up to ₹1,000, 12% above.
insert into pricing.tax_rules
  (hsn_code, description, gst_rate, price_threshold_paise, rate_above_threshold, effective_from, notification_reference)
values
  ('6109', 'T-shirts, singlets and vests',      5, 100000, 12, '2024-04-01', 'Apparel slab: 5% up to Rs.1000'),
  ('6203', 'Men''s suits, trousers and shorts', 5, 100000, 12, '2024-04-01', 'Apparel slab: 5% up to Rs.1000'),
  ('6204', 'Women''s suits, dresses and skirts',5, 100000, 12, '2024-04-01', 'Apparel slab: 5% up to Rs.1000'),
  ('6403', 'Leather footwear',                  5, 100000, 18, '2024-04-01', 'Footwear slab: 5% up to Rs.1000'),
  ('6404', 'Footwear with textile uppers',      5, 100000, 18, '2024-04-01', 'Footwear slab: 5% up to Rs.1000')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- pricing.commission_rules — the GLOBAL fallback is load-bearing:
-- pricing.resolve_commission raises if nothing resolves.
-- -----------------------------------------------------------------------------
insert into pricing.commission_rules
  (name, scope_type, commission_type, percentage, closing_fee_paise,
   payment_gateway_fee_percentage, commission_gst_rate, priority, effective_from)
values
  ('Platform default commission', 'GLOBAL', 'PERCENTAGE', 12.000, 1000, 2.000, 18.000, 1000, '2026-01-01')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- pricing.buy_box_weights — the default scoring profile.
-- -----------------------------------------------------------------------------
insert into pricing.buy_box_weights (name, category_id) values ('Platform default', null)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- returns.return_reasons
-- -----------------------------------------------------------------------------
insert into returns.return_reasons
  (code, label, category, fault_attribution, requires_evidence, min_evidence_count, auto_approve, requires_qc, allowed_resolutions, display_order)
values
  ('DAMAGED_IN_TRANSIT',   'Item arrived damaged',              'DAMAGED',      'CARRIER',  true,  2, false, true,  '{REFUND,REPLACEMENT}', 10),
  ('DEFECTIVE',            'Item is defective or not working',  'QUALITY',      'SELLER',   true,  2, false, true,  '{REFUND,REPLACEMENT}', 20),
  ('WRONG_ITEM_SENT',      'Wrong item was delivered',          'WRONG_ITEM',   'SELLER',   true,  2, false, true,  '{REFUND,REPLACEMENT}', 30),
  ('MISSING_PARTS',        'Parts or accessories missing',      'MISSING',      'SELLER',   true,  1, false, true,  '{REFUND,REPLACEMENT}', 40),
  ('NOT_AS_DESCRIBED',     'Item does not match the listing',   'QUALITY',      'SELLER',   true,  2, false, true,  '{REFUND,REPLACEMENT}', 50),
  ('SIZE_TOO_SMALL',       'Size too small',                    'SIZE_FIT',     'CUSTOMER', false, 0, false, true,  '{REFUND,REPLACEMENT}', 60),
  ('SIZE_TOO_LARGE',       'Size too large',                    'SIZE_FIT',     'CUSTOMER', false, 0, false, true,  '{REFUND,REPLACEMENT}', 70),
  ('CHANGED_MIND',         'No longer needed',                  'CHANGED_MIND', 'CUSTOMER', false, 0, false, true,  '{REFUND}',             80),
  ('FOUND_BETTER_PRICE',   'Found a better price elsewhere',    'BETTER_PRICE', 'CUSTOMER', false, 0, false, true,  '{REFUND}',             90),
  ('NEVER_DELIVERED',      'Marked delivered but never received','MISSING',     'CARRIER',  false, 0, false, false, '{REFUND}',            100),
  ('LATE_DELIVERY',        'Delivered too late to be useful',   'LATE_DELIVERY','CARRIER',  false, 0, false, true,  '{REFUND}',            110)
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- returns.return_policies — GLOBAL fallback so returns.resolve_policy always resolves.
-- -----------------------------------------------------------------------------
insert into returns.return_policies
  (name, scope_type, return_type, return_window_days, replacement_window_days,
   requires_original_packaging, requires_all_accessories, customer_bears_reverse_freight,
   requires_qc, restock_on_pass, priority, effective_from)
values
  ('Platform default 7-day return', 'GLOBAL', 'REFUND_OR_REPLACEMENT', 7, 7, true, true, false, true, true, 1000, '2026-01-01')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- analytics.fraud_rules — all seeded in shadow mode (brief §50). They score and log
-- but take no action until false-positive rates have been measured.
-- -----------------------------------------------------------------------------
insert into analytics.fraud_rules
  (code, name, description, category, subject_type, conditions, score_weight, action, severity, is_shadow_mode)
values
  ('COD_RTO_REPEAT', 'Repeat COD refusal',
   'Customer has refused delivery on multiple COD orders.', 'COD_ABUSE', 'USER',
   '{"metric":"cod_rto_count","operator":"gte","value":2,"window_days":180}'::jsonb,
   35.00, 'BLOCK_COD', 'HIGH', true),
  ('COD_HIGH_VALUE_NEW_USER', 'High-value COD from new account',
   'First-time customer attempting a high-value COD order.', 'COD_ABUSE', 'USER',
   '{"all":[{"metric":"lifetime_order_count","operator":"eq","value":0},{"metric":"cart_value_paise","operator":"gte","value":1500000}]}'::jsonb,
   25.00, 'REQUIRE_PREPAY', 'MEDIUM', true),
  ('RETURN_RATE_EXCESSIVE', 'Excessive return rate',
   'Customer returns a disproportionate share of their orders.', 'RETURN_ABUSE', 'USER',
   '{"all":[{"metric":"return_count_90d","operator":"gte","value":8},{"metric":"return_rate","operator":"gte","value":50}]}'::jsonb,
   30.00, 'REVIEW', 'MEDIUM', true),
  ('COUPON_VELOCITY', 'Coupon farming',
   'Many coupon redemptions in a short window, often across accounts on one device.', 'COUPON_ABUSE', 'USER',
   '{"all":[{"metric":"coupon_redemptions_90d","operator":"gte","value":15},{"metric":"distinct_devices_30d","operator":"lte","value":2}]}'::jsonb,
   25.00, 'BLOCK_COUPON', 'MEDIUM', true),
  ('MULTI_ACCOUNT_DEVICE', 'Many accounts on one device',
   'A single device has registered an implausible number of accounts.', 'FAKE_ACCOUNT', 'DEVICE',
   '{"metric":"accounts_per_device_30d","operator":"gte","value":5}'::jsonb,
   40.00, 'OPEN_CASE', 'HIGH', true),
  ('PAYMENT_FAILURE_VELOCITY', 'Card testing pattern',
   'Repeated payment failures in a short window suggest card testing.', 'PAYMENT_FRAUD', 'USER',
   '{"metric":"failed_payment_count_7d","operator":"gte","value":8}'::jsonb,
   45.00, 'BLOCK_CHECKOUT', 'CRITICAL', true),
  ('REVIEW_BURST', 'Review burst from one device',
   'Many reviews from one device in a short window suggests review manipulation.', 'FAKE_REVIEW', 'DEVICE',
   '{"metric":"reviews_per_device_7d","operator":"gte","value":10}'::jsonb,
   30.00, 'FLAG', 'MEDIUM', true),
  ('SELLER_CANCELLATION_SPIKE', 'Seller cancellation spike',
   'Seller cancellation rate has risen sharply, often a sign of phantom inventory.', 'SELLER_MANIPULATION', 'SELLER',
   '{"metric":"seller_cancellation_rate","operator":"gte","value":20,"window_days":30}'::jsonb,
   35.00, 'HOLD_SETTLEMENT', 'HIGH', true),
  ('ADDRESS_REUSE_ACROSS_ACCOUNTS', 'Shared address across accounts',
   'One address used by many accounts, common in promotion abuse rings.', 'FAKE_ACCOUNT', 'ADDRESS',
   '{"metric":"accounts_per_address_90d","operator":"gte","value":6}'::jsonb,
   20.00, 'FLAG', 'LOW', true)
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- support.sla_policies and ticket categories
-- -----------------------------------------------------------------------------
insert into support.sla_policies (code, name, priority, first_response_minutes, resolution_minutes) values
  ('URGENT_SLA', 'Urgent',  'URGENT',  30,   240),
  ('HIGH_SLA',   'High',    'HIGH',    120,  720),
  ('NORMAL_SLA', 'Normal',  'NORMAL',  240,  2880),
  ('LOW_SLA',    'Low',     'LOW',     480,  5760)
on conflict (code) do nothing;

insert into support.ticket_categories (code, name, audience, sla_policy_id, default_queue, requires_order, display_order)
select c.code, c.name, c.audience, s.id, c.queue, c.requires_order, c.display_order
  from (values
    ('ORDER_NOT_DELIVERED', 'Order not delivered',        'CUSTOMER', 'HIGH_SLA',   'DELIVERY', true,  10),
    ('ORDER_DAMAGED',       'Damaged or defective item',  'CUSTOMER', 'HIGH_SLA',   'RETURNS',  true,  20),
    ('REFUND_NOT_RECEIVED', 'Refund not received',        'CUSTOMER', 'URGENT_SLA', 'PAYMENTS', true,  30),
    ('PAYMENT_FAILED',      'Payment failed but debited', 'CUSTOMER', 'URGENT_SLA', 'PAYMENTS', false, 40),
    ('RETURN_PICKUP',       'Return pickup issue',        'CUSTOMER', 'NORMAL_SLA', 'RETURNS',  true,  50),
    ('PRODUCT_QUERY',       'Question about a product',   'CUSTOMER', 'LOW_SLA',    'GENERAL',  false, 60),
    ('ACCOUNT_ISSUE',       'Account or login issue',     'CUSTOMER', 'NORMAL_SLA', 'GENERAL',  false, 70),
    ('SELLER_SETTLEMENT',   'Settlement or payout query', 'SELLER',   'NORMAL_SLA', 'FINANCE',  false, 80),
    ('SELLER_LISTING',      'Listing or catalog issue',   'SELLER',   'NORMAL_SLA', 'CATALOG',  false, 90),
    ('SELLER_ORDER',        'Order or shipping issue',    'SELLER',   'HIGH_SLA',   'FULFILMENT', false, 100),
    ('DELIVERY_APP_ISSUE',  'Delivery app problem',       'DELIVERY', 'HIGH_SLA',   'DELIVERY', false, 110)
  ) as c(code, name, audience, sla_code, queue, requires_order, display_order)
  join support.sla_policies s on s.code = c.sla_code
on conflict (code) do nothing;
