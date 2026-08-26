import { Injectable, Logger } from '@nestjs/common';
import type { z } from 'zod';
import type {
  createReturnSchema,
  returnDecisionSchema,
  returnInspectionSchema,
} from '@novamart/validation';
import { AppError } from '../../common/errors/app-error';
import { RequestContext } from '../../common/context/request-context';
import { DatabaseService, type Tx } from '../../infrastructure/database/database.service';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';

type CreateReturnInput = z.infer<typeof createReturnSchema>;
type DecisionInput = z.infer<typeof returnDecisionSchema>;
type InspectionInput = z.infer<typeof returnInspectionSchema>;

@Injectable()
export class ReturnsService {
  private readonly logger = new Logger(ReturnsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: OutboxService,
  ) {}

  async reasons(): Promise<Array<Record<string, unknown>>> {
    return this.db.sql<Array<Record<string, unknown>>>`
      select code, label, label_hi, category, fault_attribution, requires_evidence,
             min_evidence_count, auto_approve, requires_qc, allowed_resolutions, display_order
        from returns.return_reasons where is_active order by display_order, label
    `;
  }

  async list(): Promise<Array<Record<string, unknown>>> {
    const userId = RequestContext.requirePrincipal().userId;
    return this.db.sql<Array<Record<string, unknown>>>`
      select rr.id, rr.return_reference, rr.order_id, o.order_number, rr.seller_id,
             s.display_name as seller_name, rr.request_type, rr.resolution_requested,
             rr.resolution_granted, rr.reason_code, rr.status, rr.refund_amount_paise::text,
             rr.reverse_freight_paise::text, rr.created_at, rr.updated_at,
             jsonb_agg(jsonb_build_object(
               'id', ri.id, 'orderItemId', ri.order_item_id, 'skuId', ri.sku_id,
               'quantity', ri.quantity, 'refundablePaise', ri.refundable_paise
             ) order by ri.created_at) as items
        from returns.return_requests rr
        join commerce.orders o on o.id = rr.order_id
        join seller.sellers s on s.id = rr.seller_id
        join returns.return_items ri on ri.return_request_id = rr.id
       where rr.user_id = ${userId}
       group by rr.id, o.order_number, s.display_name
       order by rr.created_at desc
    `;
  }

