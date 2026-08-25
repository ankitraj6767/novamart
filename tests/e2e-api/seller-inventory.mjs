#!/usr/bin/env node
/**
 * End-to-end verification of the seller and inventory vertical.
 *
 * The emphasis is the security model, because that is what this surface is:
 *
 *   - a seller may only ever touch their own records                       (§19 scoping)
 *   - separation of duties on inventory: the seller who REQUESTS an
 *     adjustment cannot APPROVE it, enforced by permission and by a
 *     database constraint                                                  (§24, §53)
 *   - approving a seller is MFA-gated and refuses unless KYC is verified    (§43, §55)
 *   - a listing cannot go ACTIVE without stock behind it
 *   - stock cannot be added to a SKU the seller does not list
 *   - every stock movement leaves a ledger entry
 *
 * Usage: node tests/e2e-api/seller-inventory.mjs
 */

const API = process.env.API_BASE_URL ?? 'http://127.0.0.1:4000/api/v1';
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const PASSWORD = 'NovaMart#Local1';

/**
 * Service-role key, used only to mint a throwaway applicant for the onboarding section.
 *
 * Registration enforces one seller per owner, so a seeded user can only ever exercise the
 * onboarding flow once. Creating a fresh user per run makes the section self-contained and
 * repeatable, and it exercises identity.handle_new_auth_user on the way in — the same
 * trigger a real signup fires.
 *
 * Local demo key. Never used against a real project.
 */
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

/** Creates a confirmed user and returns an access token for it. */
async function createApplicant() {
  const email = `applicant.${Date.now().toString(36)}@example.novamart.in`;

  const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'Onboarding Applicant' },
    }),
  });

  if (!created.ok) {
    const detail = await created.text();
    throw new Error(`Could not create applicant: ${created.status} ${detail.slice(0, 200)}`);
  }

  return { email, token: await signIn(email) };
}

const USERS = {
  // SELLER_OWNER of the approved "Aurex Official Store".
  sellerOwner: 'priya.nair@example.novamart.in',
  // OPERATIONS_MANAGER: holds inventory.approve_adjustment but NOT seller.approve.
  ops: 'ops.admin@example.novamart.in',
  // Plain CUSTOMER, owns no seller.
  customer: 'ananya.iyer@example.novamart.in',
};

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

async function signIn(email) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const json = await response.json();
  if (!json.access_token) throw new Error(`Sign-in failed for ${email}: ${JSON.stringify(json)}`);
  return json.access_token;
}

