import { describe, expect, it } from 'vitest';
import { scrubString, scrubValue } from './index';

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