  async create(input: CreateReturnInput): Promise<Record<string, unknown>> {
    const principal = RequestContext.requirePrincipal();
    const idempotencyKey = RequestContext.get()?.idempotencyKey ?? `return:${input.orderItemId}:${input.reasonCode}:${principal.userId}`;
    const [eligibility] = await this.db.sql<
      Array<{
        is_eligible: boolean;
        block_reason: string | null;
        return_type: string | null;
        window_closes_on: string | null;
        days_remaining: number | null;
        requires_evidence: boolean;
      }>
    >`
      select * from returns.check_eligibility(${input.orderItemId}, ${input.reasonCode})
    `;
    if (!eligibility?.is_eligible) {
      throw new AppError(
        eligibility?.block_reason === 'RETURN_WINDOW_CLOSED'
          ? 'RETURN_WINDOW_CLOSED'
          : 'RETURN_NOT_ELIGIBLE',
        eligibility?.block_reason ?? 'This item is not eligible for return',
      );
    }
    if (eligibility.return_type === 'REFUND_ONLY' && input.resolutionRequested !== 'REFUND') {
      throw new AppError('RETURN_NOT_ELIGIBLE', 'This item is eligible for refund only');
    }
    if (
      eligibility.return_type === 'REPLACEMENT_ONLY' &&
      input.resolutionRequested !== 'REPLACEMENT'
    ) {
      throw new AppError('RETURN_NOT_ELIGIBLE', 'This item is eligible for replacement only');
    }
    if (eligibility.requires_evidence && input.evidencePaths.length === 0) {
      throw new AppError('RETURN_NOT_ELIGIBLE', 'Evidence is required for this return reason');
    }
    if (
      input.evidencePaths.some(
        (path) => path.includes('..') || !path.startsWith(`${principal.userId}/`),
      )
    ) {
      throw AppError.forbidden('Return evidence must belong to the authenticated customer');
    }

    const [item] = await this.db.sql<
      Array<{
        order_id: string;
        user_id: string;
        seller_id: string;
        sku_id: string;
        quantity: number;
        total_payable_paise: string;
        product_title: string;
        delivery_address: Record<string, unknown> | null;
      }>
    >`
      select oi.order_id, o.user_id, oi.seller_id, oi.sku_id, oi.quantity,
             b.total_payable_paise::text, oi.product_title,
             (select to_jsonb(oa) - 'id' - 'order_id' from commerce.order_addresses oa where oa.order_id = o.id and oa.address_type = 'SHIPPING') as delivery_address
        from commerce.order_items oi
        join commerce.orders o on o.id = oi.order_id and o.user_id = ${principal.userId}
        join commerce.order_item_price_breakdowns b on b.order_item_id = oi.id
       where oi.id = ${input.orderItemId}
    `;
    if (!item) throw AppError.notFound('Order item');
    if (input.quantity > item.quantity)
      throw AppError.validation([
        { field: 'quantity', issue: 'Quantity exceeds the order item quantity' },
      ]);

    return this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const autoApprove =
        eligibility.return_type !== 'NON_RETURNABLE' && input.resolutionRequested !== 'REPAIR';
      const status = autoApprove ? 'AUTO_APPROVED' : 'REQUESTED';
      const [request] = await tx<Array<{ id: string; return_reference: string; status: string }>>`
        insert into returns.return_requests (
          order_id, user_id, seller_id, request_type, resolution_requested,
          resolution_granted, reason_code, reason_details, customer_comments,
          status, status_reason, eligibility_snapshot, pickup_address,
          refund_amount_paise, cost_borne_by, approved_by, approved_at, idempotency_key
        )
        select ${item.order_id}, ${principal.userId}, ${item.seller_id},
               ${input.resolutionRequested === 'REPLACEMENT' ? 'REPLACEMENT' : 'RETURN'},
               ${input.resolutionRequested},
               case when ${autoApprove} then ${input.resolutionRequested} else null end,
               ${input.reasonCode}, ${input.reasonDetails ?? null}, ${input.comments ?? null},
               ${status}, ${autoApprove ? 'Automatic policy approval' : null},
               ${tx.json({ ...eligibility, createdAt: new Date().toISOString() } as never)},
               ${tx.json((item.delivery_address ?? {}) as never)},
               ${Math.floor((Number(item.total_payable_paise) * input.quantity) / item.quantity)},
               'SELLER', ${autoApprove ? principal.userId : null}, ${autoApprove ? new Date().toISOString() : null}, ${idempotencyKey}
        on conflict (idempotency_key) where idempotency_key is not null do nothing
        returning id, return_reference, status
      `;
      const existingRequest = request ?? (await tx<Array<{ id: string; return_reference: string; status: string }>>`select id, return_reference, status from returns.return_requests where idempotency_key = ${idempotencyKey}`)[0];
      if (!existingRequest) throw new AppError('INTERNAL_ERROR', 'Return request was not created');
      if (!request) return existingRequest;

      const [returnItem] = await tx<Array<{ id: string }>>`
        insert into returns.return_items (
          return_request_id, order_item_id, sku_id, quantity, reason_code,
          reason_details, refundable_paise
        ) values (
          ${existingRequest.id}, ${input.orderItemId}, ${item.sku_id}, ${input.quantity},
          ${input.reasonCode}, ${input.reasonDetails ?? null},
          ${Math.floor((Number(item.total_payable_paise) * input.quantity) / item.quantity)}
        ) returning id
      `;

      for (const path of input.evidencePaths) {
        await tx`
          insert into returns.return_evidence (
            return_request_id, return_item_id, evidence_type, uploaded_by_type,
            uploaded_by, storage_path, mime_type, file_size_bytes
          ) values (${existingRequest.id}, ${returnItem?.id ?? null}, 'PHOTO', 'CUSTOMER',
                    ${principal.userId}, ${path}, 'image/jpeg', 1)
        `;
      }

      await tx`
        update commerce.order_items
           set status = 'RETURN_REQUESTED', status_reason = ${input.reasonDetails ?? input.reasonCode}
         where id = ${input.orderItemId}
      `;
      if (autoApprove) {
        await this.db.switchActor(tx, {
          actorId: null,
          actorType: 'SYSTEM',
          requestId: RequestContext.requestId(),
          traceId: RequestContext.traceId(),
        });
        await tx`
          update commerce.order_items set status = 'RETURN_APPROVED'
           where id = ${input.orderItemId} and status = 'RETURN_REQUESTED'
        `;
      }
      await this.outbox.emit(tx, 'RETURN_REQUESTED', {
        returnRequestId: existingRequest.id,
        returnReference: existingRequest.return_reference,
        orderId: item.order_id,
        userId: item.user_id,
        sellerId: item.seller_id,
        status: existingRequest.status,
        reasonCode: input.reasonCode,
        orderItemIds: [input.orderItemId],
        refundablePaise: Math.floor(
          (Number(item.total_payable_paise) * input.quantity) / item.quantity,
        ),
      });
      return request;
    });
  }

  async decide(returnRequestId: string, input: DecisionInput): Promise<Record<string, unknown>> {
    const principal = RequestContext.requirePrincipal();
    return this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [request] = await tx<
        Array<{
          id: string;
          return_reference: string;
          order_id: string;
          user_id: string;
          seller_id: string;
          reason_code: string;
          resolution_requested: string;
          status: string;
          refund_amount_paise: string | null;
        }>
      >`select id, return_reference, order_id, user_id, seller_id, reason_code, resolution_requested, status, refund_amount_paise::text from returns.return_requests where id = ${returnRequestId} for update`;
      if (!request) throw AppError.notFound('Return request');
      if (!['REQUESTED', 'PENDING_APPROVAL', 'AUTO_APPROVED'].includes(request.status))
        throw new AppError('CONFLICT', `Return is already ${request.status}`);

      await this.db.switchActor(tx, {
        actorId: principal.userId,
        actorType: principal.roles.some((role) => role.startsWith('SELLER_'))
          ? 'SELLER'
          : 'SUPPORT',
        requestId: RequestContext.requestId(),
        traceId: RequestContext.traceId(),
      });

      if (!input.approved) {
        await tx`
          update returns.return_requests
             set status = 'REJECTED', status_reason = ${input.reason}, rejection_reason = ${input.reason},
                 rejected_by = ${principal.userId}, rejected_at = now()
           where id = ${returnRequestId}
        `;
        await tx`
          update commerce.order_items oi
             set status = 'RETURN_REJECTED', status_reason = ${input.reason ?? 'Return rejected'}
           where oi.id in (select order_item_id from returns.return_items where return_request_id = ${returnRequestId})
             and oi.status = 'RETURN_REQUESTED'
        `;
        return { id: returnRequestId, status: 'REJECTED' };
      }

      await tx`
        update returns.return_requests
           set status = 'APPROVED', resolution_granted = ${request.resolution_requested},
               approved_by = ${principal.userId}, approved_at = now(), status_reason = ${input.reason ?? 'Approved'}
         where id = ${returnRequestId}
      `;
      await tx`
        update commerce.order_items
           set status = 'RETURN_APPROVED'
         where id in (select order_item_id from returns.return_items where return_request_id = ${returnRequestId})
           and status = 'RETURN_REQUESTED'
      `;
      await this.outbox.emit(tx, 'RETURN_APPROVED', {
        returnRequestId: request.id,
        returnReference: request.return_reference,
        orderId: request.order_id,
        userId: request.user_id,
        sellerId: request.seller_id,
        status: 'APPROVED',
        reasonCode: request.reason_code,
        orderItemIds: await this.itemIds(tx, request.id),
        refundablePaise: Number(request.refund_amount_paise ?? 0),
      });
      return { id: returnRequestId, status: 'APPROVED' };
    });
  }

  async receive(returnRequestId: string): Promise<Record<string, unknown>> {
    return this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [request] = await tx<
        Array<{ id: string; status: string }>
      >`select id, status from returns.return_requests where id = ${returnRequestId} for update`;
      if (!request) throw AppError.notFound('Return request');
      if (!['APPROVED', 'PICKUP_SCHEDULED', 'PICKED_UP', 'IN_TRANSIT'].includes(request.status))
        throw new AppError('CONFLICT', `Return is ${request.status}`);
      await tx`update returns.return_requests set status = 'RECEIVED', received_at = now(), status_reason = 'Received at return centre' where id = ${returnRequestId}`;
      // Carrier events are system transitions; the warehouse only owns the inspection.
      await this.db.switchActor(tx, {
        actorId: null,
        actorType: 'SYSTEM',
        requestId: RequestContext.requestId(),
        traceId: RequestContext.traceId(),
      });
      await tx`update commerce.order_items set status = 'RETURN_PICKED' where id in (select order_item_id from returns.return_items where return_request_id = ${returnRequestId}) and status = 'RETURN_APPROVED'`;
      await tx`update commerce.order_items set status = 'RETURN_RECEIVED' where id in (select order_item_id from returns.return_items where return_request_id = ${returnRequestId}) and status = 'RETURN_PICKED'`;
      return { id: returnRequestId, status: 'RECEIVED' };
    });
  }

  async inspect(returnRequestId: string, input: InspectionInput): Promise<Record<string, unknown>> {
    const principal = RequestContext.requirePrincipal();
    return this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [request] = await tx<
        Array<{
          id: string;
          return_reference: string;
          order_id: string;
          user_id: string;
          seller_id: string;
          status: string;
          reason_code: string;
          refund_amount_paise: string | null;
        }>
      >`select id, return_reference, order_id, user_id, seller_id, status, reason_code, refund_amount_paise::text from returns.return_requests where id = ${returnRequestId} for update`;
      if (!request) throw AppError.notFound('Return request');
      if (!['RECEIVED', 'QC_IN_PROGRESS'].includes(request.status))
        throw new AppError('CONFLICT', 'Return is not ready for quality inspection');
      if (input.outcome !== 'PASS' && !input.grade)
        throw AppError.validation([
          { field: 'grade', issue: 'A failed inspection requires a grade' },
        ]);
      if (input.deductionPaise > 0 && !input.deductionReason)
        throw AppError.validation([
          { field: 'deductionReason', issue: 'A deduction requires a reason' },
        ]);

      await this.db.switchActor(tx, {
        actorId: principal.userId,
        actorType: principal.roles.some((role) => role.startsWith('SELLER_'))
          ? 'SELLER'
          : 'WAREHOUSE',
        requestId: RequestContext.requestId(),
        traceId: RequestContext.traceId(),
      });

      await tx`
        insert into returns.return_inspections (
          return_request_id, warehouse_id, inspected_by, outcome, checklist,
          item_matches_order, original_packaging_present, all_accessories_present,
          serial_number_matches, physical_damage_found, usage_signs_found,
          counterfeit_suspected, grade, deduction_paise, deduction_reason, notes
        ) values (
          ${returnRequestId}, ${input.warehouseId ?? null}, ${principal.userId}, ${input.outcome},
          ${tx.json(input.checklist as never)}, ${input.itemMatchesOrder},
          ${input.originalPackagingPresent}, ${input.allAccessoriesPresent},
          ${input.serialNumberMatches ?? null}, ${input.physicalDamageFound},
          ${input.usageSignsFound}, ${input.counterfeitSuspected}, ${input.grade ?? null},
          ${input.deductionPaise}, ${input.deductionReason ?? null}, ${input.notes ?? null}
        ) on conflict (return_request_id) do update set outcome = excluded.outcome,
          checklist = excluded.checklist, grade = excluded.grade, deduction_paise = excluded.deduction_paise,
          deduction_reason = excluded.deduction_reason, notes = excluded.notes, inspected_by = excluded.inspected_by
      `;
      const nextStatus =
        input.outcome === 'PASS' || input.outcome === 'PARTIAL_PASS' ? 'QC_PASSED' : 'QC_FAILED';
      await tx`update returns.return_requests set status = ${nextStatus}, status_reason = ${input.notes ?? nextStatus} where id = ${returnRequestId}`;
      if (nextStatus === 'QC_PASSED') {
        await tx`
          update commerce.order_items oi
             set status = 'RETURN_QC_COMPLETED',
                 returned_quantity = returned_quantity + ri.quantity
            from returns.return_items ri
           where ri.return_request_id = ${returnRequestId} and ri.order_item_id = oi.id
        `;
      } else {
        await tx`
          update commerce.order_items oi
             set status = 'RETURN_QC_COMPLETED'
            from returns.return_items ri
           where ri.return_request_id = ${returnRequestId} and ri.order_item_id = oi.id and oi.status = 'RETURN_RECEIVED'
        `;
        await tx`
          update commerce.order_items oi
             set status = 'RETURN_REJECTED', status_reason = ${input.notes ?? 'Quality inspection failed'}
            from returns.return_items ri
           where ri.return_request_id = ${returnRequestId} and ri.order_item_id = oi.id and oi.status = 'RETURN_QC_COMPLETED'
        `;
      }
      if (
        nextStatus === 'QC_PASSED' &&
        request.refund_amount_paise &&
        Number(request.refund_amount_paise) > 0
      ) {
        const [intent] = await tx<
          Array<{ id: string }>
        >`select id from payments.payment_intents where order_id = ${request.order_id} and status = 'CAPTURED' order by created_at desc limit 1`;
        const [item] = await tx<
          Array<{ order_item_id: string; refundable_paise: string }>
        >`select order_item_id, refundable_paise::text from returns.return_items where return_request_id = ${returnRequestId} order by created_at limit 1`;
        if (intent && item) {
          const amount = Math.max(0, Number(request.refund_amount_paise) - input.deductionPaise);
          await tx`
            insert into payments.refunds (
              payment_intent_id, order_id, order_item_id, user_id, return_request_id,
              refund_type, reason_code, reason_notes, amount_paise, item_amount_paise,
              refund_mode, status, borne_by, initiated_by, initiated_by_type, idempotency_key
            ) values (
              ${intent.id}, ${request.order_id}, ${item.order_item_id}, ${request.user_id}, ${returnRequestId},
              'ITEM_RETURN', ${request.reason_code}, ${input.notes ?? 'Return inspection passed'},
              ${amount}, ${amount}, 'ORIGINAL_INSTRUMENT', 'PENDING', 'SELLER',
              ${principal.userId}, 'SUPPORT', ${`return:${returnRequestId}`}
            ) on conflict (idempotency_key) where idempotency_key is not null do nothing
          `;
          await tx`update returns.return_requests set status = 'REFUND_INITIATED', refund_amount_paise = ${amount} where id = ${returnRequestId}`;
          await this.db.switchActor(tx, {
            actorId: null,
            actorType: 'SYSTEM',
            requestId: RequestContext.requestId(),
            traceId: RequestContext.traceId(),
          });
          await tx`update commerce.order_items set status = 'REFUND_PENDING' where id in (select order_item_id from returns.return_items where return_request_id = ${returnRequestId}) and status = 'RETURN_QC_COMPLETED'`;
        }
      }
      await this.outbox.emit(tx, 'RETURN_RECEIVED', {
        returnRequestId: request.id,
        returnReference: request.return_reference,
        orderId: request.order_id,
        userId: request.user_id,
        sellerId: request.seller_id,
        status: nextStatus,
        reasonCode: request.reason_code,
        orderItemIds: await this.itemIds(tx, request.id),
        refundablePaise: Number(request.refund_amount_paise ?? 0),
      });
      return { id: returnRequestId, status: nextStatus };
    });
  }

  private async itemIds(tx: Tx, requestId: string): Promise<string[]> {
    const rows = await tx<
      Array<{ order_item_id: string }>
    >`select order_item_id from returns.return_items where return_request_id = ${requestId}`;
    return rows.map((row) => row.order_item_id);
  }
}
