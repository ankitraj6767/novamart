import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { requestUploadSchema } from '@novamart/validation';
import { loadServerEnv } from '@novamart/config';
import { AppError } from '../../common/errors/app-error';
import { RequestContext } from '../../common/context/request-context';
import { DatabaseService } from '../../infrastructure/database/database.service';

type UploadInput = z.infer<typeof requestUploadSchema>;

@Injectable()
export class StorageService {
  private readonly env = loadServerEnv();

  constructor(private readonly db: DatabaseService) {}

  async createUpload(input: UploadInput): Promise<Record<string, unknown>> {
    const principal = RequestContext.requirePrincipal();
    await this.authorize(input, principal.userId, principal.sellerIds, principal.permissions);
    const target = this.target(input, principal.userId);
    if (!target) throw AppError.validation([{ field: 'entityId', issue: 'This upload purpose requires an entity id' }]);
    const secret = this.env.SUPABASE_SECRET_KEY;
    if (!secret) throw new AppError('PROVIDER_UNAVAILABLE', 'Storage signing is not configured');
    const endpoint = `${this.env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/upload/sign/${target.bucket}/${target.path}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { apikey: secret, authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      body: JSON.stringify({ upsert: false }),
    });
    if (!response.ok) throw new AppError('PROVIDER_UNAVAILABLE', 'Could not create a signed upload target');
    const payload = await response.json() as { url?: string; token?: string };
    return {
      bucket: target.bucket,
      path: target.path,
      uploadUrl: payload.url ? `${this.env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1${payload.url}` : endpoint,
      token: payload.token ?? null,
      requiredHeaders: { 'content-type': input.mimeType },
      expiresInSeconds: 600,
      publicUrl: target.public ? `${this.env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/${target.bucket}/${target.path}` : null,
      maxSizeBytes: input.sizeBytes,
    };
  }

  private async authorize(input: UploadInput, userId: string, sellerIds: string[], permissions: string[]): Promise<void> {
    if (input.purpose === 'PRODUCT_IMAGE' && !permissions.includes('product.manage') && sellerIds.length === 0) throw AppError.forbidden('Catalog media upload is not allowed for this account');
    if ((input.purpose === 'KYC_DOCUMENT' || input.purpose === 'SELLER_BULK_IMPORT') && (!input.entityId || !sellerIds.includes(input.entityId))) throw AppError.forbidden('Seller document upload is outside your scope');
    if (input.purpose === 'RETURN_EVIDENCE' && input.entityId) {
      const [row] = await this.db.sql<Array<{ allowed: boolean }>>`select (user_id = ${userId} or seller_id = any(${sellerIds}::uuid[]) or identity.has_permission('return.read')) as allowed from returns.return_requests where id = ${input.entityId}`;
      if (!row?.allowed) throw AppError.notFound('Return request');
    }
    if (input.purpose === 'SUPPORT_ATTACHMENT' && input.entityId) {
      const [row] = await this.db.sql<Array<{ allowed: boolean }>>`select (requester_id = ${userId} or assigned_to = ${userId} or seller_id = any(${sellerIds}::uuid[]) or identity.has_permission('ticket.read')) as allowed from support.support_tickets where id = ${input.entityId}`;
      if (!row?.allowed) throw AppError.notFound('Support ticket');
    }
  }

  private target(input: UploadInput, userId: string): { bucket: string; path: string; public: boolean } | null {
    const id = input.entityId;
    const extension = input.mimeType.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin';
    const file = `${randomUUID()}.${extension}`;
    switch (input.purpose) {
      case 'PRODUCT_IMAGE': return id ? { bucket: 'products-public', path: `products/${id}/${file}`, public: true } : null;
      case 'REVIEW_MEDIA': return { bucket: 'reviews-public', path: `reviews/${userId}/${file}`, public: true };
      case 'RETURN_EVIDENCE': return id ? { bucket: 'returns-private', path: `returns/${id}/${file}`, public: false } : null;
      case 'SUPPORT_ATTACHMENT': return id ? { bucket: 'support-private', path: `tickets/${id}/${file}`, public: false } : null;
      case 'KYC_DOCUMENT': return id ? { bucket: 'kyc-private', path: `kyc/${id}/${input.documentType ?? 'document'}/${file}`, public: false } : null;
      case 'SELLER_BULK_IMPORT': return id ? { bucket: 'seller-private', path: `seller/${id}/bulk-import/${file}`, public: false } : null;
    }
  }
}
