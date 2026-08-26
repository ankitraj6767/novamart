import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  indianMobileSchema,
  offsetPaginationSchema,
  pincodeSchema,
  sellerBankAccountSchema,
  sellerRegistrationSchema,
  sellerTaxProfileSchema,
  sellerDocumentSchema,
  stateCodeSchema,
  upsertListingSchema,
  updateOrderItemStatusSchema,
  uuidSchema,
} from '@novamart/validation';
import { PERMISSIONS } from '@novamart/permissions';
import { Permissions, RateLimit, Scope } from '../../common/decorators';
import { parse } from '../../common/validation';
import { SellerService } from './seller.service';

const warehouseSchema = z.object({
  name: z.string().trim().min(3).max(120),
  contactName: z.string().trim().min(2).max(120),
  contactPhone: indianMobileSchema,
  addressLine1: z.string().trim().min(3).max(200),
  addressLine2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2).max(80),
  stateCode: stateCodeSchema,
  pincode: pincodeSchema,
  pickupCutoffTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM')
    .optional(),
  operatingDays: z
    .array(z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']))
    .min(1)
    .optional(),
  processingTimeHours: z.number().int().min(1).max(168).optional(),
});

const listingStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']),
  reason: z.string().trim().max(300).optional(),
});

const submitReviewSchema = z.object({
  agreementVersion: z.string().trim().min(1).max(20),
});

const listingQuerySchema = offsetPaginationSchema.extend({
  status: z
    .enum([
      'DRAFT',
      'PENDING_APPROVAL',
      'ACTIVE',
      'INACTIVE',
      'OUT_OF_STOCK',
      'SUPPRESSED',
      'BLOCKED',
    ])
    .optional(),
  search: z.string().trim().max(80).optional(),
});

/**
 * Seller Center API.
 *
 * @Scope('seller', 'param:sellerId') makes the guard verify the caller holds that seller
 * before the handler runs; the service checks membership again against seller_users,
 * because a scope claim in a token is only as fresh as the token.
 */
@Controller({ path: 'sellers', version: '1' })
export class SellerController {
  constructor(private readonly seller: SellerService) {}

  /**
   * Registration is open to any authenticated user: becoming a seller is a self-service
   * application. It grants nothing until an admin approves it.
   */
  @RateLimit(5, 3600)
  @Post()
  async register(@Body() body: unknown) {
    return this.seller.register(parse(sellerRegistrationSchema, body));
  }

  @Scope('seller', 'param:sellerId')
  @Get(':sellerId')
  async profile(@Param('sellerId') sellerId: string) {
    return this.seller.profile(parse(uuidSchema, sellerId));
  }

  /**
   * Replaces the whole tax profile rather than merging fields: a partially updated PAN and
   * GSTIN pair is not a meaningful state, and the schema cross-checks them against each
   * other.
   */
  @Scope('seller', 'param:sellerId')
  @Patch(':sellerId/tax-profile')
  async taxProfile(@Param('sellerId') sellerId: string, @Body() body: unknown) {
    return this.seller.upsertTaxProfile(
      parse(uuidSchema, sellerId),
      parse(sellerTaxProfileSchema, body),
    );
  }

  @Scope('seller', 'param:sellerId')
  @RateLimit(10, 3600)
  @Post(':sellerId/bank-accounts')
  async addBankAccount(@Param('sellerId') sellerId: string, @Body() body: unknown) {
    return this.seller.addBankAccount(
      parse(uuidSchema, sellerId),
      parse(sellerBankAccountSchema, body),
    );
  }

  @Scope('seller', 'param:sellerId')
  @Get(':sellerId/bank-accounts')
  async bankAccounts(@Param('sellerId') sellerId: string) {
    return this.seller.listBankAccounts(parse(uuidSchema, sellerId));
  }

  @Scope('seller', 'param:sellerId')
  @Post(':sellerId/warehouses')
  async addWarehouse(@Param('sellerId') sellerId: string, @Body() body: unknown) {
    return this.seller.addWarehouse(parse(uuidSchema, sellerId), parse(warehouseSchema, body));
  }

  @Scope('seller', 'param:sellerId')
  @Post(':sellerId/submit-for-review')
  async submitForReview(@Param('sellerId') sellerId: string, @Body() body: unknown) {
    return this.seller.submitForReview(
      parse(uuidSchema, sellerId),
      parse(submitReviewSchema, body),
    );
  }

  @Scope('seller', 'param:sellerId')
  @Post(':sellerId/documents')
  async document(@Param('sellerId') sellerId: string, @Body() body: unknown) {
    return this.seller.addDocument(parse(uuidSchema, sellerId), parse(sellerDocumentSchema, body));
  }

  @Scope('seller', 'param:sellerId')
  @Get(':sellerId/documents')
  async documents(@Param('sellerId') sellerId: string) {
    return this.seller.listDocuments(parse(uuidSchema, sellerId));
  }

  @Scope('seller', 'param:sellerId')
  @Permissions(PERMISSIONS.LISTING_CREATE)
  @Post(':sellerId/listings')
  async upsertListing(@Param('sellerId') sellerId: string, @Body() body: unknown) {
    return this.seller.upsertListing(parse(uuidSchema, sellerId), parse(upsertListingSchema, body));
  }

  @Scope('seller', 'param:sellerId')
  @Get(':sellerId/listings')
  async listings(@Param('sellerId') sellerId: string, @Query() query: Record<string, unknown>) {
    return this.seller.listListings(parse(uuidSchema, sellerId), parse(listingQuerySchema, query));
  }

  @Scope('seller', 'param:sellerId')
  @Permissions(PERMISSIONS.LISTING_UPDATE)
  @Patch(':sellerId/listings/:listingId/status')
  async setListingStatus(
    @Param('sellerId') sellerId: string,
    @Param('listingId') listingId: string,
    @Body() body: unknown,
  ) {
    return this.seller.setListingStatus(
      parse(uuidSchema, sellerId),
      parse(uuidSchema, listingId),
      parse(listingStatusSchema, body),
    );
  }

  @Scope('seller', 'param:sellerId')
  @Get(':sellerId/dashboard')
  async dashboard(@Param('sellerId') sellerId: string, @Query('days') days?: string) {
    const parsedDays = parse(z.coerce.number().int().min(1).max(365).default(30), days ?? 30);
    return this.seller.dashboard(parse(uuidSchema, sellerId), parsedDays);
  }

  @Scope('seller', 'param:sellerId')
  @Permissions(PERMISSIONS.ORDER_READ)
  @Get(':sellerId/orders')
  async orders(@Param('sellerId') sellerId: string, @Query() query: Record<string, unknown>) {
    return this.seller.orders(
      parse(uuidSchema, sellerId),
      parse(offsetPaginationSchema.extend({ status: z.string().max(40).optional() }), query),
    );
  }

  @Scope('seller', 'param:sellerId')
  @Permissions(PERMISSIONS.ORDER_UPDATE_STATUS)
  @Patch(':sellerId/orders/items/:orderItemId/status')
  async updateOrderItemStatus(
    @Param('sellerId') sellerId: string,
    @Param('orderItemId') orderItemId: string,
    @Body() body: unknown,
  ) {
    return this.seller.updateOrderItemStatus(
      parse(uuidSchema, sellerId),
      parse(uuidSchema, orderItemId),
      parse(updateOrderItemStatusSchema, body),
    );
  }
}
