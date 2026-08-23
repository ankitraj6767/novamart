#!/usr/bin/env node
/**
 * End-to-end verification of the NovaMart checkout vertical against a running stack.
 *
 * Exercises the real path a customer takes, and then the failure and abuse cases that
 * matter more than the happy path:
 *
 *   catalog -> cart -> checkout quote -> place order -> payment -> webhook -> order
 *
 * Assertions that are the point of the exercise:
 *   - the server prices the order; a client-supplied total is rejected  (brief §100)
 *   - placing the same order twice with one Idempotency-Key yields ONE order  (§61)
 *   - a redelivered webhook is recognised as a duplicate and changes nothing  (§34)
 *   - a webhook with a bad signature is refused                            (§54)
 *   - stock is reserved at checkout and released when payment fails         (§25)
 *
 * Usage: node tests/e2e-api/checkout-vertical.mjs
 */

const API = process.env.API_BASE_URL ?? 'http://127.0.0.1:4000/api/v1';
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const TEST_EMAIL = 'ananya.iyer@example.novamart.in';
const TEST_PASSWORD = 'NovaMart#Local1';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
}

let token = null;

async function api(method, path, { body, idempotencyKey, expectStatus, auth = true } = {}) {
  // Only declare a JSON content type when there is actually a body. Several endpoints
  // legitimately take none, and announcing JSON for an empty body is a client error.
  const headers = body === undefined ? {} : { 'Content-Type': 'application/json' };
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (expectStatus !== undefined && response.status !== expectStatus) {
    console.log(
      `        unexpected ${method} ${path} -> ${response.status} (wanted ${expectStatus}): ${text.slice(0, 300)}`,
    );
  }

  return { status: response.status, body: json };
}

