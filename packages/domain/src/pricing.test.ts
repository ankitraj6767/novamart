import { describe, expect, it } from 'vitest';
import { computeCommission, computePricing, type PricingContext } from './pricing';

function baseContext(overrides: Partial<PricingContext> = {}): PricingContext {
  return {
    lines: [
      {
        lineKey: 'a',
        listingId: 'l1',
        skuId: 's1',
        sellerId: 'seller-1',
        quantity: 1,
        unitMrpPaise: 13490000, // Rs.1,34,900
        unitSellingPricePaise: 12990000, // Rs.1,29,900
        hsnCode: '8517',
        gstRate: 18,
        supplyStateCode: 'KA',
      },
    ],
    customerStateCode: 'KA',
    promotions: [],
    coupon: null,
    bankOffer: null,
    shippingBySeller: {},
    freeShippingThresholdPaise: 4990000,
    codFeePaise: 0,
    giftWrapPaise: 0,
    roundToWholeRupee: false,
    ...overrides,
  };
}

describe('computePricing', () => {
  it('computes a single intra-state line with tax-inclusive GST', () => {
    const result = computePricing(baseContext());
    const line = result.lines[0]!;

    expect(result.itemsGrossPaise).toBe(12990000);
    expect(result.sellerDiscountPaise).toBe(500000);
    expect(result.totalPayablePaise).toBe(12990000);

    // Rs.1,29,900 inclusive of 18% GST → tax 19,815.25 → 1981525 paise
    expect(line.totalTaxPaise).toBe(1981525);
    expect(line.cgstPaise + line.sgstPaise).toBe(1981525);
    expect(line.igstPaise).toBe(0);
    expect(line.taxableValuePaise + line.totalTaxPaise).toBe(line.totalPayablePaise);
  });

  it('uses IGST for inter-state supply', () => {
    const result = computePricing(baseContext({ customerStateCode: 'MH' }));
    const line = result.lines[0]!;
    expect(line.isIntraState).toBe(false);
    expect(line.cgstPaise).toBe(0);
    expect(line.sgstPaise).toBe(0);
    expect(line.igstPaise).toBe(line.totalTaxPaise);
  });

  it('caps a percentage promotion at its maximum discount', () => {
    const result = computePricing(
      baseContext({
        promotions: [
          {
            id: 'p1',
            code: 'MOBILE10',
            label: '10% off mobiles',
            fundedBy: 'PLATFORM',
            type: 'PERCENTAGE_OFF',
            percentage: 10,
            maxDiscountPaise: 200000, // Rs.2,000 cap
            appliesToLineKeys: [],
            isExclusive: false,
            stackPriority: 100,
          },
        ],
      }),
    );

    // 10% of Rs.1,29,900 = Rs.12,990, capped to Rs.2,000
    expect(result.promotionDiscountPaise).toBe(200000);
    expect(result.platformDiscountPaise).toBe(200000);
    expect(result.totalPayablePaise).toBe(12990000 - 200000);
  });

  it('applies the coupon after the promotion, on the reduced base', () => {
    const result = computePricing(
      baseContext({
        promotions: [
          {
            id: 'p1',
            code: 'FLAT1000',
            label: 'Flat Rs.1000 off',
            fundedBy: 'SELLER',
            type: 'FLAT_OFF',
            flatPaise: 100000,
            appliesToLineKeys: [],
            isExclusive: false,
            stackPriority: 100,
          },
        ],
        coupon: {
          id: 'c1',
          code: 'SAVE5',
          discountType: 'PERCENTAGE',
          percentage: 5,
          // Cap set above the computed value so this test isolates the ordering rule.
          maxDiscountPaise: 1_000_000,
          minCartValuePaise: 0,
          appliesToLineKeys: [],
        },
      }),
    );

    expect(result.promotionDiscountPaise).toBe(100000);
    // 5% of (1,29,900 - 1,000) = Rs.6,445 — proving the coupon applied to the
    // post-promotion base, not the original price.
    expect(result.couponDiscountPaise).toBe(644500);
    // Seller-funded promotion must not be counted as platform-funded.
    expect(result.platformDiscountPaise).toBe(0);
  });

  it('ignores a coupon below its minimum cart value', () => {
    const result = computePricing(
      baseContext({
        lines: [
          {
            lineKey: 'a',
            listingId: 'l1',
            skuId: 's1',
            sellerId: 'seller-1',
            quantity: 1,
            unitMrpPaise: 50000,
            unitSellingPricePaise: 40000,
            hsnCode: '6109',
            gstRate: 5,
            supplyStateCode: 'KA',
          },
        ],
        coupon: {
          id: 'c1',
          code: 'BIG',
          discountType: 'FLAT',
          flatPaise: 20000,
          minCartValuePaise: 100000,
          appliesToLineKeys: [],
        },
      }),
    );

    expect(result.couponDiscountPaise).toBe(0);
    expect(result.appliedRules.some((r) => r.kind === 'COUPON')).toBe(false);
  });

  it('allocates an order-level coupon across lines so the parts sum exactly', () => {
    const result = computePricing(
      baseContext({
        lines: [
          {
            lineKey: 'a',
            listingId: 'l1',
            skuId: 's1',
            sellerId: 'seller-1',
            quantity: 1,
            unitMrpPaise: 100000,
            unitSellingPricePaise: 99900,
            hsnCode: '8517',
            gstRate: 18,
            supplyStateCode: 'KA',
          },
          {
            lineKey: 'b',
            listingId: 'l2',
            skuId: 's2',
            sellerId: 'seller-2',
            quantity: 3,
            unitMrpPaise: 40000,
            unitSellingPricePaise: 33300,
            hsnCode: '6109',
            gstRate: 5,
            supplyStateCode: 'MH',
          },
        ],
        coupon: {
          id: 'c1',
          code: 'ODD',
          discountType: 'FLAT',
          flatPaise: 7777, // deliberately awkward
          minCartValuePaise: 0,
          appliesToLineKeys: [],
        },
      }),
    );

    const allocated = result.lines.reduce((a, l) => a + l.couponDiscountPaise, 0);
    expect(allocated).toBe(7777);
    expect(result.couponDiscountPaise).toBe(7777);
  });

  it('grants free shipping above the threshold and charges it below', () => {
    const withFree = computePricing(
      baseContext({ shippingBySeller: { 'seller-1': 5900 } }),
    );
    expect(withFree.shippingPaise).toBe(0);

    const belowThreshold = computePricing(
      baseContext({
        lines: [
          {
            lineKey: 'a',
            listingId: 'l1',
            skuId: 's1',
            sellerId: 'seller-1',
            quantity: 1,
            unitMrpPaise: 50000,
            unitSellingPricePaise: 39900,
            hsnCode: '6109',
            gstRate: 5,
            supplyStateCode: 'KA',
          },
        ],
        shippingBySeller: { 'seller-1': 5900 },
      }),
    );
    expect(belowThreshold.shippingPaise).toBe(5900);
    expect(belowThreshold.totalPayablePaise).toBe(39900 + 5900);
  });

  it('applies an instant bank offer but never cashback', () => {
    const instant = computePricing(
      baseContext({
        bankOffer: {
          id: 'b1',
          code: 'HDFC10',
          label: '10% off with HDFC cards',
          discountType: 'INSTANT_PERCENTAGE',
          percentage: 10,
          maxDiscountPaise: 150000,
          minTransactionPaise: 500000,
        },
      }),
    );
    expect(instant.bankOfferDiscountPaise).toBe(150000);

    const cashback = computePricing(
      baseContext({
        bankOffer: {
          id: 'b2',
          code: 'AXISCB',
          label: '5% cashback',
          discountType: 'CASHBACK_PERCENTAGE',
          percentage: 5,
          maxDiscountPaise: 100000,
          minTransactionPaise: 0,
        },
      }),
    );
    // Cashback is credited by the bank later; it must not reduce the payable.
    expect(cashback.bankOfferDiscountPaise).toBe(0);
    expect(cashback.totalPayablePaise).toBe(12990000);
  });

  it('honours an exclusive promotion by suppressing later ones on the same line', () => {
    const result = computePricing(
      baseContext({
        promotions: [
          {
            id: 'p1',
            code: 'EXCLUSIVE',
            label: 'Exclusive Rs.500',
            fundedBy: 'PLATFORM',
            type: 'FLAT_OFF',
            flatPaise: 50000,
            appliesToLineKeys: [],
            isExclusive: true,
            stackPriority: 10,
          },
          {
            id: 'p2',
            code: 'STACKED',
            label: 'Another Rs.500',
            fundedBy: 'PLATFORM',
            type: 'FLAT_OFF',
            flatPaise: 50000,
            appliesToLineKeys: [],
            isExclusive: false,
            stackPriority: 20,
          },
        ],
      }),
    );

    expect(result.promotionDiscountPaise).toBe(50000);
  });

  it('closes the arithmetic: gross - discounts + charges = payable', () => {
    const result = computePricing(
      baseContext({
        lines: [
          {
            lineKey: 'a',
            listingId: 'l1',
            skuId: 's1',
            sellerId: 'seller-1',
            quantity: 2,
            unitMrpPaise: 99900,
            unitSellingPricePaise: 74900,
            hsnCode: '8518',
            gstRate: 18,
            supplyStateCode: 'KA',
          },
          {
            lineKey: 'b',
            listingId: 'l2',
            skuId: 's2',
            sellerId: 'seller-2',
            quantity: 1,
            unitMrpPaise: 249900,
            unitSellingPricePaise: 199900,
            hsnCode: '6403',
            gstRate: 18,
            supplyStateCode: 'TN',
          },
        ],
        shippingBySeller: { 'seller-1': 4900, 'seller-2': 6900 },
        freeShippingThresholdPaise: null,
        codFeePaise: 4900,
        coupon: {
          id: 'c1',
          code: 'WELCOME',
          discountType: 'PERCENTAGE',
          percentage: 7,
          maxDiscountPaise: 300000,
          minCartValuePaise: 0,
          appliesToLineKeys: [],
        },
      }),
    );

    expect(result.totalPayablePaise).toBe(
      result.itemsGrossPaise -
      result.totalDiscountPaise +
      result.shippingPaise +
      result.codFeePaise +
      result.giftWrapPaise +
      result.roundingAdjustmentPaise,
    );

    // Per-line taxable + tax must equal the line payable, for every line.
    for (const line of result.lines) {
      expect(line.taxableValuePaise + line.totalTaxPaise).toBe(line.totalPayablePaise);
    }
  });

  it('rounds to whole rupees when asked, recording the adjustment', () => {
    const result = computePricing(
      baseContext({
        lines: [
          {
            lineKey: 'a',
            listingId: 'l1',
            skuId: 's1',
            sellerId: 'seller-1',
            quantity: 1,
            unitMrpPaise: 50000,
            unitSellingPricePaise: 39977,
            hsnCode: '6109',
            gstRate: 5,
            supplyStateCode: 'KA',
          },
        ],
        roundToWholeRupee: true,
      }),
    );

    expect(result.totalPayablePaise % 100).toBe(0);
    expect(result.roundingAdjustmentPaise).toBe(23);
  });
});

