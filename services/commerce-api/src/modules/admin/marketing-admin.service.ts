import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type { campaignSchema, notificationTemplateSchema, searchSynonymSchema } from '@novamart/validation';
import { RequestContext } from '../../common/context/request-context';
import { DatabaseService } from '../../infrastructure/database/database.service';

type CampaignInput = z.infer<typeof campaignSchema>;
type TemplateInput = z.infer<typeof notificationTemplateSchema>;
type SynonymInput = z.infer<typeof searchSynonymSchema>;

@Injectable()
export class MarketingAdminService {
  constructor(private readonly db: DatabaseService) {}

  async campaigns(): Promise<Array<Record<string, unknown>>> { return this.db.sql<Array<Record<string, unknown>>>`select id, code, name, campaign_type, starts_at, ends_at, status, landing_slug, budget_paise::text, spent_paise::text, created_at, updated_at from marketing.campaigns order by starts_at desc`; }
  async upsertCampaign(input: CampaignInput): Promise<Record<string, unknown>> {
    const [row] = await this.db.sql<Array<Record<string, unknown>>>`insert into marketing.campaigns (code, name, description, campaign_type, starts_at, ends_at, landing_slug, theme, budget_paise, status, owner_id) values (${input.code}, ${input.name}, ${input.description ?? null}, ${input.campaignType}, ${input.startsAt}, ${input.endsAt}, ${input.landingSlug ?? null}, ${this.db.sql.json(input.theme as never)}, ${input.budgetPaise ?? null}, ${input.status}, ${RequestContext.requirePrincipal().userId}) on conflict (code) do update set name = excluded.name, description = excluded.description, campaign_type = excluded.campaign_type, starts_at = excluded.starts_at, ends_at = excluded.ends_at, landing_slug = excluded.landing_slug, theme = excluded.theme, budget_paise = excluded.budget_paise, status = excluded.status returning id, code, name, campaign_type, starts_at, ends_at, status`;
    return row ?? {};
  }

  async templates(): Promise<Array<Record<string, unknown>>> { return this.db.sql<Array<Record<string, unknown>>>`select id, code, channel, locale, trigger_event, category, subject, title, body, required_params, is_active, priority, updated_at from marketing.notification_templates order by code, channel, locale`; }
  async upsertTemplate(input: TemplateInput): Promise<Record<string, unknown>> {
    if (input.channel === 'EMAIL' && !input.subject) throw new Error('Email templates require a subject');
    if (input.channel === 'SMS' && input.category === 'MARKETING' && !input.dltTemplateId) throw new Error('Marketing SMS templates require a DLT template id');
    const [row] = await this.db.sql<Array<Record<string, unknown>>>`insert into marketing.notification_templates (code, channel, locale, trigger_event, category, subject, title, body, required_params, deep_link_template, dlt_template_id, is_active, respects_preferences, respects_quiet_hours, priority) values (${input.code}, ${input.channel}, ${input.locale}, ${input.triggerEvent}, ${input.category}, ${input.subject ?? null}, ${input.title ?? null}, ${input.body}, ${input.requiredParams}, ${input.deepLinkTemplate ?? null}, ${input.dltTemplateId ?? null}, ${input.isActive}, ${input.respectsPreferences}, ${input.respectsQuietHours}, ${input.priority}) on conflict (code, channel, locale) do update set trigger_event = excluded.trigger_event, category = excluded.category, subject = excluded.subject, title = excluded.title, body = excluded.body, required_params = excluded.required_params, deep_link_template = excluded.deep_link_template, dlt_template_id = excluded.dlt_template_id, is_active = excluded.is_active, respects_preferences = excluded.respects_preferences, respects_quiet_hours = excluded.respects_quiet_hours, priority = excluded.priority returning id, code, channel, locale, trigger_event, is_active, updated_at`;
    return row ?? {};
  }

  async synonyms(): Promise<Array<Record<string, unknown>>> { return this.db.sql<Array<Record<string, unknown>>>`select id, root_term, synonyms, synonym_type, locale, is_active, synced_at, created_at from marketing.search_synonyms order by root_term, locale`; }
  async upsertSynonym(input: SynonymInput): Promise<Record<string, unknown>> {
    const [row] = await this.db.sql<Array<Record<string, unknown>>>`insert into marketing.search_synonyms (root_term, synonyms, synonym_type, locale, created_by) values (${input.rootTerm.toLowerCase()}, ${input.synonyms.map((synonym) => synonym.toLowerCase())}, ${input.oneWay ? 'ONE_WAY' : 'MULTI_WAY'}, ${input.locale}, ${RequestContext.requirePrincipal().userId}) on conflict (root_term, locale) do update set synonyms = excluded.synonyms, synonym_type = excluded.synonym_type, synced_at = null returning id, root_term, synonyms, synonym_type, locale, is_active`;
    return row ?? {};
  }
}
