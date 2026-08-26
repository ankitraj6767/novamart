import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { appVersionPolicySchema, featureFlagSchema, homeSectionSchema, platformSettingSchema } from '@novamart/validation';
import { PERMISSIONS } from '@novamart/permissions';
import { Audit, Permissions, Public } from '../../common/decorators';
import { parse } from '../../common/validation';
import { PlatformAdminService } from './platform-admin.service';
import { SettingsService } from '../platform/settings.service';

@Controller({ path: 'admin/platform', version: '1' })
export class PlatformAdminController {
  constructor(
    private readonly admin: PlatformAdminService,
    private readonly settings: SettingsService,
  ) {}

  @Permissions(PERMISSIONS.SETTING_READ)
  @Get('settings')
  async settingsList() {
    return this.admin.settings();
  }

  @Permissions(PERMISSIONS.SETTING_MANAGE)
  @Audit('platform.setting_upsert', 'platform_setting')
  @Post('settings/:key')
  async setting(@Param('key') key: string, @Body() body: unknown) {
    return this.admin.upsertSetting(key, parse(platformSettingSchema, body));
  }

  @Permissions(PERMISSIONS.FEATURE_FLAG_MANAGE)
  @Get('feature-flags')
  async flags() {
    return this.admin.flags();
  }

  @Permissions(PERMISSIONS.FEATURE_FLAG_MANAGE)
  @Audit('platform.feature_flag_upsert', 'feature_flag')
  @Post('feature-flags/:key')
  async flag(@Param('key') key: string, @Body() body: unknown) {
    return this.admin.upsertFlag(key, parse(featureFlagSchema, body));
  }

  @Permissions(PERMISSIONS.CMS_MANAGE)
  @Get('home-sections')
  async sections() {
    return this.admin.sections();
  }

  @Permissions(PERMISSIONS.CMS_MANAGE)
  @Audit('cms.home_section_upsert', 'home_section')
  @Post('home-sections')
  async section(@Body() body: unknown) {
    return this.admin.upsertSection(parse(homeSectionSchema, body));
  }

  @Permissions(PERMISSIONS.SETTING_READ)
  @Get('app-version-policies')
  async versions() { return this.admin.versionPolicies(); }

  @Permissions(PERMISSIONS.SETTING_MANAGE)
  @Audit('platform.app_version_upsert', 'app_version_policy')
  @Post('app-version-policies')
  async version(@Body() body: unknown) { return this.admin.upsertVersionPolicy(parse(appVersionPolicySchema, body)); }

  @Permissions(PERMISSIONS.INTEGRATION_MANAGE)
  @Get('integrations')
  async integrations() { return this.admin.integrations(); }

  @Public()
  @Get('public-settings')
  async publicSettings() {
    return this.settings.publicSettings();
  }
}
