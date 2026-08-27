import { Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import { RequestContext } from '../../common/context/request-context';
import { DatabaseService } from '../../infrastructure/database/database.service';

@Injectable()
export class AdminOperationsService {
  constructor(private readonly db: DatabaseService) {}

  async dashboard(): Promise<Record<string, unknown>> {
    const [today, month, queues] = await Promise.all([
      this.db.replica<Array<Record<string, unknown>>>`select * from analytics.daily_metrics where metric_date = current_date`,
      this.db.replica<Array<Record<string, unknown>>>`select coalesce(sum(orders_placed), 0)::int as orders, coalesce(sum(gmv_paise), 0)::text as gmv, coalesce(sum(commission_paise), 0)::text as commission from analytics.daily_metrics where metric_date >= date_trunc('month', current_date)::date`,
      this.db.replica<Array<Record<string, unknown>>>`select (select count(*) from seller.sellers where status in ('UNDER_REVIEW', 'ACTION_REQUIRED'))::int as seller_queue, (select count(*) from returns.return_requests where status in ('REQUESTED', 'PENDING_APPROVAL', 'RECEIVED'))::int as return_queue, (select count(*) from support.support_tickets where status not in ('RESOLVED', 'CLOSED'))::int as support_queue, (select count(*) from payments.refunds where status in ('PENDING', 'APPROVAL_REQUIRED', 'PROCESSING'))::int as refund_queue`,
    ]);
    return { today: today[0] ?? null, month: month[0] ?? null, queues: queues[0] ?? null };
  }

  async customers(query: { search?: string; limit: number; offset: number }): Promise<Array<Record<string, unknown>>> {
    return this.db.replica<Array<Record<string, unknown>>>`
      select p.id, p.email::text, p.phone_e164, p.full_name, p.account_status,
             p.created_at, p.last_seen_at,
             (select count(*)::int from commerce.orders o where o.user_id = p.id) as order_count,
             (select count(*)::int from analytics.risk_scores rs where rs.subject_type = 'USER' and rs.subject_id = p.id) as risk_records
        from identity.profiles p
       where (${query.search ?? null}::text is null or p.full_name ilike ${`%${query.search ?? ''}%`} or p.email::text ilike ${`%${query.search ?? ''}%`})
       order by p.created_at desc limit ${query.limit} offset ${query.offset}
    `;
  }

  async catalog(query: { status?: string; limit: number; offset: number }): Promise<Array<Record<string, unknown>>> {
    return this.db.replica<Array<Record<string, unknown>>>`
      select p.id, p.public_id, p.slug, p.title, p.status, p.moderation_status,
             p.created_at, p.updated_at, b.name as brand_name, c.path as category_path,
             (select count(*)::int from catalog.seller_listings l where l.product_id = p.id and l.archived_at is null) as listing_count
        from catalog.products p
        left join catalog.brands b on b.id = p.brand_id
        left join catalog.categories c on c.id = p.category_id
       where (${query.status ?? null}::text is null or p.moderation_status = ${query.status ?? null})
       order by p.updated_at desc limit ${query.limit} offset ${query.offset}
    `;
  }

  async orders(query: { status?: string; limit: number; offset: number }): Promise<Array<Record<string, unknown>>> {
    return this.db.replica<Array<Record<string, unknown>>>`
      select o.id, o.order_number, o.user_id, o.status, o.fulfillment_summary,
             o.payment_status, o.payment_method, o.items_count, o.sellers_count,
             o.total_payable_paise::text, o.amount_paid_paise::text, o.amount_refunded_paise::text,
             o.delivery_pincode, o.placed_at
        from commerce.orders o
       where (${query.status ?? null}::text is null or o.status = ${query.status ?? null})
       order by o.placed_at desc limit ${query.limit} offset ${query.offset}
    `;
  }

  async payments(query: { status?: string; limit: number; offset: number }): Promise<Array<Record<string, unknown>>> {
    return this.db.replica<Array<Record<string, unknown>>>`
      select pi.id, pi.order_id, o.order_number, pi.provider, pi.provider_intent_id,
             pi.status, pi.amount_paise::text, pi.captured_paise::text, pi.refunded_paise::text,
             pi.created_at, pi.updated_at
        from payments.payment_intents pi join commerce.orders o on o.id = pi.order_id
       where (${query.status ?? null}::text is null or pi.status = ${query.status ?? null})
       order by pi.created_at desc limit ${query.limit} offset ${query.offset}
    `;
  }

  async refunds(query: { status?: string; limit: number; offset: number }): Promise<Array<Record<string, unknown>>> {
    return this.db.replica<Array<Record<string, unknown>>>`
      select r.id, r.refund_reference, r.order_id, o.order_number, r.user_id,
             r.order_item_id, r.amount_paise::text, r.refund_type, r.status,
             r.failure_code, r.created_at, r.completed_at
        from payments.refunds r join commerce.orders o on o.id = r.order_id
       where (${query.status ?? null}::text is null or r.status = ${query.status ?? null})
       order by r.created_at desc limit ${query.limit} offset ${query.offset}
    `;
  }

  async returns(query: { status?: string; limit: number; offset: number }): Promise<Array<Record<string, unknown>>> {
    return this.db.replica<Array<Record<string, unknown>>>`
      select rr.id, rr.return_reference, rr.order_id, o.order_number, rr.user_id,
             rr.seller_id, s.display_name as seller_name, rr.reason_code, rr.status,
             rr.resolution_requested, rr.refund_amount_paise::text, rr.created_at
        from returns.return_requests rr join commerce.orders o on o.id = rr.order_id
        join seller.sellers s on s.id = rr.seller_id
       where (${query.status ?? null}::text is null or rr.status = ${query.status ?? null})
       order by rr.created_at desc limit ${query.limit} offset ${query.offset}
    `;
  }

  async logistics(query: { status?: string; limit: number; offset: number }): Promise<Array<Record<string, unknown>>> {
    return this.db.replica<Array<Record<string, unknown>>>`
      select sh.id, sh.shipment_reference, sh.order_id, o.order_number, sh.seller_id,
             s.display_name as seller_name, sh.warehouse_id, w.name as warehouse_name,
             sh.awb_number, sh.status, sh.delivery_pincode, sh.promised_delivery_date,
             sh.created_at, sh.updated_at
        from fulfillment.shipments sh join commerce.orders o on o.id = sh.order_id
        join seller.sellers s on s.id = sh.seller_id join inventory.warehouses w on w.id = sh.warehouse_id
       where (${query.status ?? null}::text is null or sh.status = ${query.status ?? null})
       order by sh.created_at desc limit ${query.limit} offset ${query.offset}
    `;
  }

  async inventory(query: { limit: number; offset: number }): Promise<Array<Record<string, unknown>>> {
    return this.db.replica<Array<Record<string, unknown>>>`
      select wi.id, wi.seller_id, s.display_name as seller_name, wi.warehouse_id,
             w.code as warehouse_code, w.name as warehouse_name, sk.sku_code,
             p.title as product_title, wi.available_quantity, wi.reserved_quantity,
             wi.damaged_quantity, wi.blocked_quantity, wi.in_transit_quantity,
             wi.physical_quantity, wi.reorder_point, wi.reorder_quantity, wi.updated_at
        from inventory.warehouse_inventory wi
        join inventory.warehouses w on w.id = wi.warehouse_id
        join seller.sellers s on s.id = wi.seller_id
        join catalog.skus sk on sk.id = wi.sku_id
        join catalog.products p on p.id = sk.product_id
       order by wi.updated_at desc
       limit ${query.limit} offset ${query.offset}
    `;
  }

  async reviewQueue(limit: number): Promise<Array<Record<string, unknown>>> {
    return this.db.replica<Array<Record<string, unknown>>>`select id, product_id, user_id, rating, title, body, status, report_count, created_at from commerce.reviews where status in ('PENDING_MODERATION', 'FLAGGED') order by report_count desc, created_at limit ${limit}`;
  }

  async supportQueue(limit: number): Promise<Array<Record<string, unknown>>> {
    return this.db.replica<Array<Record<string, unknown>>>`select id, ticket_reference, requester_type, requester_id, subject, status, priority, queue, assigned_to, first_response_due_at, resolution_due_at, created_at from support.support_tickets where status not in ('RESOLVED', 'CLOSED') order by case priority when 'URGENT' then 0 when 'HIGH' then 1 else 2 end, created_at limit ${limit}`;
  }

  async finance(): Promise<Record<string, unknown>> {
    const [row] = await this.db.replica<Array<Record<string, unknown>>>`select count(distinct seller_id)::int as sellers, coalesce(sum(amount_paise) filter (where amount_paise > 0), 0)::text as credits, coalesce(sum(amount_paise) filter (where amount_paise < 0), 0)::text as debits, coalesce(sum(amount_paise), 0)::text as net from finance.seller_ledger`;
    return row ?? {};
  }

  async audit(limit: number): Promise<Array<Record<string, unknown>>> {
    return this.db.replica<Array<Record<string, unknown>>>`select id, actor_id, actor_type, action, resource_type, resource_id, request_id, trace_id, ip_address, occurred_at from audit.audit_logs order by occurred_at desc limit ${limit}`;
  }

  async updateCustomerStatus(customerId: string, status: 'ACTIVE' | 'SUSPENDED' | 'DELETED', reason: string): Promise<Record<string, unknown>> {
    const [row] = await this.db.transaction(RequestContext.sessionContext(), async (tx) =>
      tx<Array<Record<string, unknown>>>`update identity.profiles set account_status = ${status}, status_reason = ${status === 'ACTIVE' ? null : reason}, status_changed_by = ${RequestContext.requirePrincipal().userId}, status_changed_at = now() where id = ${customerId} returning id, account_status, status_reason, status_changed_at`,
    );
    if (!row) throw AppError.notFound('Customer');
    return row;
  }
}
