import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  createAnswerSchema,
  createQuestionSchema,
  createReviewSchema,
  offsetPaginationSchema,
  reviewModerationSchema,
  reviewReportSchema,
  reviewVoteSchema,
  uuidSchema,
} from '@novamart/validation';
import { PERMISSIONS } from '@novamart/permissions';
import { Audit, Permissions, Public } from '../../common/decorators';
import { parse } from '../../common/validation';
import { ReviewsService } from './reviews.service';

const reviewListSchema = offsetPaginationSchema.extend({
  rating: z.coerce.number().int().min(1).max(5).optional(),
});

@Controller({ path: 'reviews', version: '1' })
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get('products/:productId')
  async list(@Param('productId') productId: string, @Query() query: Record<string, unknown>) {
    return this.reviews.list(parse(uuidSchema, productId), parse(reviewListSchema, query));
  }

  @Post()
  async create(@Body() body: unknown) {
    return this.reviews.create(parse(createReviewSchema, body));
  }

  @Post(':reviewId/vote')
  async vote(@Param('reviewId') reviewId: string, @Body() body: unknown) {
    return this.reviews.vote(parse(uuidSchema, reviewId), parse(reviewVoteSchema, body));
  }

  @Post(':reviewId/report')
  async report(@Param('reviewId') reviewId: string, @Body() body: unknown) {
    return this.reviews.report(parse(uuidSchema, reviewId), parse(reviewReportSchema, body));
  }

  @Permissions(PERMISSIONS.REVIEW_MODERATE)
  @Audit('review.moderate', 'review')
  @Post(':reviewId/moderate')
  async moderate(@Param('reviewId') reviewId: string, @Body() body: unknown) {
    return this.reviews.moderate(parse(uuidSchema, reviewId), parse(reviewModerationSchema, body));
  }

  @Public()
  @Get('products/:productId/questions')
  async questions(@Param('productId') productId: string) {
    return this.reviews.questions(parse(uuidSchema, productId));
  }

  @Post('questions')
  async ask(@Body() body: unknown) {
    return this.reviews.ask(parse(createQuestionSchema, body));
  }

  @Post('answers')
  async answer(@Body() body: unknown) {
    return this.reviews.answer(parse(createAnswerSchema, body));
  }
}
