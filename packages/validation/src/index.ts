/**
 * Zod schemas — one definition, every consumer (docs/API_CONVENTIONS.md §14).
 *
 * The API validates requests with these; the Next.js apps validate forms with the same
 * schemas so client and server never disagree about what is acceptable. Nothing is
 * trusted: mobile requests, browser requests, webhooks, partner responses and CSV
 * imports all pass through here.
 *
 * Note what is deliberately absent: no schema accepts a price, discount or total from
 * the client. Those are server-computed, always.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const uuidSchema = z.string().uuid();
export const pincodeSchema = z.string().regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit pincode');
export const phoneSchema = z
  .string()
  .transform((v) => v.replace(/[\s-]/g, '').replace(/^\+/, ''))
  .pipe(z.string().regex(/^[1-9][0-9]{7,14}$/, 'Enter a valid phone number'));
export const indianMobileSchema = z
  .string()
  .transform((v) => {
    const digits = v.replace(/\D/g, '');
    // Accept 10-digit local entry and normalise to E.164 without the plus.
    return digits.length === 10 ? `91${digits}` : digits;
  })
  .pipe(z.string().regex(/^91[6-9][0-9]{9}$/, 'Enter a valid 10-digit Indian mobile number'));
export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address');
export const panSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Enter a valid PAN');
export const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$/, 'Enter a valid GSTIN');
export const ifscSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC code');
export const stateCodeSchema = z.string().length(2).toUpperCase();
export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const idempotencyKeySchema = z.string().uuid('Idempotency-Key must be a UUID');

/** Quantities are always positive integers with a sane ceiling. */
export const quantitySchema = z.number().int().min(1).max(100);

// ---------------------------------------------------------------------------
// Pagination, sorting and filtering
// ---------------------------------------------------------------------------

export const cursorPaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(500).optional(),
});

/** Offset pagination is capped: unbounded OFFSET on a large table is a latency bomb. */
export const offsetPaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export function sortSchema<T extends readonly [string, ...string[]]>(allowed: T) {
  return z
    .string()
    .optional()
    .transform((value) => {
      if (!value) return [] as Array<{ field: T[number]; direction: 'asc' | 'desc' }>;
      return value
        .split(',')
        .map((token) => token.trim())
        .filter(Boolean)
        .map((token) => {
          const direction = token.startsWith('-') ? ('desc' as const) : ('asc' as const);
          const field = token.replace(/^-/, '');
          return { field, direction };
        })
        .filter((s): s is { field: T[number]; direction: 'asc' | 'desc' } =>
          (allowed as readonly string[]).includes(s.field),
        );
    });
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  displayName: z.string().trim().min(2).max(60).optional(),
  dateOfBirth: z.string().date().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']).optional(),
  preferredLocale: z.enum(['en-IN', 'hi-IN']).optional(),
});

export const addressSchema = z.object({
  label: z.enum(['HOME', 'WORK', 'OTHER']).default('HOME'),
  recipientName: z.string().trim().min(2).max(120),
  recipientPhone: indianMobileSchema,
  alternatePhone: indianMobileSchema.optional(),
  addressLine1: z.string().trim().min(3).max(200),
  addressLine2: z.string().trim().max(200).optional(),
  landmark: z.string().trim().max(120).optional(),
  locality: z.string().trim().max(120).optional(),
  city: z.string().trim().min(2).max(80),
  stateCode: stateCodeSchema,
  pincode: pincodeSchema,
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  deliveryInstructions: z.string().trim().max(300).optional(),
  isDefault: z.boolean().default(false),
});

export const registerDeviceSchema = z.object({
  deviceIdentifier: z.string().min(8).max(200),
  platform: z.enum(['android', 'ios', 'web']),
  app: z.enum(['customer', 'seller', 'delivery', 'warehouse', 'web']),
  appVersion: z.string().max(20).optional(),
  osVersion: z.string().max(40).optional(),
  deviceModel: z.string().max(80).optional(),
  pushToken: z.string().max(400).optional(),
  isRooted: z.boolean().default(false),
  isEmulator: z.boolean().default(false),
});

