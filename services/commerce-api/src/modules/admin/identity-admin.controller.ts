import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { roleGrantSchema, uuidSchema } from '@novamart/validation';
import { PERMISSIONS } from '@novamart/permissions';
import { Audit, Permissions } from '../../common/decorators';
import { parse } from '../../common/validation';
import { IdentityAdminService } from './identity-admin.service';

const revokeSchema = z.object({ reason: z.string().trim().min(10).max(500) });

@Controller({ path: 'admin/identity', version: '1' })
export class IdentityAdminController {
  constructor(private readonly identity: IdentityAdminService) {}
  @Permissions(PERMISSIONS.ROLE_READ)
  @Get('roles')
  async roles() { return this.identity.roles(); }
  @Permissions(PERMISSIONS.ROLE_READ)
  @Get('permissions')
  async permissions() { return this.identity.permissions(); }
  @Permissions(PERMISSIONS.ROLE_READ)
  @Get('users/:userId/roles')
  async userRoles(@Param('userId') userId: string) { return this.identity.userRoles(parse(uuidSchema, userId)); }
  @Permissions(PERMISSIONS.ROLE_GRANT)
  @Audit('identity.role_grant', 'user_role')
  @Post('roles')
  async grant(@Body() body: unknown) { return this.identity.grant(parse(roleGrantSchema, body)); }
  @Permissions(PERMISSIONS.ROLE_REVOKE)
  @Audit('identity.role_revoke', 'user_role')
  @Post('roles/:grantId/revoke')
  async revoke(@Param('grantId') grantId: string, @Body() body: unknown) { return this.identity.revoke(parse(uuidSchema, grantId), parse(revokeSchema, body).reason); }
}
