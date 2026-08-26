import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { offsetPaginationSchema, uuidSchema } from '@novamart/validation';
import { PERMISSIONS } from '@novamart/permissions';
import { Audit, Permissions } from '../../common/decorators';
import { parse } from '../../common/validation';
import { AdminSellerService } from './admin-seller.service';

/**
 * Reasons are mandatory on every decision here.
 *
 * These permissions are in REASON_REQUIRED_PERMISSIONS, and the reason is what makes the
 * audit log useful six months later when someone asks why a seller was suspended.
 */
const approveSchema = z.object({
  reason: z.string().trim().min(5).max(500),
  commissionPercentage: z.number().min(0).max(50).optional(),
});

const rejectSchema = z.object({
  reason: z.string().trim().min(5).max(500),
  /** ACTION_REQUIRED lets the seller correct and resubmit; REJECTED is terminal. */
  allowResubmission: z.boolean().default(true),
});

const suspendSchema = z.object({
  reason: z.string().trim().min(10).max(500),
});

const verificationSchema = z
  .object({
    approved: z.boolean(),
    reason: z.string().trim().min(5).max(500).optional(),
    verifiedHolderName: z.string().trim().max(120).optional(),
  })
  .refine((v) => v.approved || v.reason !== undefined, {
    message: 'A reason is required when rejecting',
    path: ['reason'],
  });

const queueQuerySchema = offsetPaginationSchema.extend({
  status: z
    .enum([
      'DRAFT',
      'DOCUMENTS_PENDING',
      'UNDER_REVIEW',
      'ACTION_REQUIRED',
      'APPROVED',
      'REJECTED',
      'SUSPENDED',
      'BLOCKED',
    ])
    .optional(),
});

@Controller({ path: 'admin/sellers', version: '1' })
export class AdminSellerController {
  constructor(private readonly admin: AdminSellerService) {}

  @Permissions(PERMISSIONS.SELLER_READ)
  @Get()
  async queue(@Query() query: Record<string, unknown>) {
    return this.admin.queue(parse(queueQuerySchema, query));
  }

  /** seller.approve is MFA-gated, so the guard will demand step-up authentication. */
  @Permissions(PERMISSIONS.SELLER_APPROVE)
  @Audit('seller.approve', 'seller')
  @Post(':sellerId/approve')
  async approve(@Param('sellerId') sellerId: string, @Body() body: unknown) {
    return this.admin.approve(parse(uuidSchema, sellerId), parse(approveSchema, body));
  }

  @Permissions(PERMISSIONS.SELLER_REJECT)
  @Audit('seller.reject', 'seller')
  @Post(':sellerId/reject')
  async reject(@Param('sellerId') sellerId: string, @Body() body: unknown) {
    return this.admin.reject(parse(uuidSchema, sellerId), parse(rejectSchema, body));
  }

  @Permissions(PERMISSIONS.SELLER_SUSPEND)
  @Audit('seller.suspend', 'seller')
  @Post(':sellerId/suspend')
  async suspend(@Param('sellerId') sellerId: string, @Body() body: unknown) {
    return this.admin.suspend(parse(uuidSchema, sellerId), parse(suspendSchema, body));
  }

  @Permissions(PERMISSIONS.SELLER_DOCUMENT_VERIFY)
  @Audit('seller_document.verify', 'seller_document')
  @Post('documents/:documentId/verify')
  async verifyDocument(@Param('documentId') documentId: string, @Body() body: unknown) {
    return this.admin.verifyDocument(
      parse(uuidSchema, documentId),
      parse(verificationSchema, body),
    );
  }

  @Permissions(PERMISSIONS.SELLER_BANK_VERIFY)
  @Audit('seller_bank.verify', 'seller_bank_account')
  @Post('bank-accounts/:bankAccountId/verify')
  async verifyBankAccount(@Param('bankAccountId') bankAccountId: string, @Body() body: unknown) {
    return this.admin.verifyBankAccount(
      parse(uuidSchema, bankAccountId),
      parse(verificationSchema, body),
    );
  }
}
