import { EVENT_TYPES, type EventType } from '@novamart/events';
import { formatPaise } from '@novamart/domain';
import type { Consumer, OutboxEvent } from '../outbox/consumer';
import type { Tx, WorkerContext } from '../runtime/context';

interface TemplateRow {
  id: string;
  code: string;
  channel: string;
  locale: string;
  category: string;
  subject: string | null;
  title: string | null;
  body: string;
  required_params: string[];
  deep_link_template: string | null;
  image_url: string | null;
  dlt_template_id: string | null;
  respects_preferences: boolean;
  respects_quiet_hours: boolean;
  priority: string;
  max_per_user_per_day: number | null;
}

/**
 * Turns domain events into queued notifications.
 *
 * This consumer only ENQUEUES: it renders the template and writes a
 * marketing.notifications row with status QUEUED. A separate sender job hands rows to
 * providers. The split matters because sending is the unreliable part — if SMS delivery
 * were attempted inline, an MSG91 outage would fail the outbox event and stall every
 * other consumer behind it, including the ones that post money.
 *
 * Templates are data (marketing.notification_templates), not code, so operations can
 * reword an order confirmation without a deploy (brief §47, §92).
 */
export class NotificationConsumer implements Consumer {
  readonly name = 'notification-enqueuer';

  readonly eventTypes: readonly EventType[] = [
    EVENT_TYPES.ORDER_CONFIRMED,
    EVENT_TYPES.ORDER_CANCELLED,
    EVENT_TYPES.PAYMENT_SUCCESS,
    EVENT_TYPES.PAYMENT_FAILED,
    EVENT_TYPES.ORDER_SHIPPED,
    EVENT_TYPES.OUT_FOR_DELIVERY,
    EVENT_TYPES.ORDER_DELIVERED,
    EVENT_TYPES.RETURN_APPROVED,
    EVENT_TYPES.REFUND_SUCCESS,
    EVENT_TYPES.SELLER_APPROVED,
    EVENT_TYPES.SETTLEMENT_CREATED,
  ];

  async handle(event: OutboxEvent, tx: Tx, ctx: WorkerContext): Promise<void> {
    const directUserId = this.uuid(event.payload['userId']);
    const sellerId = this.uuid(event.payload['sellerId']);
    const recipientIds = directUserId
      ? [directUserId]
      : sellerId
        ? (
            await tx<Array<{ user_id: string }>>`
            select user_id from seller.seller_users
             where seller_id = ${sellerId} and status = 'ACTIVE'
               and role_code in ('SELLER_OWNER', 'SELLER_ADMIN', 'SELLER_FINANCE_MANAGER')
          `
          ).map((row) => row.user_id)
        : [];
    if (recipientIds.length === 0) {
      ctx.logger.debug(
        { eventId: event.id, eventType: event.event_type },
        'No notification recipients for event',
      );
      return;
    }

    const templates = await tx<TemplateRow[]>`
      select id, code, channel, locale, category, subject, title, body, required_params,
             deep_link_template, image_url, dlt_template_id, respects_preferences,
             respects_quiet_hours, priority, max_per_user_per_day
        from marketing.notification_templates
       where trigger_event = ${event.event_type}
         and is_active
    `;

    if (templates.length === 0) {
      ctx.logger.debug(
        { eventType: event.event_type },
        'No active template for event; nothing to enqueue',
      );
      return;
    }

    const params = this.buildParams(event);

    for (const userId of recipientIds) {
      const preferences = await this.loadPreferences(tx, userId);
      for (const template of templates) {
        // Match the customer's language where a translation exists, else fall back.
        if (template.locale !== preferences.locale && template.locale !== 'en-IN') continue;

        const suppression = this.suppressionReason(template, preferences);

        // A template whose parameters are missing would render as "Your order  is
        // confirmed". Better to record it suppressed and have it show up as a bug.
        const missing = template.required_params.filter((key) => params[key] === undefined);
        const reason = suppression ?? (missing.length > 0 ? 'MISSING_PARAMS' : null);

        await tx`
          insert into marketing.notifications (
            user_id, template_id, template_code, channel, locale, subject, title, body,
            deep_link, image_url, params, related_type, related_id, category, status,
            suppression_reason, idempotency_key
          ) values (
            ${userId}, ${template.id}, ${template.code}, ${template.channel},
            ${template.locale},
            ${template.subject ? this.render(template.subject, params) : null},
            ${template.title ? this.render(template.title, params) : null},
            ${this.render(template.body, params)},
            ${template.deep_link_template ? this.render(template.deep_link_template, params) : null},
            ${template.image_url},
            ${tx.json(params as never)},
            ${event.aggregate_type}, ${event.aggregate_id}, ${template.category},
            ${reason ? 'SUPPRESSED' : 'QUEUED'},
            ${reason},
            ${`${event.id}:${userId}:${template.code}:${template.channel}`}
          )
          on conflict (idempotency_key) where (idempotency_key is not null) do nothing
        `;
      }
    }
  }

