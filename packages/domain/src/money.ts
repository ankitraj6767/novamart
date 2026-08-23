/**
 * Money. Integer paise only (ADR 0004).
 *
 * Every arithmetic operation that could produce a fraction rounds explicitly, once,
 * half-up. Allocation across lines uses the largest-remainder method so parts always
 * sum exactly to the whole — the difference between a settlement that reconciles and
 * one that is out by a paisa per order.
 */

export type Paise = number;

export class MoneyError extends Error {}

function assertInteger(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new MoneyError(`${label} must be an integer number of paise, received ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} exceeds the safe integer range`);
  }
}

/** Half-up rounding to the nearest paisa. */
export function roundPaise(value: number): Paise {
  return Math.sign(value) >= 0 ? Math.floor(value + 0.5) : -Math.floor(-value + 0.5);
}

export function rupeesToPaise(rupees: number): Paise {
  return roundPaise(rupees * 100);
}

export function paiseToRupees(paise: Paise): number {
  assertInteger(paise, 'amount');
  return paise / 100;
}

/**
 * Applies a percentage to a paise amount, rounding half-up once.
 * Mirrors private.apply_percentage() in SQL so client and database agree exactly.
 */
export function applyPercentage(amount: Paise, percentage: number): Paise {
  assertInteger(amount, 'amount');
  if (percentage < 0) throw new MoneyError('Percentage cannot be negative');
  return roundPaise((amount * percentage) / 100);
}

/**
 * Tax component of a tax-inclusive amount. Indian retail prices are quoted inclusive
 * of GST, so the taxable value is derived rather than added.
 * Mirrors private.tax_from_inclusive().
 */
export function taxFromInclusive(inclusiveAmount: Paise, gstRate: number): Paise {
  assertInteger(inclusiveAmount, 'inclusiveAmount');
  if (gstRate === 0) return 0;
  return roundPaise((inclusiveAmount * gstRate) / (100 + gstRate));
}

export function taxableValueFromInclusive(inclusiveAmount: Paise, gstRate: number): Paise {
  return inclusiveAmount - taxFromInclusive(inclusiveAmount, gstRate);
}

/**
 * Splits GST into CGST/SGST (intra-state) or IGST (inter-state).
 * CGST and SGST are always equal halves; the odd paisa goes to CGST so the parts sum
 * exactly to the total.
 */
export function splitGst(
  taxPaise: Paise,
  isIntraState: boolean,
): { cgst: Paise; sgst: Paise; igst: Paise } {
  assertInteger(taxPaise, 'taxPaise');
  if (!isIntraState) return { cgst: 0, sgst: 0, igst: taxPaise };
  const half = Math.floor(taxPaise / 2);
  return { cgst: taxPaise - half, sgst: half, igst: 0 };
}

/**
 * Distributes a total across weights so the parts sum EXACTLY to the total
 * (largest-remainder method). Mirrors private.allocate_proportionally().
 *
 * Used for order-level discounts and shipping, which must be attributed to items for
 * per-item refunds, commission and GST.
 */
export function allocateProportionally(total: Paise, weights: number[]): Paise[] {
  assertInteger(total, 'total');
  if (weights.length === 0) return [];

  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum === 0) {
    // Nothing to weight against: give everything to the first slot rather than losing it.
    return weights.map((_, i) => (i === 0 ? total : 0));
  }

  const exact = weights.map((w) => (total * w) / weightSum);
  const base = exact.map((v) => Math.floor(v));
  let remaining = total - base.reduce((a, b) => a + b, 0);

  // Hand the leftover paise to the largest fractional remainders, deterministically.
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const result = [...base];
  for (const { i } of order) {
    if (remaining <= 0) break;
    result[i] = (result[i] ?? 0) + 1;
    remaining -= 1;
  }

  return result;
}

const INR_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/**
 * Server-side formatting so every client renders identically. Whole rupee amounts
 * drop the decimals, which is what Indian storefronts do.
 */
export function formatPaise(paise: Paise): string {
  assertInteger(paise, 'amount');
  const rupees = paise / 100;
  return paise % 100 === 0
    ? INR_FORMATTER.format(rupees)
    : new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(rupees);
}

export interface Money {
  paise: Paise;
  currency: 'INR';
  display: string;
}

export function money(paise: Paise): Money {
  assertInteger(paise, 'amount');
  return { paise, currency: 'INR', display: formatPaise(paise) };
}

export function sumPaise(...amounts: Paise[]): Paise {
  return amounts.reduce((acc, v) => {
    assertInteger(v, 'amount');
    return acc + v;
  }, 0);
}

/** Discount percentage against MRP, rounded down: never overstate a saving. */
export function discountPercentage(mrp: Paise, price: Paise): number {
  if (mrp <= 0 || price >= mrp) return 0;
  return Math.floor(((mrp - price) / mrp) * 100);
}
