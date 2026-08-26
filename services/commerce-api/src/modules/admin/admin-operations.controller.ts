import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { z } from 'zod';
import { offsetPaginationSchema, uuidSchema } from '@novamart/validation';
import { PERMISSIONS } from '@novamart/permissions';
import { Audit, Permissions } from '../../common/decorators';
import { parse } from '../../common/validation';
import { AdminOperationsService } from './admin-operations.service';

const querySchema = offsetPaginationSchema.extend({ status: z.string().max(50).optional(), search: z.string().trim().max(100).optional() });
const limitSchema = z.coerce.number().int().min(1).max(500).default(100);
const customerStatusSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'DELETED']), reason: z.string().trim().min(10).max(500) });

@Controller({ path: 'admin', version: '1' })
export class AdminOperationsController {
  constructor(private readonly admin: AdminOperationsService) {}

  @Permissions(PERMISSIONS.ANALYTICS_READ)
  @Get('dashboard')
  async dashboard() { return this.admin.dashboard(); }

  @Permissions(PERMISSIONS.CUSTOMER_READ)
  @Get('customers')
  async customers(@Query() query: Record<string, unknown>) { return this.admin.customers(parse(querySchema, query)); }

  @Permissions(PERMISSIONS.PRODUCT_READ)
  @Get('catalog')
  async catalog(@Query() query: Record<string, unknown>) { return this.admin.catalog(parse(querySchema, query)); }

  @Permissions(PERMISSIONS.ORDER_READ)
  @Get('orders')
  async orders(@Query() query: Record<string, unknown>) { return this.admin.orders(parse(querySchema, query)); }

  @Permissions(PERMISSIONS.PAYMENT_READ)
  @Get('payments')
  async payments(@Query() query: Record<string, unknown>) { return this.admin.payments(parse(querySchema, query)); }

  @Permissions(PERMISSIONS.REFUND_READ)
  @Get('refunds')
  async refunds(@Query() query: Record<string, unknown>) { return this.admin.refunds(parse(querySchema, query)); }

  @Permissions(PERMISSIONS.RETURN_READ)
  @Get('returns')
  async returns(@Query() query: Record<string, unknown>) { return this.admin.returns(parse(querySchema, query)); }

  @Permissions(PERMISSIONS.SHIPMENT_READ)
  @Get('logistics')
  async logistics(@Query() query: Record<string, unknown>) { return this.admin.logistics(parse(querySchema, query)); }

  @Permissions(PERMISSIONS.REVIEW_MODERATE)
  @Get('reviews/queue')
  async reviews(@Query('limit') limit?: string) { return this.admin.reviewQueue(parse(limitSchema, limit ?? 100)); }

  @Permissions(PERMISSIONS.TICKET_READ)
  @Get('support/queue')
  async support(@Query('limit') limit?: string) { return this.admin.supportQueue(parse(limitSchema, limit ?? 100)); }

  @Permissions(PERMISSIONS.FINANCE_READ_ALL)
  @Get('finance')
  async finance() { return this.admin.finance(); }

  @Permissions(PERMISSIONS.AUDIT_READ)
  @Get('audit')
  async audit(@Query('limit') limit?: string) { return this.admin.audit(parse(limitSchema, limit ?? 100)); }

  @Permissions(PERMISSIONS.CUSTOMER_SUSPEND)
  @Audit('customer.status_change', 'profile')
  @Patch('customers/:customerId/status')
  async customerStatus(@Param('customerId') customerId: string, @Body() body: unknown) { const input = parse(customerStatusSchema, body); return this.admin.updateCustomerStatus(parse(uuidSchema, customerId), input.status, input.reason); }
}
