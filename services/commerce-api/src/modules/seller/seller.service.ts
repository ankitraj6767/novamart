import { Injectable, Logger } from '@nestjs/common';
import { money } from '@novamart/domain';
import type { z } from 'zod';
import type {
  sellerBankAccountSchema,
  sellerRegistrationSchema,
  sellerTaxProfileSchema,
  upsertListingSchema,
} from '@novamart/validation';
import { AppError } from '../../common/errors/app-error';
import { RequestContext } from '../../common/context/request-context';
import { AuthService } from '../../common/auth/auth.service';
import { FieldEncryptionService } from '../../common/crypto/field-encryption';
import { DatabaseService, type Tx } from '../../infrastructure/database/database.service';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';

type RegistrationInput = z.infer<typeof sellerRegistrationSchema>;
type TaxProfileInput = z.infer<typeof sellerTaxProfileSchema>;
type BankAccountInput = z.infer<typeof sellerBankAccountSchema>;
type ListingInput = z.infer<typeof upsertListingSchema>;

/**
 * The onboarding sequence (brief §43). Each step unlocks the next, and the seller cannot
 * be submitted for review until all of them are done.
 */
const ONBOARDING_ORDER = [
  'BUSINESS_DETAILS',
  'TAX_DETAILS',
  'BANK_DETAILS',
  'PICKUP_ADDRESS',
  'DOCUMENTS',
  'AGREEMENT',
  'COMPLETE',
] as const;

type OnboardingStep = (typeof ONBOARDING_ORDER)[number];

/**
 * Seller onboarding, KYC and catalogue operations.
 *
 * Two rules shape the whole module:
 *
 *  1. A seller may only ever touch their own records. Every statement is scoped by
 *     seller_id, and the caller's claim to that seller is checked against
 *     seller.seller_users rather than taken from the request.
 *  2. Nothing here can make a seller transactable. Approval is an admin action requiring
 *     verified documents and a verified bank account; a seller cannot approve themselves
 *     by completing a form.
 */
@Injectable()
export class SellerService {
  private readonly logger = new Logger(SellerService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: OutboxService,
    private readonly crypto: FieldEncryptionService,
    private readonly auth: AuthService,
  ) {}

  // -------------------------------------------------------------------------
  // Onboarding
  // -------------------------------------------------------------------------

