#!/usr/bin/env node
/**
 * Smoke coverage for the API surfaces added after the checkout vertical.
 * Run with a local Supabase database and a running commerce-api.
 */

const API = process.env.API_BASE_URL ?? 'http://127.0.0.1:4000/api/v1';
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwiYXVkIjoiYW5vbiIsImV4cCI6MTk4MzgxMjk5Nn0.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const PASSWORD = 'NovaMart#Local1';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function signIn(email) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await response.json();
  if (!body.access_token) throw new Error(`Could not sign in ${email}: ${JSON.stringify(body)}`);
  return body.access_token;
}

async function api(method, path, token, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function main() {
  console.log('NovaMart platform expansion — API smoke verification');
  const customer = await signIn('ananya.iyer@example.novamart.in');
  const operations = await signIn('ops.admin@example.novamart.in');
  const seller = await signIn('priya.nair@example.novamart.in');
  const delivery = await signIn('delivery.agent@example.novamart.in');

  const settings = await api('GET', '/platform/public-settings');
  check('public platform settings are readable', settings.status === 200 && Object.keys(settings.body?.data ?? {}).length > 0);

  const version = await api('GET', '/platform/app-version?app=customer&platform=android&version=1.0.0');
  check('app version policy resolves', version.status === 200 && version.body?.data?.policy?.app === 'customer');

  const authConfig = await api('GET', '/auth/config');
  check('auth configuration is public and provider-safe', authConfig.status === 200 && authConfig.body?.data?.providers?.includes('phone_otp'));

  const categories = await api('GET', '/catalog/categories');
  check('category tree is readable', categories.status === 200 && categories.body?.data?.length >= 3);

  const search = await api('GET', '/search?q=headphones&limit=8');
  check('search returns grounded catalogue results', search.status === 200 && search.body?.data?.items?.length > 0);

  const products = await api('GET', '/catalog/products?limit=4&sort=popularity');
  const productIds = (products.body?.data ?? []).map((product) => product.productId).filter(Boolean);
  check('product list returns stable public identifiers', products.status === 200 && productIds.length >= 2);

  const nova = await api('POST', '/nova/ask', null, { message: 'headphones under ₹20,000', pincode: '560034' });
  check('Nova answers from catalogue data', nova.status === 201 || (nova.status === 200 && nova.body?.data?.grounded === true));

  const compare = await api('POST', '/nova/compare', null, { productIds: productIds.slice(0, 2) });
  check('Nova compare is bounded to selected products', compare.status === 201 || (compare.status === 200 && compare.body?.data?.comparedCount >= 2));

  const orders = await api('GET', '/orders?limit=10', customer);
  check('customer sees the delivered seeded order', orders.status === 200 && orders.body?.data?.some((order) => order.orderNumber === 'NM100000901'));

  const returnReasons = await api('GET', '/returns/reasons');
  check('return reason configuration is readable', returnReasons.status === 200 && returnReasons.body?.data?.length > 0);

  const dashboard = await api('GET', '/admin/dashboard', operations);
  check('operations dashboard is permission protected and readable', dashboard.status === 200 && dashboard.body?.data?.queues);

  const audit = await api('GET', '/admin/audit?limit=5', operations);
  check('audit queue is permission protected', audit.status === 403);

  const sellerQueue = await api('GET', '/admin/sellers?status=APPROVED&limit=100', operations);
  const sellerRow = (sellerQueue.body?.data ?? []).find((row) => row.seller_code === 'SL100001');
  check('approved seller is visible to operations', sellerQueue.status === 200 && Boolean(sellerRow?.id));
  if (sellerRow?.id) {
    const sellerScope = sellerRow.id;
    const performance = await api('GET', `/sellers/${sellerScope}/performance`, seller);
    check('seller performance is scoped', performance.status === 200 && performance.body?.data?.seller_id === sellerScope);
    const returns = await api('GET', `/sellers/${sellerScope}/returns`, seller);
    check('seller returns are scoped', returns.status === 200 && Array.isArray(returns.body?.data), String(returns.status));
    const promotions = await api('GET', `/sellers/${sellerScope}/promotions`, seller);
    check('seller promotions are scoped', promotions.status === 200 && Array.isArray(promotions.body?.data));
    const users = await api('GET', `/sellers/${sellerScope}/users`, seller);
    check('seller users and roles are scoped', users.status === 200 && users.body?.data?.length > 0, String(users.status));
    const warehouses = await api('GET', `/sellers/${sellerScope}/warehouses`, seller);
    check('seller pickup locations are scoped', warehouses.status === 200 && warehouses.body?.data?.length > 0, String(warehouses.status));
    const report = await api('GET', `/sellers/${sellerScope}/reports/sales?days=90`, seller);
    check('seller sales report is scoped', report.status === 200 && Array.isArray(report.body?.data));
  }

  const assignments = await api('GET', '/delivery/me/assignments', delivery);
  const assignment = assignments.body?.data?.[0];
  check('delivery partner sees assigned shipments', assignments.status === 200 && Boolean(assignment?.id));
  const availability = await api('PATCH', '/delivery/me/availability', delivery, { status: 'ON_DUTY' });
  check('delivery availability is persisted', availability.status === 200 && availability.body?.data?.status === 'ON_DUTY');
  if (assignment?.id) {
    const otp = await api('POST', `/delivery/shipments/${assignment.id}/otp`, delivery);
    check('delivery OTP is issued without exposing the code', (otp.status === 201 || otp.status === 200) && otp.body?.data?.sent === true && !otp.body?.data?.otp);
    const forgedProof = await api('POST', `/delivery/shipments/${assignment.id}/proof`, delivery, { proofType: 'OTP', otp: '0000' });
    check('incorrect delivery OTP cannot complete a delivery', forgedProof.status === 422 && forgedProof.body?.error?.code === 'DELIVERY_OTP_INVALID');
    const history = await api('GET', '/delivery/me/history', delivery);
    check('delivery history is scoped', history.status === 200 && Array.isArray(history.body?.data));
  }

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
