import { describe, expect, it } from 'vitest';
import {
  addToCartSchema,
  indianMobileSchema,
  placeOrderSchema,
  sellerTaxProfileSchema,
  upsertListingSchema,
} from './index';

describe('indianMobileSchema', () => {
  it('normalises 10-digit input to E.164 without the plus', () => {
    expect(indianMobileSchema.parse('9876543210')).toBe('919876543210');
    expect(indianMobileSchema.parse('+91 98765 43210')).toBe('919876543210');
  });

  it('rejects numbers that cannot be Indian mobiles', () => {
    expect(() => indianMobileSchema.parse('1234567890')).toThrow();
    expect(() => indianMobileSchema.parse('98765')).toThrow();
  });
});

describe('addToCartSchema', () => {
  it('accepts only what the client is allowed to decide', () => {
    const parsed = addToCartSchema.parse({ listingId: crypto.randomUUID(), quantity: 2 });
    expect(parsed.quantity).toBe(2);
    // Critically: there is no price field to smuggle a value through.
    expect('price' in parsed).toBe(false);
  });

  it('strips a client-supplied price instead of honouring it', () => {
    const parsed = addToCartSchema.parse({
      listingId: crypto.randomUUID(),
      quantity: 1,
      pricePaise: 1,
    } as Record<string, unknown>);
    expect((parsed as Record<string, unknown>).pricePaise).toBeUndefined();
  });
});

describe('placeOrderSchema', () => {
  it('treats the acknowledged total as confirmation, not authority', () => {
    const parsed = placeOrderSchema.parse({
      checkoutSessionId: crypto.randomUUID(),
      acknowledgedTotalPaise: 129900,
      paymentMethod: 'UPI',
    });
    expect(parsed.acknowledgedTotalPaise).toBe(129900);
  });

  it('rejects an unknown payment method', () => {
    expect(() =>
      placeOrderSchema.parse({
        checkoutSessionId: crypto.randomUUID(),
        acknowledgedTotalPaise: 100,
        paymentMethod: 'CRYPTO',
      }),
    ).toThrow();
  });
});

describe('sellerTaxProfileSchema', () => {
  const pan = 'ABCDE1234F';

  it('accepts a GSTIN that embeds the PAN and matches the state', () => {
    const parsed = sellerTaxProfileSchema.parse({
      pan,
      gstin: `29${pan}1Z5`,
      gstRegistrationType: 'REGULAR',
      gstStateCode: '29',
      legalNameAsPerPan: 'Test Private Limited',
    });
    expect(parsed.gstin).toBe(`29${pan}1Z5`);
  });

  it('rejects a GSTIN whose embedded PAN disagrees', () => {
    expect(() =>
      sellerTaxProfileSchema.parse({
        pan,
        gstin: '29ZZZZZ9999Z1Z5',
        gstRegistrationType: 'REGULAR',
        gstStateCode: '29',
        legalNameAsPerPan: 'Test Private Limited',
      }),
    ).toThrow(/does not match the PAN/);
  });

  it('rejects a GSTIN whose state code disagrees', () => {
    expect(() =>
      sellerTaxProfileSchema.parse({
        pan,
        gstin: `27${pan}1Z5`,
        gstRegistrationType: 'REGULAR',
        gstStateCode: '29',
        legalNameAsPerPan: 'Test Private Limited',
      }),
    ).toThrow(/state code/);
  });

  it('allows an unregistered seller to omit the GSTIN', () => {
    const parsed = sellerTaxProfileSchema.parse({
      pan,
      gstRegistrationType: 'UNREGISTERED',
      gstStateCode: '29',
      legalNameAsPerPan: 'Small Trader',
    });
    expect(parsed.gstin).toBeUndefined();
  });
});

describe('upsertListingSchema', () => {
  it('refuses a selling price above MRP', () => {
    expect(() =>
      upsertListingSchema.parse({
        skuId: crypto.randomUUID(),
        declaredMrpPaise: 100000,
        sellingPricePaise: 120000,
      }),
    ).toThrow(/cannot exceed MRP/);
  });

  it('refuses an inverted quantity range', () => {
    expect(() =>
      upsertListingSchema.parse({
        skuId: crypto.randomUUID(),
        declaredMrpPaise: 100000,
        sellingPricePaise: 90000,
        minOrderQuantity: 5,
        maxOrderQuantity: 2,
      }),
    ).toThrow(/at least the minimum/);
  });
});
