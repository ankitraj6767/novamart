import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type { roleGrantSchema } from '@novamart/validation';
import { AppError } from '../../common/errors/app-error';
import { RequestContext } from '../../common/context/request-context';
import { AuthService } from '../../common/auth/auth.service';
import { DatabaseService } from '../../infrastructure/database/database.service';

type RoleGrantInput = z.infer<typeof roleGrantSchema>;

@Injectable()
export class IdentityAdminService {
  constructor(private readonly db: DatabaseService, private readonly auth: AuthService) {}

  async roles(): Promise<Array<Record<string, unknown>>> {
    return this.db.sql<Array<Record<string, unknown>>>`select id, code, name, description, kind, required_scope_type, is_privileged, is_system, rank from identity.roles order by rank desc, code`;
  }

  async permissions(): Promise<Array<Record<string, unknown>>> {
    return this.db.sql<Array<Record<string, unknown>>>`select id, code, resource, action, description, is_sensitive, requires_reason, requires_mfa from identity.permissions order by resource, action`;
  }

  async userRoles(userId: string): Promise<Array<Record<string, unknown>>> {
    return this.db.sql<Array<Record<string, unknown>>>`select ur.id, ur.user_id, r.code as role_code, r.name as role_name, r.kind, ur.scope_type, ur.scope_id, ur.granted_by, ur.grant_reason, ur.expires_at, ur.created_at from identity.user_roles ur join identity.roles r on r.id = ur.role_id where ur.user_id = ${userId} and ur.revoked_at is null order by r.rank desc`;
  }

  async grant(input: RoleGrantInput): Promise<Record<string, unknown>> {
    const principal = RequestContext.requirePrincipal();
    const [role] = await this.db.sql<Array<{ id: string; required_scope_type: string | null; rank: number; is_privileged: boolean }>>`select id, required_scope_type, rank, is_privileged from identity.roles where code = ${input.roleCode}`;
    if (!role) throw AppError.notFound('Role');
    if (role.required_scope_type !== (input.scopeType ?? null)) throw AppError.validation([{ field: 'scopeType', issue: `This role requires a ${role.required_scope_type ?? 'global'} grant` }]);
    if (role.is_privileged && !principal.roles.includes('SUPER_ADMIN')) throw AppError.forbidden('Only SUPER_ADMIN may grant privileged roles');
    const [actorRank] = await this.db.sql<Array<{ rank: number }>>`select coalesce(max(r.rank), 0)::int as rank from identity.user_roles ur join identity.roles r on r.id = ur.role_id where ur.user_id = ${principal.userId} and ur.revoked_at is null`;
    if (role.rank >= Number(actorRank?.rank ?? 0) && !principal.roles.includes('SUPER_ADMIN')) throw AppError.forbidden('You cannot grant a role at or above your own privilege rank');
    const [row] = await this.db.transaction(RequestContext.sessionContext(), async (tx) =>
      tx<Array<Record<string, unknown>>>`insert into identity.user_roles (user_id, role_id, scope_type, scope_id, granted_by, grant_reason, expires_at) values (${input.userId}, ${role.id}, ${input.scopeType ?? null}, ${input.scopeId ?? null}, ${principal.userId}, ${input.reason}, ${input.expiresAt ?? null}) on conflict do nothing returning id, user_id, role_id, scope_type, scope_id, expires_at, created_at`,
    );
    if (!row) throw new AppError('CONFLICT', 'This role is already granted for the selected scope');
    await this.auth.invalidatePrincipal(input.userId);
    return row;
  }

  async revoke(roleGrantId: string, reason: string): Promise<{ revoked: true }> {
    const principal = RequestContext.requirePrincipal();
    const [row] = await this.db.transaction(RequestContext.sessionContext(), async (tx) =>
      tx<Array<{ user_id: string }>>`update identity.user_roles set revoked_at = now(), revoked_by = ${principal.userId}, revoke_reason = ${reason} where id = ${roleGrantId} and revoked_at is null returning user_id`,
    );
    if (!row) throw AppError.notFound('Role grant');
    await this.auth.invalidatePrincipal(row.user_id);
    return { revoked: true };
  }
}
