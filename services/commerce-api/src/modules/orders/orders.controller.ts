import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { cancelOrderSchema, orderListQuerySchema, uuidSchema } from '@novamart/validation';
import { enveloped } from '../../common/interceptors/envelope.interceptor';
import { parse } from '../../common/validation';
import { OrdersService } from './orders.service';

@Controller({ path: 'orders', version: '1' })
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  async list(@Query() query: Record<string, unknown>) {
    const parsed = parse(orderListQuerySchema, query);
    const result = await this.orders.list(parsed);
    return enveloped(result.items, {
      cursor: { next: result.nextCursor, hasMore: result.nextCursor !== null },
    });
  }

  @Get(':orderId')
  async detail(@Param('orderId') orderId: string) {
    return this.orders.detail(parse(uuidSchema, orderId));
  }

  @Post(':orderId/cancel')
  async cancel(@Param('orderId') orderId: string, @Body() body: unknown) {
    return this.orders.cancel(parse(uuidSchema, orderId), parse(cancelOrderSchema, body));
  }
}
