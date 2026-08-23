import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { ActorType, ClientPlatform } from '@novamart/types';

export interface Principal {
  userId: string;
  roles: string[];
  permissions: string[];
  sellerIds: string[];
  warehouseIds: string[];
  accountStatus: string;
  /** Whether the session completed an MFA challenge, for step-up gated actions. */
  mfaVerified: boolean;
}

export interface RequestContextData {
  requestId: string;
  traceId: string;
  principal: Principal | null;
  actorType: ActorType;
  platform: ClientPlatform | null;
  appVersion: string | null;
  locale: string;
  ip: string | null;
  userAgent: string | null;
  deviceId: string | null;
  idempotencyKey: string | null;
  startedAt: number;
}

const storage = new AsyncLocalStorage<RequestContextData>();

export const RequestContext = {
  run<T>(data: RequestContextData, fn: () => T): T {
    return storage.run(data, fn);
  },

  get(): RequestContextData | undefined {
    return storage.getStore();
  },

  /** Throws rather than returning null: an unauthenticated caller reaching a guarded
   * handler is a wiring bug, and failing loudly is safer than defaulting to anonymous. */
  requirePrincipal(): Principal {
    const ctx = storage.getStore();
    if (!ctx?.principal) {
      throw new Error('RequestContext has no principal; AuthGuard did not run');
    }
    return ctx.principal;
  },

  userId(): string | null {
    return storage.getStore()?.principal?.userId ?? null;
  },

  requestId(): string {
    return storage.getStore()?.requestId ?? 'unknown';
  },

  traceId(): string {
    return storage.getStore()?.traceId ?? 'unknown';
  },

  actorType(): ActorType {
    return storage.getStore()?.actorType ?? 'SYSTEM';
  },

  sessionContext(): {
    actorId: string | null;
    actorType: string;
    requestId: string | null;
    traceId: string | null;
  } {
    const ctx = storage.getStore();
    return {
      actorId: ctx?.principal?.userId ?? null,
      actorType: ctx?.actorType ?? 'SYSTEM',
      requestId: ctx?.requestId ?? null,
      traceId: ctx?.traceId ?? null,
    };
  },

  create(partial: Partial<RequestContextData> = {}): RequestContextData {
    return {
      requestId: partial.requestId ?? randomUUID(),
      traceId: partial.traceId ?? randomUUID().replace(/-/g, ''),
      principal: partial.principal ?? null,
      actorType: partial.actorType ?? 'SYSTEM',
      platform: partial.platform ?? null,
      appVersion: partial.appVersion ?? null,
      locale: partial.locale ?? 'en-IN',
      ip: partial.ip ?? null,
      userAgent: partial.userAgent ?? null,
      deviceId: partial.deviceId ?? null,
      idempotencyKey: partial.idempotencyKey ?? null,
      startedAt: partial.startedAt ?? Date.now(),
    };
  },
};

/** Derives the audit/session actor type from the roles a principal holds. */
export function deriveActorType(roles: string[]): ActorType {
  if (roles.some((r) => r === 'SUPER_ADMIN' || r === 'ADMIN' || r.endsWith('_MANAGER'))) {
    return 'STAFF';
  }
  if (roles.some((r) => r.startsWith('SUPPORT_'))) return 'SUPPORT';
  if (roles.some((r) => r.startsWith('SELLER_'))) return 'SELLER';
  if (roles.some((r) => r.startsWith('WAREHOUSE_') || r === 'INVENTORY_EMPLOYEE')) {
    return 'WAREHOUSE';
  }
  if (roles.includes('DELIVERY_AGENT')) return 'DELIVERY';
  return 'CUSTOMER';
}
