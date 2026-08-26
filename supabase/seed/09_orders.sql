-- =============================================================================
-- NovaMart seed — 09 Orders, payments and fulfilment history
--
-- One completed prepaid order gives every local client a truthful order-detail,
-- payment, shipment and review-ready record immediately after `supabase db reset`.
-- It intentionally does not reserve inventory: this order is already delivered.
-- =============================================================================

do $$
declare
  v_user_id uuid := '11111111-1111-4111-8111-111111111111';
  v_order_id uuid;
  v_item_id uuid;
  v_sku_id uuid;
  v_product_id uuid;
  v_listing_id uuid;
  v_seller_id uuid;
  v_warehouse_id uuid;
  v_carrier_id uuid;
  v_address_id uuid;
  v_shipment_id uuid;
  v_price bigint := 1000000;
  v_tax bigint := 152542;
begin
  select a.id into v_address_id
    from identity.addresses a
   where a.user_id = v_user_id and a.label = 'HOME'
   order by a.created_at
   limit 1;

  select l.id, l.seller_id, l.sku_id, l.product_id, l.default_warehouse_id
    into v_listing_id, v_seller_id, v_sku_id, v_product_id, v_warehouse_id
    from catalog.seller_listings l
    join catalog.skus sk on sk.id = l.sku_id
    join seller.sellers s on s.id = l.seller_id
   where s.slug = 'metro-gadget-house' and sk.sku_code = 'NM-SNQ-AURA-BLK'
   limit 1;

  select c.id into v_carrier_id from fulfillment.carriers c where c.code = 'MOCK';

  insert into commerce.orders (
    order_number, user_id, status, fulfillment_summary, currency,
    items_count, units_count, sellers_count, items_subtotal_paise,
    total_discount_paise, shipping_paise, cod_fee_paise, tax_paise,
    total_payable_paise, amount_paid_paise, payment_method, payment_status,
    is_cod, delivery_pincode, promised_delivery_date, client_platform,
    client_version, placed_at, confirmed_at, completed_at
  ) values (
    'NM100000901', v_user_id, 'DELIVERED', 'DELIVERED', 'INR',
    1, 1, 1, v_price, 0, 0, 0, v_tax, v_price, v_price, 'UPI', 'PAID',
    false, '560034', current_date - 20, 'web', 'seed-1.0.0',
    now() - interval '35 days', now() - interval '35 days', now() - interval '28 days'
  ) returning id into v_order_id;

  insert into commerce.order_addresses (
    order_id, address_type, source_address_id, recipient_name, recipient_phone,
    address_line1, address_line2, landmark, locality, city, state_code, pincode,
    delivery_instructions
  )
  select v_order_id, 'SHIPPING', a.id, a.recipient_name, a.recipient_phone,
         a.address_line1, a.address_line2, a.landmark, a.locality, a.city,
         a.state_code, a.pincode, a.delivery_instructions
    from identity.addresses a where a.id = v_address_id;

  insert into commerce.order_items (
    order_id, line_number, listing_id, sku_id, product_id, seller_id, warehouse_id,
    product_title, variant_label, sku_code, brand_name, primary_image_url,
    hsn_code, quantity, status, fulfillment_model, return_window_days, return_type,
    return_eligible_until, is_replacement_allowed, promised_delivery_date,
    dispatched_at, delivered_at
  )
  select v_order_id, 1, v_listing_id, v_sku_id, v_product_id, v_seller_id, v_warehouse_id,
         p.title, pv.variant_label, sk.sku_code, b.name,
         (select pm.public_url from catalog.product_media pm where pm.product_id = p.id and pm.is_primary limit 1),
         p.hsn_code, 1, 'DELIVERED', 'SELLER_FULFILLED', 7, 'REFUND_OR_REPLACEMENT',
         current_date - 14, true, current_date - 20,
         now() - interval '34 days', now() - interval '28 days'
    from catalog.products p
    join catalog.product_variants pv on pv.product_id = p.id and pv.is_default
    join catalog.skus sk on sk.id = v_sku_id and sk.variant_id = pv.id
    left join catalog.brands b on b.id = p.brand_id
   where p.id = v_product_id
  returning id into v_item_id;

  insert into commerce.order_item_price_breakdowns (
    order_item_id, order_id, quantity, unit_mrp_paise, unit_selling_price_paise,
    gross_paise, total_discount_paise, taxable_value_paise, gst_rate,
    cgst_paise, sgst_paise, total_tax_paise, is_intra_state,
    place_of_supply_state_code, total_payable_paise, commission_rate,
    commission_paise, commission_gst_paise, seller_payable_paise, applied_rules
  ) values (
    v_item_id, v_order_id, 1, 1299900, v_price, v_price, 0,
    847458, 18.000, 76271, 76271, v_tax, true, 'KA', v_price, 14.000,
    140000, 25200, 834800, '[{"source":"seed","rule":"historical_order"}]'::jsonb
  );

  insert into commerce.order_price_breakdowns (
    order_id, items_gross_paise, total_discount_paise, taxable_value_paise,
    cgst_paise, sgst_paise, total_tax_paise, total_payable_paise, applied_rules
  ) values (
    v_order_id, v_price, 0, 847458, 76271, 76271, v_tax, v_price,
    '[{"source":"seed","rule":"historical_order"}]'::jsonb
  );

  insert into payments.payment_intents (
    order_id, user_id, provider, provider_intent_id, amount_paise, captured_paise,
    payment_method, status, authorised_at, captured_at, idempotency_key
  ) values (
    v_order_id, v_user_id, 'MOCK', 'mock_seed_nm100000901', v_price, v_price,
    'UPI', 'CAPTURED', now() - interval '35 days', now() - interval '35 days',
    'seed:NM100000901'
  );

  insert into fulfillment.shipments (
    shipment_reference, order_id, seller_id, warehouse_id, carrier_id,
    awb_number, provider_shipment_id, status, declared_value_paise,
    actual_weight_grams, pickup_pincode, delivery_pincode, zone_code,
    delivery_address, pickup_address, promised_delivery_date,
    estimated_delivery_date, picked_up_at, delivered_at
  ) values (
    'SH100000901', v_order_id, v_seller_id, v_warehouse_id, v_carrier_id,
    'MOCKNM100000901', 'mock-shipment-seed-901', 'DELIVERED', v_price,
    610, '400050', '560034', 'ZONAL',
    '{"recipientName":"Ananya Iyer","city":"Bengaluru","pincode":"560034"}'::jsonb,
    '{"warehouse":"Metro Mumbai","pincode":"400050"}'::jsonb,
    current_date - 20, current_date - 20,
    now() - interval '33 days', now() - interval '28 days'
  ) returning id into v_shipment_id;

  insert into fulfillment.shipment_items (shipment_id, order_item_id, sku_id, quantity)
  values (v_shipment_id, v_item_id, v_sku_id, 1);

  insert into fulfillment.tracking_events (
    shipment_id, provider_event_id, carrier_status_code, normalised_status,
    description, occurred_at, location, raw_payload
  ) values
    (v_shipment_id, 'mock-seed-901-pickup', 'PICKED_UP', 'PICKED_UP', 'Shipment picked up', now() - interval '33 days', 'Mumbai', '{"source":"seed"}'::jsonb),
    (v_shipment_id, 'mock-seed-901-delivered', 'DELIVERED', 'DELIVERED', 'Delivered to customer', now() - interval '28 days', 'Bengaluru', '{"source":"seed"}'::jsonb)
  on conflict do nothing;
end;
$$;
