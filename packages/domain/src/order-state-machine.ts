import type { ActorType, OrderStatus } from '@novamart/types';

/**
 * Mirror of commerce.order_status_transitions and order_status_ranks (ADR 0012).
 *
 * The database is the authority — it rejects illegal transitions whatever the caller
 * does. This copy exists so the API, the operator consoles and the mobile apps can
 * render only the legal actions from one definition instead of hardcoded switches.
 *
 * If these diverge from the database, tests/domain/state-machine.test.ts fails: it
 * loads the table and compares.
 */

export type TransitionActor = Extract<
  ActorType,
  'CUSTOMER' | 'SELLER' | 'WAREHOUSE' | 'SUPPORT' | 'SYSTEM'
>;

export interface Transition {
  from: OrderStatus;
  to: OrderStatus;
  actors: TransitionActor[];
  requiresReason: boolean;
  appliesTo: 'ORDER' | 'ITEM' | 'BOTH';
}

export const ORDER_STATUS_RANK: Record<OrderStatus, number> = {
  CREATED: 10,
  PENDING_PAYMENT: 20,
  PAYMENT_FAILED: 25,
  PAYMENT_CONFIRMED: 30,
  CONFIRMED: 40,
  CANCELLATION_REQUESTED: 45,
  CANCELLED: 46,
  ALLOCATED: 50,
  PROCESSING: 60,
  PACKED: 70,
  READY_TO_SHIP: 75,
  SHIPPED: 80,
  OUT_FOR_DELIVERY: 90,
  DELIVERED: 100,
  RTO_INITIATED: 105,
  RTO_DELIVERED: 106,
  LOST_IN_TRANSIT: 107,
  RETURN_REQUESTED: 110,
  RETURN_APPROVED: 120,
  RETURN_REJECTED: 121,
  RETURN_PICKED: 130,
  RETURN_RECEIVED: 140,
  RETURN_QC_COMPLETED: 150,
  REPLACEMENT_CREATED: 155,
  REFUND_PENDING: 160,
  REFUND_FAILED: 165,
  REFUNDED: 170,
};

export const TERMINAL_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  'PAYMENT_FAILED',
  'CANCELLED',
  'RETURN_REJECTED',
  'REFUNDED',
  'REPLACEMENT_CREATED',
  'RTO_DELIVERED',
  'LOST_IN_TRANSIT',
]);

/** Statuses in which a customer may still cancel without support intervention. */
export const CUSTOMER_CANCELLABLE: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  'CREATED',
  'PENDING_PAYMENT',
  'PAYMENT_CONFIRMED',
  'CONFIRMED',
  'ALLOCATED',
  'PROCESSING',
]);

