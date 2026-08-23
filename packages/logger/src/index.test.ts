import { describe, expect, it } from 'vitest';
import { createLogger, scrubString, scrubValue } from './index';

describe('scrubString', () => {
  it('masks card-shaped numbers', () => {
    expect(scrubString('card 4111 1111 1111 1111 used')).toBe('card [REDACTED_CARD] used');
    expect(scrubString('4111-1111-1111-1111')).toBe('[REDACTED_CARD]');
  });

  it('masks provider secrets and JWTs', () => {
    expect(scrubString('key sb_secret_abc123def456')).toContain('[REDACTED_TOKEN]');
    expect(scrubString('rzp_live_AbCdEf123456')).toBe('[REDACTED_TOKEN]');
    expect(scrubString('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def')).toContain(
      '[REDACTED_TOKEN]',
    );
  });

  it('masks Aadhaar-shaped identifiers', () => {
    expect(scrubString('id 1234 5678 9012')).toBe('id [REDACTED_ID]');
  });

  it('leaves ordinary text and order numbers alone', () => {
    expect(scrubString('Order NM100000042 delivered')).toBe('Order NM100000042 delivered');
    expect(scrubString('₹1,34,900')).toBe('₹1,34,900');
  });
});

describe('scrubValue', () => {
  it('redacts sensitive keys regardless of nesting', () => {
    const result = scrubValue({
      user: { email: 'a@b.com', password: 'hunter2' },
      payment: { cvv: '123', cardNumber: '4111111111111111' },
    }) as Record<string, Record<string, unknown>>;

    expect(result.user!.password).toBe('[REDACTED]');
    expect(result.payment!.cvv).toBe('[REDACTED]');
    expect(result.payment!.cardNumber).toBe('[REDACTED]');
    expect(result.user!.email).toBe('a@b.com');
  });

  it('scrubs sensitive shapes hiding under innocent keys', () => {
    const result = scrubValue({ note: 'customer said card is 4111 1111 1111 1111' }) as {
      note: string;
    };
    expect(result.note).toContain('[REDACTED_CARD]');
  });

  it('is depth limited so cyclic-ish structures cannot hang logging', () => {
    let deep: Record<string, unknown> = { value: 'leaf' };
    for (let i = 0; i < 12; i += 1) deep = { nested: deep };
    expect(JSON.stringify(scrubValue(deep))).toContain('TRUNCATED');
  });
});

/**
 * These exist because createLogger had never actually been called anywhere: commerce-api
 * uses Nest's logger, and the worker service was the first real consumer. Two separate
 * defects surfaced at its first invocation, both of which crashed the process at startup:
 *
 *   1. a 'pino-pretty' transport target that nothing depended on
 *   2. a redact path ('set-cookie') that fast-redact rejects, because a hyphenated key
 *      must use bracket notation
 *
 * A logger that throws while being constructed takes the whole service down, so
 * constructing one is the assertion that matters most.
 */
describe('createLogger', () => {
  it('constructs in local mode, where the pretty transport is used', () => {
    expect(() => createLogger({ service: 'test', env: 'local' })).not.toThrow();
  });

  it('constructs in production mode, where output is JSON', () => {
    expect(() => createLogger({ service: 'test', env: 'production' })).not.toThrow();
  });

  it('constructs at every level', () => {
    for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) {
      expect(() => createLogger({ service: 'test', env: 'staging' }, level)).not.toThrow();
    }
  });

  it('accepts every generated redaction path', () => {
    // Any field name that needs bracket notation is covered by constructing the logger,
    // since pino validates the whole path list up front.
    const logger = createLogger({ service: 'test', env: 'staging' });
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
  });

  it('redacts a hyphenated header key without throwing', () => {
    const logger = createLogger({ service: 'test', env: 'staging' });
    expect(() =>
      logger.info({ req: { headers: { 'set-cookie': 'session=secret' } } }, 'headers'),
    ).not.toThrow();
  });
});
