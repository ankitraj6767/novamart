import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import type { ApiError } from '@novamart/types';
import { AppError } from '../errors/app-error';
import { RequestContext } from '../context/request-context';

/**
 * The single place an exception becomes an HTTP response.
 *
 * Clients get a stable error code and a safe message. Stack traces, SQL, provider
 * payloads and internal identifiers stay in the logs, correlated by requestId
 * (docs/API_CONVENTIONS.md §2).
 */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('ErrorFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const requestId = RequestContext.requestId();
    const appError = this.normalise(exception);

    const body: ApiError = {
      success: false,
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.details ? { details: appError.details } : {}),
      },
      requestId,
    };

    const logPayload = {
      requestId,
      traceId: RequestContext.traceId(),
      userId: RequestContext.userId(),
      code: appError.code,
      status: appError.status,
      ...appError.context,
    };

    if (appError.status >= 500) {
      // An Error instance JSON-serialises to {}, so name/message/stack are lifted out
      // explicitly. A 500 log that says nothing is the same as no log at all.
      const cause = appError.cause ?? appError;
      const detail =
        cause instanceof Error
          ? { errName: cause.name, errMessage: cause.message, stack: cause.stack }
          : { errValue: this.safeStringify(cause) };

      // Postgres attaches these, and they are usually the whole answer.
      const pg = cause as {
        code?: string;
        detail?: string;
        hint?: string;
        constraint?: string;
        table?: string;
        schema?: string;
        routine?: string;
        where?: string;
      };
      const pgDetail =
        typeof pg?.code === 'string'
          ? {
            sqlstate: pg.code,
            pgDetail: pg.detail,
            pgHint: pg.hint,
            pgConstraint: pg.constraint,
            pgTable: pg.schema ? `${pg.schema}.${pg.table}` : pg.table,
            pgRoutine: pg.routine,
            pgWhere: pg.where,
          }
          : {};

      this.logger.error({ ...logPayload, ...detail, ...pgDetail }, appError.message);
    } else if (appError.status === 429 || appError.status === 423) {
      this.logger.warn(logPayload, appError.message);
    } else {
      this.logger.debug(logPayload, appError.message);
    }

    void reply.status(appError.status).send(body);
  }

  /** Never let logging itself throw on a circular or exotic value. */
  private safeStringify(value: unknown): string {
    try {
      return typeof value === 'string' ? value : JSON.stringify(value) ?? String(value);
    } catch {
      return String(value);
    }
  }

  private normalise(exception: unknown): AppError {
    if (exception instanceof AppError) return exception;

    if (exception instanceof ZodError) {
      return AppError.validation(
        exception.issues.map((issue) => ({
          field: issue.path.join('.') || undefined,
          issue: issue.message,
        })),
      );
    }

    const maybeCode = (exception as { code?: unknown }).code;

    /**
     * Fastify request-parsing failures are the client's fault, not ours, so they must
     * not surface as 500s.
     *
     * The common one is a POST with `Content-Type: application/json` and no body: plenty
     * of HTTP clients set the header unconditionally, and several endpoints here take no
     * body at all. Fastify raises FST_ERR_CTP_EMPTY_JSON_BODY for that, which would
     * otherwise be reported as an internal error and page somebody.
     */
    if (typeof maybeCode === 'string' && maybeCode.startsWith('FST_ERR_CTP')) {
      const issue =
        maybeCode === 'FST_ERR_CTP_EMPTY_JSON_BODY'
          ? 'Request body is empty but Content-Type is application/json. Omit the header or send {}.'
          : 'Request body could not be parsed';
      return AppError.validation([{ field: 'body', issue }], issue);
    }

    // A Postgres error carries a five-character SQLSTATE; those map to domain codes.
    if (typeof maybeCode === 'string' && /^[0-9A-Z]{5}$/.test(maybeCode)) {
      return AppError.fromDatabaseError(exception);
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code =
        status === 404
          ? 'RESOURCE_NOT_FOUND'
          : status === 401
            ? 'AUTH_REQUIRED'
            : status === 403
              ? 'PERMISSION_DENIED'
              : status === 429
                ? 'RATE_LIMITED'
                : status >= 500
                  ? 'INTERNAL_ERROR'
                  : 'VALIDATION_FAILED';
      return new AppError(code, exception.message, { cause: exception });
    }

    return new AppError('INTERNAL_ERROR', undefined, { cause: exception });
  }
}
