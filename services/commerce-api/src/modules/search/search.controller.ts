import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { analyticsEventSchema, searchQuerySchema, suggestQuerySchema } from '@novamart/validation';
import { Public, RateLimit } from '../../common/decorators';
import { parse } from '../../common/validation';
import { SearchService } from './search.service';

@Controller({ path: 'search', version: '1' })
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Public()
  @RateLimit(120, 60)
  @Get()
  async search(@Query() query: Record<string, unknown>) {
    return this.searchService.search(parse(searchQuerySchema, query));
  }

  @Public()
  @RateLimit(240, 60)
  @Get('suggest')
  async suggest(@Query() query: Record<string, unknown>) {
    return this.searchService.suggest(parse(suggestQuerySchema, query));
  }

  @Public()
  @Get('recommendations')
  async recommendations(@Query('productId') productId?: string) {
    return this.searchService.recommendations(productId);
  }

  @Public()
  @Post('events')
  async track(@Body() body: unknown) {
    return this.searchService.track(parse(analyticsEventSchema, body));
  }
}