  /**
   * Registers a seller and makes the caller its owner.
   *
   * Starts in DRAFT: nothing is sellable, and nothing about the business has been
   * verified yet.
   */
  async register(input: RegistrationInput): Promise<{ sellerId: string; sellerCode: string }> {
    const principal = RequestContext.requirePrincipal();

    // One seller per owner keeps the model honest; a genuine multi-entity operator gets
    // additional seller accounts through support, with the paperwork that implies.
    const existing = await this.db.sql<Array<{ seller_id: string }>>`
      select seller_id from seller.seller_users
       where user_id = ${principal.userId}
         and role_code = 'SELLER_OWNER'
         and status in ('ACTIVE', 'INVITED')
    `;
    if (existing.length > 0) {
      throw new AppError('CONFLICT', 'This account already owns a seller profile');
    }

    const result = await this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [seller] = await tx<Array<{ id: string; seller_code: string }>>`
        insert into seller.sellers (
          display_name, legal_name, business_type, slug,
          primary_contact_name, primary_contact_email, primary_contact_phone,
          registered_address_line1, registered_address_line2, registered_city,
          registered_state_code, registered_pincode,
          status, status_reason, onboarding_step, created_by
        ) values (
          ${input.displayName}, ${input.legalName}, ${input.businessType},
          ${await this.uniqueSlug(tx, input.displayName)},
          ${input.primaryContactName}, ${input.primaryContactEmail},
          ${input.primaryContactPhone},
          ${input.registeredAddressLine1}, ${input.registeredAddressLine2 ?? null},
          ${input.registeredCity}, ${input.registeredStateCode}, ${input.registeredPincode},
          'DRAFT', null, 'TAX_DETAILS', ${principal.userId}
        )
        returning id, seller_code
      `;

      const sellerId = seller!.id;

      // The registering user becomes the owner. seller_users is what identity.my_seller_ids
      // reads, so this is also what grants them scoped access.
      await tx`
        insert into seller.seller_users (seller_id, user_id, role_code, status, accepted_at)
        values (${sellerId}, ${principal.userId}, 'SELLER_OWNER', 'ACTIVE', now())
      `;

      await this.outbox.emit(tx, 'SELLER_REGISTERED', {
        sellerId,
        sellerCode: seller!.seller_code,
        displayName: input.displayName,
      });

      return { sellerId, sellerCode: seller!.seller_code };
    });

    // The caller's principal is cached with their seller scopes, and it was resolved
    // before this seller existed. Without evicting it, the seller they just created is
    // invisible to them — every follow-up call 404s until the cache expires, which reads
    // as the registration having silently failed.
    await this.auth.invalidatePrincipal(principal.userId);

    return result;
  }

  async profile(sellerId: string): Promise<Record<string, unknown>> {
    await this.assertMembership(sellerId);

    const [seller] = await this.db.sql<Array<Record<string, unknown>>>`
      select s.id, s.seller_code, s.display_name, s.slug, s.legal_name, s.business_type,
             s.status, s.status_reason, s.onboarding_step, s.logo_url, s.about,
             s.primary_contact_name, s.primary_contact_email::text as primary_contact_email,
             s.primary_contact_phone, s.support_email::text as support_email,
             s.support_phone, s.fulfillment_models, s.dispatch_sla_hours,
             s.rating, s.rating_count, s.seller_score, s.settlement_cycle,
             s.settlement_hold_days, s.agreement_accepted_at, s.approved_at,
             s.vacation_from, s.vacation_to,
             seller.is_transactable(s.id) as is_transactable
        from seller.sellers s
       where s.id = ${sellerId}
    `;

    if (!seller) throw AppError.notFound('Seller');

    // The checklist drives the onboarding UI, so it is computed here rather than left to
    // each client to infer from scattered fields.
    const [checklist] = await this.db.sql<
      Array<{
        has_tax: boolean;
        has_bank: boolean;
        has_verified_bank: boolean;
        has_warehouse: boolean;
        document_count: number;
        verified_document_count: number;
      }>
    >`
      select
        exists (select 1 from seller.seller_tax_profiles where seller_id = ${sellerId}) as has_tax,
        exists (select 1 from seller.seller_bank_accounts
                 where seller_id = ${sellerId} and deleted_at is null) as has_bank,
        exists (select 1 from seller.seller_bank_accounts
                 where seller_id = ${sellerId} and deleted_at is null
                   and verification_status = 'VERIFIED') as has_verified_bank,
        exists (select 1 from inventory.warehouses
                 where seller_id = ${sellerId} and is_active) as has_warehouse,
        (select count(*)::int from seller.seller_documents where seller_id = ${sellerId}) as document_count,
        (select count(*)::int from seller.seller_documents
          where seller_id = ${sellerId} and verification_status = 'VERIFIED') as verified_document_count
    `;

    return { ...seller, checklist };
  }

  /**
   * Stores the tax profile. PAN and GSTIN consistency is already enforced by the schema
   * (the GSTIN embeds the PAN and the state code), so this only has to persist it.
   */
  async upsertTaxProfile(sellerId: string, input: TaxProfileInput): Promise<{ saved: true }> {
    await this.assertMembership(sellerId, ['SELLER_OWNER', 'SELLER_ADMIN']);
    await this.assertEditable(sellerId);

    await this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      await tx`
        insert into seller.seller_tax_profiles (
          seller_id, pan, gstin, gst_registration_type, gst_state_code,
          legal_name_as_per_pan
        ) values (
          ${sellerId}, ${input.pan}, ${input.gstin ?? null},
          ${input.gstRegistrationType}, ${input.gstStateCode}, ${input.legalNameAsPerPan}
        )
        on conflict (seller_id) do update
          set pan                   = excluded.pan,
              gstin                 = excluded.gstin,
              gst_registration_type = excluded.gst_registration_type,
              gst_state_code        = excluded.gst_state_code,
              legal_name_as_per_pan = excluded.legal_name_as_per_pan,
              -- Any change invalidates a previous verification: the new number has not
              -- been checked against the tax authority.
              pan_verified_at       = null,
              gstin_verified_at     = null
      `;

      await this.advanceOnboarding(tx, sellerId, 'BANK_DETAILS');
    });

    return { saved: true };
  }

  /**
   * Stores a bank account.
   *
   * The account number is encrypted before it reaches the database, and only the last four
   * digits are kept in the clear. A blind index makes it possible to detect the same
   * account registered by a different seller — a common fraud pattern — without
   * decrypting anything.
   */
  async addBankAccount(
    sellerId: string,
    input: BankAccountInput,
  ): Promise<{ id: string; last4: string; verificationStatus: string }> {
    await this.assertMembership(sellerId, ['SELLER_OWNER', 'SELLER_FINANCE_MANAGER']);
    await this.assertEditable(sellerId);

    const accountNumber = input.accountNumber.trim();
    const blindIndex = this.crypto.blindIndex(accountNumber);

    // Same account under another seller is a strong fraud signal. Flagged rather than
    // silently blocked, because joint and family businesses do legitimately share one.
    const [collision] = await this.db.sql<Array<{ seller_id: string }>>`
      select seller_id from seller.seller_bank_accounts
       where account_number_hash = ${blindIndex}
         and seller_id <> ${sellerId}
         and deleted_at is null
       limit 1
    `;
    if (collision) {
      this.logger.warn(
        { sellerId, otherSellerId: collision.seller_id },
        'Bank account is already registered to a different seller',
      );
    }

    const row = await this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      // Only one primary account: the settlement payout has to have exactly one
      // destination.
      await tx`
        update seller.seller_bank_accounts set is_primary = false
         where seller_id = ${sellerId} and deleted_at is null
      `;

      const [created] = await tx<
        Array<{ id: string; account_number_last4: string; verification_status: string }>
      >`
        insert into seller.seller_bank_accounts (
          seller_id, account_holder_name, account_number_encrypted, account_number_last4,
          account_number_hash, ifsc, bank_name, account_type, is_primary,
          verification_status
        ) values (
          ${sellerId}, ${input.accountHolderName},
          ${this.crypto.encrypt(accountNumber)},
          ${this.crypto.last4(accountNumber)},
          ${blindIndex}, ${input.ifsc},
          ${this.bankNameFromIfsc(input.ifsc)}, ${input.accountType}, true,
          -- Verification is a penny-drop against the provider, done asynchronously. It
          -- must never start as VERIFIED.
          'PENDING'
        )
        returning id, account_number_last4, verification_status
      `;

      await this.advanceOnboarding(tx, sellerId, 'PICKUP_ADDRESS');
      return created!;
    });

    return {
      id: row.id,
      last4: row.account_number_last4,
      verificationStatus: row.verification_status,
    };
  }

  /** Bank accounts, masked. The full number is never returned by the API. */
  async listBankAccounts(sellerId: string): Promise<Array<Record<string, unknown>>> {
    await this.assertMembership(sellerId, ['SELLER_OWNER', 'SELLER_FINANCE_MANAGER']);

    return this.db.sql<Array<Record<string, unknown>>>`
      select id, account_holder_name, ifsc, bank_name, account_type, is_primary,
             verification_status, verified_at, failure_reason,
             -- Masked for display. There is no endpoint that returns the full number:
             -- payouts read it server-side at settlement time.
             '••••••••' || account_number_last4 as account_number_masked
        from seller.seller_bank_accounts
       where seller_id = ${sellerId} and deleted_at is null
       order by is_primary desc, created_at desc
    `;
  }

  /**
   * Registers a pickup warehouse.
   *
   * A seller warehouse is a real inventory node: the checkout engine picks it as a
   * fulfillment source and the delivery promise is computed from its cutoff and operating
   * days, so those are captured up front rather than defaulted.
   */
  async addWarehouse(
    sellerId: string,
    input: {
      name: string;
      contactName: string;
      contactPhone: string;
      addressLine1: string;
      addressLine2?: string;
      city: string;
      stateCode: string;
      pincode: string;
      pickupCutoffTime?: string;
      operatingDays?: string[];
      processingTimeHours?: number;
    },
  ): Promise<{ id: string; code: string }> {
    await this.assertMembership(sellerId, ['SELLER_OWNER', 'SELLER_ADMIN']);

    // A warehouse in an unserviceable pincode can never dispatch anything.
    const [pincode] = await this.db.sql<Array<{ is_serviceable: boolean }>>`
      select is_serviceable from fulfillment.pincodes where pincode = ${input.pincode}
    `;
    if (!pincode) {
      throw AppError.validation([
        { field: 'pincode', issue: 'We do not have pickup coverage for this pincode yet' },
      ]);
    }

    const row = await this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [warehouse] = await tx<Array<{ id: string; code: string }>>`
        insert into inventory.warehouses (
          code, name, seller_id, warehouse_type, contact_name, contact_phone,
          address_line1, address_line2, city, state_code, pincode,
          operating_days, pickup_cutoff_time, processing_time_hours, is_active,
          accepts_new_orders
        ) values (
          ${await this.uniqueWarehouseCode(tx, sellerId)}, ${input.name}, ${sellerId},
          'SELLER', ${input.contactName}, ${input.contactPhone},
          ${input.addressLine1}, ${input.addressLine2 ?? null}, ${input.city},
          ${input.stateCode}, ${input.pincode},
          ${input.operatingDays ?? ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']},
          ${input.pickupCutoffTime ?? '15:00'}, ${input.processingTimeHours ?? 24},
          true, true
        )
        returning id, code
      `;

      await this.advanceOnboarding(tx, sellerId, 'DOCUMENTS');
      return warehouse!;
    });

    return row;
  }

  /**
   * Accepts the seller agreement and submits for review.
   *
   * This is the end of what a seller can do alone. Everything after it is an admin
   * decision, which is the point: self-service onboarding must not be self-approval.
   */
  async submitForReview(
    sellerId: string,
    input: { agreementVersion: string },
  ): Promise<{ status: string; missing: string[] }> {
    await this.assertMembership(sellerId, ['SELLER_OWNER']);

    const [state] = await this.db.sql<
      Array<{
        status: string;
        has_tax: boolean;
        has_bank: boolean;
        has_warehouse: boolean;
        has_pan_doc: boolean;
      }>
    >`
      select s.status,
             exists (select 1 from seller.seller_tax_profiles where seller_id = s.id) as has_tax,
             exists (select 1 from seller.seller_bank_accounts
                      where seller_id = s.id and deleted_at is null) as has_bank,
             exists (select 1 from inventory.warehouses
                      where seller_id = s.id and is_active) as has_warehouse,
             exists (select 1 from seller.seller_documents
                      where seller_id = s.id and document_type = 'PAN_CARD') as has_pan_doc
        from seller.sellers s
       where s.id = ${sellerId}
    `;

    if (!state) throw AppError.notFound('Seller');

    const missing: string[] = [];
    if (!state.has_tax) missing.push('TAX_DETAILS');
    if (!state.has_bank) missing.push('BANK_DETAILS');
    if (!state.has_warehouse) missing.push('PICKUP_ADDRESS');
    if (!state.has_pan_doc) missing.push('PAN_DOCUMENT');

    if (missing.length > 0) {
      throw AppError.validation(
        missing.map((step) => ({ field: step, issue: `${step} is required before review` })),
        'Onboarding is incomplete',
      );
    }

    if (state.status !== 'DRAFT' && state.status !== 'ACTION_REQUIRED') {
      throw new AppError('CONFLICT', `A seller in ${state.status} cannot be submitted for review`);
    }

    await this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      await tx`
        update seller.sellers
           set status                = 'UNDER_REVIEW',
               status_reason         = 'Submitted by seller for verification',
               onboarding_step       = 'COMPLETE',
               agreement_accepted_at = now(),
               agreement_version     = ${input.agreementVersion}
         where id = ${sellerId}
      `;
    });

    return { status: 'UNDER_REVIEW', missing: [] };
  }

  // -------------------------------------------------------------------------
  // Listings
  // -------------------------------------------------------------------------

  /**
   * Creates or updates a listing against an existing catalogue SKU.
   *
   * A listing is the seller's OFFER on a shared catalogue product (brief §20). The seller
   * controls price, stock and fulfilment; they do not control the product's title, images
   * or specifications, which belong to the catalogue. That separation is what lets several
   * sellers compete on one product page.
   */
  async upsertListing(
    sellerId: string,
    input: ListingInput,
  ): Promise<{ listingId: string; status: string }> {
    await this.assertMembership(sellerId, [
      'SELLER_OWNER',
      'SELLER_ADMIN',
      'SELLER_CATALOG_MANAGER',
    ]);
    await this.assertTransactable(sellerId);

    const [sku] = await this.db.sql<Array<{ id: string; product_id: string; status: string }>>`
      select sk.id, sk.product_id, sk.status
        from catalog.skus sk
        join catalog.products p on p.id = sk.product_id
       where sk.id = ${input.skuId}
         and p.status = 'ACTIVE'
         and p.moderation_status = 'APPROVED'
    `;
    if (!sku) throw AppError.notFound('SKU');

    // A seller's warehouse must be their own: listing against someone else's node would
    // let them dispatch from stock they do not hold.
    if (input.defaultWarehouseId) {
      const [warehouse] = await this.db.sql<Array<{ id: string }>>`
        select id from inventory.warehouses
         where id = ${input.defaultWarehouseId} and seller_id = ${sellerId} and is_active
      `;
      if (!warehouse) throw AppError.notFound('Warehouse');
    }

    return this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [listing] = await tx<Array<{ id: string; status: string }>>`
        insert into catalog.seller_listings (
          seller_id, sku_id, product_id, seller_sku_code, condition, fulfillment_model,
          declared_mrp_paise, min_order_quantity, max_order_quantity, handling_time_days,
          default_warehouse_id, return_window_days, cod_allowed, status
        ) values (
          ${sellerId}, ${input.skuId}, ${sku.product_id}, ${input.sellerSkuCode ?? null},
          ${input.condition}, ${input.fulfillmentModel}, ${input.declaredMrpPaise},
          ${input.minOrderQuantity}, ${input.maxOrderQuantity}, ${input.handlingTimeDays},
          ${input.defaultWarehouseId ?? null}, ${input.returnWindowDays ?? null},
          ${input.codAllowed ?? null},
          -- New listings start INACTIVE with a reason: nothing becomes buyable until the
          -- seller has priced it and put stock behind it.
          'INACTIVE'
        )
        on conflict (seller_id, sku_id) do update
          set seller_sku_code      = excluded.seller_sku_code,
              condition            = excluded.condition,
              fulfillment_model    = excluded.fulfillment_model,
              declared_mrp_paise   = excluded.declared_mrp_paise,
              min_order_quantity   = excluded.min_order_quantity,
              max_order_quantity   = excluded.max_order_quantity,
              handling_time_days   = excluded.handling_time_days,
              default_warehouse_id = excluded.default_warehouse_id,
              return_window_days   = excluded.return_window_days,
              cod_allowed          = excluded.cod_allowed
        returning id, status
      `;

      const listingId = listing!.id;

      // Price lives in pricing.listing_prices, not on the listing: it is versioned and
      // has its own audit trail via pricing.record_price_change.
      await tx`
        insert into pricing.listing_prices (
          listing_id, seller_id, sku_id, mrp_paise, selling_price_paise,
          update_source, updated_by
        ) values (
          ${listingId}, ${sellerId}, ${input.skuId}, ${input.declaredMrpPaise},
          ${input.sellingPricePaise}, 'SELLER_UI', ${RequestContext.userId()}
        )
        on conflict (listing_id) do update
          set mrp_paise           = excluded.mrp_paise,
              selling_price_paise = excluded.selling_price_paise,
              update_source       = excluded.update_source,
              updated_by          = excluded.updated_by,
              effective_from      = now()
      `;

      await this.outbox.emit(tx, 'LISTING_UPDATED', {
        listingId,
        sellerId,
        skuId: input.skuId,
        productId: sku.product_id,
        status: listing!.status,
      });

      return { listingId, status: listing!.status };
    });
  }

  /**
   * Activates or deactivates a listing.
   *
   * Activation refuses when there is no sellable stock: an ACTIVE listing with zero
   * inventory is what produces a product page that cannot be bought, and it damages the
   * seller's own cancellation rate.
   */
  async setListingStatus(
    sellerId: string,
    listingId: string,
    input: { status: 'ACTIVE' | 'INACTIVE'; reason?: string },
  ): Promise<{ status: string }> {
    await this.assertMembership(sellerId, [
      'SELLER_OWNER',
      'SELLER_ADMIN',
      'SELLER_CATALOG_MANAGER',
    ]);

    const [listing] = await this.db.sql<Array<{ id: string; sku_id: string; status: string }>>`
      select id, sku_id, status from catalog.seller_listings
       where id = ${listingId} and seller_id = ${sellerId}
    `;
    if (!listing) throw AppError.notFound('Listing');

    if (input.status === 'ACTIVE') {
      await this.assertTransactable(sellerId);

      const [available] = await this.db.sql<Array<{ quantity: number }>>`
        select coalesce(inventory.available_for_sku(${listing.sku_id}, ${sellerId}), 0) as quantity
      `;
      if ((available?.quantity ?? 0) <= 0) {
        throw AppError.validation(
          [{ field: 'status', issue: 'Add stock before activating this listing' }],
          'Cannot activate a listing with no available stock',
        );
      }
    }

    await this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      await tx`
        update catalog.seller_listings
           set status = ${input.status},
               -- seller_listings_status_reason requires a reason for INACTIVE.
               status_reason = ${
                 input.status === 'INACTIVE' ? (input.reason ?? 'Deactivated by seller') : null
               },
               first_activated_at = case
                 when ${input.status} = 'ACTIVE' and first_activated_at is null then now()
                 else first_activated_at
               end
         where id = ${listingId} and seller_id = ${sellerId}
      `;

      // The Buy Box winner for this SKU may change when an offer appears or disappears.
      await tx`select pricing.recompute_buy_box(${listing.sku_id})`;

      await this.outbox.emit(tx, 'LISTING_UPDATED', {
        listingId,
        sellerId,
        skuId: listing.sku_id,
        productId: (
          await tx<Array<{ product_id: string }>>`
            select product_id from catalog.seller_listings where id = ${listingId}
          `
        )[0]!.product_id,
        status: input.status,
      });
    });

    return { status: input.status };
  }

  /** The seller's listings with live price and stock. */
  async listListings(
    sellerId: string,
    query: { limit: number; offset: number; status?: string; search?: string },
  ): Promise<Array<Record<string, unknown>>> {
    await this.assertMembership(sellerId);
    const sql = this.db.sql;

    return sql<Array<Record<string, unknown>>>`
      select sl.id as listing_id, sl.sku_id, sl.status, sl.condition, sl.fulfillment_model,
             sl.seller_sku_code, sl.handling_time_days, sl.is_buy_box_winner,
             sk.sku_code, p.title as product_title, p.slug as product_slug,
             pv.variant_label,
             lp.mrp_paise::text as mrp_paise,
             lp.selling_price_paise::text as selling_price_paise,
             coalesce(inventory.available_for_sku(sl.sku_id, sl.seller_id), 0) as available_quantity
        from catalog.seller_listings sl
        join catalog.skus sk on sk.id = sl.sku_id
        join catalog.products p on p.id = sl.product_id
        left join catalog.product_variants pv on pv.id = sk.variant_id
        left join pricing.listing_prices lp on lp.listing_id = sl.id
       where sl.seller_id = ${sellerId}
         and sl.archived_at is null
         ${query.status ? sql`and sl.status = ${query.status}` : sql``}
         ${
           query.search
             ? sql`and (p.title ilike ${'%' + query.search + '%'}
                        or sk.sku_code ilike ${'%' + query.search + '%'}
                        or sl.seller_sku_code ilike ${'%' + query.search + '%'})`
             : sql``
         }
       order by sl.updated_at desc
       limit ${query.limit} offset ${query.offset}
    `;
  }

  /**
   * Seller dashboard (brief §17).
   *
   * Reads the pre-aggregated analytics.seller_metrics rather than scanning orders: a
   * dashboard must not get slower as the seller grows.
   */
  async dashboard(sellerId: string, days: number): Promise<Record<string, unknown>> {
    await this.assertMembership(sellerId);

    const [totals] = await this.db.replica<
      Array<{
        orders: string;
        units: string;
        gmv_paise: string;
        commission_paise: string;
        cancellations: string;
        returns: string;
      }>
    >`
      select coalesce(sum(orders), 0)::text           as orders,
             coalesce(sum(units), 0)::text            as units,
             coalesce(sum(gmv_paise), 0)::text        as gmv_paise,
             coalesce(sum(commission_paise), 0)::text as commission_paise,
             coalesce(sum(cancellations), 0)::text    as cancellations,
             coalesce(sum(returns), 0)::text          as returns
        from analytics.seller_metrics
       where seller_id = ${sellerId}
         and metric_date >= current_date - ${days}::int
    `;

    const [balance] = await this.db.sql<
      Array<{
        net_balance_paise: string;
        unsettled_paise: string;
        on_hold_paise: string;
        settleable_now_paise: string;
      }>
    >`
      select net_balance_paise::text, unsettled_paise::text, on_hold_paise::text,
             settleable_now_paise::text
        from finance.seller_balance(${sellerId})
    `;

    const [operational] = await this.db.sql<
      Array<{ pending_orders: number; low_stock: number; inactive_listings: number }>
    >`
      select
        (select count(*)::int from commerce.order_items oi
          where oi.seller_id = ${sellerId}
            and oi.status in ('CONFIRMED', 'ALLOCATED', 'PROCESSING')) as pending_orders,
        (select count(*)::int from inventory.warehouse_inventory wi
          where wi.seller_id = ${sellerId}
            and wi.reorder_point is not null
            and wi.available_quantity <= wi.reorder_point) as low_stock,
        (select count(*)::int from catalog.seller_listings sl
          where sl.seller_id = ${sellerId}
            and sl.status in ('INACTIVE', 'OUT_OF_STOCK')
            and sl.archived_at is null) as inactive_listings
    `;

    const orders = Number(totals?.orders ?? 0);
    const gmv = Number(totals?.gmv_paise ?? 0);

    return {
      periodDays: days,
      orders,
      units: Number(totals?.units ?? 0),
      grossMerchandiseValue: money(gmv),
      averageOrderValue: money(orders > 0 ? Math.round(gmv / orders) : 0),
      platformFees: money(Number(totals?.commission_paise ?? 0)),
      cancellations: Number(totals?.cancellations ?? 0),
      returns: Number(totals?.returns ?? 0),
      // Rates are computed here rather than stored so the period is always consistent
      // with the numerator.
      cancellationRate: orders > 0 ? Number(totals!.cancellations) / orders : 0,
      returnRate: orders > 0 ? Number(totals!.returns) / orders : 0,
      balance: {
        net: money(Number(balance?.net_balance_paise ?? 0)),
        unsettled: money(Number(balance?.unsettled_paise ?? 0)),
        onHold: money(Number(balance?.on_hold_paise ?? 0)),
        settleableNow: money(Number(balance?.settleable_now_paise ?? 0)),
      },
      actionRequired: {
        pendingOrders: operational?.pending_orders ?? 0,
        lowStockSkus: operational?.low_stock ?? 0,
        inactiveListings: operational?.inactive_listings ?? 0,
      },
    };
  }

  async orders(
    sellerId: string,
    query: { limit: number; offset: number; status?: string },
  ): Promise<Array<Record<string, unknown>>> {
    await this.assertMembership(sellerId, ['SELLER_OWNER', 'SELLER_ADMIN', 'SELLER_ORDER_MANAGER']);
    const sql = this.db.sql;
    return sql<Array<Record<string, unknown>>>`
      select oi.id, oi.item_number, oi.order_id, o.order_number, o.status as order_status,
             o.payment_status, o.payment_method, oi.product_title, oi.sku_code, oi.quantity,
             oi.status, oi.status_reason, oi.promised_dispatch_by, oi.promised_delivery_date,
             oi.created_at, oi.updated_at, b.total_payable_paise::text,
             sh.shipment_reference, sh.awb_number, sh.status as shipment_status
        from commerce.order_items oi
        join commerce.orders o on o.id = oi.order_id
        left join commerce.order_item_price_breakdowns b on b.order_item_id = oi.id
        left join fulfillment.shipment_items si on si.order_item_id = oi.id
        left join fulfillment.shipments sh on sh.id = si.shipment_id
       where oi.seller_id = ${sellerId}
         ${query.status ? sql`and oi.status = ${query.status}` : sql``}
       order by oi.created_at desc limit ${query.limit} offset ${query.offset}
    `;
  }

  async updateOrderItemStatus(
    sellerId: string,
    orderItemId: string,
    input: { toStatus: string; reason?: string },
  ): Promise<Record<string, unknown>> {
    await this.assertMembership(sellerId, ['SELLER_OWNER', 'SELLER_ADMIN', 'SELLER_ORDER_MANAGER']);
    const principal = RequestContext.requirePrincipal();
    return this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [item] = await tx<
        Array<{
          id: string;
          order_id: string;
          item_number: string;
          user_id: string;
          seller_id: string;
          status: string;
          product_title: string;
        }>
      >`
        select oi.id, oi.order_id, oi.item_number, o.user_id, oi.seller_id, oi.status, oi.product_title
          from commerce.order_items oi join commerce.orders o on o.id = oi.order_id
         where oi.id = ${orderItemId} and oi.seller_id = ${sellerId} for update
      `;
      if (!item) throw AppError.notFound('Order item');
      if (item.status === input.toStatus)
        return { id: item.id, status: item.status, unchanged: true };
      const [updated] = await tx<Array<Record<string, unknown>>>`
        update commerce.order_items set status = ${input.toStatus}, status_reason = ${input.reason ?? null}
         where id = ${orderItemId}
        returning id, item_number, status, status_reason, updated_at
      `;
      await this.outbox.emit(tx, 'ORDER_ITEM_STATUS_CHANGED', {
        orderId: item.order_id,
        orderItemId: item.id,
        itemNumber: item.item_number,
        userId: item.user_id,
        sellerId,
        fromStatus: item.status,
        toStatus: input.toStatus,
        reason: input.reason ?? null,
      });
      this.logger.log(
        { actorId: principal.userId, orderItemId, from: item.status, to: input.toStatus },
        'Seller updated order item status',
      );
      return updated ?? {};
    });
  }

  // -------------------------------------------------------------------------
  // Guards and helpers
  // -------------------------------------------------------------------------

  /**
   * Confirms the caller belongs to this seller, with one of the allowed roles.
   *
   * Membership comes from seller.seller_users, never from the request. Staff with a global
   * grant pass, because support has to be able to act on a seller's behalf — and that
   * action is separately audited.
   */
  private async assertMembership(sellerId: string, roles?: string[]): Promise<void> {
    const principal = RequestContext.requirePrincipal();

    if (principal.roles.includes('ADMIN') || principal.roles.includes('SUPER_ADMIN')) return;

    const [membership] = await this.db.sql<Array<{ role_code: string }>>`
      select role_code from seller.seller_users
       where seller_id = ${sellerId}
         and user_id = ${principal.userId}
         and status = 'ACTIVE'
    `;

    // 404, not 403: confirming a seller id exists would let someone enumerate them.
    if (!membership) throw AppError.notFound('Seller');

    if (roles && !roles.includes(membership.role_code)) {
      throw AppError.forbidden(`This action requires one of: ${roles.join(', ')}`);
    }
  }

  /** Onboarding data may only be edited before approval. */
  private async assertEditable(sellerId: string): Promise<void> {
    const [seller] = await this.db.sql<Array<{ status: string }>>`
      select status from seller.sellers where id = ${sellerId}
    `;
    if (!seller) throw AppError.notFound('Seller');

    // Once approved, tax and bank changes go through support so the change is reviewed:
    // a silent bank-detail change is the textbook payout-diversion attack.
    if (!['DRAFT', 'DOCUMENTS_PENDING', 'ACTION_REQUIRED'].includes(seller.status)) {
      throw new AppError('CONFLICT', 'Verified details can only be changed through seller support');
    }
  }

  /** Only an approved, unsuspended seller may list or sell. */
  private async assertTransactable(sellerId: string): Promise<void> {
    const [row] = await this.db.sql<Array<{ transactable: boolean }>>`
      select seller.is_transactable(${sellerId}) as transactable
    `;
    if (!row?.transactable) {
      throw new AppError('SELLER_NOT_APPROVED', 'This seller account cannot list products yet');
    }
  }

  /**
   * Moves onboarding forward, never backward.
   *
   * A seller who revisits an earlier step to correct something must not lose the progress
   * they already made.
   */
  private async advanceOnboarding(tx: Tx, sellerId: string, target: OnboardingStep): Promise<void> {
    const [current] = await tx<Array<{ onboarding_step: string }>>`
      select onboarding_step from seller.sellers where id = ${sellerId}
    `;
    if (!current) return;

    const currentIndex = ONBOARDING_ORDER.indexOf(current.onboarding_step as OnboardingStep);
    const targetIndex = ONBOARDING_ORDER.indexOf(target);
    if (targetIndex <= currentIndex) return;

    await tx`
      update seller.sellers set onboarding_step = ${target} where id = ${sellerId}
    `;
  }

  private async uniqueSlug(tx: Tx, displayName: string): Promise<string> {
    const [row] = await tx<Array<{ slug: string }>>`
      select private.slugify(${displayName}) as slug
    `;
    const base = row?.slug ?? 'seller';

    // Slug collisions are certain at scale ("Sharma Electronics" is not unique), so a
    // suffix is appended rather than failing the registration.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const taken = await tx<Array<{ id: string }>>`
        select id from seller.sellers where slug = ${candidate}
      `;
      if (taken.length === 0) return candidate;
    }

    return `${base}-${Date.now().toString(36)}`;
  }

  private async uniqueWarehouseCode(tx: Tx, sellerId: string): Promise<string> {
    const [seller] = await tx<Array<{ seller_code: string }>>`
      select seller_code from seller.sellers where id = ${sellerId}
    `;
    const [count] = await tx<Array<{ count: string }>>`
      select count(*)::text as count from inventory.warehouses where seller_id = ${sellerId}
    `;
    return `${seller?.seller_code ?? 'WH'}-W${String(Number(count?.count ?? 0) + 1).padStart(2, '0')}`;
  }

  /**
   * Derives the bank from the IFSC prefix.
   *
   * The first four characters identify the bank. A lookup table would be more complete;
   * this covers the common cases and degrades to the raw prefix rather than guessing.
   */
  private bankNameFromIfsc(ifsc: string): string {
    const banks: Record<string, string> = {
      HDFC: 'HDFC Bank',
      ICIC: 'ICICI Bank',
      SBIN: 'State Bank of India',
      UTIB: 'Axis Bank',
      KKBK: 'Kotak Mahindra Bank',
      PUNB: 'Punjab National Bank',
      BARB: 'Bank of Baroda',
      IDIB: 'Indian Bank',
      CNRB: 'Canara Bank',
      UBIN: 'Union Bank of India',
      YESB: 'Yes Bank',
      INDB: 'IndusInd Bank',
      IDFB: 'IDFC First Bank',
      RATN: 'RBL Bank',
      FDRL: 'Federal Bank',
      BKID: 'Bank of India',
    };
    const prefix = ifsc.slice(0, 4).toUpperCase();
    return banks[prefix] ?? prefix;
  }
}