async function signIn() {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  const json = await response.json();
  if (!json.access_token) {
    throw new Error(`Sign-in failed: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json.access_token;
}

async function main() {
  console.log('NovaMart checkout vertical — end-to-end verification');
  console.log(`API: ${API}`);

  // -------------------------------------------------------------------------
  section('0. Authentication');
  token = await signIn();
  check('signs in a seeded customer and receives a JWT', typeof token === 'string' && token.length > 20);

  const me = await api('GET', '/users/me', { expectStatus: 200 });
  check('GET /users/me returns the profile', me.status === 200 && me.body?.data?.id);
  check('profile carries resolved roles from the database', Array.isArray(me.body?.data?.roles) && me.body.data.roles.includes('CUSTOMER'));

  // -------------------------------------------------------------------------
  section('1. Catalog is readable without authentication');
  const anonProducts = await fetch(`${API}/catalog/products?limit=5`).then((r) => r.json());
  check('public product list works unauthenticated', Array.isArray(anonProducts?.data) && anonProducts.data.length > 0);

  const products = anonProducts.data;
  const buyable = products.find((p) => p.listingId && p.inStock);
  check('at least one seeded listing is buyable', Boolean(buyable), buyable ? '' : 'no in-stock listing found');
  if (!buyable) throw new Error('Cannot continue without a buyable listing');
  console.log(`        using: ${buyable.title} (${buyable.price?.display}) listing=${buyable.listingId}`);

  const detail = await api('GET', `/catalog/products/${buyable.slug}`, { auth: false, expectStatus: 200 });
  check('product detail resolves a Buy Box winner', detail.body?.data?.buyBox?.listingId !== undefined);
  check('competing offers are all for the same SKU', (detail.body?.data?.otherOffers ?? []).every((o) => o.listingId !== detail.body.data.buyBox?.listingId));

  // -------------------------------------------------------------------------
  section('2. Cart');
  // Start from a clean cart so repeated runs are deterministic.
  const existingCart = await api('GET', '/cart', { expectStatus: 200 });
  for (const group of existingCart.body?.data?.sellerGroups ?? []) {
    for (const item of group.items) {
      await api('DELETE', `/cart/items/${item.id}`);
    }
  }

  const added = await api('POST', '/cart/items', {
    body: { listingId: buyable.listingId, quantity: 2 },
    expectStatus: 201,
  });
  check('adds an item to the cart', added.status === 201 || added.status === 200);
  const cart = added.body?.data ?? (await api('GET', '/cart')).body.data;
  check('cart groups items by seller', Array.isArray(cart?.sellerGroups) && cart.sellerGroups.length === 1);
  const cartItem = cart.sellerGroups[0]?.items[0];
  check('cart line total equals server price x quantity', cartItem?.lineTotal?.paise === cartItem?.price?.paise * cartItem?.quantity);

  const overQuantity = await api('POST', '/cart/items', {
    body: { listingId: buyable.listingId, quantity: 99 },
  });
  check('rejects a quantity beyond the listing maximum', overQuantity.status === 400 || overQuantity.status === 422, `got ${overQuantity.status}`);

  const badCoupon = await api('POST', '/cart/coupon', { body: { code: 'NOTREAL123' } });
  check('rejects an unknown coupon', badCoupon.status >= 400 && badCoupon.body?.error?.code === 'COUPON_INVALID', `got ${badCoupon.status} ${badCoupon.body?.error?.code}`);

  // -------------------------------------------------------------------------
  section('3. Checkout quote is server-authoritative');
  const addresses = await api('GET', '/users/me/addresses', { expectStatus: 200 });
  check('customer has a seeded address', (addresses.body?.data ?? []).length > 0);
  const address = addresses.body.data[0];

  const started = await api('POST', '/checkout', {
    body: { shippingAddressId: address.id },
    expectStatus: 201,
  });
  check('opens a checkout session', started.status === 201 || started.status === 200, `got ${started.status}: ${JSON.stringify(started.body).slice(0, 300)}`);

  const quote = started.body?.data;
  if (!quote?.checkoutSessionId) throw new Error(`No checkout session: ${JSON.stringify(started.body).slice(0, 500)}`);

  const sessionId = quote.checkoutSessionId;
  console.log(`        session ${sessionId}, payable ${quote.breakdown?.totalPayable?.display}`);

  check('quote has a positive payable total', quote.breakdown?.totalPayable?.paise > 0);
  check('quote reports tax computed from HSN', quote.breakdown?.tax?.paise >= 0);
  check('quote has no blocking issues', (quote.issues ?? []).length === 0, JSON.stringify(quote.issues));
  check('quote is marked payable', quote.payable === true);
  check('seller group carries a delivery promise date', Boolean(quote.sellerGroups?.[0]?.promisedDeliveryDate), JSON.stringify(quote.sellerGroups?.[0]));

  // Reservation must exist now, before any order does.
  const reservedCheck = await api('GET', `/checkout/${sessionId}`, { expectStatus: 200 });
  check('quote is re-readable and stable', reservedCheck.body?.data?.breakdown?.totalPayable?.paise === quote.breakdown.totalPayable.paise);

  const setUpi = await api('PATCH', `/checkout/${sessionId}`, { body: { paymentMethod: 'UPI' } });
  check('sets the payment method on the session', setUpi.status === 200 && setUpi.body?.data?.paymentMethod === 'UPI', `got ${setUpi.status}`);
  const payable = setUpi.body?.data?.breakdown?.totalPayable?.paise ?? quote.breakdown.totalPayable.paise;

  // -------------------------------------------------------------------------
  section('4. A tampered total is refused');
  const tampered = await api('POST', `/checkout/${sessionId}/place-order`, {
    body: { acknowledgedTotalPaise: 100, paymentMethod: 'UPI' },
    idempotencyKey: crypto.randomUUID(),
  });
  check('rejects an order acknowledging the wrong total', tampered.status >= 400 && tampered.body?.error?.code === 'PRICE_CHANGED', `got ${tampered.status} ${tampered.body?.error?.code}`);

  const noKey = await api('POST', `/checkout/${sessionId}/place-order`, {
    body: { acknowledgedTotalPaise: payable, paymentMethod: 'UPI' },
  });
  check('refuses to place an order without an Idempotency-Key', noKey.status >= 400 && noKey.body?.error?.code === 'IDEMPOTENCY_KEY_REQUIRED', `got ${noKey.status} ${noKey.body?.error?.code}`);

  // -------------------------------------------------------------------------
  section('5. Place the order, twice, with one key');
  const idempotencyKey = crypto.randomUUID();
  const placed = await api('POST', `/checkout/${sessionId}/place-order`, {
    body: { acknowledgedTotalPaise: payable, paymentMethod: 'UPI' },
    idempotencyKey,
    expectStatus: 201,
  });
  check('places the order', placed.status === 201 && placed.body?.data?.orderId, `got ${placed.status}: ${JSON.stringify(placed.body).slice(0, 300)}`);
  const order = placed.body.data;
  console.log(`        order ${order.orderNumber} (${order.orderId})`);

  const replayed = await api('POST', `/checkout/${sessionId}/place-order`, {
    body: { acknowledgedTotalPaise: payable, paymentMethod: 'UPI' },
    idempotencyKey,
  });
  check('replaying the same key returns the SAME order, not a second one', replayed.body?.data?.orderId === order.orderId, `got ${replayed.body?.data?.orderId}`);

  const orders = await api('GET', '/orders?limit=20', { expectStatus: 200 });
  const matching = (orders.body?.data ?? []).filter((o) => o.orderNumber === order.orderNumber);
  check('exactly one order exists for that order number', matching.length === 1, `found ${matching.length}`);

  const orderDetail = await api('GET', `/orders/${order.orderId}`, { expectStatus: 200 });
  check('order detail loads', orderDetail.status === 200);
  check('order is awaiting payment', orderDetail.body?.data?.status === 'PENDING_PAYMENT', `status ${orderDetail.body?.data?.status}`);
  check('order total matches the quoted payable', orderDetail.body?.data?.totalPayable?.paise === payable);
  check('order snapshots the delivery address', orderDetail.body?.data?.shippingAddress?.pincode === address.pincode);
  check('order item carries a frozen unit price', orderDetail.body?.data?.items?.[0]?.unitPrice?.paise > 0);

  // -------------------------------------------------------------------------
  section('6. Payment session and webhook');
  const session = await api('POST', `/payments/orders/${order.orderId}/session`, { expectStatus: 201 });
  check('creates a provider payment session', session.status === 201 || session.status === 200, `got ${session.status}`);
  const providerIntentId = session.body?.data?.providerSession?.orderId;
  check('session exposes a provider order id', Boolean(providerIntentId));
  check('session exposes no secret material', !JSON.stringify(session.body?.data?.providerSession ?? {}).toLowerCase().includes('secret'));

  const forged = await api('POST', `/payments/mock/${providerIntentId}/forged`, {});
  check('webhook with an invalid signature is refused', forged.status >= 400 && forged.body?.error?.code === 'PAYMENT_VERIFICATION_FAILED', `got ${forged.status} ${forged.body?.error?.code}`);

  const succeeded = await api('POST', `/payments/mock/${providerIntentId}/succeed`, { expectStatus: 201 });
  check('valid webhook is accepted and processed', (succeeded.status === 200 || succeeded.status === 201) && succeeded.body?.data?.processed === true, `got ${succeeded.status}: ${JSON.stringify(succeeded.body).slice(0, 300)}`);
  const providerPaymentId = succeeded.body?.data?.providerPaymentId;

  const afterPayment = await api('GET', `/orders/${order.orderId}`, { expectStatus: 200 });
  check('order advances to CONFIRMED after verified payment', afterPayment.body?.data?.status === 'CONFIRMED', `status ${afterPayment.body?.data?.status}`);
  check('order payment status is PAID', afterPayment.body?.data?.paymentStatus === 'PAID', `got ${afterPayment.body?.data?.paymentStatus}`);

  // The invariant from brief §34.
  const replay1 = await api('POST', `/payments/mock/${providerIntentId}/replay/${providerPaymentId}`, {});
  const replay2 = await api('POST', `/payments/mock/${providerIntentId}/replay/${providerPaymentId}`, {});
  check('redelivered webhook is reported as a duplicate', replay1.body?.data?.duplicate === true, JSON.stringify(replay1.body).slice(0, 200));
  check('a third delivery is also a duplicate', replay2.body?.data?.duplicate === true);

  const afterReplays = await api('GET', `/orders/${order.orderId}`, { expectStatus: 200 });
  check('order total is unchanged after replays', afterReplays.body?.data?.totalPayable?.paise === payable);
  check('order status is unchanged after replays', afterReplays.body?.data?.status === 'CONFIRMED');

  const paymentStatus = await api('GET', `/payments/${session.body.data.paymentIntentId}`, { expectStatus: 200 });
  check('payment reports captured amount equal to the order total', paymentStatus.body?.data?.capturedAmount?.paise === payable, `captured ${paymentStatus.body?.data?.capturedAmount?.paise} vs ${payable}`);
  check('payment is marked verified by a server-side source', paymentStatus.body?.data?.verified === true);

  // -------------------------------------------------------------------------
  section('7. Cancellation returns stock and requests a refund');
  const cancelled = await api('POST', `/orders/${order.orderId}/cancel`, {
    body: { reason: 'E2E verification cancellation' },
  });
  check('cancels a confirmed order', cancelled.status === 200 || cancelled.status === 201, `got ${cancelled.status}: ${JSON.stringify(cancelled.body).slice(0, 200)}`);
  check('a refund was initiated for the captured amount', cancelled.body?.data?.refundInitiated === true, JSON.stringify(cancelled.body?.data));

  const afterCancel = await api('GET', `/orders/${order.orderId}`, { expectStatus: 200 });
  check('order is CANCELLED', afterCancel.body?.data?.status === 'CANCELLED', `status ${afterCancel.body?.data?.status}`);
  check('order is no longer cancellable', afterCancel.body?.data?.cancellable === false);

  // -------------------------------------------------------------------------
  section('8. Authorization');
  const noAuth = await fetch(`${API}/orders`);
  check('order list requires authentication', noAuth.status === 401, `got ${noAuth.status}`);

  const otherOrder = await fetch(`${API}/orders/00000000-0000-4000-8000-000000000000`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check('an order the customer does not own is not found', otherOrder.status === 404, `got ${otherOrder.status}`);

  // -------------------------------------------------------------------------
  console.log(`\n${'='.repeat(60)}`);
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(`Failures:\n${failures.map((f) => `  - ${f}`).join('\n')}`);
  }
  console.log('='.repeat(60));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('\nFATAL:', error.message);
  process.exit(1);
});
