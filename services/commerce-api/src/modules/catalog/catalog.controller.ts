import { Controller, Get, Param, Query } from '@nestjs/common';
import { productListQuerySchema } from '@novamart/validation';
import { Public, RateLimit } from '../../common/decorators';
import { enveloped } from '../../common/interceptors/envelope.interceptor';
import { parse } from '../../common/validation';
import { RequestContext } from '../../common/context/request-context';
import { CatalogService } from './catalog.service';

@Controller({ path: 'catalog', version: '1' })
export class CatalogController {
  constructor(private readonly catalog: CatalogService) { }

  @Public()
  @Get('categories')
  async categories() {
    return this.catalog.categoryTree();
  }

  /**
   * Category by SEO path. The wildcard lets /catalog/categories/electronics/phones
   * resolve without encoding slashes.
   */
  @Public()
  @Get('categories/*')
  async category(@Param('*') path: string) {
    return this.catalog.categoryBySlugPath(path);
  }

  @Public()
  @RateLimit(120, 60)
  @Get('products')
  async products(@Query() query: Record<string, unknown>) {
    const parsed = parse(productListQuerySchema, query);
    const result = await this.catalog.listProducts(parsed);
    return enveloped(result.items, {
      cursor: { next: result.nextCursor, hasMore: result.nextCursor !== null },
    });
  }

  /**
   * `variantId` selects which variant the page is about. The Buy Box and competing
   * offers are always scoped to that one SKU.
   */
  @Public()
  @Get('products/:slug')
  async product(
    @Param('slug') slug: string,
    @Query('variantId') variantId?: string,
    @Query('pincode') pincode?: string,
  ) {
    return this.catalog.productDetail(slug, { variantId, pincode });
  }

  @Public()
  @Get('home')
  async home() {
    const platform = RequestContext.get()?.platform ?? 'web';
    return this.catalog.homeSections(platform);
  }

  @Public()
  @Get('serviceability/:pincode')
  async serviceability(@Param('pincode') pincode: string) {
    return this.catalog.serviceability(pincode);
  }
}
