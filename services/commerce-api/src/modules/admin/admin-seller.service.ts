import { Injectable, Logger } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import { RequestContext } from '../../common/context/request-context';
import { AuthService } from '../../common/auth/auth.service';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';

/**
 * Seller lifecycle administration (brief §18, §43).
 *
 * The gate between "someone filled in a form" and "someone can take money from
 * customers". Approval is deliberately hard to do by accident:
 *
 *  - it requires seller.approve, which is MFA-gated (packages/permissions)
 *  - it refuses unless the PAN document is verified and a bank account is verified
 *  - it always writes a status-history row and an audit entry
 *
 * Suspension deactivates listings in the same transaction, because a suspended seller whose
 * offers stay live is still selling.
 */
@Injectable()
export class AdminSellerService {
  private readonly logger = new Logger(AdminSellerService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: OutboxService,
    private readonly auth: AuthService,
  ) { }

  /**
   * Evicts the cached principal of every user attached to a seller.
   *
   * A seller's status governs what its users may do, and principals are cached. After an
   * approval or suspension the change must be visible on the very next request: a suspended
   * seller whose cached principal keeps working for another minute can still act in that
   * window.
   */
  private async invalidateSellerUsers(sellerId: string): Promise<void> {
    const users = await this.db.sql<Array<{ user_id: string }>>`
      select user_id from seller.seller_users
       where seller_id = ${sellerId} and user_id is not null
    `;
    await Promise.all(users.map((u) => this.auth.invalidatePrincipal(u.user_id)));
  }

  /** The review queue, oldest first: a seller waiting longest has waited longest. */
  async queue(query: {
    status?: string;
    limit: number;
    offset: number;
  }): Promise<Array<Record<string, unknown>>> {
    const sql = this.db.sql;

    return sql<Array<Record<string, unknown>>>`
      select s.id, s.seller_code, s.display_name, s.legal_name, s.business_type, s.status,
             s.status_reason, s.onboarding_step, s.created_at,
             s.primary_contact_name, s.primary_contact_email::text as primary_contact_email,
             s.primary_contact_phone, s.registered_city, s.registered_state_code,
             tp.pan, tp.gstin, tp.gst_registration_type,
             tp.pan_verified_at, tp.gstin_verified_at,
             (select count(*)::int from seller.seller_documents d
               where d.seller_id = s.id) as document_count,
             (select count(*)::int from seller.seller_documents d
               where d.seller_id = s.id and d.verification_status = 'VERIFIED') as verified_documents,
             (select count(*)::int from seller.seller_bank_accounts b
               where b.seller_id = s.id and b.deleted_at is null
                 and b.verification_status = 'VERIFIED') as verified_bank_accounts,
             (select count(*)::int from inventory.warehouses w
               where w.seller_id = s.id and w.is_active) as warehouse_count
        from seller.sellers s
        left join seller.seller_tax_profiles tp on tp.seller_id = s.id
       where ${query.status ? sql`s.status = ${query.status}` : sql`s.status = 'UNDER_REVIEW'`}
       order by s.created_at
       limit ${query.limit} offset ${query.offset}
    `;
  }