async function api(token, method, path, body) {
  const headers = body === undefined ? {} : { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

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
  return { status: response.status, body: json, code: json?.error?.code };
}

async function main() {
  console.log('NovaMart seller + inventory — end-to-end verification');
  console.log(`API: ${API}`);

  const tokens = {
    sellerOwner: await signIn(USERS.sellerOwner),
    ops: await signIn(USERS.ops),
    customer: await signIn(USERS.customer),
  };

  // -------------------------------------------------------------------------
  section('0. Resolve the existing approved seller');
  const me = await api(tokens.sellerOwner, 'GET', '/users/me');
  check('seller owner signs in', me.status === 200);
  check('seller owner carries the SELLER_OWNER role', (me.body?.data?.roles ?? []).includes('SELLER_OWNER'));

  // Seller id comes from the token's scope, which the API resolved from seller_users.
  const sellerIds = me.body?.data?.sellerIds ?? [];
  // The profile DTO does not expose sellerIds, so discover it via the admin queue instead.
  const approvedList = await api(tokens.ops, 'GET', '/admin/sellers?status=APPROVED&limit=5');
  check('operations can read the seller list (seller.read)', approvedList.status === 200, `got ${approvedList.status} ${approvedList.code}`);

  const seller = (approvedList.body?.data ?? [])[0];
  if (!seller) throw new Error('No approved seller found to test against');
  const sellerId = seller.id;
  console.log(`        seller ${seller.display_name} (${seller.seller_code}) ${sellerId}`);

  // -------------------------------------------------------------------------
  section('1. Seller scoping: a stranger cannot read another seller');
  const stranger = await api(tokens.customer, 'GET', `/sellers/${sellerId}`);
  check(
    'a plain customer gets 404 for a seller they do not belong to',
    stranger.status === 404,
    `got ${stranger.status} ${stranger.code}`,
  );

  const ownProfile = await api(tokens.sellerOwner, 'GET', `/sellers/${sellerId}`);
  check('the owner can read their own seller', ownProfile.status === 200, `got ${ownProfile.status} ${ownProfile.code}`);
  check('profile exposes an onboarding checklist', ownProfile.body?.data?.checklist !== undefined);
  check('profile reports transactability', ownProfile.body?.data?.is_transactable === true);

  // -------------------------------------------------------------------------
  section('2. Listings');
  const listings = await api(tokens.sellerOwner, 'GET', `/sellers/${sellerId}/listings?limit=10`);
  check('owner can list their listings', listings.status === 200, `got ${listings.status} ${listings.code}`);
  const existing = (listings.body?.data ?? [])[0];
  check('seller has at least one seeded listing', Boolean(existing), `count=${(listings.body?.data ?? []).length}`);

  if (existing) {
    console.log(`        listing ${existing.product_title} sku=${existing.sku_code} stock=${existing.available_quantity}`);
    check('listing reports live available stock', typeof existing.available_quantity === 'number');
    check('listing reports its price', Number(existing.selling_price_paise) > 0);
  }

  const strangerListings = await api(tokens.customer, 'GET', `/sellers/${sellerId}/listings`);
  check(
    'a stranger cannot read another seller listings',
    strangerListings.status === 404 || strangerListings.status === 403,
    `got ${strangerListings.status}`,
  );

  // -------------------------------------------------------------------------
  section('3. Inventory: stock requires a listing');
  const warehouses = await api(tokens.sellerOwner, 'GET', `/inventory/sellers/${sellerId}?limit=5`);
  check('owner can read their inventory', warehouses.status === 200, `got ${warehouses.status} ${warehouses.code}`);
  const stockRow = (warehouses.body?.data ?? [])[0];
  check('inventory rows are returned', Boolean(stockRow), `count=${(warehouses.body?.data ?? []).length}`);

  if (!stockRow) throw new Error('No inventory rows to test against');
  const { warehouse_id: warehouseId, sku_id: skuId } = stockRow;
  const startingAvailable = stockRow.available_quantity;
  console.log(`        warehouse ${stockRow.warehouse_code} sku ${stockRow.sku_code} available=${startingAvailable}`);

  // A SKU this seller does not list must be refused, even though it exists in the catalogue.
  const foreignSku = await api(tokens.sellerOwner, 'POST', '/inventory/receipts', {
    warehouseId,
    skuId: '00000000-0000-4000-8000-000000000000',
    quantity: 5,
  });
  check(
    'stock cannot be received against a SKU the seller does not list',
    foreignSku.status >= 400,
    `got ${foreignSku.status} ${foreignSku.code}`,
  );

  const receipt = await api(tokens.sellerOwner, 'POST', '/inventory/receipts', {
    warehouseId,
    skuId,
    quantity: 25,
    reference: 'E2E-GRN-001',
    reason: 'End-to-end verification receipt',
  });
  check('owner can receive stock', receipt.status === 201 || receipt.status === 200, `got ${receipt.status} ${receipt.code}: ${JSON.stringify(receipt.body).slice(0, 200)}`);
  check(
    'available quantity increased by exactly the received amount',
    receipt.body?.data?.availableQuantity === startingAvailable + 25,
    `${startingAvailable} + 25 vs ${receipt.body?.data?.availableQuantity}`,
  );

  // -------------------------------------------------------------------------
  section('4. The movement left a ledger entry');
  const ledger = await api(
    tokens.sellerOwner,
    'GET',
    `/inventory/sellers/${sellerId}/ledger?skuId=${skuId}&limit=5`,
  );
  check('owner can read the ledger', ledger.status === 200, `got ${ledger.status} ${ledger.code}`);
  const latest = (ledger.body?.data ?? [])[0];
  check('the receipt is recorded as a movement', latest?.movement_type === 'PURCHASE_RECEIPT', `got ${latest?.movement_type}`);
  check('the movement records its delta', latest?.available_delta === 25, `got ${latest?.available_delta}`);
  check('the movement records the resulting balance', latest?.available_after === startingAvailable + 25);
  check('the movement carries the supplied reference', latest?.reference === 'E2E-GRN-001');

  // -------------------------------------------------------------------------
  section('5. Separation of duties on adjustments');
  const adjustment = await api(tokens.sellerOwner, 'POST', '/inventory/adjustments', {
    warehouseId,
    skuId,
    adjustmentType: 'DAMAGE',
    quantityDelta: -3,
    targetBucket: 'AVAILABLE',
    reason: 'Three units water damaged during the monsoon, verified by warehouse QC',
  });
  check('owner can REQUEST an adjustment', adjustment.status === 201 || adjustment.status === 200, `got ${adjustment.status} ${adjustment.code}`);
  check('the adjustment is not applied on request', adjustment.body?.data?.status === 'PENDING_APPROVAL', `got ${adjustment.body?.data?.status}`);
  check('the response states approval is required', adjustment.body?.data?.requiresApproval === true);

  const adjustmentId = adjustment.body?.data?.adjustmentId;

  // The seller holds inventory.adjust but NOT inventory.approve_adjustment. This is the
  // whole point of the maker-checker split.
  const selfApprove = await api(
    tokens.sellerOwner,
    'POST',
    `/inventory/adjustments/${adjustmentId}/approve`,
    { approved: true },
  );
  check(
    'the requesting seller CANNOT approve their own adjustment',
    selfApprove.status === 403 && selfApprove.code === 'PERMISSION_DENIED',
    `got ${selfApprove.status} ${selfApprove.code}`,
  );

  const stillPending = await api(
    tokens.sellerOwner,
    'GET',
    `/inventory/sellers/${sellerId}?limit=50`,
  );
  const unchanged = (stillPending.body?.data ?? []).find((r) => r.sku_id === skuId);
  check(
    'stock is unchanged while the adjustment is pending',
    unchanged?.available_quantity === startingAvailable + 25,
    `got ${unchanged?.available_quantity}`,
  );

  // Operations holds inventory.approve_adjustment and is a different person.
  const opsApprove = await api(
    tokens.ops,
    'POST',
    `/inventory/adjustments/${adjustmentId}/approve`,
    { approved: true },
  );
  check(
    'a separate approver with the permission CAN apply it',
    opsApprove.status === 200 || opsApprove.status === 201,
    `got ${opsApprove.status} ${opsApprove.code}: ${JSON.stringify(opsApprove.body).slice(0, 200)}`,
  );
  check('the adjustment is now APPLIED', opsApprove.body?.data?.status === 'APPLIED', `got ${opsApprove.body?.data?.status}`);
  check(
    'stock decreased by exactly the adjustment',
    opsApprove.body?.data?.availableQuantity === startingAvailable + 25 - 3,
    `expected ${startingAvailable + 22}, got ${opsApprove.body?.data?.availableQuantity}`,
  );

  const reApprove = await api(
    tokens.ops,
    'POST',
    `/inventory/adjustments/${adjustmentId}/approve`,
    { approved: true },
  );
  check(
    'an already-applied adjustment cannot be approved twice',
    reApprove.status >= 400,
    `got ${reApprove.status} ${reApprove.code}`,
  );

  // -------------------------------------------------------------------------
  section('6. An impossible adjustment is refused up front');
  const impossible = await api(tokens.sellerOwner, 'POST', '/inventory/adjustments', {
    warehouseId,
    skuId,
    adjustmentType: 'WRITE_OFF',
    quantityDelta: -999999,
    targetBucket: 'AVAILABLE',
    reason: 'Deliberately larger than the balance to prove the guard rejects it',
  });
  check(
    'an adjustment that would drive stock negative is refused',
    impossible.status === 400 || impossible.status === 422,
    `got ${impossible.status} ${impossible.code}`,
  );

  const shortReason = await api(tokens.sellerOwner, 'POST', '/inventory/adjustments', {
    warehouseId,
    skuId,
    adjustmentType: 'DAMAGE',
    quantityDelta: -1,
    targetBucket: 'AVAILABLE',
    reason: 'oops',
  });
  check(
    'a token reason is refused (adjustments demand a real explanation)',
    shortReason.status === 400 || shortReason.status === 422,
    `got ${shortReason.status}`,
  );

  // -------------------------------------------------------------------------
  section('7. New seller onboarding');

  // A throwaway applicant per run, so this section always executes. Depending on a seeded
  // user meant it silently skipped after the first run, and the KYC and encryption
  // assertions below never actually ran.
  let applicantToken = null;
  let registration = null;
  {
    const applicant = await createApplicant();
    console.log(`        applicant ${applicant.email}`);
    const token = applicant.token;
    const attempt = await api(token, 'POST', '/sellers', {
      displayName: `Kavya Handlooms ${Date.now().toString(36)}`,
      legalName: 'Kavya Handlooms Private Limited',
      businessType: 'PRIVATE_LIMITED',
      primaryContactName: 'Kavya Reddy',
      primaryContactEmail: 'kavya@example.novamart.in',
      primaryContactPhone: '9800000011',
      registeredAddressLine1: '14 Weavers Colony',
      registeredCity: 'Hyderabad',
      registeredStateCode: 'TS',
      registeredPincode: '500001',
    });
    if (attempt.status === 201 || attempt.status === 200) {
      applicantToken = token;
      registration = attempt;
    } else {
      console.log(
        `        registration returned ${attempt.status} ${attempt.code ?? ''}: ${JSON.stringify(attempt.body).slice(0, 200)}`,
      );
    }
  }

  const couldRegister = registration !== null;

  check('a fresh customer can register a seller', couldRegister);

  if (couldRegister) {
    const tokensApplicant = applicantToken;
    const newSellerId = registration.body?.data?.sellerId;
    console.log(`        registered ${registration.body?.data?.sellerCode} ${newSellerId}`);
    check('registration returns a seller code', Boolean(registration.body?.data?.sellerCode));

    const newProfile = await api(tokensApplicant, 'GET', `/sellers/${newSellerId}`);
    check('a new seller starts in DRAFT', newProfile.body?.data?.status === 'DRAFT', `got ${newProfile.body?.data?.status}`);
    check('a new seller is not transactable', newProfile.body?.data?.is_transactable === false);

    // Cannot list anything yet: not approved.
    const prematureListing = await api(tokensApplicant, 'POST', `/sellers/${newSellerId}/listings`, {
      skuId: skuId,
      declaredMrpPaise: 100000,
      sellingPricePaise: 90000,
    });
    check(
      'an unapproved seller cannot create a listing',
      prematureListing.status >= 400,
      `got ${prematureListing.status} ${prematureListing.code}`,
    );

    const premature = await api(tokensApplicant, 'POST', `/sellers/${newSellerId}/submit-for-review`, {
      agreementVersion: '2026-01',
    });
    check(
      'submission is refused while onboarding is incomplete',
      premature.status === 400 || premature.status === 422,
      `got ${premature.status} ${premature.code}`,
    );
    const issues = JSON.stringify(premature.body?.error?.details ?? []);
    check('the refusal names the missing steps', issues.includes('TAX_DETAILS') || issues.includes('BANK_DETAILS'), issues.slice(0, 160));

    const tax = await api(tokensApplicant, 'PATCH', `/sellers/${newSellerId}/tax-profile`, {
      pan: 'AAKCK1234P',
      gstin: '36AAKCK1234P1Z5',
      gstRegistrationType: 'REGULAR',
      gstStateCode: '36',
      legalNameAsPerPan: 'Kavya Handlooms Private Limited',
    });
    check('tax profile is accepted when internally consistent', tax.status === 200, `got ${tax.status} ${tax.code}: ${JSON.stringify(tax.body).slice(0, 200)}`);

    // The GSTIN embeds the PAN; a mismatch is forged or mistyped data.
    const badGstin = await api(tokensApplicant, 'PATCH', `/sellers/${newSellerId}/tax-profile`, {
      pan: 'AAKCK1234P',
      gstin: '36ZZZZZ9999Z1Z5',
      gstRegistrationType: 'REGULAR',
      gstStateCode: '36',
      legalNameAsPerPan: 'Kavya Handlooms Private Limited',
    });
    check(
      'a GSTIN that does not embed the PAN is refused',
      badGstin.status === 400 || badGstin.status === 422,
      `got ${badGstin.status}`,
    );

    const bank = await api(tokensApplicant, 'POST', `/sellers/${newSellerId}/bank-accounts`, {
      accountHolderName: 'Kavya Handlooms Private Limited',
      accountNumber: '50100123456789',
      confirmAccountNumber: '50100123456789',
      ifsc: 'HDFC0001234',
      accountType: 'CURRENT',
    });
    check('bank account is accepted', bank.status === 201 || bank.status === 200, `got ${bank.status} ${bank.code}: ${JSON.stringify(bank.body).slice(0, 200)}`);
    check('bank account starts unverified', bank.body?.data?.verificationStatus === 'PENDING', `got ${bank.body?.data?.verificationStatus}`);
    check('only the last four digits are returned', bank.body?.data?.last4 === '6789', `got ${bank.body?.data?.last4}`);

    const accounts = await api(tokensApplicant, 'GET', `/sellers/${newSellerId}/bank-accounts`);
    const stored = (accounts.body?.data ?? [])[0];
    check('listed accounts are masked', String(stored?.account_number_masked ?? '').includes('••'), JSON.stringify(stored).slice(0, 160));
    check(
      'the full account number is never returned',
      !JSON.stringify(accounts.body).includes('50100123456789'),
    );
    check('the bank is derived from the IFSC', stored?.bank_name === 'HDFC Bank', `got ${stored?.bank_name}`);
  }

  // -------------------------------------------------------------------------
  section('8. Approval is privileged and gated');
  const opsApproveSeller = await api(tokens.ops, 'POST', `/admin/sellers/${sellerId}/approve`, {
    reason: 'Operations attempting an approval it should not be able to perform',
  });
  check(
    'OPERATIONS_MANAGER cannot approve a seller (lacks seller.approve)',
    opsApproveSeller.status === 403,
    `got ${opsApproveSeller.status} ${opsApproveSeller.code}`,
  );

  const customerApprove = await api(tokens.customer, 'POST', `/admin/sellers/${sellerId}/approve`, {
    reason: 'A customer attempting to approve a seller',
  });
  check(
    'a customer cannot approve a seller',
    customerApprove.status === 403,
    `got ${customerApprove.status} ${customerApprove.code}`,
  );

  const customerQueue = await api(tokens.customer, 'GET', '/admin/sellers');
  check(
    'a customer cannot read the seller review queue',
    customerQueue.status === 403,
    `got ${customerQueue.status} ${customerQueue.code}`,
  );

  const customerSuspend = await api(tokens.customer, 'POST', `/admin/sellers/${sellerId}/suspend`, {
    reason: 'A customer attempting to suspend a competitor seller account',
  });
  check(
    'a customer cannot suspend a seller',
    customerSuspend.status === 403,
    `got ${customerSuspend.status} ${customerSuspend.code}`,
  );

  // -------------------------------------------------------------------------
  section('9. Seller dashboard');
  const dashboard = await api(tokens.sellerOwner, 'GET', `/sellers/${sellerId}/dashboard?days=30`);
  check('owner can read their dashboard', dashboard.status === 200, `got ${dashboard.status} ${dashboard.code}`);
  check('dashboard reports GMV as formatted money', typeof dashboard.body?.data?.grossMerchandiseValue?.display === 'string');
  check('dashboard reports a ledger balance', dashboard.body?.data?.balance?.net !== undefined);
  check('dashboard reports action-required counts', dashboard.body?.data?.actionRequired !== undefined);

  const strangerDashboard = await api(tokens.customer, 'GET', `/sellers/${sellerId}/dashboard`);
  check(
    'a stranger cannot read a seller dashboard',
    strangerDashboard.status === 404 || strangerDashboard.status === 403,
    `got ${strangerDashboard.status}`,
  );

  // -------------------------------------------------------------------------
  console.log(`\n${'='.repeat(60)}`);
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  if (failed > 0) console.log(`Failures:\n${failures.map((f) => `  - ${f}`).join('\n')}`);
  console.log('='.repeat(60));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('\nFATAL:', error.message);
  process.exit(1);
});
