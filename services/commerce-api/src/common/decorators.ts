import { SetMetadata } from '@nestjs/common';

export const PUBLIC_KEY = 'novamart:public';
export const PERMISSIONS_KEY = 'novamart:permissions';
export const SCOPE_KEY = 'novamart:scope';
export const IDEMPOTENT_KEY = 'novamart:idempotent';
export const RATE_LIMIT_KEY = 'novamart:rate-limit';
export const AUDIT_KEY = 'novamart:audit';

/** No authentication required. Everything else needs a verified principal. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Requires every listed permission. */
export const Permissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Declares that the permission must be held for the scope identified by a route
 * parameter or body field, e.g. @Scope('seller', 'param:sellerId').
 */
export const Scope = (scopeType: 'seller' | 'warehouse', source: string) =>
  SetMetadata(SCOPE_KEY, { scopeType, source });

/** Requires an Idempotency-Key header, and replays the stored response on retry. */
export const Idempotent = (scope: string) => SetMetadata(IDEMPOTENT_KEY, scope);

export const RateLimit = (limit: number, windowSeconds: number) =>
  SetMetadata(RATE_LIMIT_KEY, { limit, windowSeconds });

/** Writes an audit row for this action. */
export const Audit = (action: string, resourceType: string) =>
  SetMetadata(AUDIT_KEY, { action, resourceType });
