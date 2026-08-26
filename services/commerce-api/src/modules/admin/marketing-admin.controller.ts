import { Body, Controller, Get, Post } from '@nestjs/common';
import { campaignSchema, notificationTemplateSchema, searchSynonymSchema } from '@novamart/validation';
import { PERMISSIONS } from '@novamart/permissions';
import { Audit, Permissions } from '../../common/decorators';
import { parse } from '../../common/validation';
import { MarketingAdminService } from './marketing-admin.service';

@Controller({ path: 'admin/marketing', version: '1' })
export class MarketingAdminController {
  constructor(private readonly marketing: MarketingAdminService) {}

  @Permissions(PERMISSIONS.PROMOTION_MANAGE)
  @Get('campaigns')
  async campaigns() { return this.marketing.campaigns(); }

  @Permissions(PERMISSIONS.PROMOTION_MANAGE)
  @Audit('marketing.campaign_upsert', 'campaign')
  @Post('campaigns')
  async campaign(@Body() body: unknown) { return this.marketing.upsertCampaign(parse(campaignSchema, body)); }

  @Permissions(PERMISSIONS.NOTIFICATION_MANAGE)
  @Get('notification-templates')
  async templates() { return this.marketing.templates(); }

  @Permissions(PERMISSIONS.NOTIFICATION_MANAGE)
  @Audit('marketing.notification_template_upsert', 'notification_template')
  @Post('notification-templates')
  async template(@Body() body: unknown) { return this.marketing.upsertTemplate(parse(notificationTemplateSchema, body)); }

  @Permissions(PERMISSIONS.SEARCH_MANAGE)
  @Get('synonyms')
  async synonyms() { return this.marketing.synonyms(); }

  @Permissions(PERMISSIONS.SEARCH_MANAGE)
  @Audit('marketing.search_synonym_upsert', 'search_synonym')
  @Post('synonyms')
  async synonym(@Body() body: unknown) { return this.marketing.upsertSynonym(parse(searchSynonymSchema, body)); }
}
