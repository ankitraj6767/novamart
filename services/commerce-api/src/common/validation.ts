import type { ZodSchema, ZodTypeDef } from 'zod';
import { AppError } from './errors/app-error';

/**
 * Boundary validation helper.
 *
 * Used explicitly in controllers rather than as a global pipe, so the schema for each
 * endpoint is visible at the call site and the parsed type flows through inference.
 */
export function parse<TOut, TDef extends ZodTypeDef, TIn>(
  schema: ZodSchema<TOut, TDef, TIn>,
  input: unknown,
): TOut {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw AppError.validation(
      result.error.issues.map((issue) => ({
        field: issue.path.join('.') || undefined,
        issue: issue.message,
      })),
    );
  }
  return result.data;
}

/** Opaque cursor encoding. Base64 of a JSON keyset, so clients cannot craft offsets. */
export function encodeCursor(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeCursor<T extends Record<string, unknown>>(cursor: string | undefined): T | null {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as T;
  } catch {
    throw AppError.validation([{ field: 'cursor', issue: 'Malformed cursor' }]);
  }
}
