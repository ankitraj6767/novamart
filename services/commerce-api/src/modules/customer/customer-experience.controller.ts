import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { uuidSchema } from '@novamart/validation';
import { Public } from '../../common/decorators';
import { parse } from '../../common/validation';
import { CustomerExperienceService } from './customer-experience.service';

const wishlistItemSchema = z.object({
  productId: uuidSchema,
  variantId: uuidSchema.optional(),
  listingId: uuidSchema.optional(),
  note: z.string().trim().max(500).optional(),
});
const shareTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{20,100}$/);

@Controller({ path: 'customer', version: '1' })
export class CustomerExperienceController {
  constructor(private readonly customer: CustomerExperienceService) {}

  @Get('wishlist')
  async wishlist() {
    return this.customer.wishlist();
  }

  @Post('wishlist/items')
  async add(@Body() body: unknown) {
    return this.customer.addWishlist(parse(wishlistItemSchema, body));
  }

  @Delete('wishlist/items/:itemId')
  async remove(@Param('itemId') itemId: string) {
    return this.customer.removeWishlist(parse(uuidSchema, itemId));
  }

  @Post('wishlist/share')
  async share() {
    return this.customer.shareWishlist();
  }

  @Public()
  @Get('wishlist/shared/:token')
  async shared(@Param('token') token: string) {
    return this.customer.publicWishlist(parse(shareTokenSchema, token));
  }

  @Get('recently-viewed')
  async recent() {
    return this.customer.recent();
  }
}
