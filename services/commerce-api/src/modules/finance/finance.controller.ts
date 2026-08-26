import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  financialAdjustmentSchema,
  payoutSchema,
  settlementPeriodSchema,
  uuidSchema,
} from '@novamart/validation';
import { PERMISSIONS } from '@novamart/permissions';
import { Audit, Permissions } from '../../common/decorators';
import { parse } from '../../common/validation';
import { FinanceService } from './finance.service';

const ledgerQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) });
const adjustmentDecisionSchema = z.object({
  approved: z.boolean(),
  reason: z.string().trim().min(5).max(500).optional(),
});

@Controller({ path: 'seller-finance', version: '1' })
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Permissions(PERMISSIONS.FINANCE_READ)
  @Get(':sellerId/balance')
  async balance(@Param('sellerId') sellerId: string) {
    return this.finance.balance(parse(uuidSchema, sellerId));
  }

  @Permissions(PERMISSIONS.FINANCE_READ)
  @Get(':sellerId/ledger')
  async ledger(@Param('sellerId') sellerId: string, @Query() query: Record<string, unknown>) {
    return this.finance.ledger(parse(uuidSchema, sellerId), parse(ledgerQuerySchema, query).limit);
  }

  @Permissions(PERMISSIONS.SETTLEMENT_READ)
  @Get(':sellerId/settlements')
  async settlements(@Param('sellerId') sellerId: string) {
    return this.finance.settlements(parse(uuidSchema, sellerId));
  }

  @Permissions(PERMISSIONS.SETTLEMENT_PROCESS)
  @Audit('settlement.generate', 'settlement')
  @Post('settlements')
  async generate(@Body() body: unknown) {
    return this.finance.generateSettlement(parse(settlementPeriodSchema, body));
  }

  @Permissions(PERMISSIONS.SETTLEMENT_PROCESS)
  @Audit('settlement.approve', 'settlement')
  @Post('settlements/:settlementId/approve')
  async approve(@Param('settlementId') settlementId: string) {
    return this.finance.approveSettlement(parse(uuidSchema, settlementId));
  }

  @Permissions(PERMISSIONS.PAYOUT_INITIATE)
  @Audit('payout.create', 'payout')
  @Post('payouts')
  async payout(@Body() body: unknown) {
    return this.finance.createPayout(parse(payoutSchema, body));
  }

  @Permissions(PERMISSIONS.FINANCE_ADJUST)
  @Audit('finance.adjustment_request', 'financial_adjustment')
  @Post('adjustments')
  async adjustment(@Body() body: unknown) {
    return this.finance.requestAdjustment(parse(financialAdjustmentSchema, body));
  }

  @Permissions(PERMISSIONS.FINANCE_APPROVE_ADJUSTMENT)
  @Audit('finance.adjustment_approve', 'financial_adjustment')
  @Post('adjustments/:adjustmentId/decision')
  async adjustmentDecision(@Param('adjustmentId') id: string, @Body() body: unknown) {
    const input = parse(adjustmentDecisionSchema, body);
    return this.finance.approveAdjustment(parse(uuidSchema, id), input.approved, input.reason);
  }
}
