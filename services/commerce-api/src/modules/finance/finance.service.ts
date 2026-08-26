import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type {
  financialAdjustmentSchema,
  payoutSchema,
  settlementPeriodSchema,
} from '@novamart/validation';
import { AppError } from '../../common/errors/app-error';
import { RequestContext } from '../../common/context/request-context';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';

type SettlementInput = z.infer<typeof settlementPeriodSchema>;
type PayoutInput = z.infer<typeof payoutSchema>;
type AdjustmentInput = z.infer<typeof financialAdjustmentSchema>;

@Injectable()
export class FinanceService {
  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: OutboxService,
  ) {}

  async balance(sellerId: string): Promise<Record<string, unknown>> {
    await this.assertSellerAccess(sellerId);
    const [row] = await this.db.sql<
      Array<Record<string, unknown>>
    >`select * from finance.seller_balance(${sellerId})`;
    return row ?? {};
  }

  async ledger(sellerId: string, limit: number): Promise<Array<Record<string, unknown>>> {
    await this.assertSellerAccess(sellerId);
    return this.db.sql<Array<Record<string, unknown>>>`
      select id, entry_type, direction, amount_paise::text, tax_paise::text, order_id,
             order_item_id, return_request_id, description, posting_date,
             available_for_settlement_on, settlement_status, settlement_id, payout_id, created_at
        from finance.seller_ledger where seller_id = ${sellerId}
       order by created_at desc limit ${limit}
    `;
  }

  async settlements(sellerId: string): Promise<Array<Record<string, unknown>>> {
    await this.assertSellerAccess(sellerId);
    return this.db.sql<Array<Record<string, unknown>>>`
      select id, settlement_reference, seller_id, period_start, period_end,
             settlement_cycle, gross_sales_paise::text, total_commission_paise::text,
             total_fees_paise::text, total_refunds_paise::text, net_payable_paise::text,
             entry_count, status, hold_reason, approved_at, paid_at, generated_at
        from finance.seller_settlements where seller_id = ${sellerId}
       order by period_end desc
    `;
  }

  async generateSettlement(input: SettlementInput): Promise<Record<string, unknown>> {
    await this.assertSellerAccess(input.sellerId);
    return this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const entries = await tx<
        Array<{
          id: string;
          amount_paise: string;
          entry_type: string;
          order_id: string | null;
        }>
      >`
        select id, amount_paise::text, entry_type, order_id
          from finance.seller_ledger
         where seller_id = ${input.sellerId}
           and settlement_status = 'UNSETTLED'
           and available_for_settlement_on <= ${input.periodEnd}::date
           and posting_date between ${input.periodStart}::date and ${input.periodEnd}::date
         order by created_at, id
         for update
      `;
      if (entries.length === 0)
        throw new AppError(
          'SETTLEMENT_NOT_READY',
          'No settleable ledger entries exist for this period',
        );
      const total = entries.reduce((sum, entry) => sum + Number(entry.amount_paise), 0);
      const gross = entries
        .filter((entry) => Number(entry.amount_paise) > 0)
        .reduce((sum, entry) => sum + Number(entry.amount_paise), 0);
      const deductions = Math.max(
        0,
        -entries
          .filter((entry) => Number(entry.amount_paise) < 0)
          .reduce((sum, entry) => sum + Number(entry.amount_paise), 0),
      );
      const [settlement] = await tx<
        Array<{ id: string; settlement_reference: string; status: string }>
      >`
        insert into finance.seller_settlements (
          seller_id, period_start, period_end, settlement_cycle,
          gross_sales_paise, total_fees_paise, net_payable_paise, entry_count, status
        ) values (
          ${input.sellerId}, ${input.periodStart}, ${input.periodEnd}, 'CUSTOM',
          ${gross}, ${deductions}, ${total}, ${entries.length}, 'PENDING_APPROVAL'
        )
        on conflict (seller_id, period_start, period_end) do update set
          gross_sales_paise = excluded.gross_sales_paise,
          total_fees_paise = excluded.total_fees_paise,
          net_payable_paise = excluded.net_payable_paise,
          entry_count = excluded.entry_count
        returning id, settlement_reference, status
      `;
      if (!settlement) throw new AppError('INTERNAL_ERROR', 'Settlement was not created');
      for (const entry of entries) {
        await tx`
          insert into finance.settlement_items (settlement_id, ledger_entry_id, amount_paise)
          values (${settlement.id}, ${entry.id}, ${entry.amount_paise})
          on conflict (ledger_entry_id) do nothing
        `;
      }
      await this.outbox.emit(tx, 'SETTLEMENT_CREATED', {
        settlementId: settlement.id,
        settlementReference: settlement.settlement_reference,
        sellerId: input.sellerId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        netPayablePaise: Math.max(0, total),
        entryCount: entries.length,
      });
      return settlement;
    });
  }

  async approveSettlement(settlementId: string): Promise<Record<string, unknown>> {
    return this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [settlement] = await tx<
        Array<{ id: string; seller_id: string; status: string; net_payable_paise: string }>
      >`
        select id, seller_id, status, net_payable_paise::text from finance.seller_settlements where id = ${settlementId} for update
      `;
      if (!settlement) throw AppError.notFound('Settlement');
      if (settlement.status !== 'PENDING_APPROVAL')
        throw new AppError('CONFLICT', `Settlement is already ${settlement.status}`);
      const entries = await tx<
        Array<{ ledger_entry_id: string }>
      >`select ledger_entry_id from finance.settlement_items where settlement_id = ${settlementId}`;
      await tx`select finance.mark_ledger_settled(${entries.map((entry) => entry.ledger_entry_id)}::uuid[], ${settlementId})`;
      const [row] = await tx<Array<Record<string, unknown>>>`
        update finance.seller_settlements set status = 'APPROVED', approved_by = ${RequestContext.requirePrincipal().userId}, approved_at = now() where id = ${settlementId}
        returning id, settlement_reference, seller_id, net_payable_paise::text, status, approved_at
      `;
      return row ?? {};
    });
  }

  async createPayout(input: PayoutInput): Promise<Record<string, unknown>> {
    if (input.provider !== 'MOCK')
      throw new AppError('PROVIDER_UNAVAILABLE', 'Payout provider is not configured');
    return this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [settlement] = await tx<
        Array<{ id: string; seller_id: string; net_payable_paise: string; status: string }>
      >`select id, seller_id, net_payable_paise::text, status from finance.seller_settlements where id = ${input.settlementId} for update`;
      if (!settlement) throw AppError.notFound('Settlement');
      if (settlement.status !== 'APPROVED')
        throw new AppError('SETTLEMENT_NOT_READY', 'Settlement must be approved before payout');
      const [bank] = await tx<
        Array<{ id: string }>
      >`select id from seller.seller_bank_accounts where id = ${input.bankAccountId} and seller_id = ${settlement.seller_id} and verification_status = 'VERIFIED' and deleted_at is null`;
      if (!bank)
        throw new AppError('SETTLEMENT_NOT_READY', 'A verified seller bank account is required');
      const amount = Number(settlement.net_payable_paise);
      if (amount <= 0)
        throw new AppError('SETTLEMENT_NOT_READY', 'Settlement has no positive payable balance');
      const [payout] = await tx<Array<{ id: string; payout_reference: string }>>`
        insert into finance.seller_payouts (
          settlement_id, seller_id, bank_account_id, amount_paise, provider,
          payout_mode, status, idempotency_key, initiated_by, initiated_at
        ) values (${settlement.id}, ${settlement.seller_id}, ${bank.id}, ${amount}, ${input.provider}, ${input.payoutMode}, 'PAID', ${`payout:${settlement.id}`}, ${RequestContext.requirePrincipal().userId}, now())
        on conflict (idempotency_key) where idempotency_key is not null do update set status = 'PAID'
        returning id, payout_reference
      `;
      if (!payout) throw new AppError('INTERNAL_ERROR', 'Payout was not created');
      await tx`
        insert into finance.seller_ledger (
          seller_id, entry_type, direction, amount_paise, settlement_id, payout_id,
          description, settlement_status, idempotency_key
        ) values (${settlement.seller_id}, 'SETTLEMENT_PAYOUT', 'DEBIT', ${-amount}, ${settlement.id}, ${payout.id}, 'Seller settlement payout', 'SETTLED', ${`payout-ledger:${settlement.id}`})
        on conflict (idempotency_key) where idempotency_key is not null do nothing
      `;
      await tx`update finance.seller_settlements set status = 'PAID', paid_at = now() where id = ${settlement.id}`;
      await this.outbox.emit(tx, 'SELLER_PAID', {
        payoutId: payout.id,
        payoutReference: payout.payout_reference,
        settlementId: settlement.id,
        sellerId: settlement.seller_id,
        amountPaise: amount,
        utrNumber: null,
      });
      return { ...payout, amountPaise: amount, status: 'PAID' };
    });
  }

  async requestAdjustment(input: AdjustmentInput): Promise<Record<string, unknown>> {
    await this.assertSellerAccess(input.sellerId);
    const principal = RequestContext.requirePrincipal();
    const signedAmount = input.direction === 'CREDIT' ? input.amountPaise : -input.amountPaise;
    const [row] = await this.db.sql<Array<Record<string, unknown>>>`
      insert into finance.financial_adjustments (
        seller_id, adjustment_type, direction, amount_paise, order_id, order_item_id,
        reason, supporting_documents, requested_by
      ) values (${input.sellerId}, ${input.adjustmentType}, ${input.direction}, ${input.amountPaise},
                ${input.orderId ?? null}, ${input.orderItemId ?? null}, ${input.reason},
                ${input.supportingDocuments}, ${principal.userId})
      returning id, seller_id, adjustment_type, direction, amount_paise, status, created_at
    `;
    void signedAmount;
    return row ?? {};
  }

  async approveAdjustment(
    adjustmentId: string,
    approved: boolean,
    reason?: string,
  ): Promise<Record<string, unknown>> {
    const principal = RequestContext.requirePrincipal();
    return this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [adjustment] = await tx<
        Array<{
          id: string;
          seller_id: string;
          adjustment_type: string;
          direction: string;
          amount_paise: string;
          order_id: string | null;
          order_item_id: string | null;
          requested_by: string;
          status: string;
        }>
      >`select id, seller_id, adjustment_type, direction, amount_paise::text, order_id, order_item_id, requested_by, status from finance.financial_adjustments where id = ${adjustmentId} for update`;
      if (!adjustment) throw AppError.notFound('Financial adjustment');
      if (adjustment.status !== 'PENDING_APPROVAL')
        throw new AppError('CONFLICT', `Adjustment is already ${adjustment.status}`);
      if (adjustment.requested_by === principal.userId)
        throw AppError.forbidden('An adjustment cannot be self-approved');
      if (!approved) {
        const [row] = await tx<
          Array<Record<string, unknown>>
        >`update finance.financial_adjustments set status = 'REJECTED', rejection_reason = ${reason ?? 'Rejected'} where id = ${adjustmentId} returning id, status, rejection_reason`;
        return row ?? {};
      }
      await tx`update finance.financial_adjustments set status = 'APPROVED', approved_by = ${principal.userId}, approved_at = now() where id = ${adjustmentId}`;
      const amount =
        adjustment.direction === 'CREDIT'
          ? Number(adjustment.amount_paise)
          : -Number(adjustment.amount_paise);
      const entryType =
        adjustment.direction === 'CREDIT' ? 'ADJUSTMENT_CREDIT' : 'ADJUSTMENT_DEBIT';
      const [entry] = await tx<Array<{ id: string }>>`
        insert into finance.seller_ledger (
          seller_id, entry_type, direction, amount_paise, order_id, order_item_id,
          adjustment_id, description, created_by, idempotency_key
        ) values (${adjustment.seller_id}, ${entryType}, ${adjustment.direction}, ${amount},
                  ${adjustment.order_id}, ${adjustment.order_item_id}, ${adjustment.id},
                  ${reason ?? 'Approved financial adjustment'}, ${principal.userId}, ${`adjustment:${adjustment.id}`})
        returning id
      `;
      await tx`update finance.financial_adjustments set status = 'POSTED', ledger_entry_id = ${entry?.id ?? null}, posted_at = now() where id = ${adjustmentId}`;
      return { id: adjustmentId, status: 'POSTED', ledgerEntryId: entry?.id ?? null };
    });
  }

  private async assertSellerAccess(sellerId: string): Promise<void> {
    const principal = RequestContext.requirePrincipal();
    if (principal.roles.some((role) => ['ADMIN', 'SUPER_ADMIN', 'FINANCE_MANAGER'].includes(role)))
      return;
    if (!principal.sellerIds.includes(sellerId)) throw AppError.notFound('Seller');
  }
}
