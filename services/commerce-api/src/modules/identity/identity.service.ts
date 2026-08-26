import { Injectable } from '@nestjs/common';
import type { AddressDto, ProfileDto } from '@novamart/types';
import type { z } from 'zod';
import type {
  addressSchema,
  notificationPreferencesSchema,
  registerDeviceSchema,
  updateProfileSchema,
} from '@novamart/validation';
import { AppError } from '../../common/errors/app-error';
import { RequestContext } from '../../common/context/request-context';
import { DatabaseService } from '../../infrastructure/database/database.service';

type AddressInput = z.infer<typeof addressSchema>;
type ProfileInput = z.infer<typeof updateProfileSchema>;
type DeviceInput = z.infer<typeof registerDeviceSchema>;
type PreferencesInput = z.infer<typeof notificationPreferencesSchema>;

interface AddressRow {
  id: string;
  label: string;
  recipient_name: string;
  recipient_phone: string;
  alternate_phone: string | null;
  address_line1: string;
  address_line2: string | null;
  landmark: string | null;
  locality: string | null;
  city: string;
  state_code: string;
  state_name: string | null;
  pincode: string;
  country_code: string;
  is_default: boolean;
  delivery_instructions: string | null;
}

/**
 * Profile, addresses, devices and preferences.
 *
 * Every query is scoped by user_id in the WHERE clause rather than relying on RLS
 * alone. The API connects as a privileged role, so RLS is a backstop here, not the
 * primary control — the ownership predicate is (docs/SECURITY_MODEL.md §5).
 */
@Injectable()
export class IdentityService {
  constructor(private readonly db: DatabaseService) { }

  async profile(): Promise<ProfileDto> {
    const principal = RequestContext.requirePrincipal();

    const [row] = await this.db.sql<
      Array<{
        id: string;
        full_name: string | null;
        email: string | null;
        phone: string | null;
        avatar_url: string | null;
        preferred_locale: string;
        account_status: string;
        email_verified_at: string | null;
        phone_verified_at: string | null;
        lifetime_order_count: number;
      }>
    >`
      select id, full_name, email::text as email, phone, avatar_url, preferred_locale,
             account_status, email_verified_at, phone_verified_at, lifetime_order_count
        from identity.profiles
       where id = ${principal.userId}
    `;

    if (!row) throw AppError.notFound('Profile');

    return {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      avatarUrl: row.avatar_url,
      preferredLocale: row.preferred_locale,
      accountStatus: row.account_status,
      emailVerified: row.email_verified_at !== null,
      phoneVerified: row.phone_verified_at !== null,
      lifetimeOrderCount: row.lifetime_order_count,
      roles: principal.roles,
      permissions: principal.permissions,
    };
  }

