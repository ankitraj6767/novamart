import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type {
  featureFlagSchema,
  homeSectionSchema,
  platformSettingSchema,
} from '@novamart/validation';
import { AppError } from '../../common/errors/app-error';
import { RequestContext } from '../../common/context/request-context';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { RedisService } from '../../infrastructure/redis/redis.service';

type SettingInput = z.infer<typeof platformSettingSchema>;
type FlagInput = z.infer<typeof featureFlagSchema>;
type SectionInput = z.infer<typeof homeSectionSchema>;

@Injectable()
export class PlatformAdminService {
  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  async settings(): Promise<Array<Record<string, unknown>>> {
    return this.db.sql<Array<Record<string, unknown>>>`
      select key, value, value_type, category, label, description, is_public,
             is_sensitive, validation_schema, default_value, updated_by, updated_at
        from platform.platform_settings order by category, key
    `;
  }

  async upsertSetting(key: string, input: SettingInput): Promise<Record<string, unknown>> {
    if (input.isSensitive && !RequestContext.requirePrincipal().mfaVerified)
      throw new AppError('AUTH_MFA_REQUIRED');
    const [row] = await this.db.sql<Array<Record<string, unknown>>>`
      insert into platform.platform_settings (
        key, value, value_type, category, label, description, is_public,
        is_sensitive, validation_schema, default_value, updated_by
      ) values (
        ${key}, ${this.coerceValue(input.value, input.valueType)}, ${input.valueType},
        ${input.category}, ${input.label}, ${input.description}, ${input.isPublic},
        ${input.isSensitive}, ${input.validationSchema ? this.db.sql.json(input.validationSchema as never) : null},
        ${this.coerceValue(input.value, input.valueType)}, ${RequestContext.requirePrincipal().userId}
      ) on conflict (key) do update set
        value = excluded.value, value_type = excluded.value_type, category = excluded.category,
        label = excluded.label, description = excluded.description, is_public = excluded.is_public,
        is_sensitive = excluded.is_sensitive, validation_schema = excluded.validation_schema,
        updated_by = excluded.updated_by, updated_at = now()
      returning key, value, value_type, category, is_public, is_sensitive, updated_at
    `;
    await this.redis.invalidatePrefix('settings:');
    return row ?? {};
  }

  async flags(): Promise<Array<Record<string, unknown>>> {
    return this.db.sql<Array<Record<string, unknown>>>`
      select key, name, description, is_enabled, default_value, rollout_percentage,
             owner_team, expected_removal_at, updated_by, updated_at
        from platform.feature_flags order by key
    `;
  }

  async upsertFlag(key: string, input: FlagInput): Promise<Record<string, unknown>> {
    const [row] = await this.db.sql<Array<Record<string, unknown>>>`
      insert into platform.feature_flags (
        key, name, description, is_enabled, default_value, rollout_percentage,
        owner_team, expected_removal_at, updated_by
      ) values (${key}, ${input.name}, ${input.description}, ${input.isEnabled}, ${input.defaultValue},
                ${input.rolloutPercentage}, ${input.ownerTeam ?? null}, ${input.expectedRemovalAt ?? null},
                ${RequestContext.requirePrincipal().userId})
      on conflict (key) do update set name = excluded.name, description = excluded.description,
        is_enabled = excluded.is_enabled, default_value = excluded.default_value,
        rollout_percentage = excluded.rollout_percentage, owner_team = excluded.owner_team,
        expected_removal_at = excluded.expected_removal_at, updated_by = excluded.updated_by, updated_at = now()
      returning key, name, is_enabled, default_value, rollout_percentage, updated_at
    `;
    await this.redis.invalidatePrefix('flag:');
    return row ?? {};
  }

  async sections(): Promise<Array<Record<string, unknown>>> {
    return this.db.sql<Array<Record<string, unknown>>>`
      select id, code, section_type, title, title_hi, subtitle, configuration, position,
             surfaces, audience_segments, audience_states, campaign_id, starts_at, ends_at, status, updated_at
        from marketing.home_sections order by position, code
    `;
  }

  async upsertSection(input: SectionInput): Promise<Record<string, unknown>> {
    const principal = RequestContext.requirePrincipal();
    const [row] = await this.db.sql<Array<Record<string, unknown>>>`
      insert into marketing.home_sections (
        code, section_type, title, title_hi, subtitle, configuration, position,
        surfaces, audience_segments, audience_states, campaign_id, starts_at, ends_at, status, created_by
      ) values (${input.code}, ${input.sectionType}, ${input.title ?? null}, ${input.titleHi ?? null}, ${input.subtitle ?? null},
                ${this.db.sql.json(input.configuration as never)}, ${input.position}, ${input.surfaces},
                ${input.audienceSegments}, ${input.audienceStates}, ${input.campaignId ?? null},
                ${input.startsAt ?? null}, ${input.endsAt ?? null}, ${input.status}, ${principal.userId})
      on conflict (code) do update set section_type = excluded.section_type, title = excluded.title,
        title_hi = excluded.title_hi, subtitle = excluded.subtitle, configuration = excluded.configuration,
        position = excluded.position, surfaces = excluded.surfaces, audience_segments = excluded.audience_segments,
        audience_states = excluded.audience_states, campaign_id = excluded.campaign_id,
        starts_at = excluded.starts_at, ends_at = excluded.ends_at, status = excluded.status
      returning id, code, section_type, title, position, surfaces, status, updated_at
    `;
    return row ?? {};
  }

  private coerceValue(value: unknown, type: SettingInput['valueType']): unknown {
    if (type === 'string' && typeof value !== 'string')
      throw AppError.validation([{ field: 'value', issue: 'Expected a string value' }]);
    if (type === 'number' && (typeof value !== 'number' || !Number.isFinite(value)))
      throw AppError.validation([{ field: 'value', issue: 'Expected a finite number value' }]);
    if (type === 'boolean' && typeof value !== 'boolean')
      throw AppError.validation([{ field: 'value', issue: 'Expected a boolean value' }]);
    if ((type === 'object' || type === 'array') && (typeof value !== 'object' || value === null))
      throw AppError.validation([{ field: 'value', issue: `Expected an ${type} value` }]);
    if (type === 'array' && !Array.isArray(value))
      throw AppError.validation([{ field: 'value', issue: 'Expected an array value' }]);
    return value;
  }
}
