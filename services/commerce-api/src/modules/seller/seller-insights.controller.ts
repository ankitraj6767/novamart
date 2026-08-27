import { Controller, Get, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { uuidSchema } from '@novamart/validation';
import { Scope } from '../../common/decorators';
import { parse } from '../../common/validation';
import { SellerInsightsService } from './seller-insights.service';

const daysSchema = z.coerce.number().int().min(1).max(365).default(30);

@Controller({ path: 'sellers', version: '1' })
export class SellerInsightsController {
  constructor(private readonly insights: SellerInsightsService) {}

  @Scope('seller', 'param:sellerId')
  @Get(':sellerId/performance')
  async performance(@Param('sellerId') sellerId: string) {
    return this.insights.performance(parse(uuidSchema, sellerId));
  }

  @Scope('seller', 'param:sellerId')
  @Get(':sellerId/returns')
  async returns(@Param('sellerId') sellerId: string) {
    return this.insights.returns(parse(uuidSchema, sellerId));
  }

  @Scope('seller', 'param:sellerId')
  @Get(':sellerId/promotions')
  async promotions(@Param('sellerId') sellerId: string) {
    return this.insights.promotions(parse(uuidSchema, sellerId));
  }

  @Scope('seller', 'param:sellerId')
  @Get(':sellerId/users')
  async users(@Param('sellerId') sellerId: string) {
    return this.insights.users(parse(uuidSchema, sellerId));
  }

  @Scope('seller', 'param:sellerId')
  @Get(':sellerId/reports/sales')
  async sales(@Param('sellerId') sellerId: string, @Query('days') days?: string) {
    return this.insights.salesReport(parse(uuidSchema, sellerId), parse(daysSchema, days ?? 30));
  }

  @Scope('seller', 'param:sellerId')
  @Get(':sellerId/warehouses')
  async warehouses(@Param('sellerId') sellerId: string) {
    return this.insights.warehouses(parse(uuidSchema, sellerId));
  }
}
