/**
 * Ports. Every external dependency the platform will outgrow sits behind one of
 * these, so swapping Supabase Queues for Kafka, or Typesense for OpenSearch, is an
 * adapter change plus a backfill rather than a domain rewrite
 * (docs/SYSTEM_ARCHITECTURE.md §7).
 */

import type { Paise } from './money';

// ---------------------------------------------------------------------------
// Event transport
// ---------------------------------------------------------------------------

export interface DomainEventEnvelope<TPayload = unknown> {
  id: string;
  eventType: string;
  eventVersion: number;
  aggregateType: string;
  aggregateId: string;
  partitionKey: string;
  payload: TPayload;
  metadata: Record<string, unknown>;
  actorId: string | null;
  requestId: string | null;
  traceId: string | null;
  occurredAt: Date;
}

export interface EventBus {
  /**
   * Publishes an already-durable event. Domain code never calls this: it writes to
   * the outbox, and the dispatcher publishes (ADR 0005).
   */
  publish(event: DomainEventEnvelope): Promise<void>;
  publishBatch(events: DomainEventEnvelope[]): Promise<void>;
}

export interface EventConsumer {
  readonly name: string;
  readonly eventTypes: readonly string[];
  /** Must be idempotent: delivery is at-least-once. */
  handle(event: DomainEventEnvelope): Promise<void>;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export type SearchCollection = 'products' | 'suggestions' | 'sellers';

export interface SearchDocument {
  id: string;
  [field: string]: unknown;
}

export interface SearchQuery {
  collection: SearchCollection;
  query: string;
  filters?: Record<string, string | number | boolean | Array<string | number>>;
  numericRanges?: Record<string, { gte?: number; lte?: number }>;
  facets?: string[];
  sort?: string[];
  page?: number;
  perPage?: number;
  /** Personalisation hook; unused at launch but part of the contract. */
  userId?: string;
}

export interface SearchFacet {
  field: string;
  label: string;
  values: Array<{ value: string; label: string; count: number }>;
}

export interface SearchResult {
  hits: SearchDocument[];
  found: number;
  page: number;
  perPage: number;
  facets: SearchFacet[];
  /** Typo-corrected query when the engine rewrote it. */
  correctedQuery: string | null;
  processingTimeMs: number;
}

export interface SuggestQuery {
  query: string;
  limit?: number;
}

export interface SuggestResult {
  suggestions: Array<{
    text: string;
    type: 'PRODUCT' | 'CATEGORY' | 'BRAND' | 'QUERY';
    targetId: string | null;
    imageUrl: string | null;
  }>;
}

export interface SearchEngine {
  ensureSchema(): Promise<void>;
  upsertDocuments(collection: SearchCollection, docs: SearchDocument[]): Promise<void>;
  deleteDocument(collection: SearchCollection, id: string): Promise<void>;
  search(query: SearchQuery): Promise<SearchResult>;
  suggest(query: SuggestQuery): Promise<SuggestResult>;
  /** Zero-downtime reindex: build into a new collection, then repoint the alias. */
  swapAlias(collection: SearchCollection, target: string): Promise<void>;
  syncSynonyms(
    synonyms: Array<{ root: string; synonyms: string[]; oneWay: boolean }>,
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  /** Invalidate by tag so a price change can clear every derived entry. */
  invalidateTag(tag: string): Promise<void>;
  incr(key: string, ttlSeconds?: number): Promise<number>;
  /** Distributed lock for coordination that is not money- or stock-critical. */
  acquireLock(key: string, ttlMs: number): Promise<string | null>;
  releaseLock(key: string, token: string): Promise<boolean>;
}

export interface RateLimiter {
  consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; remaining: number; resetAt: Date; retryAfterSeconds: number }>;
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export interface CreatePaymentInput {
  orderId: string;
  orderNumber: string;
  amountPaise: Paise;
  currency: 'INR';
  paymentMethod: string;
  customer: { id: string; name: string | null; email: string | null; phone: string | null };
  idempotencyKey: string;
  notes?: Record<string, string>;
}

export interface CreatePaymentResult {
  providerIntentId: string;
  /** Publishable handoff data for the client. Never contains a secret. */
  clientSession: Record<string, unknown>;
  expiresAt: Date | null;
}

export interface VerifiedPayment {
  providerPaymentId: string;
  providerIntentId: string;
  status: 'AUTHORISED' | 'CAPTURED' | 'FAILED' | 'PENDING' | 'CANCELLED' | 'REFUNDED';
  amountPaise: Paise;
  capturedPaise: Paise;
  method: string | null;
  instrument: {
    type: string | null;
    cardNetwork: string | null;
    cardLast4: string | null;
    cardIssuer: string | null;
    upiVpaMasked: string | null;
    bankCode: string | null;
    walletProvider: string | null;
    token: string | null;
  } | null;
  fee: { providerFeePaise: Paise; providerTaxPaise: Paise } | null;
  failureCode: string | null;
  failureReason: string | null;
  isRetryable: boolean | null;
  occurredAt: Date;
  raw: Record<string, unknown>;
}

export interface RefundInput {
  providerPaymentId: string;
  amountPaise: Paise;
  idempotencyKey: string;
  reason: string;
  notes?: Record<string, string>;
}

export interface RefundResult {
  providerRefundId: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  amountPaise: Paise;
  failureCode: string | null;
  failureReason: string | null;
  raw: Record<string, unknown>;
}

export interface WebhookVerification {
  valid: boolean;
  eventId: string | null;
  eventType: string | null;
  providerPaymentId: string | null;
  providerIntentId: string | null;
  providerRefundId: string | null;
  reportedAmountPaise: Paise | null;
  occurredAt: Date | null;
  payload: Record<string, unknown>;
  reason?: string;
}

export interface PaymentProvider {
  readonly code: string;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  /** Server-side truth. Never trust a client callback (brief §33). */
  getPayment(providerPaymentId: string): Promise<VerifiedPayment>;
  capturePayment(providerPaymentId: string, amountPaise: Paise): Promise<VerifiedPayment>;
  refund(input: RefundInput): Promise<RefundResult>;
  getRefund(providerRefundId: string): Promise<RefundResult>;
  /** Verifies the HMAC over the RAW body before any parsing. */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | undefined>): WebhookVerification;
}

// ---------------------------------------------------------------------------
// Shipping
// ---------------------------------------------------------------------------

export interface ServiceabilityQuery {
  originPincode: string;
  destinationPincode: string;
  weightGrams: number;
  isCod: boolean;
  declaredValuePaise: Paise;
}

export interface ServiceabilityOption {
  carrierCode: string;
  carrierName: string;
  serviceMode: 'SURFACE' | 'AIR' | 'EXPRESS';
  estimatedDays: number;
  freightPaise: Paise;
  codAvailable: boolean;
  codFeePaise: Paise;
  reverseAvailable: boolean;
}

export interface CreateShipmentInput {
  shipmentReference: string;
  orderNumber: string;
  carrierCode: string;
  isCod: boolean;
  codAmountPaise: Paise;
  declaredValuePaise: Paise;
  weightGrams: number;
  dimensions: { lengthMm: number; widthMm: number; heightMm: number } | null;
  pickup: ShippingAddress;
  delivery: ShippingAddress;
  items: Array<{ name: string; sku: string; quantity: number; unitPricePaise: Paise; hsn: string | null }>;
  idempotencyKey: string;
}

export interface ShippingAddress {
  name: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  stateCode: string;
  pincode: string;
  countryCode: 'IN';
  email?: string | null;
}

export interface CreateShipmentResult {
  providerShipmentId: string;
  awbNumber: string;
  carrierCode: string;
  labelUrl: string | null;
  estimatedDeliveryDate: Date | null;
  freightPaise: Paise | null;
}

export interface TrackingUpdate {
  providerEventId: string | null;
  carrierStatusCode: string | null;
  normalisedStatus: string;
  description: string;
  location: string | null;
  locationPincode: string | null;
  occurredAt: Date;
  raw: Record<string, unknown>;
}

export interface ShippingProvider {
  readonly code: string;
  checkServiceability(query: ServiceabilityQuery): Promise<ServiceabilityOption[]>;
  createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult>;
  cancelShipment(providerShipmentId: string, reason: string): Promise<boolean>;
  generateLabel(providerShipmentId: string): Promise<{ url: string; format: 'PDF' | 'PNG' | 'ZPL' }>;
  trackShipment(awbNumber: string): Promise<TrackingUpdate[]>;
  schedulePickup(providerShipmentId: string, date: Date): Promise<boolean>;
  createReverseShipment(input: CreateShipmentInput): Promise<CreateShipmentResult>;
  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
  ): { valid: boolean; awbNumber: string | null; updates: TrackingUpdate[]; reason?: string };
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export type NotificationChannel = 'PUSH' | 'EMAIL' | 'SMS' | 'WHATSAPP' | 'IN_APP';

export interface SendNotificationInput {
  channel: NotificationChannel;
  to: { userId: string; pushTokens?: string[]; email?: string | null; phone?: string | null };
  subject: string | null;
  title: string | null;
  body: string;
  deepLink: string | null;
  imageUrl: string | null;
  data: Record<string, string>;
  /** DLT template id, mandatory for commercial SMS in India. */
  dltTemplateId?: string | null;
  idempotencyKey: string;
}

export interface SendNotificationResult {
  accepted: boolean;
  providerMessageId: string | null;
  failureCode: string | null;
  failureReason: string | null;
  raw: Record<string, unknown>;
}

export interface NotificationProvider {
  readonly code: string;
  readonly channels: readonly NotificationChannel[];
  send(input: SendNotificationInput): Promise<SendNotificationResult>;
}

// ---------------------------------------------------------------------------
// Object storage
// ---------------------------------------------------------------------------

export interface SignedUploadTarget {
  url: string;
  token: string | null;
  path: string;
  bucket: string;
  expiresAt: Date;
  requiredHeaders: Record<string, string>;
}

export interface ObjectStore {
  createSignedUpload(input: {
    bucket: string;
    path: string;
    mimeType: string;
    maxSizeBytes: number;
    expiresInSeconds?: number;
  }): Promise<SignedUploadTarget>;
  createSignedDownload(input: {
    bucket: string;
    path: string;
    expiresInSeconds?: number;
    downloadName?: string;
  }): Promise<{ url: string; expiresAt: Date }>;
  publicUrl(bucket: string, path: string): string;
  remove(bucket: string, paths: string[]): Promise<void>;
  /** Re-encodes an image to strip EXIF and polyglot payloads before public exposure. */
  uploadProcessedImage(input: {
    bucket: string;
    path: string;
    body: Buffer;
    mimeType: string;
  }): Promise<{ path: string; publicUrl: string; width: number | null; height: number | null }>;
}

// ---------------------------------------------------------------------------
// KYC / bank verification
// ---------------------------------------------------------------------------

export interface KycProvider {
  readonly code: string;
  verifyPan(pan: string, name: string): Promise<{ valid: boolean; nameMatch: boolean; registeredName: string | null; raw: Record<string, unknown> }>;
  verifyGstin(gstin: string): Promise<{ valid: boolean; legalName: string | null; status: string | null; stateCode: string | null; raw: Record<string, unknown> }>;
  verifyBankAccount(input: { accountNumber: string; ifsc: string; name: string }): Promise<{
    valid: boolean;
    nameMatch: boolean;
    nameMatchScore: number | null;
    registeredName: string | null;
    reference: string | null;
    raw: Record<string, unknown>;
  }>;
}
