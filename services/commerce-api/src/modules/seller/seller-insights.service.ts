import { Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import { RequestContext } from '../../common/context/request-context';
import { DatabaseService } from '../../infrastructure/database/database.service';

/** Seller-scoped read models used by Seller Center and the seller mobile app. */
@Injectable()
export class SellerInsightsService {
  constructor(private readonly db: DatabaseService) {}

  async performance(sellerId: string): Promise<Record<string, unknown>> {
    await this.assertSeller(sellerId);
    const [row] = await this.db.replica<Array<Record<string, unknown>>>`
      select s.id as seller_id, s.display_name, s.rating, s.rating_count, s.seller_score,
             s.status, sp.window_days, sp.orders_count, sp.units_sold, sp.gmv_paise::text,
             sp.on_time_dispatch_rate, sp.on_time_delivery_rate,
             sp.seller_cancellation_rate, sp.return_rate, sp.rto_rate, sp.defect_rate,
             sp.average_dispatch_hours, sp.average_rating, sp.negative_feedback_rate,
             sp.support_escalation_rate, sp.score, sp.tier, sp.computed_at
        from seller.sellers s
        left join seller.seller_performance sp on sp.seller_id = s.id
       where s.id = ${sellerId}
    `;
    if (!row) throw AppError.notFound('Seller');
    return row;
  }

  async returns(sellerId: string): Promise<Array<Record<string, unknown>>> {
    await this.assertSeller(sellerId);
    return this.db.replica<Array<Record<string, unknown>>>`
      select rr.id, rr.return_reference, rr.order_id, o.order_number, ri.order_item_id,
             rr.reason_code, rr.reason_details, rr.resolution_requested,
             rr.resolution_granted, rr.status, rr.refund_amount_paise::text,
             rr.created_at, rr.updated_at
        from returns.return_requests rr
        join commerce.orders o on o.id = rr.order_id
        left join returns.return_items ri on ri.return_request_id = rr.id
       where rr.seller_id = ${sellerId}
       order by rr.created_at desc
       limit 200
    `;
  }

  async promotions(sellerId: string): Promise<Array<Record<string, unknown>>> {
    await this.assertSeller(sellerId);
    return this.db.replica<Array<Record<string, unknown>>>`
      select distinct p.id, p.code, p.name, p.description, p.funded_by, p.promotion_type,
             p.discount_percentage, p.discount_paise::text, p.max_discount_paise::text,
             p.starts_at, p.ends_at, p.status, p.badge_text, p.terms_url
        from pricing.promotions p
        left join pricing.promotion_targets pt on pt.promotion_id = p.id
       where p.status in ('ACTIVE', 'SCHEDULED')
         and (p.funded_by = 'SELLER' and p.created_by = ${RequestContext.requirePrincipal().userId}
              or pt.target_type = 'SELLER' and pt.seller_id = ${sellerId})
       order by p.starts_at desc
    `;
  }

  async users(sellerId: string): Promise<Array<Record<string, unknown>>> {
    await this.assertSeller(sellerId);
    return this.db.replica<Array<Record<string, unknown>>>`
      select su.id, su.user_id, su.invited_email, su.invited_phone, su.role_code,
             su.status, su.accepted_at, su.invite_expires_at, su.created_at,
             p.full_name, p.email::text as email, p.phone
        from seller.seller_users su
        left join identity.profiles p on p.id = su.user_id
       where su.seller_id = ${sellerId} and su.status <> 'REMOVED'
       order by case when su.role_code = 'SELLER_OWNER' then 0 else 1 end, su.created_at
    `;
  }

  async salesReport(sellerId: string, days: number): Promise<Array<Record<string, unknown>>> {
    await this.assertSeller(sellerId);
    return this.db.replica<Array<Record<string, unknown>>>`
      select date_trunc('day', o.placed_at)::date as report_date,
             count(distinct o.id)::int as orders,
             sum(oi.quantity)::int as units,
             sum(b.total_payable_paise)::text as gmv_paise,
             sum(b.commission_paise + b.commission_gst_paise + b.platform_fee_paise
                 + b.payment_gateway_fee_paise + b.fulfillment_fee_paise)::text as fees_paise
        from commerce.orders o
        join commerce.order_items oi on oi.order_id = o.id and oi.seller_id = ${sellerId}
        join commerce.order_item_price_breakdowns b on b.order_item_id = oi.id
       where o.placed_at >= now() - (${days}::text || ' days')::interval
         and o.status not in ('CANCELLED', 'PAYMENT_FAILED')
       group by 1
       order by 1 desc
    `;
  }

  async warehouses(sellerId: string): Promise<Array<Record<string, unknown>>> {
    await this.assertSeller(sellerId);
    return this.db.replica<Array<Record<string, unknown>>>`
      select id, code, name, warehouse_type, address_line1, city, state_code, pincode,
             is_active, accepts_new_orders, operating_days, pickup_cutoff_time
        from inventory.warehouses
       where seller_id = ${sellerId}
       order by is_active desc, name
    `;
  }

  private async assertSeller(sellerId: string): Promise<void> {
    const principal = RequestContext.requirePrincipal();
    if (principal.roles.includes('ADMIN') || principal.roles.includes('SUPER_ADMIN')) return;
    if (!principal.sellerIds.includes(sellerId)) throw AppError.notFound('Seller');
  }
}
