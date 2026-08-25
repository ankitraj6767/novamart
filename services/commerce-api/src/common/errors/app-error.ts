import {
  ERROR_CODES,
  ERROR_MESSAGES,
  ERROR_STATUS,
  SQLSTATE_TO_ERROR_CODE,
  type ErrorCode,
} from '@novamart/types';

function asErrorCode(value: string | undefined): ErrorCode | undefined {
  return value && (ERROR_CODES as readonly string[]).includes(value)
    ? (value as ErrorCode)
    : undefined;
}

export interface ErrorDetail {
  field?: string;
  issue: string;
}

/**
 * The only exception type the API throws deliberately. Everything else is treated as
 * an unexpected internal error, logged with full context and reported to the client as
 * INTERNAL_ERROR with no internals leaked.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: ErrorDetail[];
  /** Extra context for logs only. Never serialised to the client. */
  readonly context?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message?: string,
    options?: { details?: ErrorDetail[]; context?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message ?? ERROR_MESSAGES[code]);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = options?.details;
    this.context = options?.context;
    if (options?.cause !== undefined) this.cause = options.cause;
  }

  static notFound(resource: string): AppError {
    return new AppError('RESOURCE_NOT_FOUND', `${resource} not found`);
  }

  static forbidden(reason?: string): AppError {
    return new AppError('PERMISSION_DENIED', reason);
  }

  static validation(details: ErrorDetail[], message?: string): AppError {
    return new AppError('VALIDATION_FAILED', message, { details });
  }

  /**
   * Translates a Postgres error into an AppError.
   *
   * The database enforces the hard invariants (stock, refund ceilings, state
   * transitions), so its SQLSTATEs are a first-class part of the API contract rather
   * than an implementation detail to be hidden (docs/DATABASE.md §4).
   */
  static fromDatabaseError(error: unknown): AppError {
    const pgError = error as {
      code?: string;
      message?: string;
      detail?: string;
      hint?: string;
      constraint_name?: string;
      table_name?: string;
    };

    const sqlstate = pgError?.code;
    if (!sqlstate) {
      return new AppError('INTERNAL_ERROR', undefined, { cause: error });
    }

    const mapped = SQLSTATE_TO_ERROR_CODE[sqlstate];
    if (!mapped) {
      return new AppError('INTERNAL_ERROR', undefined, {
        cause: error,
        context: { sqlstate, constraint: pgError.constraint_name, table: pgError.table_name },
      });
    }

    // Database functions set `hint` to the intended API error code, which is more
    // specific than the SQLSTATE mapping alone.
    const code = asErrorCode(pgError.hint) ?? mapped;

    let details: ErrorDetail[] | undefined;

    /**
     * A foreign-key violation from an API write almost always means the client supplied an
     * identifier or code that does not exist — a bad state code, an unknown category. The
     * mapped code alone ("resource not found") does not say WHICH reference failed, which
     * makes the response useless for fixing the request.
     *
     * The constraint name is derived from the referencing column, so surfacing it turns an
     * opaque 404 into something actionable. It names a column, not data, so it leaks
     * nothing sensitive.
     */
    if (sqlstate === '23503' && pgError.constraint_name) {
      const field = pgError.constraint_name
        .replace(/^.*?_/, '')
        .replace(/_fkey$/, '');
      details = [
        {
          field: field || undefined,
          issue: 'References a record that does not exist',
        },
      ];
    }

    if (pgError.detail) {
      try {
        const parsed = JSON.parse(pgError.detail) as Record<string, unknown>;
        details = Object.entries(parsed).map(([field, issue]) => ({
          field,
          issue: String(issue),
        }));
      } catch {
        // Non-JSON detail: only surface it for validation-class errors, where it is
        // safe and useful. Never for internal failures.
        if (code === 'VALIDATION_FAILED') {
          details = [{ issue: pgError.detail }];
        }
      }
    }

    return new AppError(code, undefined, {
      details,
      context: { sqlstate, constraint: pgError.constraint_name, dbMessage: pgError.message },
      cause: error,
    });
  }
}