export const notificationPreferencesSchema = z.object({
  pushMarketing: z.boolean().optional(),
  emailMarketing: z.boolean().optional(),
  smsMarketing: z.boolean().optional(),
  whatsappMarketing: z.boolean().optional(),
  notificationTopics: z.record(z.boolean()).optional(),
  preferredLanguage: z.enum(['en-IN', 'hi-IN']).optional(),
  defaultPincode: pincodeSchema.optional(),
  personalisedRecommendations: z.boolean().optional(),
  saveSearchHistory: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Catalog and search
// ---------------------------------------------------------------------------

export const productListQuerySchema = cursorPaginationSchema.extend({
  category: slugSchema.optional(),
  brand: z.string().max(120).optional(),
  seller: uuidSchema.optional(),
  'price.gte': z.coerce.number().int().min(0).optional(),
  'price.lte': z.coerce.number().int().min(0).optional(),
  'rating.gte': z.coerce.number().min(0).max(5).optional(),
  'discount.gte': z.coerce.number().min(0).max(100).optional(),
  inStock: z.coerce.boolean().optional(),
  fulfillment: z.enum(['SELLER_FULFILLED', 'NOVAMART_FULFILLED', 'WAREHOUSE_FULFILLED']).optional(),
  pincode: pincodeSchema.optional(),
  /** Dynamic attribute filters arrive as attr.<code>=value1,value2 */
  sort: z
    .enum(['relevance', 'popularity', 'price', '-price', '-discount', '-rating', '-newest'])
    .default('relevance'),
  facets: z.string().max(300).optional(),
});

export const searchQuerySchema = productListQuerySchema.extend({
  q: z.string().trim().min(1).max(120),
});

export const suggestQuerySchema = z.object({
  q: z.string().trim().min(1).max(80),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

/**
 * Note the absence of any price field. The client says what and how many; the server
 * decides what it costs (brief §100).
 */
export const addToCartSchema = z.object({
  listingId: uuidSchema,
  quantity: quantitySchema.default(1),
  /** Optional: added from a live flash sale slot. */
  flashSaleItemId: uuidSchema.optional(),
});

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(0).max(100),
});

export const applyCouponSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9_-]{2,31}$/, 'Enter a valid coupon code'),
});

export const setCartPincodeSchema = z.object({ pincode: pincodeSchema });

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

export const startCheckoutSchema = z.object({
  cartId: uuidSchema.optional(),
  /** Buy-now flow: a single listing bypassing the cart. */
  listingId: uuidSchema.optional(),
  quantity: quantitySchema.optional(),
  shippingAddressId: uuidSchema.optional(),
  deliveryPincode: pincodeSchema.optional(),
});

export const updateCheckoutSchema = z.object({
  shippingAddressId: uuidSchema.optional(),
  billingAddressId: uuidSchema.optional(),
  paymentMethod: z
    .enum(['UPI', 'CARD', 'NET_BANKING', 'WALLET', 'EMI', 'COD', 'PAY_LATER', 'GIFT_CARD'])
    .optional(),
  couponCode: z.string().trim().toUpperCase().max(32).nullable().optional(),
  bankOfferCode: z.string().trim().toUpperCase().max(32).nullable().optional(),
  isGift: z.boolean().optional(),
  giftMessage: z.string().trim().max(300).optional(),
});

/**
 * Placing the order. The client confirms the session and the amount it was shown; the
 * server re-derives the amount and rejects a mismatch rather than trusting it.
 */
export const placeOrderSchema = z.object({
  checkoutSessionId: uuidSchema,
  /** Echoed back for confirmation only. A mismatch aborts with PRICE_CHANGED. */
  acknowledgedTotalPaise: z.number().int().nonnegative(),
  paymentMethod: z.enum([
    'UPI',
    'CARD',
    'NET_BANKING',
    'WALLET',
    'EMI',
    'COD',
    'PAY_LATER',
    'GIFT_CARD',
  ]),
  savedInstrumentId: uuidSchema.optional(),
  upiVpa: z
    .string()
    .trim()
    .regex(/^[\w.\-]{2,64}@[a-zA-Z]{2,32}$/, 'Enter a valid UPI ID')
    .optional(),
  emiTenureMonths: z.number().int().min(3).max(36).optional(),
});

export const serviceabilityQuerySchema = z.object({
  pincode: pincodeSchema,
  listingId: uuidSchema.optional(),
});

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export const orderListQuerySchema = cursorPaginationSchema.extend({
  status: z.string().max(40).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  search: z.string().trim().max(60).optional(),
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(3).max(300),
  /** Cancel specific items; omit to cancel everything still cancellable. */
  orderItemIds: z.array(uuidSchema).max(50).optional(),
});

