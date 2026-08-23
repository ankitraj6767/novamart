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
      this.logger.error({ ...logPayload, err: appError.cause ?? appError }, appError.message);
    } else if (appError.status === 429 || appError.status === 423) {
      this.logger.warn(logPayload, appError.message);
    } else {
      this.logger.debug(logPayload, appError.message);
    }

    void reply.status(appError.status).send(body);
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

    // A Postgres error carries a SQLSTATE; those map to domain error codes.
    const maybePg = exception as { code?: unknown; severity?: unknown };
    if (typeof maybePg?.code === 'string' && /^[0-9A-Z]{5}$/.test(maybePg.code)) {
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