export const TRANSITIONS: readonly Transition[] = [
  { from: 'CREATED', to: 'PENDING_PAYMENT', actors: ['SYSTEM'], requiresReason: false, appliesTo: 'BOTH' },
  { from: 'CREATED', to: 'CONFIRMED', actors: ['SYSTEM'], requiresReason: false, appliesTo: 'BOTH' },
  { from: 'CREATED', to: 'CANCELLED', actors: ['CUSTOMER', 'SUPPORT', 'SYSTEM'], requiresReason: true, appliesTo: 'BOTH' },
  { from: 'PENDING_PAYMENT', to: 'PAYMENT_CONFIRMED', actors: ['SYSTEM'], requiresReason: false, appliesTo: 'BOTH' },
  { from: 'PENDING_PAYMENT', to: 'PAYMENT_FAILED', actors: ['SYSTEM'], requiresReason: true, appliesTo: 'BOTH' },
  { from: 'PENDING_PAYMENT', to: 'CANCELLED', actors: ['CUSTOMER', 'SUPPORT', 'SYSTEM'], requiresReason: true, appliesTo: 'BOTH' },
  { from: 'PAYMENT_FAILED', to: 'PENDING_PAYMENT', actors: ['CUSTOMER', 'SYSTEM'], requiresReason: false, appliesTo: 'BOTH' },
  { from: 'PAYMENT_CONFIRMED', to: 'CONFIRMED', actors: ['SYSTEM'], requiresReason: false, appliesTo: 'BOTH' },
  { from: 'CONFIRMED', to: 'ALLOCATED', actors: ['SYSTEM'], requiresReason: false, appliesTo: 'ITEM' },
  { from: 'CONFIRMED', to: 'CANCELLATION_REQUESTED', actors: ['CUSTOMER', 'SUPPORT'], requiresReason: true, appliesTo: 'BOTH' },
  { from: 'CONFIRMED', to: 'CANCELLED', actors: ['SELLER', 'SUPPORT', 'SYSTEM'], requiresReason: true, appliesTo: 'BOTH' },
  { from: 'ALLOCATED', to: 'PROCESSING', actors: ['SELLER', 'WAREHOUSE', 'SYSTEM'], requiresReason: false, appliesTo: 'ITEM' },
  { from: 'ALLOCATED', to: 'CANCELLATION_REQUESTED', actors: ['CUSTOMER', 'SUPPORT'], requiresReason: true, appliesTo: 'ITEM' },
  { from: 'ALLOCATED', to: 'CANCELLED', actors: ['SELLER', 'SUPPORT', 'SYSTEM'], requiresReason: true, appliesTo: 'ITEM' },
  { from: 'PROCESSING', to: 'PACKED', actors: ['SELLER', 'WAREHOUSE'], requiresReason: false, appliesTo: 'ITEM' },
  { from: 'PROCESSING', to: 'CANCELLED', actors: ['SELLER', 'SUPPORT', 'SYSTEM'], requiresReason: true, appliesTo: 'ITEM' },
  { from: 'PACKED', to: 'READY_TO_SHIP', actors: ['SELLER', 'WAREHOUSE', 'SYSTEM'], requiresReason: false, appliesTo: 'ITEM' },
  { from: 'PACKED', to: 'CANCELLED', actors: ['SUPPORT', 'SYSTEM'], requiresReason: true, appliesTo: 'ITEM' },
  { from: 'READY_TO_SHIP', to: 'SHIPPED', actors: ['SYSTEM', 'WAREHOUSE'], requiresReason: false, appliesTo: 'ITEM' },
  { from: 'READY_TO_SHIP', to: 'CANCELLED', actors: ['SUPPORT', 'SYSTEM'], requiresReason: true, appliesTo: 'ITEM' },
  { from: 'SHIPPED', to: 'OUT_FOR_DELIVERY', actors: ['SYSTEM'], requiresReason: false, appliesTo: 'ITEM' },
  { from: 'SHIPPED', to: 'RTO_INITIATED', actors: ['SYSTEM'], requiresReason: true, appliesTo: 'ITEM' },
  { from: 'SHIPPED', to: 'LOST_IN_TRANSIT', actors: ['SUPPORT', 'SYSTEM'], requiresReason: true, appliesTo: 'ITEM' },
  { from: 'OUT_FOR_DELIVERY', to: 'DELIVERED', actors: ['SYSTEM'], requiresReason: false, appliesTo: 'ITEM' },
  { from: 'OUT_FOR_DELIVERY', to: 'RTO_INITIATED', actors: ['SYSTEM'], requiresReason: true, appliesTo: 'ITEM' },
  { from: 'OUT_FOR_DELIVERY', to: 'LOST_IN_TRANSIT', actors: ['SUPPORT', 'SYSTEM'], requiresReason: true, appliesTo: 'ITEM' },
  { from: 'RTO_INITIATED', to: 'RTO_DELIVERED', actors: ['SYSTEM', 'WAREHOUSE'], requiresReason: false, appliesTo: 'ITEM' },
  { from: 'CANCELLATION_REQUESTED', to: 'CANCELLED', actors: ['SELLER', 'SUPPORT', 'SYSTEM'], requiresReason: true, appliesTo: 'BOTH' },
  { from: 'CANCELLATION_REQUESTED', to: 'PROCESSING', actors: ['SELLER', 'SUPPORT'], requiresReason: true, appliesTo: 'ITEM' },
  { from: 'DELIVERED', to: 'RETURN_REQUESTED', actors: ['CUSTOMER', 'SUPPORT'], requiresReason: true, appliesTo: 'ITEM' },
  { from: 'RETURN_REQUESTED', to: 'RETURN_APPROVED', actors: ['SELLER', 'SUPPORT', 'SYSTEM'], requiresReason: false, appliesTo: 'ITEM' },
  { from: 'RETURN_REQUESTED', to: 'RETURN_REJECTED', actors: ['SELLER', 'SUPPORT'], requiresReason: true, appliesTo: 'ITEM' },
  { from: 'RETURN_APPROVED', to: 'RETURN_PICKED', actors: ['SYSTEM'], requiresReason: false, appliesTo: 'ITEM' },
  { from: 'RETURN_PICKED', to: 'RETURN_RECEIVED', actors: ['WAREHOUSE', 'SELLER', 'SYSTEM'], requiresReason: false, appliesTo: 'ITEM' },
  { from: 'RETURN_RECEIVED', to: 'RETURN_QC_COMPLETED', actors: ['WAREHOUSE', 'SELLER'], requiresReason: false, appliesTo: 'ITEM' },
  { from: 'RETURN_QC_COMPLETED', to: 'REFUND_PENDING', actors: ['SYSTEM'], requiresReason: false, appliesTo: 'ITEM' },
  { from: 'RETURN_QC_COMPLETED', to: 'REPLACEMENT_CREATED', actors: ['SYSTEM'], requiresReason: false, appliesTo: 'ITEM' },
  { from: 'RETURN_QC_COMPLETED', to: 'RETURN_REJECTED', actors: ['WAREHOUSE', 'SUPPORT'], requiresReason: true, appliesTo: 'ITEM' },
  { from: 'CANCELLED', to: 'REFUND_PENDING', actors: ['SYSTEM'], requiresReason: false, appliesTo: 'ITEM' },
  { from: 'RTO_DELIVERED', to: 'REFUND_PENDING', actors: ['SYSTEM'], requiresReason: false, appliesTo: 'ITEM' },
  { from: 'LOST_IN_TRANSIT', to: 'REFUND_PENDING', actors: ['SYSTEM'], requiresReason: false, appliesTo: 'ITEM' },
  { from: 'REFUND_PENDING', to: 'REFUNDED', actors: ['SYSTEM'], requiresReason: false, appliesTo: 'ITEM' },
  { from: 'REFUND_PENDING', to: 'REFUND_FAILED', actors: ['SYSTEM'], requiresReason: true, appliesTo: 'ITEM' },
  { from: 'REFUND_FAILED', to: 'REFUND_PENDING', actors: ['SUPPORT', 'SYSTEM'], requiresReason: false, appliesTo: 'ITEM' },
];