export const updateOrderItemStatusSchema = z.object({
  toStatus: z.string().min(3).max(40),
  reason: z.string().trim().max(300).optional(),
});

// ---------------------------------------------------------------------------
// Returns
// ---------------------------------------------------------------------------

export const createReturnSchema = z.object({
  orderItemId: uuidSchema,
  quantity: quantitySchema.default(1),
  reasonCode: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  reasonDetails: z.string().trim().max(500).optional(),
  resolutionRequested: z.enum(['REFUND', 'REPLACEMENT', 'EXCHANGE', 'REPAIR']),
  comments: z.string().trim().max(1000).optional(),
  evidencePaths: z.array(z.string().max(400)).max(6).default([]),
  /** COD refunds need a destination; validated further server-side. */
  refundBankAccount: z
    .object({
      accountNumber: z.string().regex(/^[0-9]{6,20}$/),
      ifsc: ifscSchema,
      accountHolderName: z.string().trim().min(2).max(120),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// Reviews and Q&A
// ---------------------------------------------------------------------------

export const createReviewSchema = z
  .object({
    productId: uuidSchema,
    orderItemId: uuidSchema.optional(),
    rating: z.number().int().min(1).max(5),
    sellerRating: z.number().int().min(1).max(5).optional(),
    title: z.string().trim().min(3).max(120).optional(),
    body: z.string().trim().min(5).max(5000).optional(),
    mediaPaths: z.array(z.string().max(400)).max(8).default([]),
  })
  .refine((v) => v.title !== undefined || v.body !== undefined || v.rating !== undefined, {
    message: 'Provide a rating, and optionally a title or review text',
  });

export const createQuestionSchema = z.object({
  productId: uuidSchema,
  body: z.string().trim().min(5).max(500),
});

export const createAnswerSchema = z.object({
  questionId: uuidSchema,
  body: z.string().trim().min(2).max(2000),
});

// ---------------------------------------------------------------------------
// Fulfillment, support, finance and administration
// ---------------------------------------------------------------------------

export const createShipmentSchema = z.object({
  orderId: uuidSchema,
  orderItemIds: z.array(uuidSchema).min(1).max(100),
  warehouseId: uuidSchema,
  carrierCode: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]*$/)
    .optional(),
  shipmentMode: z.enum(['SURFACE', 'AIR', 'EXPRESS']).default('SURFACE'),
  isCod: z.boolean().default(false),
  codAmountPaise: z.number().int().nonnegative().default(0),
  declaredValuePaise: z.number().int().nonnegative().optional(),
  actualWeightGrams: z.number().int().positive(),
  dimensions: z
    .object({
      lengthMm: z.number().int().positive(),
      widthMm: z.number().int().positive(),
      heightMm: z.number().int().positive(),
    })
    .optional(),
});

export const trackingUpdateSchema = z
  .object({
    shipmentId: uuidSchema.optional(),
    awbNumber: z.string().trim().min(3).max(120).optional(),
    providerEventId: z.string().trim().max(200).nullable().optional(),
    carrierStatusCode: z.string().trim().max(80).nullable().optional(),
    normalisedStatus: z.enum([
      'CREATED',
      'LABEL_GENERATED',
      'PICKUP_SCHEDULED',
      'PICKED_UP',
      'IN_TRANSIT',
      'REACHED_DESTINATION_HUB',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'DELIVERY_FAILED',
      'RTO_INITIATED',
      'RTO_IN_TRANSIT',
      'RTO_DELIVERED',
      'LOST',
      'DAMAGED',
      'CANCELLED',
    ]),
    description: z.string().trim().min(2).max(500),
    location: z.string().trim().max(160).nullable().optional(),
    locationPincode: pincodeSchema.nullable().optional(),
    occurredAt: z.string().datetime().optional(),
    rawPayload: z.record(z.unknown()).default({}),
  })
  .refine((value) => value.shipmentId !== undefined || value.awbNumber !== undefined, {
    message: 'shipmentId or awbNumber is required',
    path: ['shipmentId'],
  });

export const returnDecisionSchema = z
  .object({
    approved: z.boolean(),
    reason: z.string().trim().min(5).max(500).optional(),
  })
  .refine((value) => value.approved || value.reason !== undefined, {
    message: 'A reason is required when rejecting a return',
    path: ['reason'],
  });

export const returnInspectionSchema = z.object({
  warehouseId: uuidSchema.optional(),
  outcome: z.enum(['PASS', 'FAIL', 'PARTIAL_PASS']),
  checklist: z.record(z.unknown()).default({}),
  itemMatchesOrder: z.boolean(),
  originalPackagingPresent: z.boolean(),
  allAccessoriesPresent: z.boolean(),
  serialNumberMatches: z.boolean().optional(),
  physicalDamageFound: z.boolean().default(false),
  usageSignsFound: z.boolean().default(false),
  counterfeitSuspected: z.boolean().default(false),
  grade: z
    .enum(['A_RESELLABLE', 'B_OPEN_BOX', 'C_REFURBISH', 'D_SCRAP', 'NOT_AS_DESCRIBED'])
    .optional(),
  deductionPaise: z.number().int().nonnegative().default(0),
  deductionReason: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const reviewVoteSchema = z.object({ isHelpful: z.boolean() });

export const reviewReportSchema = z.object({
  reason: z.enum([
    'SPAM',
    'OFFENSIVE',
    'IRRELEVANT',
    'FAKE',
    'PERSONAL_INFO',
    'PROMOTIONAL',
    'WRONG_PRODUCT',
    'OTHER',
  ]),
  details: z.string().trim().max(1000).optional(),
});

export const reviewModerationSchema = z
  .object({
    status: z.enum(['PUBLISHED', 'REJECTED', 'HIDDEN']),
    reason: z.string().trim().min(5).max(500).optional(),
  })
  .refine((value) => value.status === 'PUBLISHED' || value.reason !== undefined, {
    message: 'A reason is required when hiding or rejecting a review',
    path: ['reason'],
  });

export const supportTicketSchema = z.object({
  categoryId: uuidSchema.optional(),
  subject: z.string().trim().min(3).max(200),
  description: z.string().trim().min(3).max(5000),
  orderId: uuidSchema.optional(),
  orderItemId: uuidSchema.optional(),
  returnRequestId: uuidSchema.optional(),
  shipmentId: uuidSchema.optional(),
  paymentIntentId: uuidSchema.optional(),
  channel: z.enum(['APP', 'WEB', 'EMAIL', 'PHONE', 'WHATSAPP', 'CHAT', 'INTERNAL']).default('APP'),
});

export const supportMessageSchema = z.object({
  body: z.string().trim().min(1).max(10000),
  isInternal: z.boolean().default(false),
  macroId: uuidSchema.optional(),
});

export const supportTicketUpdateSchema = z.object({
  status: z
    .enum([
      'OPEN',
      'PENDING_AGENT',
      'PENDING_CUSTOMER',
      'PENDING_SELLER',
      'PENDING_THIRD_PARTY',
      'ESCALATED',
      'RESOLVED',
      'CLOSED',
      'REOPENED',
    ])
    .optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  assignedTo: uuidSchema.nullable().optional(),
  assignedTeam: z.string().trim().max(100).optional(),
  resolutionCode: z.string().trim().max(100).optional(),
  resolutionNotes: z.string().trim().max(2000).optional(),
  reason: z.string().trim().min(5).max(500).optional(),
  csatScore: z.number().int().min(1).max(5).optional(),
  csatComment: z.string().trim().max(1000).optional(),
});

export const settlementPeriodSchema = z.object({
  sellerId: uuidSchema,
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
});

export const payoutSchema = z.object({
  settlementId: uuidSchema,
  bankAccountId: uuidSchema,
  provider: z
    .enum(['RAZORPAYX', 'CASHFREE_PAYOUTS', 'MANUAL_BANK_TRANSFER', 'MOCK'])
    .default('MOCK'),
  payoutMode: z.enum(['IMPS', 'NEFT', 'RTGS', 'UPI']).default('NEFT'),
});

export const financialAdjustmentSchema = z.object({
  sellerId: uuidSchema,
  adjustmentType: z.enum([
    'GOODWILL_CREDIT',
    'FEE_WAIVER',
    'PENALTY',
    'RECOVERY',
    'CORRECTION',
    'PROMOTION_REIMBURSEMENT',
    'CHARGEBACK_RECOVERY',
    'WRITE_OFF',
  ]),
  direction: z.enum(['CREDIT', 'DEBIT']),
  amountPaise: z.number().int().positive(),
  orderId: uuidSchema.optional(),
  orderItemId: uuidSchema.optional(),
  reason: z.string().trim().min(15).max(2000),
  supportingDocuments: z.array(z.string().max(400)).max(10).default([]),
});

export const riskEventSchema = z.object({
  subjectType: z.enum(['USER', 'SELLER', 'ORDER', 'PAYMENT', 'DEVICE', 'IP']),
  subjectId: uuidSchema.optional(),
  userId: uuidSchema.optional(),
  sellerId: uuidSchema.optional(),
  orderId: uuidSchema.optional(),
  category: z.string().trim().min(2).max(80),
  ruleCode: z.string().trim().min(2).max(100),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  scoreDelta: z.number().int().min(-100).max(100).default(0),
  evidence: z.record(z.unknown()).default({}),
});

export const analyticsEventSchema = z.object({
  eventType: z.enum([
    'IMPRESSION',
    'PRODUCT_VIEW',
    'CATEGORY_VIEW',
    'SEARCH',
    'SEARCH_CLICK',
    'SEARCH_NO_RESULTS',
    'FILTER_APPLIED',
    'ADD_TO_CART',
    'REMOVE_FROM_CART',
    'CART_VIEW',
    'WISHLIST_ADD',
    'WISHLIST_REMOVE',
    'ADDRESS_SELECTED',
    'PAYMENT_SELECTED',
    'COUPON_APPLIED',
    'COUPON_FAILED',
    'REVIEW_SUBMITTED',
    'BANNER_CLICK',
    'SECTION_VIEW',
    'APP_OPEN',
    'PUSH_OPENED',
    'DEEP_LINK_OPENED',
    'PDP_SCROLL_DEPTH',
    'VIDEO_PLAY',
  ]),
  anonymousId: z.string().trim().max(200).optional(),
  sessionId: z.string().trim().max(200).optional(),
  productId: uuidSchema.optional(),
  skuId: uuidSchema.optional(),
  listingId: uuidSchema.optional(),
  sellerId: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
  orderId: uuidSchema.optional(),
  searchQuery: z.string().trim().max(200).optional(),
  surface: z
    .enum([
      'HOME',
      'CATEGORY',
      'PLP',
      'PDP',
      'SEARCH',
      'CART',
      'CHECKOUT',
      'ORDERS',
      'WISHLIST',
      'COLLECTION',
      'CAMPAIGN',
      'NOTIFICATION',
      'DEEP_LINK',
    ])
    .optional(),
  position: z.number().int().min(0).max(10000).optional(),
  isSponsored: z.boolean().default(false),
  quantity: z.number().int().positive().optional(),
  valuePaise: z.number().int().nonnegative().optional(),
  properties: z.record(z.unknown()).default({}),
});

export const platformSettingSchema = z.object({
  value: z.unknown(),
  valueType: z.enum(['string', 'number', 'boolean', 'object', 'array']),
  category: z.enum([
    'commerce',
    'checkout',
    'payment',
    'shipping',
    'returns',
    'seller',
    'finance',
    'support',
    'security',
    'notification',
    'catalog',
    'search',
    'general',
  ]),
  label: z.string().trim().min(2).max(120),
  description: z.string().trim().min(2).max(1000),
  isPublic: z.boolean().default(false),
  isSensitive: z.boolean().default(false),
  validationSchema: z.record(z.unknown()).optional(),
});

export const featureFlagSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(2).max(1000),
  isEnabled: z.boolean(),
  defaultValue: z.boolean(),
  rolloutPercentage: z.number().int().min(0).max(100).default(0),
  ownerTeam: z.string().trim().max(100).optional(),
  expectedRemovalAt: z.string().date().optional(),
});

export const homeSectionSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  sectionType: z.enum([
    'HERO_BANNER',
    'CATEGORY_GRID',
    'PRODUCT_CAROUSEL',
    'DEALS_STRIP',
    'BRAND_STRIP',
    'SELLER_SPOTLIGHT',
    'FLASH_SALE',
    'CAMPAIGN_BANNER',
    'RECOMMENDED',
    'RECENTLY_VIEWED',
    'VIDEO',
    'RICH_CONTENT',
    'COLLECTION_GRID',
    'COUNTDOWN',
    'TOP_SELLING',
  ]),
  title: z.string().trim().max(200).optional(),
  titleHi: z.string().trim().max(200).optional(),
  subtitle: z.string().trim().max(500).optional(),
  configuration: z.record(z.unknown()).default({}),
  position: z.number().int().min(0).max(10000).default(100),
  surfaces: z
    .array(z.enum(['web', 'android', 'ios']))
    .min(1)
    .default(['web', 'android', 'ios']),
  audienceSegments: z.array(z.string().max(100)).default([]),
  audienceStates: z.array(stateCodeSchema).default([]),
  campaignId: uuidSchema.optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED']).default('DRAFT'),
});

