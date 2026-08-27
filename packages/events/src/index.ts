/**
 * Domain event contracts (docs/DOMAIN_MODEL.md §3).
 *
 * Events are the only sanctioned cross-context coupling. Payloads are validated on
 * publish AND on consume: a queue message is untrusted input like any other, and a
 * malformed event should fail loudly at the boundary rather than corrupt a projection.
 *
 * Versioning: payloads are additive within a version. A breaking change ships as
 * `_V2` alongside the original until every consumer has migrated.
 */

import { z } from 'zod';

export const EVENT_TYPES = {
  // identity
  USER_REGISTERED: 'USER_REGISTERED',
  // seller
  SELLER_REGISTERED: 'SELLER_REGISTERED',
  SELLER_APPROVED: 'SELLER_APPROVED',
  SELLER_SUSPENDED: 'SELLER_SUSPENDED',
  // catalog
  PRODUCT_CREATED: 'PRODUCT_CREATED',
  PRODUCT_UPDATED: 'PRODUCT_UPDATED',
  LISTING_CREATED: 'LISTING_CREATED',
  LISTING_UPDATED: 'LISTING_UPDATED',
  LISTING_PRICE_CHANGED: 'LISTING_PRICE_CHANGED',
  // inventory
  INVENTORY_UPDATED: 'INVENTORY_UPDATED',
  INVENTORY_RESERVED: 'INVENTORY_RESERVED',
  INVENTORY_RELEASED: 'INVENTORY_RELEASED',
  // commerce
  CHECKOUT_STARTED: 'CHECKOUT_STARTED',
  ORDER_CREATED: 'ORDER_CREATED',
  ORDER_CONFIRMED: 'ORDER_CONFIRMED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  ORDER_ITEM_STATUS_CHANGED: 'ORDER_ITEM_STATUS_CHANGED',
  // payments
  PAYMENT_CREATED: 'PAYMENT_CREATED',
  PAYMENT_SUCCESS: 'PAYMENT_SUCCESS',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  REFUND_CREATED: 'REFUND_CREATED',
  REFUND_SUCCESS: 'REFUND_SUCCESS',
  REFUND_FAILED: 'REFUND_FAILED',
  // fulfillment
  SHIPMENT_CREATED: 'SHIPMENT_CREATED',
  ORDER_SHIPPED: 'ORDER_SHIPPED',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  ORDER_DELIVERED: 'ORDER_DELIVERED',
  DELIVERY_OTP_REQUESTED: 'DELIVERY_OTP_REQUESTED',
  // returns
  RETURN_REQUESTED: 'RETURN_REQUESTED',
  RETURN_APPROVED: 'RETURN_APPROVED',
  RETURN_RECEIVED: 'RETURN_RECEIVED',
  // finance
  SETTLEMENT_CREATED: 'SETTLEMENT_CREATED',
  SELLER_PAID: 'SELLER_PAID',
  // reviews
  REVIEW_PUBLISHED: 'REVIEW_PUBLISHED',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

const uuid = z.string().uuid();
const paise = z.number().int();

// ---------------------------------------------------------------------------
// Payload schemas
// ---------------------------------------------------------------------------

export const userRegisteredSchema = z.object({
  userId: uuid,
  registeredVia: z.enum(['PHONE_OTP', 'EMAIL', 'GOOGLE', 'APPLE']),
  referredBy: uuid.nullable(),
});

export const sellerApprovedSchema = z.object({
  sellerId: uuid,
  sellerCode: z.string(),
  displayName: z.string(),
  approvedBy: uuid.nullable(),
});

export const sellerSuspendedSchema = z.object({
  sellerId: uuid,
  reason: z.string(),
  suspendedBy: uuid.nullable(),
  /** Suspension deactivates listings, so search must reindex. */
  listingCount: z.number().int().nonnegative(),
});

export const productUpdatedSchema = z.object({
  productId: uuid,
  categoryId: uuid,
  brandId: uuid.nullable(),
  status: z.string(),
  /** Which fields changed, so the indexer can do partial updates. */
  changedFields: z.array(z.string()),
});

export const listingUpdatedSchema = z.object({
  listingId: uuid,
  sellerId: uuid,
  skuId: uuid,
  productId: uuid,
  status: z.string(),
});

export const listingPriceChangedSchema = z.object({
  listingId: uuid,
  sellerId: uuid,
  skuId: uuid,
  productId: uuid,
  oldSellingPricePaise: paise.nullable(),
  newSellingPricePaise: paise,
  oldMrpPaise: paise.nullable(),
  newMrpPaise: paise,
});

export const inventoryUpdatedSchema = z.object({
  skuId: uuid,
  sellerId: uuid,
  warehouseId: uuid,
  listingId: uuid.nullable(),
  availableQuantity: z.number().int().nonnegative(),
  reservedQuantity: z.number().int().nonnegative(),
  movementType: z.string(),
});

export const inventoryReservedSchema = z.object({
  reservationIds: z.array(uuid),
  checkoutSessionId: uuid.nullable(),
  orderId: uuid.nullable(),
  items: z.array(
    z.object({
      skuId: uuid,
      sellerId: uuid,
      warehouseId: uuid,
      quantity: z.number().int().positive(),
    }),
  ),
});

export const checkoutStartedSchema = z.object({
  checkoutSessionId: uuid,
  userId: uuid,
  cartId: uuid.nullable(),
  itemCount: z.number().int().positive(),
  subtotalPaise: paise,
});

export const orderCreatedSchema = z.object({
  orderId: uuid,
  orderNumber: z.string(),
  userId: uuid,
  totalPayablePaise: paise,
  paymentMethod: z.string(),
  isCod: z.boolean(),
  itemCount: z.number().int().positive(),
  sellerIds: z.array(uuid),
  deliveryPincode: z.string(),
});

export const orderConfirmedSchema = z.object({
  orderId: uuid,
  orderNumber: z.string(),
  userId: uuid,
  paymentIntentId: uuid.nullable(),
  totalPayablePaise: paise,
  items: z.array(
    z.object({
      orderItemId: uuid,
      sellerId: uuid,
      skuId: uuid,
      warehouseId: uuid.nullable(),
      quantity: z.number().int().positive(),
      reservationId: uuid.nullable(),
    }),
  ),
});

export const orderCancelledSchema = z.object({
  orderId: uuid,
  orderNumber: z.string(),
  userId: uuid,
  cancelledBy: uuid.nullable(),
  actor: z.enum(['CUSTOMER', 'SELLER', 'SUPPORT', 'SYSTEM']),
  reason: z.string(),
  orderItemIds: z.array(uuid),
  refundablePaise: paise,
});

export const orderItemStatusChangedSchema = z.object({
  orderId: uuid,
  orderItemId: uuid,
  itemNumber: z.string(),
  userId: uuid,
  sellerId: uuid,
  fromStatus: z.string().nullable(),
  toStatus: z.string(),
  reason: z.string().nullable(),
});

export const paymentEventSchema = z.object({
  paymentIntentId: uuid,
  orderId: uuid,
  orderNumber: z.string(),
  userId: uuid,
  provider: z.string(),
  providerPaymentId: z.string().nullable(),
  amountPaise: paise,
  capturedPaise: paise,
  paymentMethod: z.string(),
  failureCode: z.string().nullable(),
  failureReason: z.string().nullable(),
});

export const refundEventSchema = z.object({
  refundId: uuid,
  refundReference: z.string(),
  orderId: uuid,
  orderItemId: uuid.nullable(),
  userId: uuid,
  amountPaise: paise,
  refundType: z.string(),
  status: z.string(),
  failureCode: z.string().nullable(),
});

export const shipmentEventSchema = z.object({
  shipmentId: uuid,
  shipmentReference: z.string(),
  orderId: uuid,
  orderNumber: z.string(),
  userId: uuid,
  sellerId: uuid,
  carrierCode: z.string().nullable(),
  awbNumber: z.string().nullable(),
  status: z.string(),
  orderItemIds: z.array(uuid),
  estimatedDeliveryDate: z.string().nullable(),
});

export const returnEventSchema = z.object({
  returnRequestId: uuid,
  returnReference: z.string(),
  orderId: uuid,
  userId: uuid,
  sellerId: uuid,
  status: z.string(),
  reasonCode: z.string(),
  orderItemIds: z.array(uuid),
  refundablePaise: paise,
});

export const settlementCreatedSchema = z.object({
  settlementId: uuid,
  settlementReference: z.string(),
  sellerId: uuid,
  periodStart: z.string(),
  periodEnd: z.string(),
  netPayablePaise: paise,
  entryCount: z.number().int().nonnegative(),
});

export const sellerPaidSchema = z.object({
  payoutId: uuid,
  payoutReference: z.string(),
  settlementId: uuid.nullable(),
  sellerId: uuid,
  amountPaise: paise,
  utrNumber: z.string().nullable(),
});

export const reviewPublishedSchema = z.object({
  reviewId: uuid,
  productId: uuid,
  userId: uuid,
  sellerId: uuid.nullable(),
  rating: z.number().int().min(1).max(5),
  isVerifiedPurchase: z.boolean(),
});

export const deliveryOtpRequestedSchema = z.object({
  shipmentId: uuid,
  orderId: uuid,
  challengeId: uuid,
});

/**
 * Registry mapping every event type to its payload schema. Publish and consume both
 * validate through this, so an event that does not match its contract never reaches a
 * projection.
 */
export const EVENT_SCHEMAS = {
  USER_REGISTERED: userRegisteredSchema,
  SELLER_REGISTERED: sellerApprovedSchema.partial({ approvedBy: true }),
  SELLER_APPROVED: sellerApprovedSchema,
  SELLER_SUSPENDED: sellerSuspendedSchema,
  PRODUCT_CREATED: productUpdatedSchema,
  PRODUCT_UPDATED: productUpdatedSchema,
  LISTING_CREATED: listingUpdatedSchema,
  LISTING_UPDATED: listingUpdatedSchema,
  LISTING_PRICE_CHANGED: listingPriceChangedSchema,
  INVENTORY_UPDATED: inventoryUpdatedSchema,
  INVENTORY_RESERVED: inventoryReservedSchema,
  INVENTORY_RELEASED: inventoryReservedSchema,
  CHECKOUT_STARTED: checkoutStartedSchema,
  ORDER_CREATED: orderCreatedSchema,
  ORDER_CONFIRMED: orderConfirmedSchema,
  ORDER_CANCELLED: orderCancelledSchema,
  ORDER_ITEM_STATUS_CHANGED: orderItemStatusChangedSchema,
  PAYMENT_CREATED: paymentEventSchema,
  PAYMENT_SUCCESS: paymentEventSchema,
  PAYMENT_FAILED: paymentEventSchema,
  REFUND_CREATED: refundEventSchema,
  REFUND_SUCCESS: refundEventSchema,
  REFUND_FAILED: refundEventSchema,
  SHIPMENT_CREATED: shipmentEventSchema,
  ORDER_SHIPPED: shipmentEventSchema,
  OUT_FOR_DELIVERY: shipmentEventSchema,
  ORDER_DELIVERED: shipmentEventSchema,
  DELIVERY_OTP_REQUESTED: deliveryOtpRequestedSchema,
  RETURN_REQUESTED: returnEventSchema,
  RETURN_APPROVED: returnEventSchema,
  RETURN_RECEIVED: returnEventSchema,
  SETTLEMENT_CREATED: settlementCreatedSchema,
  SELLER_PAID: sellerPaidSchema,
  REVIEW_PUBLISHED: reviewPublishedSchema,
} as const satisfies Record<EventType, z.ZodTypeAny>;

export type EventPayload<T extends EventType> = z.infer<(typeof EVENT_SCHEMAS)[T]>;

/** Aggregate type and partition key per event, so ordering guarantees are explicit. */
export const EVENT_AGGREGATE: Record<EventType, { aggregateType: string; partitionBy: string }> = {
  USER_REGISTERED: { aggregateType: 'user', partitionBy: 'userId' },
  SELLER_REGISTERED: { aggregateType: 'seller', partitionBy: 'sellerId' },
  SELLER_APPROVED: { aggregateType: 'seller', partitionBy: 'sellerId' },
  SELLER_SUSPENDED: { aggregateType: 'seller', partitionBy: 'sellerId' },
  PRODUCT_CREATED: { aggregateType: 'product', partitionBy: 'productId' },
  PRODUCT_UPDATED: { aggregateType: 'product', partitionBy: 'productId' },
  LISTING_CREATED: { aggregateType: 'listing', partitionBy: 'skuId' },
  LISTING_UPDATED: { aggregateType: 'listing', partitionBy: 'skuId' },
  LISTING_PRICE_CHANGED: { aggregateType: 'listing', partitionBy: 'skuId' },
  INVENTORY_UPDATED: { aggregateType: 'inventory', partitionBy: 'skuId' },
  INVENTORY_RESERVED: { aggregateType: 'inventory', partitionBy: 'checkoutSessionId' },
  INVENTORY_RELEASED: { aggregateType: 'inventory', partitionBy: 'checkoutSessionId' },
  CHECKOUT_STARTED: { aggregateType: 'checkout', partitionBy: 'checkoutSessionId' },
  ORDER_CREATED: { aggregateType: 'order', partitionBy: 'orderId' },
  ORDER_CONFIRMED: { aggregateType: 'order', partitionBy: 'orderId' },
  ORDER_CANCELLED: { aggregateType: 'order', partitionBy: 'orderId' },
  ORDER_ITEM_STATUS_CHANGED: { aggregateType: 'order', partitionBy: 'orderId' },
  PAYMENT_CREATED: { aggregateType: 'payment', partitionBy: 'orderId' },
  PAYMENT_SUCCESS: { aggregateType: 'payment', partitionBy: 'orderId' },
  PAYMENT_FAILED: { aggregateType: 'payment', partitionBy: 'orderId' },
  REFUND_CREATED: { aggregateType: 'refund', partitionBy: 'orderId' },
  REFUND_SUCCESS: { aggregateType: 'refund', partitionBy: 'orderId' },
  REFUND_FAILED: { aggregateType: 'refund', partitionBy: 'orderId' },
  SHIPMENT_CREATED: { aggregateType: 'shipment', partitionBy: 'orderId' },
  ORDER_SHIPPED: { aggregateType: 'shipment', partitionBy: 'orderId' },
  OUT_FOR_DELIVERY: { aggregateType: 'shipment', partitionBy: 'orderId' },
  ORDER_DELIVERED: { aggregateType: 'shipment', partitionBy: 'orderId' },
  DELIVERY_OTP_REQUESTED: { aggregateType: 'shipment', partitionBy: 'orderId' },
  RETURN_REQUESTED: { aggregateType: 'return', partitionBy: 'returnRequestId' },
  RETURN_APPROVED: { aggregateType: 'return', partitionBy: 'returnRequestId' },
  RETURN_RECEIVED: { aggregateType: 'return', partitionBy: 'returnRequestId' },
  SETTLEMENT_CREATED: { aggregateType: 'settlement', partitionBy: 'sellerId' },
  SELLER_PAID: { aggregateType: 'payout', partitionBy: 'sellerId' },
  REVIEW_PUBLISHED: { aggregateType: 'review', partitionBy: 'productId' },
};

export function validateEventPayload<T extends EventType>(
  eventType: T,
  payload: unknown,
): EventPayload<T> {
  const schema = EVENT_SCHEMAS[eventType];
  if (!schema) {
    throw new Error(`Unknown event type: ${eventType}`);
  }
  return schema.parse(payload) as EventPayload<T>;
}

/** Resolves the partition key from a validated payload. */
export function resolvePartitionKey<T extends EventType>(
  eventType: T,
  payload: EventPayload<T>,
): string {
  const field = EVENT_AGGREGATE[eventType].partitionBy;
  const value = (payload as Record<string, unknown>)[field];
  return typeof value === 'string' && value.length > 0 ? value : eventType;
}
