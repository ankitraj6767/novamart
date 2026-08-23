/**
 * Structured logging with mandatory redaction (SECURITY_MODEL §11).
 *
 * Two layers of protection:
 *   1. A pino redaction path list for known-sensitive field names.
 *   2. A value-shape scrubber that catches card-like and token-like strings even when
 *      they arrive under an unexpected key — which is how leaks actually happen.
 *
 * Every log line carries requestId and traceId so a single request can be followed
 * from HTTP through the database and into a worker.
 */

import pino, { type Logger, type LoggerOptions } from 'pino';

/** Field names that must never be logged, at any level, in any environment. */
export const REDACTED_PATHS = [
  'password',
  'newPassword',
  'currentPassword',
  'otp',
  'otpValue',
  'code',
  'pin',
  'cvv',
  'cardNumber',
  'card_number',
  'pan',
  'panNumber',
  'accountNumber',
  'account_number',
  'aadhaar',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'idToken',
  'authorization',
  'cookie',
  'setCookie',
  'set-cookie',
  'apiKey',
  'api_key',
  'secret',
  'keySecret',
  'webhookSecret',
  'serviceRoleKey',
  'signature',
  'documentNumber',
  'beneficiaryDetails',
] as const;

/**
 * Renders one path segment.
 *
 * fast-redact only accepts bare identifiers in dot notation, so a key containing a
 * hyphen (`set-cookie`) has to be written in bracket notation or pino throws
 * "redact paths array contains an invalid path" and the process dies at startup.
 */
function segment(field: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(field) ? `.${field}` : `["${field}"]`;
}

/** A leading segment cannot start with a dot. */
function rootSegment(field: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(field) ? field : `["${field}"]`;
}

function redactionPaths(): string[] {
  const paths: string[] = [];
  const prefixes = ['', '*', 'req.body', 'req.headers', 'request', 'payload', 'data', 'body', 'context'];

  for (const field of REDACTED_PATHS) {
    for (const prefix of prefixes) {
      paths.push(prefix === '' ? rootSegment(field) : `${prefix}${segment(field)}`);
    }
  }

  // Header blocks are redacted wholesale rather than per-key.
  paths.push('req.headers.authorization', 'req.headers.cookie', 'headers.authorization');
  return Array.from(new Set(paths));
}

// A 13–19 digit run is card-shaped; long opaque strings with provider prefixes are
// token-shaped. Both get masked wherever they appear in a string value.
// Written so it cannot swallow the separator that follows the final digit: the
// pattern must both start and end on a digit.
const CARD_LIKE = /\b\d(?:[ -]?\d){12,18}\b/g;
const TOKEN_LIKE =
  /\b(?:sb_secret_|sb_publishable_|rzp_(?:live|test)_|sk_(?:live|test)_|eyJ[A-Za-z0-9_-]{10,})[A-Za-z0-9._-]+/g;
const AADHAAR_LIKE = /\b\d{4}\s?\d{4}\s?\d{4}\b/g;

export function scrubString(value: string): string {
  return value
    .replace(TOKEN_LIKE, '[REDACTED_TOKEN]')
    .replace(CARD_LIKE, '[REDACTED_CARD]')
    .replace(AADHAAR_LIKE, '[REDACTED_ID]');
}

/** Recursively scrubs value shapes. Depth-limited so a cyclic object cannot hang logging. */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[TRUNCATED]';
  if (typeof value === 'string') return scrubString(value);
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => scrubValue(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = (REDACTED_PATHS as readonly string[]).includes(k)
        ? '[REDACTED]'
        : scrubValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface LoggerContext {
  service: string;
  env: string;
  version?: string;
}

/**
 * Resolves pino-pretty to an absolute path, or null when it is unavailable.
 *
 * Two problems this avoids:
 *
 *  - pino resolves a transport target from the calling module's context. Under pnpm's
 *    isolated node_modules that is not this package, so the bare name 'pino-pretty' can
 *    fail to resolve in a consumer that does not depend on it directly. An absolute path
 *    resolves from here, where it IS a dependency.
 *  - Pretty printing is a developer convenience. If it cannot be loaded, the right
 *    outcome is plain JSON logs, not a service that refuses to boot. Returning null lets
 *    createLogger degrade instead of throwing.
 */
function resolvePrettyTransport(): string | null {
  try {
    return require.resolve('pino-pretty');
  } catch {
    return null;
  }
}

export function createLogger(context: LoggerContext, level = 'info'): Logger {
  const prettyTarget = context.env === 'local' ? resolvePrettyTransport() : null;

  const options: LoggerOptions = {
    level,
    base: { service: context.service, env: context.env, version: context.version },
    redact: { paths: redactionPaths(), censor: '[REDACTED]' },
    // Pretty output locally; JSON everywhere else so log shipping stays parseable.
    ...(prettyTarget
      ? {
        transport: {
          target: prettyTarget,
          options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname,service,env' },
        },
      }
      : {}),
    formatters: {
      level: (label) => ({ level: label }),
      log: (object) => scrubValue(object) as Record<string, unknown>,
    },
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
  };

  return pino(options);
}

export interface CorrelationFields {
  requestId?: string;
  traceId?: string;
  userId?: string | null;
  sellerId?: string | null;
  orderId?: string | null;
  paymentId?: string | null;
  shipmentId?: string | null;
  actorType?: string;
}

/** Child logger carrying the domain identifiers that make an incident traceable. */
export function withCorrelation(logger: Logger, fields: CorrelationFields): Logger {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== null && v !== undefined) clean[k] = v;
  }
  return logger.child(clean);
}

export type { Logger };
