import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { RedisService } from '../../infrastructure/redis/redis.service';

/**
 * Platform settings and feature flags (brief §49, §84).
 *
 * Business rules live in platform.platform_settings so operations can change a COD
 * ceiling or a free-shipping threshold without a deployment. Reads are cached briefly
 * because they sit on the checkout hot path; the TTL is short so a change takes effect
 * in seconds rather than requiring a restart.
 *
 * Every getter takes an explicit fallback. A missing setting must never mean "0" by
 * accident on a money field.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private static readonly TTL_SECONDS = 30;

  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  private async raw(key: string): Promise<unknown> {
    return this.redis.remember(`settings:${key}`, SettingsService.TTL_SECONDS, async () => {
      const [row] = await this.db.sql<Array<{ value: unknown }>>`
        select value from platform.platform_settings where key = ${key}
      `;
      // Cache the miss as null too, so a typo'd key does not hammer the database.
      return row?.value ?? null;
    });
  }

  async number(key: string, fallback: number | null): Promise<number | null> {
    const value = await this.raw(key);
    if (value === null || value === undefined) return fallback;
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      this.logger.warn(`Setting ${key} is not numeric; using fallback`);
      return fallback;
    }
    return parsed;
  }

  async boolean(key: string, fallback: boolean): Promise<boolean> {
    const value = await this.raw(key);
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return fallback;
  }

  async string(key: string, fallback: string | null): Promise<string | null> {
    const value = await this.raw(key);
    if (value === null || value === undefined) return fallback;
    return typeof value === 'string' ? value : JSON.stringify(value);
  }

  /**
   * Feature flag evaluation with percentage rollout.
   *
   * Bucketing hashes (salt + subject) so a given user stays on the same side of a
   * partial rollout across requests. Without the stable hash a 10% rollout would
   * flicker per request and be untestable.
   */
  async isEnabled(key: string, subjectId: string | null): Promise<boolean> {
    const flag = await this.redis.remember(
      `flag:${key}`,
      SettingsService.TTL_SECONDS,
      async () => {
        const [row] = await this.db.sql<
          Array<{
            is_enabled: boolean;
            default_value: boolean;
            rollout_percentage: number;
            rollout_salt: string;
          }>
        >`
          select is_enabled, default_value, rollout_percentage, rollout_salt
            from platform.feature_flags where key = ${key}
        `;
        return row ?? null;
      },
    );

    if (!flag) return false;
    if (!flag.is_enabled) return false;
    if (flag.rollout_percentage >= 100) return true;
    if (flag.rollout_percentage <= 0) return flag.default_value;
    if (!subjectId) return flag.default_value;

    const digest = createHash('sha256').update(`${flag.rollout_salt}:${subjectId}`).digest();
    // First two bytes give a stable 0-99 bucket.
    const bucket = ((digest[0]! << 8) | digest[1]!) % 100;
    return bucket < flag.rollout_percentage;
  }

  /** Settings safe to hand to clients, for config-driven UI. */
  async publicSettings(): Promise<Record<string, unknown>> {
    return this.redis.remember('settings:public', SettingsService.TTL_SECONDS, async () => {
      const rows = await this.db.sql<Array<{ key: string; value: unknown }>>`
        select key, value from platform.platform_settings
         where is_public and not is_sensitive
      `;
      return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    });
  }
}
