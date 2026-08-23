import { describe, expect, it } from 'vitest';
import {
  canTransition,
  isCustomerCancellable,
  isTerminal,
  nextStatuses,
  shouldApplyProviderStatus,
} from './order-state-machine';

describe('order state machine', () => {
  it('rejects the transition the brief calls out explicitly', () => {
    // DELIVERED → PACKED must never be possible (brief §32).
    expect(canTransition('DELIVERED', 'PACKED', 'SYSTEM').allowed).toBe(false);
  });

  it('rejects other physically impossible moves', () => {
    expect(canTransition('CANCELLED', 'SHIPPED', 'SYSTEM').allowed).toBe(false);
    expect(canTransition('REFUNDED', 'DELIVERED', 'SUPPORT').allowed).toBe(false);
    expect(canTransition('CREATED', 'DELIVERED', 'SYSTEM').allowed).toBe(false);
  });

  it('allows the normal fulfilment path', () => {
    expect(canTransition('CONFIRMED', 'ALLOCATED', 'SYSTEM').allowed).toBe(true);
    expect(canTransition('ALLOCATED', 'PROCESSING', 'WAREHOUSE').allowed).toBe(true);
    expect(canTransition('PROCESSING', 'PACKED', 'WAREHOUSE').allowed).toBe(true);
    expect(canTransition('READY_TO_SHIP', 'SHIPPED', 'SYSTEM').allowed).toBe(true);
    expect(canTransition('OUT_FOR_DELIVERY', 'DELIVERED', 'SYSTEM').allowed).toBe(true);
  });

  it('enforces actor authority', () => {
    // A customer cannot mark their own order delivered.
    expect(canTransition('OUT_FOR_DELIVERY', 'DELIVERED', 'CUSTOMER').allowed).toBe(false);
    // A customer can request cancellation while it is still being prepared.
    expect(canTransition('CONFIRMED', 'CANCELLATION_REQUESTED', 'CUSTOMER').allowed).toBe(true);
  });

  it('flags transitions that require a reason', () => {
    expect(canTransition('PROCESSING', 'CANCELLED', 'SELLER').requiresReason).toBe(true);
    expect(canTransition('PROCESSING', 'PACKED', 'WAREHOUSE').requiresReason).toBe(false);
  });

  it('exposes legal next actions for UI rendering', () => {
    expect(nextStatuses('DELIVERED', 'CUSTOMER')).toEqual(['RETURN_REQUESTED']);
    expect(nextStatuses('PACKED', 'WAREHOUSE')).toContain('READY_TO_SHIP');
  });

  it('treats terminal statuses as terminal', () => {
    expect(isTerminal('CANCELLED')).toBe(true);
    expect(isTerminal('REFUNDED')).toBe(true);
    expect(isTerminal('SHIPPED')).toBe(false);
  });

  it('ignores out-of-order provider events instead of regressing status', () => {
    // Courier sends "shipped" after we already recorded "delivered".
    expect(shouldApplyProviderStatus('DELIVERED', 'SHIPPED')).toBe(false);
    expect(shouldApplyProviderStatus('SHIPPED', 'OUT_FOR_DELIVERY')).toBe(true);
    expect(shouldApplyProviderStatus('CANCELLED', 'SHIPPED')).toBe(false);
    expect(shouldApplyProviderStatus('SHIPPED', 'SHIPPED')).toBe(false);
  });

  it('limits self-service cancellation to pre-dispatch states', () => {
    expect(isCustomerCancellable('PROCESSING')).toBe(true);
    expect(isCustomerCancellable('SHIPPED')).toBe(false);
    expect(isCustomerCancellable('DELIVERED')).toBe(false);
  });
});
