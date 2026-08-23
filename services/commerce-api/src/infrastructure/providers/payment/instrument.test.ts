import { describe, expect, it } from 'vitest';
import {
  normaliseCardLast4,
  normaliseCardNetwork,
  normaliseInstrumentType,
} from './instrument';

/**
 * These mappings exist to satisfy payment_attempts_instrument_type_check and
 * payment_attempts_card_network_check. A wrong value is not a cosmetic problem: the
 * insert fails and a verified payment cannot be recorded, which strands a paid order in
 * PENDING_PAYMENT.
 */
describe('normaliseInstrumentType', () => {
  it('maps UPI to the specific flow when known', () => {
    expect(normaliseInstrumentType({ method: 'upi', upiFlow: 'collect' })).toBe('UPI_COLLECT');
    expect(normaliseInstrumentType({ method: 'upi', upiFlow: 'qr' })).toBe('UPI_QR');
    expect(normaliseInstrumentType({ method: 'upi', upiFlow: 'intent' })).toBe('UPI_INTENT');
  });

  it('defaults UPI to intent when the flow is unspecified', () => {
    expect(normaliseInstrumentType({ method: 'upi' })).toBe('UPI_INTENT');
  });

  it('distinguishes card types', () => {
    expect(normaliseInstrumentType({ method: 'card', cardType: 'credit' })).toBe('CREDIT_CARD');
    expect(normaliseInstrumentType({ method: 'card', cardType: 'debit' })).toBe('DEBIT_CARD');
    expect(normaliseInstrumentType({ method: 'card', cardType: 'prepaid' })).toBe('PREPAID_CARD');
  });

  /**
   * Guessing "credit" would be wrong often enough to corrupt interchange reporting, and
   * the column is nullable precisely so we do not have to guess.
   */
  it('returns null for a card whose type the provider omitted', () => {
    expect(normaliseInstrumentType({ method: 'card', cardType: null })).toBeNull();
  });

  it('maps the remaining methods', () => {
    expect(normaliseInstrumentType({ method: 'netbanking' })).toBe('NET_BANKING');
    expect(normaliseInstrumentType({ method: 'wallet' })).toBe('WALLET');
    expect(normaliseInstrumentType({ method: 'emi' })).toBe('EMI');
    expect(normaliseInstrumentType({ method: 'cardless_emi' })).toBe('CARDLESS_EMI');
    expect(normaliseInstrumentType({ method: 'paylater' })).toBe('PAY_LATER');
    expect(normaliseInstrumentType({ method: 'cod' })).toBe('COD');
  });

  it('tolerates separators and casing from different providers', () => {
    expect(normaliseInstrumentType({ method: 'NET-BANKING' })).toBe('NET_BANKING');
    expect(normaliseInstrumentType({ method: 'Cardless EMI' })).toBe('CARDLESS_EMI');
  });

  it('returns null for an unknown or missing method rather than guessing', () => {
    expect(normaliseInstrumentType({ method: 'crypto' })).toBeNull();
    expect(normaliseInstrumentType({ method: null })).toBeNull();
    expect(normaliseInstrumentType({ method: undefined })).toBeNull();
  });
});

describe('normaliseCardNetwork', () => {
  it('maps the networks the schema allows', () => {
    expect(normaliseCardNetwork('Visa')).toBe('VISA');
    expect(normaliseCardNetwork('MasterCard')).toBe('MASTERCARD');
    expect(normaliseCardNetwork('RuPay')).toBe('RUPAY');
    expect(normaliseCardNetwork('American Express')).toBe('AMEX');
    expect(normaliseCardNetwork('Diners Club')).toBe('DINERS');
    expect(normaliseCardNetwork('Maestro')).toBe('MAESTRO');
    expect(normaliseCardNetwork('Discover')).toBe('DISCOVER');
  });

  it('returns null for unknown or absent networks', () => {
    expect(normaliseCardNetwork('UnionPay')).toBeNull();
    expect(normaliseCardNetwork(null)).toBeNull();
    expect(normaliseCardNetwork('')).toBeNull();
  });
});

describe('normaliseCardLast4', () => {
  it('keeps exactly four digits', () => {
    expect(normaliseCardLast4('4242')).toBe('4242');
    expect(normaliseCardLast4('XXXX-1234')).toBe('1234');
  });

  /** Anything that is not four digits is dropped rather than stored malformed. */
  it('rejects anything that is not four digits', () => {
    expect(normaliseCardLast4('123')).toBeNull();
    expect(normaliseCardLast4('12345')).toBeNull();
    expect(normaliseCardLast4(null)).toBeNull();
  });

  /**
   * A full PAN must never be retained. If a provider ever sent one, the guard drops it
   * instead of writing 16 digits into a column meant for four.
   */
  it('refuses a full card number', () => {
    expect(normaliseCardLast4('4111111111111111')).toBeNull();
  });
});
