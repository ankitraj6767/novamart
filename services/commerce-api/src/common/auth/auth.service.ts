import { Injectable, Logger } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { loadServerEnv } from '@novamart/config';
import { AppError } from '../errors/app-error';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import type { Principal } from '../context/request-context';

/**
 * Authentication and authorization resolution.
 *
 * Supabase issues and signs the token; NovaMart decides what the holder may do, and it
 * reads that from identity.user_roles — never from JWT user_metadata, which the user
 * can write (ADR 0009).
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly env = loadServerEnv();
  private jwks?: ReturnType<typeof createRemoteJWKSet>;
  private readonly hmacKey?: Uint8Array;

  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {
    if (this.env.SUPABASE_JWKS_URL) {
      this.jwks = createRemoteJWKSet(new URL(this.env.SUPABASE_JWKS_URL), {
        cooldownDuration: 30_000,
        cacheMaxAge: 600_000,
      });
    }
    if (this.env.SUPABASE_JWT_SECRET) {
      this.hmacKey = new TextEncoder().encode(this.env.SUPABASE_JWT_SECRET);
    }
    if (!this.jwks && !this.hmacKey) {
      this.logger.warn(
        'No JWT verification material configured. Set SUPABASE_JWKS_URL or SUPABASE_JWT_SECRET.',
      );
    }
  }

  async verifyToken(token: string): Promise<JWTPayload> {
    const options = {
      audience: this.env.SUPABASE_JWT_AUDIENCE,
      ...(this.env.SUPABASE_JWT_ISSUER ? { issuer: this.env.SUPABASE_JWT_ISSUER } : {}),
      clockTolerance: 5,
    };

    try {
      // Asymmetric verification first: hosted Supabase projects use JWKS.
      if (this.jwks) {
        const { payload } = await jwtVerify(token, this.jwks, options);
        return payload;
      }
      if (this.hmacKey) {
        const { payload } = await jwtVerify(token, this.hmacKey, options);
        return payload;
      }
      throw new AppError('AUTH_INVALID_TOKEN', 'Token verification is not configured');
    } catch (error) {
      // A shared-secret fallback covers local stacks where JWKS is present but the
      // token was signed with the legacy HS256 secret.
      if (this.jwks && this.hmacKey) {
        try {
          const { payload } = await jwtVerify(token, this.hmacKey, options);
          return payload;
        } catch {
          /* fall through to the mapped error below */
        }
      }

      const message = error instanceof Error ? error.message : '';
      if (message.includes('exp') || message.includes('expired')) {
        throw new AppError('AUTH_TOKEN_EXPIRED');
      }
      throw new AppError('AUTH_INVALID_TOKEN');
    }
  }

  /**
   * Resolves the authorization state for a user.
   *
   * Cached briefly in Redis: authorization must be fast on every request, but a
   * revocation has to take effect quickly. 60 seconds is the documented trade-off, and
   * role changes actively invalidate the key.
   */
  async resolvePrincipal(userId: string, mfaVerified: boolean): Promise<Principal> {
    const cacheKey = `principal:${userId}`;
    const cached = await this.redis.get<Omit<Principal, 'mfaVerified'>>(cacheKey);
    if (cached) return { ...cached, mfaVerified };

    const [profile] = await this.db.sql<Array<{ account_status: string }>>`
      select account_status from identity.profiles where id = ${userId}
    `;

    if (!profile) {
      // Authenticated by Supabase but no NovaMart profile: the provisioning trigger
      // has not run yet, or the account was purged.
      throw new AppError('AUTH_INVALID_TOKEN', 'No NovaMart profile for this account');
    }

    const rows = await this.db.sql<
      Array<{
        role_code: string;
        permission_code: string | null;
        scope_type: string | null;
        scope_id: string | null;
      }>
    >`
      select r.code            as role_code,
             p.code            as permission_code,
             ur.scope_type,
             ur.scope_id::text as scope_id
        from identity.user_roles ur
        join identity.roles r on r.id = ur.role_id
        left join identity.role_permissions rp on rp.role_id = r.id
        left join identity.permissions p on p.id = rp.permission_id
       where ur.user_id = ${userId}
         and ur.revoked_at is null
         and (ur.expires_at is null or ur.expires_at > now())
    `;

    const roles = new Set<string>();
    const permissions = new Set<string>();
    const sellerIds = new Set<string>();
    const warehouseIds = new Set<string>();

    for (const row of rows) {
      roles.add(row.role_code);
      if (row.permission_code) permissions.add(row.permission_code);
      if (row.scope_type === 'seller' && row.scope_id) sellerIds.add(row.scope_id);
      if (row.scope_type === 'warehouse' && row.scope_id) warehouseIds.add(row.scope_id);
    }

    const resolved: Omit<Principal, 'mfaVerified'> = {
      userId,
      roles: [...roles],
      permissions: [...permissions],
      sellerIds: [...sellerIds],
      warehouseIds: [...warehouseIds],
      accountStatus: profile.account_status,
    };

    await this.redis.set(cacheKey, resolved, this.env.CACHE_PERMISSION_TTL_SECONDS);
    return { ...resolved, mfaVerified };
  }

  /** Called after any role or status change so revocation is immediate. */
  async invalidatePrincipal(userId: string): Promise<void> {
    await this.redis.del(`principal:${userId}`);
  }
}