  async updateProfile(input: ProfileInput): Promise<ProfileDto> {
    const principal = RequestContext.requirePrincipal();

    // Only the columns a user may change. Account status, risk tier and GMV counters
    // are all server-owned and deliberately absent.
    await this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      await tx`
        update identity.profiles
           set full_name        = coalesce(${input.fullName ?? null}, full_name),
               display_name     = coalesce(${input.displayName ?? null}, display_name),
               date_of_birth    = coalesce(${input.dateOfBirth ?? null}::date, date_of_birth),
               gender           = coalesce(${input.gender ?? null}, gender),
               preferred_locale = coalesce(${input.preferredLocale ?? null}, preferred_locale)
         where id = ${principal.userId}
      `;
    });

    return this.profile();
  }

  async listAddresses(): Promise<AddressDto[]> {
    const principal = RequestContext.requirePrincipal();

    const rows = await this.db.sql<AddressRow[]>`
      select a.id, a.label, a.recipient_name, a.recipient_phone, a.alternate_phone,
             a.address_line1, a.address_line2, a.landmark, a.locality, a.city,
             a.state_code, s.name as state_name, a.pincode, a.country_code,
             a.is_default, a.delivery_instructions
        from identity.addresses a
        left join fulfillment.states s on s.code = a.state_code
       where a.user_id = ${principal.userId}
         and a.deleted_at is null
       order by a.is_default desc, a.updated_at desc
    `;

    return rows.map((r) => this.toAddressDto(r));
  }

  async createAddress(input: AddressInput): Promise<AddressDto> {
    const principal = RequestContext.requirePrincipal();

    // Reject an address we cannot deliver to at creation time rather than letting the
    // customer discover it at checkout.
    await this.assertPincodeKnown(input.pincode);

    const row = await this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [created] = await tx<AddressRow[]>`
        insert into identity.addresses (
          user_id, label, recipient_name, recipient_phone, alternate_phone,
          address_line1, address_line2, landmark, locality, city, state_code, pincode,
          latitude, longitude, delivery_instructions, is_default
        ) values (
          ${principal.userId}, ${input.label}, ${input.recipientName}, ${input.recipientPhone},
          ${input.alternatePhone ?? null}, ${input.addressLine1}, ${input.addressLine2 ?? null},
          ${input.landmark ?? null}, ${input.locality ?? null}, ${input.city},
          ${input.stateCode}, ${input.pincode}, ${input.latitude ?? null},
          ${input.longitude ?? null}, ${input.deliveryInstructions ?? null}, ${input.isDefault}
        )
        returning id, label, recipient_name, recipient_phone, alternate_phone, address_line1,
                  address_line2, landmark, locality, city, state_code, null::text as state_name,
                  pincode, country_code, is_default, delivery_instructions
      `;
      return created!;
    });

    return this.toAddressDto(row);
  }

  async updateAddress(addressId: string, input: AddressInput): Promise<AddressDto> {
    const principal = RequestContext.requirePrincipal();
    await this.assertPincodeKnown(input.pincode);

    const row = await this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [updated] = await tx<AddressRow[]>`
        update identity.addresses
           set label                 = ${input.label},
               recipient_name        = ${input.recipientName},
               recipient_phone       = ${input.recipientPhone},
               alternate_phone       = ${input.alternatePhone ?? null},
               address_line1         = ${input.addressLine1},
               address_line2         = ${input.addressLine2 ?? null},
               landmark              = ${input.landmark ?? null},
               locality              = ${input.locality ?? null},
               city                  = ${input.city},
               state_code            = ${input.stateCode},
               pincode               = ${input.pincode},
               latitude              = ${input.latitude ?? null},
               longitude             = ${input.longitude ?? null},
               delivery_instructions = ${input.deliveryInstructions ?? null},
               is_default            = ${input.isDefault}
         where id = ${addressId}
           and user_id = ${principal.userId}
           and deleted_at is null
        returning id, label, recipient_name, recipient_phone, alternate_phone, address_line1,
                  address_line2, landmark, locality, city, state_code, null::text as state_name,
                  pincode, country_code, is_default, delivery_instructions
      `;
      if (!updated) throw AppError.notFound('Address');
      return updated;
    });

    return this.toAddressDto(row);
  }

  /**
   * Soft delete. Orders snapshot their delivery address into commerce.order_addresses,
   * so removing the source row never rewrites delivery history.
   */
  async deleteAddress(addressId: string): Promise<{ deleted: true }> {
    const principal = RequestContext.requirePrincipal();

    await this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const rows = await tx`
        update identity.addresses
           set deleted_at = now()
         where id = ${addressId}
           and user_id = ${principal.userId}
           and deleted_at is null
        returning id
      `;
      if (rows.length === 0) throw AppError.notFound('Address');
    });

    return { deleted: true };
  }

  /**
   * Device registration for push. Upserted on (user_id, device_identifier) so a
   * reinstall refreshes the token instead of accumulating dead rows that would make
   * every notification fan out to stale tokens.
   */
  async registerDevice(input: DeviceInput): Promise<{ id: string }> {
    const principal = RequestContext.requirePrincipal();
    const ctx = RequestContext.get();

    const [row] = await this.db.sql<Array<{ id: string }>>`
      insert into identity.user_devices (
        user_id, device_identifier, platform, app, app_version, os_version, device_model,
        push_token, push_provider, push_enabled, is_rooted, is_emulator, last_ip
      ) values (
        ${principal.userId}, ${input.deviceIdentifier}, ${input.platform}, ${input.app},
        ${input.appVersion ?? null}, ${input.osVersion ?? null}, ${input.deviceModel ?? null},
        ${input.pushToken ?? null}, ${input.pushToken ? 'FCM' : null},
        ${input.pushToken !== undefined}, ${input.isRooted}, ${input.isEmulator},
        ${ctx?.ip ?? null}::inet
      )
      on conflict (user_id, device_identifier, app) do update
        set platform     = excluded.platform,
            app_version  = excluded.app_version,
            os_version   = excluded.os_version,
            device_model = excluded.device_model,
            push_token   = coalesce(excluded.push_token, identity.user_devices.push_token),
            push_enabled = excluded.push_enabled,
            is_rooted    = excluded.is_rooted,
            is_emulator  = excluded.is_emulator,
            last_seen_at = now(),
            last_ip      = excluded.last_ip,
            revoked_at   = null
      returning id
    `;

    return { id: row!.id };
  }

  async preferences(): Promise<Record<string, unknown>> {
    const principal = RequestContext.requirePrincipal();

    const [row] = await this.db.sql<Array<Record<string, unknown>>>`
      select push_marketing, email_marketing, sms_marketing, whatsapp_marketing,
             notification_topics, preferred_language, default_pincode,
             personalised_recommendations, save_search_history
        from identity.user_preferences
       where user_id = ${principal.userId}
    `;

    // The row is created by a trigger on signup; absence means defaults apply.
    return row ?? {};
  }

  async updatePreferences(input: PreferencesInput): Promise<Record<string, unknown>> {
    const principal = RequestContext.requirePrincipal();

    await this.db.sql`
      insert into identity.user_preferences (user_id) values (${principal.userId})
      on conflict (user_id) do nothing
    `;

    await this.db.sql`
      update identity.user_preferences
         set push_marketing               = coalesce(${input.pushMarketing ?? null}, push_marketing),
             email_marketing              = coalesce(${input.emailMarketing ?? null}, email_marketing),
             sms_marketing                = coalesce(${input.smsMarketing ?? null}, sms_marketing),
             whatsapp_marketing           = coalesce(${input.whatsappMarketing ?? null}, whatsapp_marketing),
             notification_topics          = coalesce(${input.notificationTopics ? this.db.sql.json(input.notificationTopics as never) : null}, notification_topics),
             preferred_language           = coalesce(${input.preferredLanguage ?? null}, preferred_language),
             default_pincode              = coalesce(${input.defaultPincode ?? null}, default_pincode),
             personalised_recommendations = coalesce(${input.personalisedRecommendations ?? null}, personalised_recommendations),
             save_search_history          = coalesce(${input.saveSearchHistory ?? null}, save_search_history)
       where user_id = ${principal.userId}
    `;

    return this.preferences();
  }

  async exportData(): Promise<Record<string, unknown>> {
    const userId = RequestContext.requirePrincipal().userId;
    const [profile, addresses, orders, reviews, tickets] = await Promise.all([
      this.db.sql<Array<Record<string, unknown>>>`select id, email::text, phone::text, full_name, display_name, preferred_locale, account_status, created_at from identity.profiles where id = ${userId}`,
      this.db.sql<Array<Record<string, unknown>>>`select id, label, recipient_name, address_line1, address_line2, city, state_code, pincode, is_default from identity.addresses where user_id = ${userId} and deleted_at is null order by created_at`,
      this.db.sql<Array<Record<string, unknown>>>`select id, order_number, status, total_payable_paise::text, placed_at from commerce.orders where user_id = ${userId} order by placed_at desc`,
      this.db.sql<Array<Record<string, unknown>>>`select id, product_id, rating, title, body, status, created_at from commerce.reviews where user_id = ${userId} order by created_at desc`,
      this.db.sql<Array<Record<string, unknown>>>`select id, ticket_reference, subject, status, created_at from support.support_tickets where requester_id = ${userId} order by created_at desc`,
    ]);
    return { exportedAt: new Date().toISOString(), profile: profile[0] ?? null, addresses, orders, reviews, tickets };
  }

  async requestDeletion(reason: string): Promise<{ requested: true; status: string }> {
    const userId = RequestContext.requirePrincipal().userId;
    const [row] = await this.db.sql<Array<{ account_status: string }>>`
      update identity.profiles set account_status = 'DELETION_REQUESTED', status_reason = ${reason}, deletion_requested_at = now(), status_changed_at = now(), status_changed_by = ${userId}
       where id = ${userId} and account_status not in ('DELETED', 'DELETION_REQUESTED')
       returning account_status
    `;
    if (!row) throw new AppError('CONFLICT', 'Account deletion has already been requested or completed');
    return { requested: true, status: row.account_status };
  }

  private async assertPincodeKnown(pincode: string): Promise<void> {
    const [row] = await this.db.sql<Array<{ is_serviceable: boolean }>>`
      select is_serviceable from fulfillment.pincodes where pincode = ${pincode}
    `;
    if (!row) {
      throw AppError.validation([
        { field: 'pincode', issue: 'We do not deliver to this pincode yet' },
      ]);
    }
  }

  private toAddressDto(row: AddressRow): AddressDto {
    return {
      id: row.id,
      label: row.label as AddressDto['label'],
      recipientName: row.recipient_name,
      recipientPhone: row.recipient_phone,
      alternatePhone: row.alternate_phone,
      addressLine1: row.address_line1,
      addressLine2: row.address_line2,
      landmark: row.landmark,
      locality: row.locality,
      city: row.city,
      stateCode: row.state_code,
      ...(row.state_name ? { stateName: row.state_name } : {}),
      pincode: row.pincode,
      countryCode: 'IN',
      isDefault: row.is_default,
      deliveryInstructions: row.delivery_instructions,
    };
  }
}