  private async loadPreferences(
    tx: Tx,
    userId: string,
  ): Promise<{
    locale: string;
    pushMarketing: boolean;
    emailMarketing: boolean;
    smsMarketing: boolean;
    whatsappMarketing: boolean;
  }> {
    const [row] = await tx<
      Array<{
        preferred_language: string;
        push_marketing: boolean;
        email_marketing: boolean;
        sms_marketing: boolean;
        whatsapp_marketing: boolean;
      }>
    >`
      select preferred_language, push_marketing, email_marketing, sms_marketing,
             whatsapp_marketing
        from identity.user_preferences where user_id = ${userId}
    `;

    return {
      locale: row?.preferred_language ?? 'en-IN',
      pushMarketing: row?.push_marketing ?? true,
      emailMarketing: row?.email_marketing ?? true,
      smsMarketing: row?.sms_marketing ?? true,
      whatsappMarketing: row?.whatsapp_marketing ?? false,
    };
  }

  /**
   * Marketing opt-outs are honoured; transactional messages are not suppressible.
   *
   * A customer who unsubscribed from marketing must still be told their order shipped —
   * that is a service message, and withholding it would be worse than spam.
   */
  private suppressionReason(
    template: TemplateRow,
    preferences: {
      pushMarketing: boolean;
      emailMarketing: boolean;
      smsMarketing: boolean;
      whatsappMarketing: boolean;
    },
  ): string | null {
    if (!template.respects_preferences) return null;

    const optedIn =
      template.channel === 'PUSH'
        ? preferences.pushMarketing
        : template.channel === 'EMAIL'
          ? preferences.emailMarketing
          : template.channel === 'SMS'
            ? preferences.smsMarketing
            : template.channel === 'WHATSAPP'
              ? preferences.whatsappMarketing
              : true;

    return optedIn ? null : 'USER_OPTED_OUT';
  }

  /** Flattens the payload into template parameters, formatting money for display. */
  private buildParams(event: OutboxEvent): Record<string, string> {
    const params: Record<string, string> = {};

    for (const [key, value] of Object.entries(event.payload)) {
      if (value === null || value === undefined) continue;
      if (Array.isArray(value)) {
        params[key] = String(value.length);
        continue;
      }
      if (typeof value === 'object') continue;

      params[key] = String(value);

      // Money arrives as integer paise; a template must never interpolate "1829980".
      if (key.endsWith('Paise') && typeof value === 'number') {
        params[key.replace(/Paise$/, '')] = formatPaise(value);
      }
    }

    return params;
  }

  /**
   * Renders {{placeholder}} against the parameters.
   *
   * Substitution only — no expressions, no property traversal. A template is
   * operations-editable content, so it must not be able to reach into the process.
   */
  private render(template: string, params: Record<string, string>): string {
    return template.replace(
      /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
      (_match, key: string) => params[key] ?? '',
    );
  }

  private uuid(value: unknown): string | null {
    return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
  }
}
