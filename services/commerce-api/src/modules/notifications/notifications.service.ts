import { Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import { RequestContext } from '../../common/context/request-context';
import { DatabaseService } from '../../infrastructure/database/database.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly db: DatabaseService) {}

  async list(limit: number): Promise<Array<Record<string, unknown>>> {
    const userId = RequestContext.requirePrincipal().userId;
    return this.db.sql<Array<Record<string, unknown>>>`
      select id, template_code, channel, locale, subject, title, body, deep_link,
             image_url, related_type, related_id, category, status, sent_at,
             delivered_at, read_at, created_at
        from marketing.notifications
       where user_id = ${userId}
       order by created_at desc limit ${limit}
    `;
  }

  async markRead(notificationId: string): Promise<{ read: true }> {
    const userId = RequestContext.requirePrincipal().userId;
    const result = await this.db.sql`
      update marketing.notifications set status = case when status = 'SENT' then 'READ' else status end,
             read_at = coalesce(read_at, now())
       where id = ${notificationId} and user_id = ${userId}
    `;
    if (result.count === 0) throw AppError.notFound('Notification');
    return { read: true };
  }
}
