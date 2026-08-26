import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  createReturnSchema,
  returnDecisionSchema,
  returnInspectionSchema,
  uuidSchema,
} from '@novamart/validation';
import { PERMISSIONS } from '@novamart/permissions';
import { Audit, Permissions, Public } from '../../common/decorators';
import { parse } from '../../common/validation';
import { ReturnsService } from './returns.service';

@Controller({ path: 'returns', version: '1' })
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Public()
  @Get('reasons')
  async reasons() {
    return this.returns.reasons();
  }

  @Get()
  async list() {
    return this.returns.list();
  }

  @Post()
  async create(@Body() body: unknown) {
    return this.returns.create(parse(createReturnSchema, body));
  }

  @Permissions(PERMISSIONS.RETURN_APPROVE)
  @Audit('return.decide', 'return_request')
  @Post(':returnRequestId/decision')
  async decide(@Param('returnRequestId') id: string, @Body() body: unknown) {
    return this.returns.decide(parse(uuidSchema, id), parse(returnDecisionSchema, body));
  }

  @Permissions(PERMISSIONS.RETURN_QC)
  @Post(':returnRequestId/receive')
  async receive(@Param('returnRequestId') id: string) {
    return this.returns.receive(parse(uuidSchema, id));
  }

  @Permissions(PERMISSIONS.RETURN_QC)
  @Audit('return.inspect', 'return_request')
  @Post(':returnRequestId/inspection')
  async inspect(@Param('returnRequestId') id: string, @Body() body: unknown) {
    return this.returns.inspect(parse(uuidSchema, id), parse(returnInspectionSchema, body));
  }
}
