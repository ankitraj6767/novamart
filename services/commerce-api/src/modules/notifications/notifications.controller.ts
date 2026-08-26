import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { uuidSchema } from '@novamart/validation';
import { parse } from '../../common/validation';
import { NotificationsService } from './notifications.service';

const limitSchema = z.coerce.number().int().min(1).max(100).default(50);

@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async list(@Query('limit') limit?: string) {
    return this.notifications.list(parse(limitSchema, limit ?? 50));
  }

  @Post(':notificationId/read')
  async read(@Param('notificationId') id: string) {
    return this.notifications.markRead(parse(uuidSchema, id));
  }
}