  /**
   * Approves a seller.
   *
   * The readiness checks are enforced here rather than trusted to the reviewer's
   * attention: an approved seller with an unverified bank account produces a settlement
   * that cannot be paid, and an unverified PAN means NovaMart cannot meet its own TCS
   * reporting obligation.
   */
  async approve(
    sellerId: string,
    input: { reason: string; commissionPercentage?: number },
  ): Promise<{ status: string }> {
    const principal = RequestContext.requirePrincipal();

    const [readiness] = await this.db.sql<
      Array<{
        status: string;
        seller_code: string;
        display_name: string;
        agreement_accepted_at: string | null;
        has_verified_pan_doc: boolean;
        has_verified_bank: boolean;
        has_tax_profile: boolean;
        has_warehouse: boolean;
      }>
    >`
      select s.status, s.seller_code, s.display_name, s.agreement_accepted_at,
             exists (select 1 from seller.seller_documents d
                      where d.seller_id = s.id and d.document_type = 'PAN_CARD'
                        and d.verification_status = 'VERIFIED') as has_verified_pan_doc,
             exists (select 1 from seller.seller_bank_accounts b
                      where b.seller_id = s.id and b.deleted_at is null
                        and b.verification_status = 'VERIFIED') as has_verified_bank,
             exists (select 1 from seller.seller_tax_profiles t
                      where t.seller_id = s.id) as has_tax_profile,
             exists (select 1 from inventory.warehouses w
                      where w.seller_id = s.id and w.is_active) as has_warehouse
        from seller.sellers s
       where s.id = ${sellerId}
    `;

    if (!readiness) throw AppError.notFound('Seller');

    if (readiness.status === 'APPROVED') {
      // Idempotent: a double-click must not produce a second SELLER_APPROVED event and a
      // second welcome email.
      return { status: 'APPROVED' };
    }

    if (!['UNDER_REVIEW', 'ACTION_REQUIRED', 'SUSPENDED'].includes(readiness.status)) {
      throw new AppError('CONFLICT', `A seller in ${readiness.status} cannot be approved`);
    }

    const blockers: string[] = [];
    if (!readiness.has_verified_pan_doc) blockers.push('PAN document is not verified');
    if (!readiness.has_verified_bank) blockers.push('No verified bank account');
    if (!readiness.has_tax_profile) blockers.push('Tax profile is missing');
    if (!readiness.has_warehouse) blockers.push('No active pickup location');
    if (!readiness.agreement_accepted_at) blockers.push('Seller agreement is not accepted');

    if (blockers.length > 0) {
      throw AppError.validation(
        blockers.map((issue) => ({ issue })),
        'This seller is not ready to be approved',
      );
    }

    await this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      await tx`
        update seller.sellers
           set status            = 'APPROVED',
               status_reason     = null,
               status_changed_at = now(),
               status_changed_by = ${principal.userId},
               approved_at       = now(),
               approved_by       = ${principal.userId},
               onboarding_step   = 'COMPLETE',
               default_commission_percentage = coalesce(
                 ${input.commissionPercentage ?? null}, default_commission_percentage)
         where id = ${sellerId}
      `;

      // seller.record_status_change writes the history row from the trigger; the reason is
      // recorded here so the review decision is attributable.
      await tx`
        update seller.seller_status_history
           set reason = ${input.reason}
         where seller_id = ${sellerId}
           and to_status = 'APPROVED'
           and reason is null
      `;

      await this.outbox.emit(tx, 'SELLER_APPROVED', {
        sellerId,
        sellerCode: readiness.seller_code,
        displayName: readiness.display_name,
        approvedBy: principal.userId,
      });
    });

    await this.invalidateSellerUsers(sellerId);

    this.logger.log({ sellerId, approvedBy: principal.userId }, 'Seller approved');
    return { status: 'APPROVED' };
  }

  /** Rejects, or asks for corrections. ACTION_REQUIRED lets the seller fix and resubmit. */
  async reject(
    sellerId: string,
    input: { reason: string; allowResubmission: boolean },
  ): Promise<{ status: string }> {
    const principal = RequestContext.requirePrincipal();
    const target = input.allowResubmission ? 'ACTION_REQUIRED' : 'REJECTED';

    const updated = await this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const rows = await tx<Array<{ id: string }>>`
        update seller.sellers
           set status            = ${target},
               status_reason     = ${input.reason},
               status_changed_at = now(),
               status_changed_by = ${principal.userId}
         where id = ${sellerId}
           and status in ('UNDER_REVIEW', 'ACTION_REQUIRED', 'DOCUMENTS_PENDING')
        returning id
      `;
      return rows.length > 0;
    });

    if (!updated) {
      throw new AppError('CONFLICT', 'This seller is not awaiting review');
    }

    return { status: target };
  }

  /**
   * Suspends a seller and takes their offers down.
   *
   * Listings are deactivated in the same transaction as the status change. Leaving them
   * ACTIVE would keep the seller selling while suspended, and customers would be buying
   * from an account the platform has decided not to trust.
   *
   * Orders already placed are NOT cancelled: those are existing obligations and are handled
   * through the normal cancellation flow with the customer informed.
   */
  async suspend(
    sellerId: string,
    input: { reason: string },
  ): Promise<{ status: string; listingsDeactivated: number }> {
    const principal = RequestContext.requirePrincipal();

    const outcome = await this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [seller] = await tx<Array<{ status: string }>>`
        select status from seller.sellers where id = ${sellerId} for update
      `;
      if (!seller) throw AppError.notFound('Seller');
      if (seller.status === 'SUSPENDED') {
        return { status: 'SUSPENDED', listingsDeactivated: 0 };
      }

      await tx`
        update seller.sellers
           set status            = 'SUSPENDED',
               status_reason     = ${input.reason},
               status_changed_at = now(),
               status_changed_by = ${principal.userId}
         where id = ${sellerId}
      `;

      const suppressed = await tx<Array<{ id: string; sku_id: string }>>`
        update catalog.seller_listings
           set status = 'SUPPRESSED',
               -- seller_listings_suppressed_reason_check constrains this vocabulary.
               suppressed_reason = 'POLICY_VIOLATION',
               status_reason = ${`Seller suspended: ${input.reason}`.slice(0, 300)}
         where seller_id = ${sellerId}
           and status = 'ACTIVE'
        returning id, sku_id
      `;

      // Recompute the Buy Box for every affected SKU so a competing seller takes the slot
      // rather than the product appearing unavailable.
      for (const skuId of new Set(suppressed.map((l) => l.sku_id))) {
        await tx`select pricing.recompute_buy_box(${skuId})`;
      }

      await this.outbox.emit(tx, 'SELLER_SUSPENDED', {
        sellerId,
        reason: input.reason,
        suspendedBy: principal.userId,
        listingCount: suppressed.length,
      });

      this.logger.warn(
        { sellerId, suspendedBy: principal.userId, listings: suppressed.length },
        'Seller suspended and listings suppressed',
      );

      return { status: 'SUSPENDED', listingsDeactivated: suppressed.length };
    });

    // Outside the transaction on purpose: the cache eviction must happen after the status
    // change is durably committed, otherwise a concurrent request could repopulate the
    // cache from the pre-suspension state.
    await this.invalidateSellerUsers(sellerId);

    return outcome;
  }

  /**
   * Records a document verification decision.
   *
   * seller_documents_verified_fields requires verified_by and verified_at together, so the
   * decision is always attributable to a person.
   */
  async verifyDocument(
    documentId: string,
    input: { approved: boolean; reason?: string },
  ): Promise<{ verificationStatus: string }> {
    const principal = RequestContext.requirePrincipal();

    if (!input.approved && !input.reason) {
      throw AppError.validation([
        { field: 'reason', issue: 'A rejection reason is required' },
      ]);
    }

    const status = input.approved ? 'VERIFIED' : 'REJECTED';

    const rows = await this.db.sql<Array<{ id: string; seller_id: string }>>`
      update seller.seller_documents
         set verification_status = ${status},
             rejection_reason    = ${input.approved ? null : input.reason},
             verified_by         = ${principal.userId},
             verified_at         = now()
       where id = ${documentId}
         and verification_status in ('PENDING', 'IN_REVIEW', 'RESUBMIT_REQUESTED')
      returning id, seller_id
    `;

    if (rows.length === 0) {
      throw new AppError('CONFLICT', 'This document is not awaiting verification');
    }

    return { verificationStatus: status };
  }

  /**
   * Records a bank verification decision.
   *
   * In production this is the result of a penny drop against the account. Recorded as MANUAL
   * when an operator overrides, so the method is always visible in the audit trail.
   */
  async verifyBankAccount(
    bankAccountId: string,
    input: { approved: boolean; reason?: string; verifiedHolderName?: string },
  ): Promise<{ verificationStatus: string }> {
    const principal = RequestContext.requirePrincipal();
    const status = input.approved ? 'VERIFIED' : 'FAILED';

    const rows = await this.db.sql<Array<{ id: string }>>`
      update seller.seller_bank_accounts
         set verification_status  = ${status},
             verification_method  = 'MANUAL',
             verified_holder_name = ${input.verifiedHolderName ?? null},
             verified_at          = ${input.approved ? this.db.sql`now()` : null},
             failure_reason       = ${input.approved ? null : (input.reason ?? 'Verification failed')},
             verification_response = ${this.db.sql.json({
      method: 'MANUAL',
      operator: principal.userId,
      at: new Date().toISOString(),
    } as never)}
       where id = ${bankAccountId}
         and deleted_at is null
      returning id
    `;

    if (rows.length === 0) throw AppError.notFound('Bank account');
    return { verificationStatus: status };
  }
}
