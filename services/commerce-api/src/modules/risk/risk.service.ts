import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type { riskEventSchema } from '@novamart/validation';
import { AppError } from '../../common/errors/app-error';
import { RequestContext } from '../../common/context/request-context';
import { DatabaseService } from '../../infrastructure/database/database.service';

type RiskInput = z.infer<typeof riskEventSchema>;

@Injectable()
export class RiskService {
  constructor(private readonly db: DatabaseService) {}

  async rules(): Promise<Array<Record<string, unknown>>> {
    return this.db.sql<Array<Record<string, unknown>>>`
      select id, code, name, description, category, subject_type, conditions,
             score_weight, action, severity, is_shadow_mode, is_active,
             trigger_count_24h, false_positive_count, updated_at
        from analytics.fraud_rules order by category, code
    `;
  }

  async events(subjectId?: string): Promise<Array<Record<string, unknown>>> {
    return this.db.sql<Array<Record<string, unknown>>>`
      select id, rule_code, category, severity, subject_type, subject_id, subject_key,
             user_id, seller_id, order_id, score_contribution, evidence, action_taken,
             was_shadow_mode, occurred_at
        from analytics.risk_events
       where ${subjectId ?? null}::uuid is null or subject_id = ${subjectId ?? null}
       order by occurred_at desc limit 200
    `;
  }

  async record(input: RiskInput): Promise<Record<string, unknown>> {
    const principal = RequestContext.requirePrincipal();
    const subjectKey = input.subjectId ?? input.userId ?? input.sellerId ?? input.orderId;
    if (!subjectKey)
      throw AppError.validation([
        { field: 'subjectId', issue: 'A subject identifier is required' },
      ]);
    const [row] = await this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [event] = await tx<Array<Record<string, unknown>>>`
        insert into analytics.risk_events (
          rule_code, category, severity, subject_type, subject_id, subject_key,
          user_id, seller_id, order_id, score_contribution, evidence,
          action_taken, was_shadow_mode, ip_address, device_id, request_id, trace_id
        ) values (${input.ruleCode}, ${input.category}, ${input.severity}, ${input.subjectType},
                  ${input.subjectId ?? null}, ${subjectKey}, ${input.userId ?? null},
                  ${input.sellerId ?? null}, ${input.orderId ?? null}, ${input.scoreDelta},
                  ${tx.json(input.evidence as never)}, 'FLAG', false,
                  ${RequestContext.get()?.ip ?? null}, ${RequestContext.get()?.deviceId ?? null},
                  ${RequestContext.requestId()}, ${RequestContext.traceId()})
        returning id, rule_code, subject_type, subject_key, score_contribution, occurred_at
      `;
      await tx`
        insert into analytics.risk_scores (subject_type, subject_id, subject_key, score, tier, last_event_at)
        values (${input.subjectType}, ${input.subjectId ?? null}, ${subjectKey}, ${input.scoreDelta}, ${this.tier(input.scoreDelta)}, now())
        on conflict (subject_type, subject_key) do update set
          score = analytics.risk_scores.score + excluded.score,
          tier = ${this.tier(input.scoreDelta)}, last_event_at = now(), computed_at = now()
      `;
      return [event];
    });
    void principal;
    return row ?? {};
  }

  async scores(): Promise<Array<Record<string, unknown>>> {
    return this.db.sql<Array<Record<string, unknown>>>`
      select subject_type, subject_id, subject_key, score, tier, restrictions,
             cod_orders_count, cod_rto_count, cancellation_count_90d, return_count_90d,
             refund_count_90d, failed_payment_count_7d, last_event_at, updated_at
        from analytics.risk_scores order by score desc limit 500
    `;
  }

  async cases(): Promise<Array<Record<string, unknown>>> {
    return this.db.sql<Array<Record<string, unknown>>>`
      select id, case_reference, category, priority, status, subject_type, subject_id,
             subject_key, user_id, seller_id, triggering_event_ids, total_score,
             estimated_loss_paise::text, summary, assigned_to, opened_at, updated_at
        from analytics.fraud_cases order by opened_at desc limit 200
    `;
  }

  async openCase(input: {
    category: string;
    priority: string;
    subjectType: string;
    subjectId?: string;
    summary: string;
    estimatedLossPaise?: number;
  }): Promise<Record<string, unknown>> {
    const principal = RequestContext.requirePrincipal();
    const [row] = await this.db.sql<Array<Record<string, unknown>>>`
      insert into analytics.fraud_cases (
        category, priority, subject_type, subject_id, subject_key, summary,
        estimated_loss_paise, opened_by
      ) values (${input.category}, ${input.priority}, ${input.subjectType}, ${input.subjectId ?? null},
                ${input.subjectId ?? `manual:${Date.now()}`}, ${input.summary},
                ${input.estimatedLossPaise ?? null}, ${principal.userId})
      returning id, case_reference, category, priority, status, summary, opened_at
    `;
    return row ?? {};
  }

  async resolveCase(
    caseId: string,
    outcome: string,
    reason: string,
  ): Promise<Record<string, unknown>> {
    const principal = RequestContext.requirePrincipal();
    const [row] = await this.db.sql<Array<Record<string, unknown>>>`
      update analytics.fraud_cases
         set status = ${outcome === 'CONFIRMED_FRAUD' ? 'CONFIRMED_FRAUD' : outcome === 'FALSE_POSITIVE' ? 'FALSE_POSITIVE' : 'RESOLVED'},
             outcome = ${outcome}, outcome_reason = ${reason}, resolved_by = ${principal.userId}, resolved_at = now()
       where id = ${caseId}
      returning id, case_reference, status, outcome, outcome_reason, resolved_at
    `;
    if (!row) throw AppError.notFound('Fraud case');
    return row;
  }

  private tier(score: number): string {
    if (score >= 80) return 'BLOCKED';
    if (score >= 50) return 'HIGH';
    if (score >= 25) return 'ELEVATED';
    if (score <= -25) return 'TRUSTED';
    return 'STANDARD';
  }
}
