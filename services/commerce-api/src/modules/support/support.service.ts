import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type {
  supportMessageSchema,
  supportTicketSchema,
  supportTicketUpdateSchema,
} from '@novamart/validation';
import { AppError } from '../../common/errors/app-error';
import { RequestContext } from '../../common/context/request-context';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';

type CreateTicketInput = z.infer<typeof supportTicketSchema>;
type MessageInput = z.infer<typeof supportMessageSchema>;
type UpdateInput = z.infer<typeof supportTicketUpdateSchema>;

@Injectable()
export class SupportService {
  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: OutboxService,
  ) {}

  async categories(): Promise<Array<Record<string, unknown>>> {
    return this.db.sql<Array<Record<string, unknown>>>`
      select id, code, name, audience, requires_order, default_queue, display_order
        from support.ticket_categories where is_active order by display_order, name
    `;
  }

  async help(
    audience: string = 'CUSTOMER',
    locale: string = 'en-IN',
  ): Promise<Array<Record<string, unknown>>> {
    return this.db.sql<Array<Record<string, unknown>>>`
      select id, slug, title, summary, body_html, audience, locale, tags,
             seo_title, seo_description, view_count, helpful_count, not_helpful_count
        from support.help_articles
       where status = 'PUBLISHED' and locale = ${locale}
         and (audience = ${audience} or audience = 'ALL')
       order by display_order, title
    `;
  }

  async list(): Promise<Array<Record<string, unknown>>> {
    const principal = RequestContext.requirePrincipal();
    return this.db.sql<Array<Record<string, unknown>>>`
      select t.id, t.ticket_reference, t.requester_type, t.subject, t.status, t.priority,
             t.queue, t.assigned_to, t.order_id, t.order_item_id, t.message_count,
             t.first_response_due_at, t.resolution_due_at, t.escalation_level,
             t.created_at, t.updated_at
        from support.support_tickets t
       where t.requester_id = ${principal.userId}
          or t.assigned_to = ${principal.userId}
          or t.seller_id = any(${principal.sellerIds}::uuid[])
       order by t.updated_at desc
    `;
  }

  async detail(ticketId: string): Promise<Record<string, unknown>> {
    const principal = RequestContext.requirePrincipal();
    const [ticket] = await this.db.sql<Array<Record<string, unknown>>>`
      select t.* from support.support_tickets t
       where t.id = ${ticketId}
         and (t.requester_id = ${principal.userId} or t.assigned_to = ${principal.userId} or t.seller_id = any(${principal.sellerIds}::uuid[]))
    `;
    if (!ticket) throw AppError.notFound('Support ticket');
    const messages = await this.db.sql<Array<Record<string, unknown>>>`
      select id, sender_type, sender_id, sender_name, body, is_internal, created_at
        from support.support_messages where ticket_id = ${ticketId}
         and (not is_internal or ${this.isStaff()})
       order by created_at
    `;
    const history = await this.db.sql<Array<Record<string, unknown>>>`
      select from_status, to_status, from_assignee, to_assignee, reason, actor_id, occurred_at
        from support.ticket_status_history where ticket_id = ${ticketId} order by occurred_at desc
    `;
    return { ticket, messages, history };
  }

  async create(input: CreateTicketInput): Promise<Record<string, unknown>> {
    const principal = RequestContext.requirePrincipal();
    const [category] = await this.db.sql<
      Array<{ id: string; default_queue: string; sla_policy_id: string | null }>
    >`
      select id, default_queue, sla_policy_id from support.ticket_categories
       where id = ${input.categoryId ?? null}::uuid and is_active
    `;
    if (input.categoryId && !category) throw AppError.notFound('Ticket category');
    const [ticket] = await this.db.transaction(
      RequestContext.sessionContext(),
      async (tx) => tx<Array<Record<string, unknown>>>`
      insert into support.support_tickets (
        requester_type, requester_id, category_id, subject, description,
        order_id, order_item_id, return_request_id, shipment_id, payment_intent_id,
        status, priority, queue, sla_policy_id, first_response_due_at, resolution_due_at, channel
      )
      select 'CUSTOMER', ${principal.userId}, ${input.categoryId ?? null}, ${input.subject}, ${input.description},
             ${input.orderId ?? null}, ${input.orderItemId ?? null}, ${input.returnRequestId ?? null},
             ${input.shipmentId ?? null}, ${input.paymentIntentId ?? null}, 'OPEN', 'NORMAL',
             ${category?.default_queue ?? 'GENERAL'}, ${category?.sla_policy_id ?? null},
             case when sp.id is null then null else now() + (sp.first_response_minutes || ' minutes')::interval end,
             case when sp.id is null then null else now() + (sp.resolution_minutes || ' minutes')::interval end,
             ${input.channel}
        from (select ${category?.sla_policy_id ?? null}::uuid as policy_id) p
        left join support.sla_policies sp on sp.id = p.policy_id
      returning id, ticket_reference, status, priority, queue, created_at
    `,
    );
    if (!ticket) throw new AppError('INTERNAL_ERROR', 'Ticket was not created');
    return ticket;
  }

  async message(ticketId: string, input: MessageInput): Promise<Record<string, unknown>> {
    const principal = RequestContext.requirePrincipal();
    const [ticket] = await this.db.sql<
      Array<{ id: string; requester_id: string | null; seller_id: string | null }>
    >`select id, requester_id, seller_id from support.support_tickets where id = ${ticketId}`;
    if (!ticket) throw AppError.notFound('Support ticket');
    const isStaff = this.isStaff();
    if (
      !isStaff &&
      ticket.requester_id !== principal.userId &&
      !principal.sellerIds.includes(ticket.seller_id ?? '')
    )
      throw AppError.notFound('Support ticket');
    if (input.isInternal && !isStaff)
      throw AppError.forbidden('Only support staff can add internal notes');
    const senderType = isStaff
      ? 'AGENT'
      : principal.sellerIds.includes(ticket.seller_id ?? '')
        ? 'SELLER'
        : 'CUSTOMER';
    const [message] = await this.db.transaction(
      RequestContext.sessionContext(),
      async (tx) => tx<Array<Record<string, unknown>>>`
      insert into support.support_messages (ticket_id, sender_type, sender_id, body, is_internal, macro_id)
      values (${ticketId}, ${senderType}, ${principal.userId}, ${input.body}, ${input.isInternal}, ${input.macroId ?? null})
      returning id, ticket_id, sender_type, body, is_internal, created_at
    `,
    );
    if (!message) throw new AppError('INTERNAL_ERROR', 'Message was not created');
    return message;
  }

  async update(ticketId: string, input: UpdateInput): Promise<Record<string, unknown>> {
    const principal = RequestContext.requirePrincipal();
    const isStaff = this.isStaff();
    const [current] = await this.db.sql<
      Array<{
        id: string;
        requester_id: string | null;
        status: string;
        resolution_code: string | null;
      }>
    >`select id, requester_id, status, resolution_code from support.support_tickets where id = ${ticketId}`;
    if (!current) throw AppError.notFound('Support ticket');
    if (!isStaff && current.requester_id !== principal.userId)
      throw AppError.notFound('Support ticket');
    if (!isStaff && input.status && !['OPEN', 'REOPENED', 'CLOSED'].includes(input.status))
      throw AppError.forbidden('Customers may only reopen or close their own tickets');
    if (
      input.status &&
      ['RESOLVED', 'CLOSED'].includes(input.status) &&
      !input.resolutionCode &&
      !current.resolution_code
    )
      throw AppError.validation([
        { field: 'resolutionCode', issue: 'A resolution code is required' },
      ]);

    const [row] = await this.db.transaction(
      RequestContext.sessionContext(),
      async (tx) => tx<Array<Record<string, unknown>>>`
      update support.support_tickets
         set status = coalesce(${input.status ?? null}, status),
             priority = coalesce(${input.priority ?? null}, priority),
             assigned_to = case when ${input.assignedTo === undefined} then assigned_to else ${input.assignedTo ?? null} end,
             assigned_team = coalesce(${input.assignedTeam ?? null}, assigned_team),
             resolution_code = coalesce(${input.resolutionCode ?? null}, resolution_code),
             resolution_notes = coalesce(${input.resolutionNotes ?? null}, resolution_notes),
             csat_score = coalesce(${input.csatScore ?? null}, csat_score),
             csat_comment = coalesce(${input.csatComment ?? null}, csat_comment),
             resolved_at = case when ${input.status ?? null} in ('RESOLVED', 'CLOSED') then coalesce(resolved_at, now()) else resolved_at end,
             closed_at = case when ${input.status ?? null} = 'CLOSED' then coalesce(closed_at, now()) else closed_at end,
             escalated_at = case when ${input.status ?? null} = 'ESCALATED' then coalesce(escalated_at, now()) else escalated_at end,
             escalation_level = case when ${input.status ?? null} = 'ESCALATED' then least(escalation_level + 1, 3) else escalation_level end,
             escalation_reason = coalesce(${input.reason ?? null}, escalation_reason)
       where id = ${ticketId}
      returning id, ticket_reference, status, priority, assigned_to, resolution_code, updated_at
    `,
    );
    return row ?? {};
  }

  private isStaff(): boolean {
    const roles = RequestContext.requirePrincipal().roles;
    return roles.some((role) =>
      ['SUPPORT_AGENT', 'SUPPORT_MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(role),
    );
  }
}
