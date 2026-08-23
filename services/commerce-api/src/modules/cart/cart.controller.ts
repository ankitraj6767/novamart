import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import {
  addToCartSchema,
  applyCouponSchema,
  setCartPincodeSchema,
  updateCartItemSchema,
  uuidSchema,
} from '@novamart/validation';
import { RateLimit } from '../../common/decorators';
import { parse } from '../../common/validation';
import { CartService } from './cart.service';

/**
 * Every mutation returns the whole cart. One round trip keeps the client's view
 * authoritative and avoids a stale local total after a price change.
 */
@Controller({ path: 'cart', version: '1' })
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  async get() {
    return this.cart.getCart();
  }

  @RateLimit(60, 60)
  @Post('items')
  async addItem(@Body() body: unknown) {
    return this.cart.addItem(parse(addToCartSchema, body));
  }

  @Patch('items/:cartItemId')
  async updateItem(@Param('cartItemId') cartItemId: string, @Body() body: unknown) {
    const { quantity } = parse(updateCartItemSchema, body);
    return this.cart.updateItem(parse(uuidSchema, cartItemId), quantity);
  }

  @Delete('items/:cartItemId')
  async removeItem(@Param('cartItemId') cartItemId: string) {
    return this.cart.removeItem(parse(uuidSchema, cartItemId));
  }

  @Post('items/:cartItemId/save-for-later')
  async saveForLater(@Param('cartItemId') cartItemId: string) {
    return this.cart.saveForLater(parse(uuidSchema, cartItemId));
  }

  @Post('saved/:savedItemId/move-to-cart')
  async moveToCart(@Param('savedItemId') savedItemId: string) {
    return this.cart.moveToCart(parse(uuidSchema, savedItemId));
  }

  @RateLimit(20, 60)
  @Post('coupon')
  async applyCoupon(@Body() body: unknown) {
    const { code } = parse(applyCouponSchema, body);
    return this.cart.applyCoupon(code);
  }

  @Delete('coupon')
  async removeCoupon() {
    return this.cart.removeCoupon();
  }

  @Post('pincode')
  async setPincode(@Body() body: unknown) {
    const { pincode } = parse(setCartPincodeSchema, body);
    return this.cart.setPincode(pincode);
  }
}
