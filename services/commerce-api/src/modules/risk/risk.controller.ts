import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { riskEventSchema, uuidSchema } from '@novamart/validation';
import { PERMISSIONS } from '@novamart/permissions';
import { Audit, Permissions } from '../../common/decorators';
import { parse } from '../../common/validation';
import { RiskService } from './risk.service';

const caseSchema = z.object({
  category: z.string().trim().min(2).max(80),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  subjectType: z.string().trim().min(2).max(50),
  subjectId: uuidSchema.optional(),
  summary: z.string().trim().min(10).max(2000),
  estimatedLossPaise: z.number().int().nonnegative().optional(),
});
const resolveSchema = z.object({
  outcome: z.string().trim().min(2).max(100),
  reason: z.string().trim().min(10).max(2000),
});

@Controller({ path: 'risk', version: '1' })
export class RiskController {
  constructor(private readonly risk: RiskService) {}

  @Permissions(PERMISSIONS.RISK_READ)
  @Get('rules')
  async rules() {
    return this.risk.rules();
  }

  @Permissions(PERMISSIONS.RISK_READ)
  @Get('events')
  async events(@Query('subjectId') subjectId?: string) {
    return this.risk.events(subjectId);
  }

  @Permissions(PERMISSIONS.RISK_MANAGE)
  @Audit('risk.event_record', 'risk_event')
  @Post('events')
  async record(@Body() body: unknown) {
    return this.risk.record(parse(riskEventSchema, body));
  }

  @Permissions(PERMISSIONS.RISK_READ)
  @Get('scores')
  async scores() {
    return this.risk.scores();
  }

  @Permissions(PERMISSIONS.FRAUD_CASE_MANAGE)
  @Get('cases')
  async cases() {
    return this.risk.cases();
  }

  @Permissions(PERMISSIONS.FRAUD_CASE_MANAGE)
  @Audit('fraud_case.open', 'fraud_case')
  @Post('cases')
  async openCase(@Body() body: unknown) {
    return this.risk.openCase(parse(caseSchema, body));
  }

  @Permissions(PERMISSIONS.FRAUD_CASE_MANAGE)
  @Audit('fraud_case.resolve', 'fraud_case')
  @Post('cases/:caseId/resolve')
  async resolve(@Param('caseId') id: string, @Body() body: unknown) {
    const input = parse(resolveSchema, body);
    return this.risk.resolveCase(parse(uuidSchema, id), input.outcome, input.reason);
  }
}
