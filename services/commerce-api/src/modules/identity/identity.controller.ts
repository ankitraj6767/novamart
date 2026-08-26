import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import {
  addressSchema,
  notificationPreferencesSchema,
  registerDeviceSchema,
  updateProfileSchema,
  uuidSchema,
} from '@novamart/validation';
import { parse } from '../../common/validation';
import { z } from 'zod';
import { Audit } from '../../common/decorators';
import { IdentityService } from './identity.service';

/**
 * The signed-in user's own record. No permission decorators: authentication is the
 * authorization, and every query is scoped to the caller's own id.
 */
@Controller({ path: 'users', version: '1' })
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Get('me')
  async me() {
    return this.identity.profile();
  }

  @Patch('me')
  async updateMe(@Body() body: unknown) {
    return this.identity.updateProfile(parse(updateProfileSchema, body));
  }

  @Get('me/addresses')
  async addresses() {
    return this.identity.listAddresses();
  }

  @Post('me/addresses')
  async createAddress(@Body() body: unknown) {
    return this.identity.createAddress(parse(addressSchema, body));
  }

  @Put('me/addresses/:addressId')
  async updateAddress(@Param('addressId') addressId: string, @Body() body: unknown) {
    return this.identity.updateAddress(
      parse(uuidSchema, addressId),
      parse(addressSchema, body),
    );
  }

  @Delete('me/addresses/:addressId')
  async deleteAddress(@Param('addressId') addressId: string) {
    return this.identity.deleteAddress(parse(uuidSchema, addressId));
  }

  @Post('me/devices')
  async registerDevice(@Body() body: unknown) {
    return this.identity.registerDevice(parse(registerDeviceSchema, body));
  }

  @Get('me/preferences')
  async preferences() {
    return this.identity.preferences();
  }

  @Patch('me/preferences')
  async updatePreferences(@Body() body: unknown) {
    return this.identity.updatePreferences(parse(notificationPreferencesSchema, body));
  }

  @Get('me/export')
  async exportData() { return this.identity.exportData(); }

  @Audit('customer.delete_requested', 'profile')
  @Post('me/delete')
  async requestDeletion(@Body() body: unknown) {
    return this.identity.requestDeletion(parse(z.object({ reason: z.string().trim().min(10).max(500) }), body).reason);
  }
}
