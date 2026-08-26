import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  supportMessageSchema,
  supportTicketSchema,
  supportTicketUpdateSchema,
  uuidSchema,
} from '@novamart/validation';
import { PERMISSIONS } from '@novamart/permissions';
import { Audit, Permissions, Public } from '../../common/decorators';
import { parse } from '../../common/validation';
import { RequestContext } from '../../common/context/request-context';
import { SupportService } from './support.service';

@Controller({ path: 'support', version: '1' })
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Public()
  @Get('categories')
  async categories() {
    return this.support.categories();
  }

  @Public()
  @Get('help')
  async help(@Query('audience') audience?: string) {
    return this.support.help(audience ?? 'CUSTOMER', RequestContext.get()?.locale ?? 'en-IN');
  }

  @Get('tickets')
  async list() {
    return this.support.list();
  }

  @Get('tickets/:ticketId')
  async detail(@Param('ticketId') ticketId: string) {
    return this.support.detail(parse(uuidSchema, ticketId));
  }

  @Post('tickets')
  async create(@Body() body: unknown) {
    return this.support.create(parse(supportTicketSchema, body));
  }

  @Post('tickets/:ticketId/messages')
  async message(@Param('ticketId') ticketId: string, @Body() body: unknown) {
    return this.support.message(parse(uuidSchema, ticketId), parse(supportMessageSchema, body));
  }

  @Permissions(PERMISSIONS.TICKET_RESPOND)
  @Audit('support.ticket_update', 'support_ticket')
  @Patch('tickets/:ticketId')
  async update(@Param('ticketId') ticketId: string, @Body() body: unknown) {
    return this.support.update(parse(uuidSchema, ticketId), parse(supportTicketUpdateSchema, body));
  }
}