// ---------------------------------------------------------------------------
// Seller
// ---------------------------------------------------------------------------

export const sellerRegistrationSchema = z.object({
  displayName: z.string().trim().min(3).max(120),
  legalName: z.string().trim().min(3).max(200),
  businessType: z.enum([
    'SOLE_PROPRIETORSHIP',
    'PARTNERSHIP',
    'LLP',
    'PRIVATE_LIMITED',
    'PUBLIC_LIMITED',
    'HUF',
    'TRUST',
    'SOCIETY',
    'INDIVIDUAL',
  ]),
  primaryContactName: z.string().trim().min(2).max(120),
  primaryContactEmail: emailSchema,
  primaryContactPhone: indianMobileSchema,
  registeredAddressLine1: z.string().trim().min(3).max(200),
  registeredAddressLine2: z.string().trim().max(200).optional(),
  registeredCity: z.string().trim().min(2).max(80),
  registeredStateCode: stateCodeSchema,
  registeredPincode: pincodeSchema,
});

export const sellerTaxProfileSchema = z
  .object({
    pan: panSchema,
    gstin: gstinSchema.optional(),
    gstRegistrationType: z.enum(['REGULAR', 'COMPOSITION', 'UNREGISTERED', 'EXEMPT']),
    gstStateCode: z.string().regex(/^[0-9]{2}$/),
    legalNameAsPerPan: z.string().trim().min(3).max(200),
  })
  .superRefine((v, ctx) => {
    if (
      v.gstRegistrationType !== 'UNREGISTERED' &&
      v.gstRegistrationType !== 'EXEMPT' &&
      !v.gstin
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['gstin'], message: 'GSTIN is required' });
    }
    // A GSTIN embeds the PAN at characters 3-12; a mismatch means bad or forged data.
    if (v.gstin && v.gstin.slice(2, 12) !== v.pan) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['gstin'],
        message: 'GSTIN does not match the PAN provided',
      });
    }
    if (v.gstin && v.gstin.slice(0, 2) !== v.gstStateCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['gstin'],
        message: 'GSTIN state code does not match the declared state',
      });
    }
  });

