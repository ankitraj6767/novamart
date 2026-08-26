import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type {
  createAnswerSchema,
  createQuestionSchema,
  createReviewSchema,
  reviewModerationSchema,
  reviewReportSchema,
  reviewVoteSchema,
} from '@novamart/validation';
import { AppError } from '../../common/errors/app-error';
import { RequestContext } from '../../common/context/request-context';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';

type ReviewInput = z.infer<typeof createReviewSchema>;
type QuestionInput = z.infer<typeof createQuestionSchema>;
type AnswerInput = z.infer<typeof createAnswerSchema>;
type ModerationInput = z.infer<typeof reviewModerationSchema>;
type VoteInput = z.infer<typeof reviewVoteSchema>;
type ReportInput = z.infer<typeof reviewReportSchema>;

@Injectable()
export class ReviewsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: OutboxService,
  ) {}

  async list(
    productId: string,
    query: { limit: number; offset: number; rating?: number },
  ): Promise<Record<string, unknown>> {
    const ratingFilter = query.rating ?? null;
    const reviews = await this.db.sql<Array<Record<string, unknown>>>`
      select r.id, r.product_id, r.user_id, r.rating, r.title, r.body,
             r.seller_rating, r.is_verified_purchase, r.status, r.helpful_count,
             r.not_helpful_count, r.report_count, r.created_at, r.seller_response,
             coalesce(jsonb_agg(jsonb_build_object(
               'mediaType', rm.media_type, 'path', rm.storage_path, 'url', rm.public_url,
               'moderationStatus', rm.moderation_status
             ) order by rm.display_order) filter (where rm.id is not null), '[]'::jsonb) as media
        from commerce.reviews r
        left join commerce.review_media rm on rm.review_id = r.id and rm.moderation_status = 'APPROVED'
       where r.product_id = ${productId} and r.status = 'PUBLISHED'
         and (${ratingFilter}::smallint is null or r.rating = ${ratingFilter})
       group by r.id
       order by r.helpful_count desc, r.created_at desc
       limit ${query.limit} offset ${query.offset}
    `;
    const [summary] = await this.db.sql<Array<Record<string, unknown>>>`
      select average_rating, rating_count, review_count, verified_review_count,
             count_1_star, count_2_star, count_3_star, count_4_star, count_5_star,
             ranking_score, media_count, updated_at
        from commerce.product_rating_summary where product_id = ${productId}
    `;
    return { summary: summary ?? { average_rating: 0, rating_count: 0 }, items: reviews };
  }

  async create(input: ReviewInput): Promise<Record<string, unknown>> {
    const userId = RequestContext.requirePrincipal().userId;
    return this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [review] = await tx<Array<Record<string, unknown>>>`
        insert into commerce.reviews (
          product_id, user_id, order_item_id, rating, seller_rating, title, body,
          locale, status, device_id
        ) values (
          ${input.productId}, ${userId}, ${input.orderItemId ?? null}, ${input.rating},
          ${input.sellerRating ?? null}, ${input.title ?? null}, ${input.body ?? null},
          ${RequestContext.get()?.locale ?? 'en-IN'}, 'PENDING_MODERATION',
          ${RequestContext.get()?.deviceId ?? null}
        ) returning id, product_id, rating, status, is_verified_purchase, seller_id, created_at
      `;
      if (!review) throw new AppError('INTERNAL_ERROR', 'Review was not created');
      for (const [index, path] of input.mediaPaths.entries()) {
        await tx`
          insert into commerce.review_media (
            review_id, media_type, storage_path, public_url, mime_type, file_size_bytes, display_order
          ) values (${review['id']}, 'IMAGE', ${path}, ${path}, 'image/jpeg', 1, ${index})
        `;
      }
      return review;
    });
  }

  async vote(reviewId: string, input: VoteInput): Promise<Record<string, unknown>> {
    const userId = RequestContext.requirePrincipal().userId;
    await this.db.sql`
      insert into commerce.review_votes (review_id, user_id, is_helpful)
      values (${reviewId}, ${userId}, ${input.isHelpful})
      on conflict (review_id, user_id) do update set is_helpful = excluded.is_helpful
    `;
    const [review] = await this.db.sql<Array<Record<string, unknown>>>`
      select id, helpful_count, not_helpful_count from commerce.reviews where id = ${reviewId}
    `;
    if (!review) throw AppError.notFound('Review');
    return review;
  }

  async report(reviewId: string, input: ReportInput): Promise<{ reported: true }> {
    const userId = RequestContext.requirePrincipal().userId;
    await this.db.sql`
      insert into commerce.review_reports (review_id, reported_by, reason, details)
      values (${reviewId}, ${userId}, ${input.reason}, ${input.details ?? null})
      on conflict (review_id, reported_by) do nothing
    `;
    return { reported: true };
  }

  async moderate(reviewId: string, input: ModerationInput): Promise<Record<string, unknown>> {
    const principal = RequestContext.requirePrincipal();
    return this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [review] = await tx<
        Array<{
          id: string;
          product_id: string;
          user_id: string;
          seller_id: string | null;
          rating: number;
          is_verified_purchase: boolean;
          status: string;
        }>
      >`select id, product_id, user_id, seller_id, rating, is_verified_purchase, status from commerce.reviews where id = ${reviewId} for update`;
      if (!review) throw AppError.notFound('Review');
      await tx`
        update commerce.reviews
           set status = ${input.status}, moderation_reason = ${input.reason ?? null},
               moderated_by = ${principal.userId}, moderated_at = now()
         where id = ${reviewId}
      `;
      if (input.status === 'PUBLISHED') {
        await this.outbox.emit(tx, 'REVIEW_PUBLISHED', {
          reviewId: review.id,
          productId: review.product_id,
          userId: review.user_id,
          sellerId: review.seller_id,
          rating: review.rating,
          isVerifiedPurchase: review.is_verified_purchase,
        });
      }
      return { id: reviewId, status: input.status };
    });
  }

  async questions(productId: string): Promise<Array<Record<string, unknown>>> {
    return this.db.sql<Array<Record<string, unknown>>>`
      select q.id, q.product_id, q.body, q.answer_count, q.upvote_count, q.is_featured,
             q.created_at,
             coalesce(jsonb_agg(jsonb_build_object(
               'id', a.id, 'body', a.body, 'answererType', a.answerer_type,
               'isVerifiedBuyer', a.is_verified_buyer, 'upvoteCount', a.upvote_count,
               'downvoteCount', a.downvote_count, 'createdAt', a.created_at
             ) order by a.upvote_count desc, a.created_at) filter (where a.id is not null), '[]'::jsonb) as answers
        from commerce.product_questions q
        left join commerce.product_answers a on a.question_id = q.id and a.status = 'PUBLISHED'
       where q.product_id = ${productId} and q.status = 'PUBLISHED'
       group by q.id order by q.is_featured desc, q.upvote_count desc, q.created_at desc
    `;
  }

  async ask(input: QuestionInput): Promise<Record<string, unknown>> {
    const userId = RequestContext.requirePrincipal().userId;
    const [row] = await this.db.sql<Array<Record<string, unknown>>>`
      insert into commerce.product_questions (product_id, user_id, body)
      values (${input.productId}, ${userId}, ${input.body})
      returning id, product_id, body, status, created_at
    `;
    if (!row) throw new AppError('INTERNAL_ERROR', 'Question was not created');
    return row;
  }

  async answer(input: AnswerInput): Promise<Record<string, unknown>> {
    const userId = RequestContext.requirePrincipal().userId;
    const [row] = await this.db.sql<Array<Record<string, unknown>>>`
      insert into commerce.product_answers (question_id, user_id, body, answerer_type)
      select ${input.questionId}, ${userId}, ${input.body}, 'CUSTOMER'
       where exists (select 1 from commerce.product_questions where id = ${input.questionId})
      returning id, question_id, body, status, created_at
    `;
    if (!row) throw AppError.notFound('Question');
    return row;
  }
}
