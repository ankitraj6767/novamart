import type { ErrorCode } from './errors';

/** Success envelope (docs/API_CONVENTIONS.md §2). */
export interface ApiSuccess<TData, TMeta extends object = Record<string, unknown>> {
  success: true;
  data: TData;
  meta?: TMeta & { requestId?: string; cursor?: CursorMeta };
}

export interface ApiError {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Array<{ field?: string; issue: string }>;
  };
  requestId?: string;
}

export type ApiResponse<TData> = ApiSuccess<TData> | ApiError;

export interface CursorMeta {
  next: string | null;
  hasMore: boolean;
}

export interface Paginated<T> {
  items: T[];
  cursor: CursorMeta;
  /** Present only where a cheap exact count is available. */
  totalCount?: number;
}

/** Money is always transported as integer paise plus a server-formatted display string. */
export interface MoneyDto {
  paise: number;
  currency: 'INR';
  display: string;
}

export type ClientPlatform = 'android' | 'ios' | 'web';

export interface RequestContext {
  requestId: string;
  traceId: string;
  userId: string | null;
  actorType: ActorType;
  permissions: string[];
  sellerIds: string[];
  warehouseIds: string[];
  roles: string[];
  platform: ClientPlatform | null;
  appVersion: string | null;
  locale: string;
  ip: string | null;
  userAgent: string | null;
  deviceId: string | null;
}

export type ActorType =
  | 'CUSTOMER'
  | 'SELLER'
  | 'WAREHOUSE'
  | 'DELIVERY'
  | 'SUPPORT'
  | 'STAFF'
  | 'SYSTEM'
  | 'WORKER'
  | 'PROVIDER_WEBHOOK';

export const ORDER_STATUSES = [
  'CREATED',
  'PENDING_PAYMENT',
  'PAYMENT_FAILED',
  'PAYMENT_CONFIRMED',
  'CONFIRMED',
  'ALLOCATED',
  'PROCESSING',
  'PACKED',
  'READY_TO_SHIP',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLATION_REQUESTED',
  'CANCELLED',
  'RETURN_REQUESTED',
  'RETURN_APPROVED',
  'RETURN_REJECTED',
  'RETURN_PICKED',
  'RETURN_RECEIVED',
  'RETURN_QC_COMPLETED',
  'REFUND_PENDING',
  'REFUNDED',
  'REFUND_FAILED',
  'REPLACEMENT_CREATED',
  'RTO_INITIATED',
  'RTO_DELIVERED',
  'LOST_IN_TRANSIT',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_METHODS = [
  'UPI',
  'CARD',
  'NET_BANKING',
  'WALLET',
  'EMI',
  'COD',
  'PAY_LATER',
  'GIFT_CARD',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type CodDecision = 'COD_ALLOWED' | 'COD_BLOCKED' | 'COD_PARTIAL_PREPAY';

export type FulfillmentModel =
  | 'SELLER_FULFILLED'
  | 'NOVAMART_FULFILLED'
  | 'WAREHOUSE_FULFILLED'
  | 'DROPSHIP';