export const sellerBankAccountSchema = z
  .object({
    accountHolderName: z.string().trim().min(2).max(120),
    accountNumber: z.string().regex(/^[0-9]{6,20}$/, 'Enter a valid account number'),
    confirmAccountNumber: z.string(),
    ifsc: ifscSchema,
    accountType: z.enum(['SAVINGS', 'CURRENT']).default('CURRENT'),
  })
  .refine((v) => v.accountNumber === v.confirmAccountNumber, {
    message: 'Account numbers do not match',
    path: ['confirmAccountNumber'],
  });

export const upsertListingSchema = z
  .object({
    skuId: uuidSchema,
    sellerSkuCode: z.string().trim().max(64).optional(),
    condition: z
      .enum([
        'NEW',
        'REFURBISHED_EXCELLENT',
        'REFURBISHED_GOOD',
        'OPEN_BOX',
        'USED_LIKE_NEW',
        'USED_GOOD',
      ])
      .default('NEW'),
    fulfillmentModel: z
      .enum(['SELLER_FULFILLED', 'NOVAMART_FULFILLED', 'WAREHOUSE_FULFILLED', 'DROPSHIP'])
      .default('SELLER_FULFILLED'),
    declaredMrpPaise: z.number().int().positive(),
    sellingPricePaise: z.number().int().positive(),
    minOrderQuantity: z.number().int().min(1).max(100).default(1),
    maxOrderQuantity: z.number().int().min(1).max(100).default(10),
    handlingTimeDays: z.number().int().min(0).max(14).default(1),
    defaultWarehouseId: uuidSchema.optional(),
    returnWindowDays: z.number().int().min(0).max(90).optional(),
    codAllowed: z.boolean().optional(),
  })
  .refine((v) => v.sellingPricePaise <= v.declaredMrpPaise, {
    message: 'Selling price cannot exceed MRP',
    path: ['sellingPricePaise'],
  })
  .refine((v) => v.maxOrderQuantity >= v.minOrderQuantity, {
    message: 'Maximum order quantity must be at least the minimum',
    path: ['maxOrderQuantity'],
  });

