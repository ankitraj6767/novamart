import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { adminBrandSchema, adminCategorySchema, adminProductSchema, moderationDecisionSchema, uuidSchema } from '@novamart/validation';
import { PERMISSIONS } from '@novamart/permissions';
import { Audit, Permissions } from '../../common/decorators';
import { parse } from '../../common/validation';
import { CatalogAdminService } from './catalog-admin.service';

@Controller({ path: 'admin/catalog', version: '1' })
export class CatalogAdminController {
  constructor(private readonly catalog: CatalogAdminService) {}

  @Permissions(PERMISSIONS.CATEGORY_MANAGE)
  @Get('categories')
  async categories() { return this.catalog.categories(); }

  @Permissions(PERMISSIONS.CATEGORY_MANAGE)
  @Audit('catalog.category_upsert', 'category')
  @Post('categories')
  async category(@Body() body: unknown) { return this.catalog.upsertCategory(parse(adminCategorySchema, body)); }

  @Permissions(PERMISSIONS.BRAND_MANAGE)
  @Get('brands')
  async brands() { return this.catalog.brands(); }

  @Permissions(PERMISSIONS.BRAND_MANAGE)
  @Audit('catalog.brand_upsert', 'brand')
  @Post('brands')
  async brand(@Body() body: unknown) { return this.catalog.upsertBrand(parse(adminBrandSchema, body)); }

  @Permissions(PERMISSIONS.PRODUCT_CREATE)
  @Audit('catalog.product_create', 'product')
  @Post('products')
  async product(@Body() body: unknown) { return this.catalog.createProduct(parse(adminProductSchema, body)); }

  @Permissions(PERMISSIONS.PRODUCT_APPROVE)
  @Audit('catalog.product_moderate', 'product')
  @Post('products/:productId/moderate')
  async productModerate(@Param('productId') id: string, @Body() body: unknown) { return this.catalog.moderateProduct(parse(uuidSchema, id), parse(moderationDecisionSchema, body)); }

  @Permissions(PERMISSIONS.LISTING_MANAGE)
  @Audit('catalog.listing_moderate', 'listing')
  @Post('listings/:listingId/moderate')
  async listingModerate(@Param('listingId') id: string, @Body() body: unknown) { return this.catalog.moderateListing(parse(uuidSchema, id), parse(moderationDecisionSchema, body)); }
}
