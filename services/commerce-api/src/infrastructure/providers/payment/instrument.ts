/**
 * Provider vocabulary -> NovaMart vocabulary.
 *
 * Gateways describe instruments in their own terms ("card" + type "credit", network
 * "MasterCard"). The database constrains these to a canonical set, so every adapter must
 * translate before persisting. Keeping the mapping here rather than in each adapter means
 * a new provider inherits the same normalisation, and the allowed values are stated once.
 *
 * Canonical sets mirror:
 *   payments.payment_attempts_instrument_type_check
 *   payments.payment_attempts_card_network_check
 */

export type InstrumentType =
  | 'UPI_INTENT'
  | 'UPI_COLLECT'
  | 'UPI_QR'
  | 'CREDIT_CARD'
  | 'DEBIT_CARD'
  | 'PREPAID_CARD'
  | 'NET_BANKING'
  | 'WALLET'
  | 'EMI'
  | 'CARDLESS_EMI'
  | 'PAY_LATER'
  | 'COD';

export type CardNetwork =
  | 'VISA'
  | 'MASTERCARD'
  | 'RUPAY'
  | 'AMEX'
  | 'DINERS'
  | 'DISCOVER'
  | 'MAESTRO';

/**
 * Resolves the canonical instrument type.
 *
 * Returns null rather than guessing when the provider sends something unrecognised: a
 * NULL instrument_type is accepted by the schema, whereas a wrong guess would be
 * indistinguishable from real data in a settlement report.
 */
export function normaliseInstrumentType(input: {
  method: string | null | undefined;
  cardType?: string | null;
  upiFlow?: 'intent' | 'collect' | 'qr' | null;
}): InstrumentType | null {
  const method = (input.method ?? '').toLowerCase().replace(/[\s_-]/g, '');

  switch (method) {
    case 'upi':
    case 'upiintent':
      if (input.upiFlow === 'collect') return 'UPI_COLLECT';
      if (input.upiFlow === 'qr') return 'UPI_QR';
      return 'UPI_INTENT';
    case 'card': {
      const cardType = (input.cardType ?? '').toLowerCase();
      if (cardType.includes('debit')) return 'DEBIT_CARD';
      if (cardType.includes('prepaid')) return 'PREPAID_CARD';
      if (cardType.includes('credit')) return 'CREDIT_CARD';
      // Razorpay omits `type` for some issuers. Credit is the commonest case, but
      // guessing would corrupt interchange reporting, so leave it unset.
      return null;
    }
    case 'netbanking':
      return 'NET_BANKING';
    case 'wallet':
      return 'WALLET';
    case 'emi':
      return 'EMI';
    case 'cardlessemi':
      return 'CARDLESS_EMI';
    case 'paylater':
      return 'PAY_LATER';
    case 'cod':
      return 'COD';
    default:
      return null;
  }
}

const CARD_NETWORKS: Record<string, CardNetwork> = {
  visa: 'VISA',
  mastercard: 'MASTERCARD',
  master: 'MASTERCARD',
  mc: 'MASTERCARD',
  rupay: 'RUPAY',
  amex: 'AMEX',
  americanexpress: 'AMEX',
  diners: 'DINERS',
  dinersclub: 'DINERS',
  discover: 'DISCOVER',
  maestro: 'MAESTRO',
};

export function normaliseCardNetwork(raw: string | null | undefined): CardNetwork | null {
  if (!raw) return null;
  return CARD_NETWORKS[raw.toLowerCase().replace(/[\s_-]/g, '')] ?? null;
}

/** Only four digits are ever stored, and only if they really are four digits. */
export function normaliseCardLast4(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return /^[0-9]{4}$/.test(digits) ? digits : null;
}