export const inventoryReceiptSchema = z.object({
  warehouseId: uuidSchema,
  skuId: uuidSchema,
  quantity: z.number().int().min(1).max(100_000),
  reference: z.string().trim().max(80).optional(),
  reason: z.string().trim().max(300).optional(),
});

export const inventoryAdjustmentSchema = z.object({
  warehouseId: uuidSchema,
  skuId: uuidSchema,
  adjustmentType: z.enum([
    'CYCLE_COUNT',
    'DAMAGE',
    'THEFT',
    'EXPIRY',
    'FOUND',
    'DATA_CORRECTION',
    'WRITE_OFF',
    'SUPPLIER_SHORTAGE',
    'QC_REJECT',
  ]),
  quantityDelta: z
    .number()
    .int()
    .refine((v) => v !== 0, 'Adjustment cannot be zero'),
  targetBucket: z.enum(['AVAILABLE', 'DAMAGED', 'BLOCKED']).default('AVAILABLE'),
  /** Long enough to be a real explanation, because this moves stock. */
  reason: z.string().trim().min(10).max(500),
  evidenceUrls: z.array(z.string().url()).max(6).default([]),
});

// ---------------------------------------------------------------------------
// Storage upload requests
// ---------------------------------------------------------------------------

export const requestUploadSchema = z.object({
  purpose: z.enum([
    'PRODUCT_IMAGE',
    'REVIEW_MEDIA',
    'RETURN_EVIDENCE',
    'SUPPORT_ATTACHMENT',
    'KYC_DOCUMENT',
    'SELLER_BULK_IMPORT',
  ]),
  mimeType: z.string().regex(/^[a-z]+\/[a-z0-9.+-]+$/),
  sizeBytes: z.number().int().min(1).max(52_428_800),
  /** Entity the object belongs to; the server derives the storage path from it. */
  entityId: uuidSchema.optional(),
  documentType: z.string().max(60).optional(),
});

