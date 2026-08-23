-- =============================================================================
-- NovaMart seed — 07 Notification templates
--
-- Templates are DATA, not code (brief §47, §92): operations rewords an order
-- confirmation without a deploy. The notification consumer looks templates up by
-- trigger_event, renders {{placeholders}} against the event payload, and queues a row.
--
-- Placeholder names must match the keys the event payload actually carries, because
-- required_params is enforced: a template whose parameters are missing is recorded
-- SUPPRESSED with reason MISSING_PARAMS rather than sent half-rendered.
--
-- Money placeholders come in two forms. `totalPayablePaise` is the raw integer; the
-- consumer additionally exposes `totalPayable` already formatted as Indian currency.
-- Templates use the formatted one.
--
-- Constraints worth knowing:
--   channel  in PUSH | EMAIL | SMS | WHATSAPP | IN_APP
--   category in TRANSACTIONAL | MARKETING | SECURITY | OPERATIONAL
--   EMAIL requires a subject; MARKETING SMS requires a DLT template id
--   code must match ^[A-Z][A-Z0-9_]*$
--
-- All of these are TRANSACTIONAL, so respects_preferences is false: a customer who
-- opted out of marketing must still be told their order shipped.
-- =============================================================================

insert into marketing.notification_templates (
  code, channel, locale, trigger_event, category, subject, title, body,
  required_params, deep_link_template, respects_preferences, respects_quiet_hours,
  priority, is_active
) values

  -- Order confirmed -----------------------------------------------------------
  ('ORDER_CONFIRMED_PUSH', 'PUSH', 'en-IN', 'ORDER_CONFIRMED', 'TRANSACTIONAL',
   null, 'Order confirmed',
   'Your order {{orderNumber}} for {{totalPayable}} is confirmed. We will let you know when it ships.',
   ARRAY['orderNumber', 'totalPayable'], 'novamart://orders/{{orderId}}',
   false, false, 'HIGH', true),

  ('ORDER_CONFIRMED_EMAIL', 'EMAIL', 'en-IN', 'ORDER_CONFIRMED', 'TRANSACTIONAL',
   'Your NovaMart order {{orderNumber}} is confirmed',
   'Order confirmed',
   'Thank you for your order. We have confirmed {{orderNumber}} for {{totalPayable}} and will email you again as soon as it is on its way.',
   ARRAY['orderNumber', 'totalPayable'], 'https://novamart.com/orders/{{orderId}}',
   false, false, 'NORMAL', true),

  ('ORDER_CONFIRMED_HI_PUSH', 'PUSH', 'hi-IN', 'ORDER_CONFIRMED', 'TRANSACTIONAL',
   null, 'ऑर्डर की पुष्टि हुई',
   'आपका ऑर्डर {{orderNumber}} ({{totalPayable}}) कन्फ़र्म हो गया है। भेजते समय हम आपको बताएंगे।',
   ARRAY['orderNumber', 'totalPayable'], 'novamart://orders/{{orderId}}',
   false, false, 'HIGH', true),

  -- Payment -------------------------------------------------------------------
  ('PAYMENT_SUCCESS_PUSH', 'PUSH', 'en-IN', 'PAYMENT_SUCCESS', 'TRANSACTIONAL',
   null, 'Payment received',
   'We have received {{captured}} for order {{orderNumber}}.',
   ARRAY['orderNumber', 'captured'], 'novamart://orders/{{orderId}}',
   false, false, 'HIGH', true),

  -- A failed payment is time-critical: the reservation expires, so the sooner the
  -- customer retries the more likely the stock is still theirs.
  ('PAYMENT_FAILED_PUSH', 'PUSH', 'en-IN', 'PAYMENT_FAILED', 'TRANSACTIONAL',
   null, 'Payment could not be completed',
   'Your payment for order {{orderNumber}} did not go through. Tap to try another method before the items are released.',
   ARRAY['orderNumber'], 'novamart://orders/{{orderId}}/pay',
   false, false, 'CRITICAL', true),

  -- Fulfilment ----------------------------------------------------------------
  ('ORDER_SHIPPED_PUSH', 'PUSH', 'en-IN', 'ORDER_SHIPPED', 'TRANSACTIONAL',
   null, 'Your order has shipped',
   'Order {{orderNumber}} is on its way. Track it with {{awbNumber}}.',
   ARRAY['orderNumber'], 'novamart://orders/{{orderId}}/track',
   false, false, 'HIGH', true),

  ('OUT_FOR_DELIVERY_PUSH', 'PUSH', 'en-IN', 'OUT_FOR_DELIVERY', 'TRANSACTIONAL',
   null, 'Arriving today',
   'Order {{orderNumber}} is out for delivery and should reach you today.',
   ARRAY['orderNumber'], 'novamart://orders/{{orderId}}/track',
   false, false, 'HIGH', true),

  ('ORDER_DELIVERED_PUSH', 'PUSH', 'en-IN', 'ORDER_DELIVERED', 'TRANSACTIONAL',
   null, 'Delivered',
   'Order {{orderNumber}} has been delivered. Tell us what you think.',
   ARRAY['orderNumber'], 'novamart://orders/{{orderId}}/review',
   false, true, 'NORMAL', true),

  -- Cancellation, returns, refunds --------------------------------------------
  ('ORDER_CANCELLED_PUSH', 'PUSH', 'en-IN', 'ORDER_CANCELLED', 'TRANSACTIONAL',
   null, 'Order cancelled',
   'Order {{orderNumber}} has been cancelled. Any amount paid will be refunded to the original payment method.',
   ARRAY['orderNumber'], 'novamart://orders/{{orderId}}',
   false, false, 'HIGH', true),

  ('RETURN_APPROVED_PUSH', 'PUSH', 'en-IN', 'RETURN_APPROVED', 'TRANSACTIONAL',
   null, 'Return approved',
   'Your return {{returnReference}} is approved. We will arrange a pickup shortly.',
   ARRAY['returnReference'], 'novamart://returns/{{returnRequestId}}',
   false, false, 'HIGH', true),

  ('REFUND_SUCCESS_PUSH', 'PUSH', 'en-IN', 'REFUND_SUCCESS', 'TRANSACTIONAL',
   null, 'Refund completed',
   'Your refund of {{amount}} for {{refundReference}} has been processed. Banks usually credit it within 3 to 5 working days.',
   ARRAY['amount', 'refundReference'], 'novamart://orders/{{orderId}}',
   false, false, 'HIGH', true),

  ('REFUND_SUCCESS_EMAIL', 'EMAIL', 'en-IN', 'REFUND_SUCCESS', 'TRANSACTIONAL',
   'Your refund of {{amount}} has been processed',
   'Refund completed',
   'We have processed your refund of {{amount}} against {{refundReference}}. It should appear on your statement within 3 to 5 working days.',
   ARRAY['amount', 'refundReference'], 'https://novamart.com/orders/{{orderId}}',
   false, false, 'NORMAL', true),

  -- Seller-facing -------------------------------------------------------------
  ('SELLER_APPROVED_EMAIL', 'EMAIL', 'en-IN', 'SELLER_APPROVED', 'TRANSACTIONAL',
   'Your NovaMart seller account is approved',
   'You are approved to sell',
   'Congratulations. {{displayName}} ({{sellerCode}}) is approved to sell on NovaMart. Sign in to Seller Center to add your first listing.',
   ARRAY['displayName', 'sellerCode'], 'https://seller.novamart.com/onboarding',
   false, false, 'HIGH', true),

  ('SETTLEMENT_CREATED_EMAIL', 'EMAIL', 'en-IN', 'SETTLEMENT_CREATED', 'TRANSACTIONAL',
   'Settlement {{settlementReference}} is ready',
   'Settlement ready',
   'Settlement {{settlementReference}} for the period {{periodStart}} to {{periodEnd}} is ready, with a net payable of {{netPayable}}.',
   ARRAY['settlementReference', 'netPayable'], 'https://seller.novamart.com/finance/settlements',
   false, false, 'NORMAL', true)

-- The natural key is (code, channel, locale): the same template code legitimately exists
-- per channel and per language, which is how a Hindi push and an English email can share
-- one logical message.
on conflict (code, channel, locale) do nothing;
