import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { novaQuerySchema, uuidSchema } from '@novamart/validation';
import { Public, RateLimit } from '../../common/decorators';
import { parse } from '../../common/validation';
import { NovaService } from './nova.service';

const compareSchema = z.object({ productIds: z.array(uuidSchema).min(2).max(4) });

@Controller({ path: 'nova', version: '1' })
export class NovaController {
  constructor(private readonly nova: NovaService) {}

  @Public()
  @RateLimit(30, 60)
  @Post('ask')
  async ask(@Body() body: unknown) { return this.nova.ask(parse(novaQuerySchema, body)); }

  @Public()
  @RateLimit(30, 60)
  @Post('compare')
  async compare(@Body() body: unknown) { return this.nova.compare(parse(compareSchema, body).productIds); }
}