// ---------------------------------------------------------------------------
// Webhooks — provider payloads are untrusted input like any other
// ---------------------------------------------------------------------------

export const razorpayWebhookSchema = z.object({
  event: z.string(),
  account_id: z.string().optional(),
  created_at: z.number().int().optional(),
  payload: z.record(z.unknown()),
});

export const shippingWebhookSchema = z.object({
  awb: z.string().min(3).max(60),
  status: z.string().min(1).max(80),
  status_code: z.string().max(40).optional(),
  description: z.string().max(400).optional(),
  location: z.string().max(120).optional(),
  timestamp: z.string(),
  event_id: z.string().max(120).optional(),
});

// ---------------------------------------------------------------------------
// CSV bulk import
// ---------------------------------------------------------------------------

/**
 * One row of a seller bulk price/stock upload. Validated per row so a single bad line
 * is reported precisely instead of failing the whole file.
 */
export const bulkPriceStockRowSchema = z
  .object({
    sku_code: z.string().trim().min(3).max(64),
    mrp: z.coerce.number().positive(),
    selling_price: z.coerce.number().positive(),
    quantity: z.coerce.number().int().min(0).max(100_000),
    warehouse_code: z.string().trim().min(3).max(32),
  })
  .refine((v) => v.selling_price <= v.mrp, {
    message: 'selling_price cannot exceed mrp',
    path: ['selling_price'],
  });

export type AddressInput = z.infer<typeof addressSchema>;
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
export type UpsertListingInput = z.infer<typeof upsertListingSchema>;
export type CreateReturnInput = z.infer<typeof createReturnSchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
