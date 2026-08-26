import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../../common/decorators';
import { parse } from '../../common/validation';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { SettingsService } from './settings.service';

const versionQuery = z.object({ app: z.enum(['customer', 'seller', 'delivery', 'warehouse']), platform: z.enum(['android', 'ios']), version: z.string().regex(/^\d+(?:\.\d+){0,3}$/) });

@Controller({ path: 'platform', version: '1' })
export class PlatformController {
  constructor(private readonly db: DatabaseService, private readonly settings: SettingsService) {}

  @Public()
  @Get('public-settings')
  async publicSettings() { return this.settings.publicSettings(); }

  @Public()
  @Get('app-version')
  async appVersion(@Query() query: Record<string, unknown>) {
    const input = parse(versionQuery, query);
    const [policy] = await this.db.sql<Array<Record<string, unknown>>>`
      select app, platform, minimum_version, latest_version, force_update_message,
             soft_update_message, store_url, maintenance_mode, maintenance_message,
             maintenance_until
        from platform.app_version_policies where app = ${input.app} and platform = ${input.platform}
    `;
    if (!policy) return { forceUpdate: false, softUpdate: false, maintenanceMode: false, policy: null };
    const compare = (left: string, right: string) => left.split('.').map(Number).reduce((result, value, index) => result || value - Number(right.split('.')[index] ?? 0), 0);
    return {
      forceUpdate: compare(input.version, String(policy['minimum_version'])) < 0,
      softUpdate: compare(input.version, String(policy['latest_version'])) < 0,
      maintenanceMode: Boolean(policy['maintenance_mode']),
      policy,
    };
  }
}
