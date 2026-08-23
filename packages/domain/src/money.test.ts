import { describe, expect, it } from 'vitest';
import {
  allocateProportionally,
  applyPercentage,
  discountPercentage,
  formatPaise,
  roundPaise,
  splitGst,
  taxFromInclusive,
  taxableValueFromInclusive,
} from './money';

describe('roundPaise', () => {
  it('rounds half up, symmetrically around zero', () => {
    expect(roundPaise(10.5)).toBe(11);
    expect(roundPaise(10.4)).toBe(10);
    expect(roundPaise(-10.5)).toBe(-11);
  });
});

describe('applyPercentage', () => {
  it('applies GST-style rates exactly', () => {
    expect(applyPercentage(100000, 18)).toBe(18000);
    // 12.5% of 999 paise = 124.875 → 125
    expect(applyPercentage(999, 12.5)).toBe(125);
  });
});

describe('taxFromInclusive', () => {
  it('extracts GST from a tax-inclusive Indian retail price', () => {
    // Rs.1180 inclusive of 18% GST → Rs.180 tax, Rs.1000 taxable
    expect(taxFromInclusive(118000, 18)).toBe(18000);
    expect(taxableValueFromInclusive(118000, 18)).toBe(100000);
  });

  it('returns zero for exempt goods', () => {
    expect(taxFromInclusive(50000, 0)).toBe(0);
  });

  it('never loses a paisa: taxable + tax equals the original', () => {
    for (const amount of [1, 7, 99, 12345, 134900, 999999]) {
      for (const rate of [0, 5, 12, 18, 28]) {
        expect(taxableValueFromInclusive(amount, rate) + taxFromInclusive(amount, rate)).toBe(
          amount,
        );
      }
    }
  });
});

describe('splitGst', () => {
  it('splits intra-state tax into equal halves', () => {
    expect(splitGst(18000, true)).toEqual({ cgst: 9000, sgst: 9000, igst: 0, total: 18000 });
  });

  /**
   * CGST and SGST must be identical on an intra-state invoice. An odd input therefore
   * rounds to an even total rather than handing the spare paisa to one side: an invoice
   * with CGST != SGST is invalid, and the database rejects it too.
   */
  it('keeps CGST and SGST exactly equal, reporting the adjusted total', () => {
    const { cgst, sgst, igst, total } = splitGst(1801, true);
    expect(cgst).toBe(sgst);
    expect(cgst).toBe(901);
    expect(igst).toBe(0);
    expect(total).toBe(1802);
    expect(cgst + sgst + igst).toBe(total);
  });

  it('rounds an odd total down when the half rounds down', () => {
    const { cgst, sgst, total } = splitGst(1799, true);
    expect(cgst).toBe(900);
    expect(sgst).toBe(900);
    expect(total).toBe(1800);
  });

  it('uses IGST for inter-state supply, where no split applies', () => {
    expect(splitGst(18000, false)).toEqual({ cgst: 0, sgst: 0, igst: 18000, total: 18000 });
  });

  it('leaves an odd inter-state amount untouched', () => {
    expect(splitGst(1801, false)).toEqual({ cgst: 0, sgst: 0, igst: 1801, total: 1801 });
  });
});

describe('allocateProportionally', () => {
  it('distributes exactly, with no paise created or lost', () => {
    const parts = allocateProportionally(10000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10000);
    expect(parts).toEqual([3334, 3333, 3333]);
  });

  it('weights by line value', () => {
    const parts = allocateProportionally(30000, [100000, 50000]);
    expect(parts).toEqual([20000, 10000]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(30000);
  });

  it('always sums to the total across awkward inputs', () => {
    const cases: Array<[number, number[]]> = [
      [1, [1, 1, 1]],
      [7, [3, 5, 11]],
      [99999, [7, 13, 19, 23]],
      [12345, [1]],
      [0, [5, 5]],
    ];
    for (const [total, weights] of cases) {
      expect(allocateProportionally(total, weights).reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it('does not lose the total when all weights are zero', () => {
    expect(allocateProportionally(500, [0, 0])).toEqual([500, 0]);
  });
});

describe('discountPercentage', () => {
  it('rounds down so a saving is never overstated', () => {
    expect(discountPercentage(100000, 75001)).toBe(24);
    expect(discountPercentage(100000, 50000)).toBe(50);
    expect(discountPercentage(100000, 100000)).toBe(0);
  });
});

describe('formatPaise', () => {
  it('formats in the Indian numbering system', () => {
    expect(formatPaise(13490000)).toBe('₹1,34,900');
    expect(formatPaise(99900)).toBe('₹999');
  });

  it('shows paise only when they are non-zero', () => {
    expect(formatPaise(99950)).toBe('₹999.50');
  });
});