describe('computeCommission', () => {
  it('computes commission, GST on commission and the seller payable', () => {
    const result = computeCommission({
      taxableBasePaise: 100000,
      commissionType: 'PERCENTAGE',
      percentage: 12,
      fixedPaise: null,
      minCommissionPaise: null,
      maxCommissionPaise: null,
      commissionGstRate: 18,
      closingFeePaise: 1000,
      fulfillmentFeePaise: 0,
      paymentGatewayFeePercentage: 2,
      itemPayablePaise: 118000,
    });

    expect(result.commissionPaise).toBe(12000);
    expect(result.commissionGstPaise).toBe(2160);
    expect(result.paymentGatewayFeePaise).toBe(2360);
    expect(result.sellerPayablePaise).toBe(118000 - 12000 - 2160 - 1000 - 2360);
  });

  it('respects the commission floor and cap', () => {
    const capped = computeCommission({
      taxableBasePaise: 10000000,
      commissionType: 'PERCENTAGE',
      percentage: 12,
      fixedPaise: null,
      minCommissionPaise: null,
      maxCommissionPaise: 500000,
      commissionGstRate: 18,
      closingFeePaise: 0,
      fulfillmentFeePaise: 0,
      paymentGatewayFeePercentage: 0,
      itemPayablePaise: 10000000,
    });
    expect(capped.commissionPaise).toBe(500000);

    const floored = computeCommission({
      taxableBasePaise: 1000,
      commissionType: 'PERCENTAGE',
      percentage: 12,
      fixedPaise: null,
      minCommissionPaise: 5000,
      maxCommissionPaise: null,
      commissionGstRate: 18,
      closingFeePaise: 0,
      fulfillmentFeePaise: 0,
      paymentGatewayFeePercentage: 0,
      itemPayablePaise: 1000,
    });
    expect(floored.commissionPaise).toBe(5000);
  });
});
