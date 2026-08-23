import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { RequestContext } from '../context/request-context';

/**
 * Establishes the per-request context before anything else runs.
 *
 * Correlation identifiers are accepted from the caller when present (so a trace spans
 * the storefront's server components and the API) but always validated: an attacker
 * controlling a log field is a log-injection risk.
 */
export function contextMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply,
  next: (error?: Error) => void,
): void {
  const header = (name: string): string | null => {
    const value = request.headers[name];
    return typeof value === 'string' && value.length > 0 && value.length <= 200 ? value : null;
  };

  const safeId = (value: string | null): string | null =>
    value && /^[A-Za-z0-9._-]{8,64}$/.test(value) ? value : null;

  const platformHeader = header('x-client-platform');
  const platform =
    platformHeader === 'android' || platformHeader === 'ios' || platformHeader === 'web'
      ? platformHeader
      : 'web';

  const localeHeader = header('accept-language');
  const locale = localeHeader?.startsWith('hi') ? 'hi-IN' : 'en-IN';

  const context = RequestContext.create({
    requestId: safeId(header('x-request-id')) ?? randomUUID(),
    traceId: safeId(header('x-trace-id')) ?? randomUUID().replace(/-/g, ''),
    platform,
    appVersion: header('x-client-version'),
    locale,
    ip: request.ip ?? null,
    userAgent: header('user-agent'),
    deviceId: safeId(header('x-device-id')),
    idempotencyKey: header('idempotency-key'),
  });

  RequestContext.run(context, () => next());
}