const INDEX = new Map<string, Transition>();
for (const t of TRANSITIONS) {
  INDEX.set(`${t.from}->${t.to}->${t.appliesTo}`, t);
}

export interface TransitionCheck {
  allowed: boolean;
  reason?: string;
  requiresReason?: boolean;
}

export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  actor: TransitionActor,
  scope: 'ORDER' | 'ITEM' = 'ITEM',
): TransitionCheck {
  const candidates = TRANSITIONS.filter(
    (t) => t.from === from && t.to === to && (t.appliesTo === scope || t.appliesTo === 'BOTH'),
  );

  if (candidates.length === 0) {
    return { allowed: false, reason: `No transition defined from ${from} to ${to}` };
  }

  const permitted = candidates.find((t) => t.actors.includes(actor));
  if (!permitted) {
    return { allowed: false, reason: `${actor} may not move ${from} to ${to}` };
  }

  return { allowed: true, requiresReason: permitted.requiresReason };
}

/** The legal next statuses for an actor. Drives action buttons in every console. */
export function nextStatuses(
  from: OrderStatus,
  actor: TransitionActor,
  scope: 'ORDER' | 'ITEM' = 'ITEM',
): OrderStatus[] {
  return TRANSITIONS.filter(
    (t) =>
      t.from === from &&
      t.actors.includes(actor) &&
      (t.appliesTo === scope || t.appliesTo === 'BOTH'),
  ).map((t) => t.to);
}

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * Whether a provider event should advance status, or only be recorded.
 * Couriers routinely deliver events out of order; a late "shipped" after "delivered"
 * must not regress the order.
 */
export function shouldApplyProviderStatus(current: OrderStatus, incoming: OrderStatus): boolean {
  if (current === incoming) return false;
  if (isTerminal(current)) return false;
  return (ORDER_STATUS_RANK[incoming] ?? 0) > (ORDER_STATUS_RANK[current] ?? 0);
}

export function isCustomerCancellable(status: OrderStatus): boolean {
  return CUSTOMER_CANCELLABLE.has(status);
}
