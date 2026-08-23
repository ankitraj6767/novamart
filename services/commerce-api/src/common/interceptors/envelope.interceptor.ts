import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { map, type Observable } from 'rxjs';
import { RequestContext } from '../context/request-context';

/** Marker so a handler can return a fully-formed envelope (paginated lists). */
export const RAW_ENVELOPE = Symbol('novamart:raw-envelope');

export interface RawEnvelope<T> {
  [RAW_ENVELOPE]: true;
  data: T;
  meta?: Record<string, unknown>;
}

export function enveloped<T>(data: T, meta?: Record<string, unknown>): RawEnvelope<T> {
  return { [RAW_ENVELOPE]: true, data, meta };
}

/**
 * Wraps every successful response in the standard envelope so no handler has to
 * remember to, and attaches the correlation headers.
 */
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    const requestId = RequestContext.requestId();
    const traceId = RequestContext.traceId();

    void reply.header('X-Request-Id', requestId);
    void reply.header('X-Trace-Id', traceId);

    return next.handle().pipe(
      map((payload) => {
        // 204 responses must stay empty.
        if (payload === undefined || payload === null) return payload;

        if (typeof payload === 'object' && RAW_ENVELOPE in (payload as object)) {
          const raw = payload as RawEnvelope<unknown>;
          return { success: true, data: raw.data, meta: { requestId, ...raw.meta } };
        }

        return { success: true, data: payload, meta: { requestId } };
      }),
    );
  }
}
