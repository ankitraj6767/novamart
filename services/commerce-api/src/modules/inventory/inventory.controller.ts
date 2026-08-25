import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  inventoryAdjustmentSchema,
  inventoryReceiptSchema,
  offsetPaginationSchema,
  uuidSchema,
} from '@novamart/validation';
import { PERMISSIONS } from '@novamart/permissions';
import { Audit, Permissions, RateLimit, Scope } from '../../common/decorators';
import { parse } from '../../common/validation';
import { InventoryService } from './inventory.service';

const approvalSchema = z
  .object({
    approved: z.boolean(),
    reason: z.string().trim().min(5).max(500).optional(),
  })
  .refine((v) => v.approved || v.reason !== undefined, {
    message: 'A reason is required when rejecting',
    path: ['reason'],
  });

const inventoryQuerySchema = offsetPaginationSchema.extend({
  warehouseId: uuidSchema.optional(),
  lowStockOnly: z.coerce.boolean().optional(),
});

const ledgerQuerySchema = z.object({
  skuId: uuidSchema,
  warehouseId: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

@Controller({ path: 'inventory', version: '1' })
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Permissions(PERMISSIONS.INVENTORY_RECEIVE)
  @Audit('inventory.receive', 'inventory')
  @RateLimit(120, 60)
  @Post('receipts')
  async receive(@Body() body: unknown) {
    return this.inventory.receive(parse(inventoryReceiptSchema, body));
  }

  /**
   * Requests an adjustment. Deliberately does not apply it — see approve below.
   */
  @Permissions(PERMISSIONS.INVENTORY_ADJUST)
  @Audit('inventory.adjust_requested', 'inventory')
  @Post('adjustments')
  async requestAdjustment(@Body() body: unknown) {
    return this.inventory.requestAdjustment(parse(inventoryAdjustmentSchema, body));
  }

  /**
   * Approves or rejects an adjustment.
   *
   * A separate permission from requesting, so the two can be held by different people.
   * The database additionally refuses self-approval.
   */
  @Permissions(PERMISSIONS.INVENTORY_APPROVE_ADJUSTMENT)
  @Audit('inventory.adjust_approved', 'inventory')
  @Post('adjustments/:adjustmentId/approve')
  async approveAdjustment(
    @Param('adjustmentId') adjustmentId: string,
    @Body() body: unknown,
  ) {
    return this.inventory.approveAdjustment(
      parse(uuidSchema, adjustmentId),
      parse(approvalSchema, body),
    );
  }

  @Scope('seller', 'param:sellerId')
  @Permissions(PERMISSIONS.INVENTORY_READ)
  @Get('sellers/:sellerId')
  async list(@Param('sellerId') sellerId: string, @Query() query: Record<string, unknown>) {
    return this.inventory.list(parse(uuidSchema, sellerId), parse(inventoryQuerySchema, query));
  }

  @Scope('seller', 'param:sellerId')
  @Permissions(PERMISSIONS.INVENTORY_READ_LEDGER)
  @Get('sellers/:sellerId/ledger')
  async ledger(@Param('sellerId') sellerId: string, @Query() query: Record<string, unknown>) {
    return this.inventory.ledger(parse(uuidSchema, sellerId), parse(ledgerQuerySchema, query));
  }
}
