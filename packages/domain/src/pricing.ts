/**
 * The pricing engine (brief §27).
 *
 * Pure functions: no I/O, no database, no clock. The caller loads the inputs from the
 * database and passes them in, which makes the whole computation unit-testable and
 * makes it impossible for a client-supplied value to leak into a total.
 *
 * Fixed order of operations, and every step rounds once:
 *   MRP → seller discount → platform discount → coupon → offer → bank offer
 *       → shipping → other charges → GST split → final payable
 *
 * Order-level amounts (coupon, shipping) are allocated back to lines with the
 * largest-remainder method so per-item refunds, commission and GST all reconcile.
 */

import {
  allocateProportionally,
  applyPercentage,
  splitGst,
  taxFromInclusive,
  type Paise,
} from './money';

export interface PricingLineInput {
  lineKey: string;
  listingId: string;
  skuId: string;
  sellerId: string;
  quantity: number;
  /** MRP declared by this seller for this listing. */
  unitMrpPaise: Paise;
  /** Seller's current selling price, already net of any seller-funded discount. */
  unitSellingPricePaise: Paise;
  hsnCode: string | null;
  gstRate: number;
  cessRate?: number;
  /** Seller's state of supply, from the dispatching warehouse. */
  supplyStateCode: string;
}

export interface PromotionInput {
  id: string;
  code: string;
  label: string;
  fundedBy: 'PLATFORM' | 'SELLER' | 'BRAND' | 'SHARED';
  type: 'PERCENTAGE_OFF' | 'FLAT_OFF' | 'FREE_SHIPPING';
  percentage?: number;
  flatPaise?: Paise;
  maxDiscountPaise?: Paise;
  /** Lines this promotion applies to. Empty means the whole cart. */
  appliesToLineKeys: string[];
  isExclusive: boolean;
  stackPriority: number;
}

export interface CouponInput {
  id: string;
  code: string;
  discountType: 'PERCENTAGE' | 'FLAT' | 'FREE_SHIPPING';
  percentage?: number;
  flatPaise?: Paise;
  maxDiscountPaise?: Paise;
  minCartValuePaise: Paise;
  /** Restrict to a subset of lines; empty means all. */
  appliesToLineKeys: string[];
}

export interface BankOfferInput {
  id: string;
  code: string;
  label: string;
  discountType: 'INSTANT_PERCENTAGE' | 'INSTANT_FLAT' | 'CASHBACK_PERCENTAGE' | 'CASHBACK_FLAT';
  percentage?: number;
  flatPaise?: Paise;
  maxDiscountPaise?: Paise;
  minTransactionPaise: Paise;
}

export interface PricingContext {
  lines: PricingLineInput[];
  /** Customer's state, for the CGST/SGST vs IGST decision. */
  customerStateCode: string;
  promotions: PromotionInput[];
  coupon: CouponInput | null;
  bankOffer: BankOfferInput | null;
  /** Per-seller shipping, already computed by the shipping engine. */
  shippingBySeller: Record<string, Paise>;
  freeShippingThresholdPaise: Paise | null;
  codFeePaise: Paise;
  giftWrapPaise: Paise;
  /** Round the final payable to whole rupees (some COD flows require it). */
  roundToWholeRupee: boolean;
}

export interface PricedLine {
  lineKey: string;
  listingId: string;
  skuId: string;
  sellerId: string;
  quantity: number;
  unitMrpPaise: Paise;
  unitSellingPricePaise: Paise;
  grossPaise: Paise;
  sellerDiscountPaise: Paise;
  platformDiscountPaise: Paise;
  couponDiscountPaise: Paise;
  promotionDiscountPaise: Paise;
  bankOfferDiscountPaise: Paise;
  totalDiscountPaise: Paise;
  shippingPaise: Paise;
  codFeePaise: Paise;
  giftWrapPaise: Paise;
  taxableValuePaise: Paise;
  gstRate: number;
  cgstPaise: Paise;
  sgstPaise: Paise;
  igstPaise: Paise;
  cessPaise: Paise;
  totalTaxPaise: Paise;
  totalPayablePaise: Paise;
  isIntraState: boolean;
  placeOfSupplyStateCode: string;
}

export interface AppliedRule {
  kind: 'PROMOTION' | 'COUPON' | 'BANK_OFFER' | 'SHIPPING' | 'TAX';
  id: string | null;
  code: string | null;
  label: string;
  amountPaise: Paise;
}

export interface PricingResult {
  lines: PricedLine[];
  itemsGrossPaise: Paise;
  sellerDiscountPaise: Paise;
  platformDiscountPaise: Paise;
  couponDiscountPaise: Paise;
  promotionDiscountPaise: Paise;
  bankOfferDiscountPaise: Paise;
  totalDiscountPaise: Paise;
  shippingPaise: Paise;
  codFeePaise: Paise;
  giftWrapPaise: Paise;
  taxableValuePaise: Paise;
  cgstPaise: Paise;
  sgstPaise: Paise;
  igstPaise: Paise;
  cessPaise: Paise;
  totalTaxPaise: Paise;
  roundingAdjustmentPaise: number;
  totalPayablePaise: Paise;
  appliedRules: AppliedRule[];
}

/** Cart value used for threshold checks: gross less item-level discounts. */
function lineNetBeforeOrderDiscounts(line: PricingLineInput): Paise {
  return line.unitSellingPricePaise * line.quantity;
}

export function computePricing(ctx: PricingContext): PricingResult {
  if (ctx.lines.length === 0) {
    throw new Error('Pricing requires at least one line');
  }

  const appliedRules: AppliedRule[] = [];

  // Step 1: gross and seller discount, per line.
  const gross = ctx.lines.map((l) => l.unitSellingPricePaise * l.quantity);
  const sellerDiscount = ctx.lines.map(
    (l) => Math.max(0, l.unitMrpPaise - l.unitSellingPricePaise) * l.quantity,
  );

  const netBeforeOrderDiscounts = ctx.lines.reduce(
    (acc, l) => acc + lineNetBeforeOrderDiscounts(l),
    0,
  );

  // Step 2: promotions. Exclusive promotions suppress others on the lines they touch.
  const promotionDiscount = new Array<Paise>(ctx.lines.length).fill(0);
  const platformDiscount = new Array<Paise>(ctx.lines.length).fill(0);
  let freeShippingFromPromotion = false;

  const sortedPromotions = [...ctx.promotions].sort((a, b) => a.stackPriority - b.stackPriority);
  const exclusivelyClaimed = new Set<string>();

  for (const promo of sortedPromotions) {
    const targetIdx = ctx.lines
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => promo.appliesToLineKeys.length === 0 || promo.appliesToLineKeys.includes(l.lineKey))
      .filter(({ l }) => !exclusivelyClaimed.has(l.lineKey));

    if (targetIdx.length === 0) continue;

    if (promo.type === 'FREE_SHIPPING') {
      freeShippingFromPromotion = true;
      appliedRules.push({
        kind: 'PROMOTION',
        id: promo.id,
        code: promo.code,
        label: promo.label,
        amountPaise: 0,
      });
      continue;
    }

    const targetBase = targetIdx.reduce((acc, { i }) => acc + (gross[i] ?? 0), 0);
    if (targetBase <= 0) continue;

    let discount =
      promo.type === 'PERCENTAGE_OFF'
        ? applyPercentage(targetBase, promo.percentage ?? 0)
        : (promo.flatPaise ?? 0);

    if (promo.maxDiscountPaise !== undefined) {
      discount = Math.min(discount, promo.maxDiscountPaise);
    }
    discount = Math.min(discount, targetBase);
    if (discount <= 0) continue;

    // Spread across the targeted lines by value, exactly.
    const parts = allocateProportionally(
      discount,
      targetIdx.map(({ i }) => gross[i] ?? 0),
    );
    targetIdx.forEach(({ i, l }, k) => {
      const part = parts[k] ?? 0;
      promotionDiscount[i] = (promotionDiscount[i] ?? 0) + part;
      if (promo.fundedBy === 'PLATFORM' || promo.fundedBy === 'SHARED') {
        platformDiscount[i] = (platformDiscount[i] ?? 0) + part;
      }
      if (promo.isExclusive) exclusivelyClaimed.add(l.lineKey);
    });

    appliedRules.push({
      kind: 'PROMOTION',
      id: promo.id,
      code: promo.code,
      label: promo.label,
      amountPaise: discount,
    });
  }

  const afterPromotions = gross.map((g, i) => g - (promotionDiscount[i] ?? 0));
  const cartAfterPromotions = afterPromotions.reduce((a, b) => a + b, 0);

  // Step 3: coupon, applied to the post-promotion value.
  const couponDiscount = new Array<Paise>(ctx.lines.length).fill(0);
  let freeShippingFromCoupon = false;

  if (ctx.coupon && cartAfterPromotions >= ctx.coupon.minCartValuePaise) {
    const coupon = ctx.coupon;
    const targetIdx = ctx.lines
      .map((l, i) => ({ l, i }))
      .filter(
        ({ l }) => coupon.appliesToLineKeys.length === 0 || coupon.appliesToLineKeys.includes(l.lineKey),
      );

    if (coupon.discountType === 'FREE_SHIPPING') {
      freeShippingFromCoupon = true;
      appliedRules.push({
        kind: 'COUPON',
        id: coupon.id,
        code: coupon.code,
        label: `Coupon ${coupon.code}`,
        amountPaise: 0,
      });
    } else {
      const base = targetIdx.reduce((acc, { i }) => acc + (afterPromotions[i] ?? 0), 0);
      let discount =
        coupon.discountType === 'PERCENTAGE'
          ? applyPercentage(base, coupon.percentage ?? 0)
          : (coupon.flatPaise ?? 0);

      if (coupon.maxDiscountPaise !== undefined) {
        discount = Math.min(discount, coupon.maxDiscountPaise);
      }
      discount = Math.min(discount, base);

      if (discount > 0) {
        const parts = allocateProportionally(
          discount,
          targetIdx.map(({ i }) => afterPromotions[i] ?? 0),
        );
        targetIdx.forEach(({ i }, k) => {
          couponDiscount[i] = parts[k] ?? 0;
        });
        appliedRules.push({
          kind: 'COUPON',
          id: coupon.id,
          code: coupon.code,
          label: `Coupon ${coupon.code}`,
          amountPaise: discount,
        });
      }
    }
  }

  const afterCoupon = afterPromotions.map((v, i) => v - (couponDiscount[i] ?? 0));
  const cartAfterCoupon = afterCoupon.reduce((a, b) => a + b, 0);

  // Step 4: shipping, per seller, before the bank offer (bank offers apply to the
  // transaction amount, which includes shipping).
  const freeShipping =
    freeShippingFromPromotion ||
    freeShippingFromCoupon ||
    (ctx.freeShippingThresholdPaise !== null && cartAfterCoupon >= ctx.freeShippingThresholdPaise);

  const shippingPerLine = new Array<Paise>(ctx.lines.length).fill(0);
  let shippingTotal = 0;

  if (!freeShipping) {
    for (const [sellerId, sellerShipping] of Object.entries(ctx.shippingBySeller)) {
      if (sellerShipping <= 0) continue;
      const idx = ctx.lines
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => l.sellerId === sellerId);
      if (idx.length === 0) continue;

      const parts = allocateProportionally(
        sellerShipping,
        idx.map(({ i }) => afterCoupon[i] ?? 0),
      );
      idx.forEach(({ i }, k) => {
        shippingPerLine[i] = parts[k] ?? 0;
      });
      shippingTotal += sellerShipping;
    }
    if (shippingTotal > 0) {
      appliedRules.push({
        kind: 'SHIPPING',
        id: null,
        code: null,
        label: 'Delivery charges',
        amountPaise: shippingTotal,
      });
    }
  } else {
    appliedRules.push({
      kind: 'SHIPPING',
      id: null,
      code: null,
      label: 'Free delivery',
      amountPaise: 0,
    });
  }

  // COD fee and gift wrap, spread by line value.
  const codPerLine = allocateProportionally(ctx.codFeePaise, afterCoupon);
  const giftWrapPerLine = allocateProportionally(ctx.giftWrapPaise, afterCoupon);

  const transactionBeforeBankOffer =
    cartAfterCoupon + shippingTotal + ctx.codFeePaise + ctx.giftWrapPaise;

  // Step 5: bank offer, on the transaction amount. Instant discounts reduce the
  // payable; cashback does not (it is credited by the bank later).
  const bankOfferDiscount = new Array<Paise>(ctx.lines.length).fill(0);

  if (
    ctx.bankOffer &&
    transactionBeforeBankOffer >= ctx.bankOffer.minTransactionPaise &&
    (ctx.bankOffer.discountType === 'INSTANT_PERCENTAGE' ||
      ctx.bankOffer.discountType === 'INSTANT_FLAT')
  ) {
    const offer = ctx.bankOffer;
    let discount =
      offer.discountType === 'INSTANT_PERCENTAGE'
        ? applyPercentage(transactionBeforeBankOffer, offer.percentage ?? 0)
        : (offer.flatPaise ?? 0);

    if (offer.maxDiscountPaise !== undefined) {
      discount = Math.min(discount, offer.maxDiscountPaise);
    }
    discount = Math.min(discount, cartAfterCoupon);

    if (discount > 0) {
      const parts = allocateProportionally(discount, afterCoupon);
      parts.forEach((p, i) => {
        bankOfferDiscount[i] = p;
      });
      appliedRules.push({
        kind: 'BANK_OFFER',
        id: offer.id,
        code: offer.code,
        label: offer.label,
        amountPaise: discount,
      });
    }
  }

  // Step 6: per-line totals and GST. Indian retail prices are tax-inclusive, so the
  // taxable value is derived from the payable, not added to it.
  const pricedLines: PricedLine[] = ctx.lines.map((line, i) => {
    const isIntraState = line.supplyStateCode === ctx.customerStateCode;
    const g = gross[i] ?? 0;
    const promo = promotionDiscount[i] ?? 0;
    const coup = couponDiscount[i] ?? 0;
    const bank = bankOfferDiscount[i] ?? 0;
    const ship = shippingPerLine[i] ?? 0;
    const cod = codPerLine[i] ?? 0;
    const wrap = giftWrapPerLine[i] ?? 0;
    const seller = sellerDiscount[i] ?? 0;
    const platform = platformDiscount[i] ?? 0;

    const totalDiscount = promo + coup + bank;
    const totalPayable = g - totalDiscount + ship + cod + wrap;

    const taxOnGoods = taxFromInclusive(g - totalDiscount, line.gstRate);
    // Shipping and handling attract GST at the same rate as the goods they carry.
    const taxOnCharges = taxFromInclusive(ship + cod + wrap, line.gstRate);
    const gstTotal = taxOnGoods + taxOnCharges;
    const cess = line.cessRate ? taxFromInclusive(g - totalDiscount, line.cessRate) : 0;
    const { cgst, sgst, igst } = splitGst(gstTotal, isIntraState);

    return {
      lineKey: line.lineKey,
      listingId: line.listingId,
      skuId: line.skuId,
      sellerId: line.sellerId,
      quantity: line.quantity,
      unitMrpPaise: line.unitMrpPaise,
      unitSellingPricePaise: line.unitSellingPricePaise,
      grossPaise: g,
      sellerDiscountPaise: seller,
      platformDiscountPaise: platform,
      couponDiscountPaise: coup,
      promotionDiscountPaise: promo,
      bankOfferDiscountPaise: bank,
      totalDiscountPaise: totalDiscount,
      shippingPaise: ship,
      codFeePaise: cod,
      giftWrapPaise: wrap,
      taxableValuePaise: totalPayable - gstTotal - cess,
      gstRate: line.gstRate,
      cgstPaise: cgst,
      sgstPaise: sgst,
      igstPaise: igst,
      cessPaise: cess,
      totalTaxPaise: gstTotal + cess,
      totalPayablePaise: totalPayable,
      isIntraState,
      placeOfSupplyStateCode: ctx.customerStateCode,
    };
  });

  const sum = (pick: (l: PricedLine) => number): number => pricedLines.reduce((a, l) => a + pick(l), 0);

  const totalPayableBeforeRounding = sum((l) => l.totalPayablePaise);

  // Step 7: optional whole-rupee rounding, recorded as an explicit adjustment so the
  // arithmetic still closes.
  let roundingAdjustment = 0;
  if (ctx.roundToWholeRupee) {
    const remainder = totalPayableBeforeRounding % 100;
    roundingAdjustment = remainder === 0 ? 0 : remainder < 50 ? -remainder : 100 - remainder;
  }

  return {
    lines: pricedLines,
    itemsGrossPaise: sum((l) => l.grossPaise),
    sellerDiscountPaise: sum((l) => l.sellerDiscountPaise),
    platformDiscountPaise: sum((l) => l.platformDiscountPaise),
    couponDiscountPaise: sum((l) => l.couponDiscountPaise),
    promotionDiscountPaise: sum((l) => l.promotionDiscountPaise),
    bankOfferDiscountPaise: sum((l) => l.bankOfferDiscountPaise),
    totalDiscountPaise: sum((l) => l.totalDiscountPaise),
    shippingPaise: sum((l) => l.shippingPaise),
    codFeePaise: sum((l) => l.codFeePaise),
    giftWrapPaise: sum((l) => l.giftWrapPaise),
    taxableValuePaise: sum((l) => l.taxableValuePaise),
    cgstPaise: sum((l) => l.cgstPaise),
    sgstPaise: sum((l) => l.sgstPaise),
    igstPaise: sum((l) => l.igstPaise),
    cessPaise: sum((l) => l.cessPaise),
    totalTaxPaise: sum((l) => l.totalTaxPaise),
    roundingAdjustmentPaise: roundingAdjustment,
    totalPayablePaise: totalPayableBeforeRounding + roundingAdjustment,
    appliedRules,
  };
}

/**
 * Commission for a line, from the rule the database resolved. Kept here so the
 * arithmetic is testable without a database round trip.
 */
export function computeCommission(input: {
  taxableBasePaise: Paise;
  commissionType: 'PERCENTAGE' | 'FIXED' | 'HYBRID';
  percentage: number | null;
  fixedPaise: Paise | null;
  minCommissionPaise: Paise | null;
  maxCommissionPaise: Paise | null;
  commissionGstRate: number;
  closingFeePaise: Paise;
  fulfillmentFeePaise: Paise;
  paymentGatewayFeePercentage: number;
  itemPayablePaise: Paise;
}): {
  commissionPaise: Paise;
  commissionGstPaise: Paise;
  closingFeePaise: Paise;
  fulfillmentFeePaise: Paise;
  paymentGatewayFeePaise: Paise;
  sellerPayablePaise: Paise;
} {
  let commission =
    input.commissionType === 'PERCENTAGE'
      ? applyPercentage(input.taxableBasePaise, input.percentage ?? 0)
      : input.commissionType === 'FIXED'
        ? (input.fixedPaise ?? 0)
        : applyPercentage(input.taxableBasePaise, input.percentage ?? 0) + (input.fixedPaise ?? 0);

  if (input.minCommissionPaise !== null) commission = Math.max(commission, input.minCommissionPaise);
  if (input.maxCommissionPaise !== null) commission = Math.min(commission, input.maxCommissionPaise);

  const commissionGst = applyPercentage(commission, input.commissionGstRate);
  const pgFee = applyPercentage(input.itemPayablePaise, input.paymentGatewayFeePercentage);

  const sellerPayable =
    input.itemPayablePaise -
    commission -
    commissionGst -
    input.closingFeePaise -
    input.fulfillmentFeePaise -
    pgFee;

  return {
    commissionPaise: commission,
    commissionGstPaise: commissionGst,
    closingFeePaise: input.closingFeePaise,
    fulfillmentFeePaise: input.fulfillmentFeePaise,
    paymentGatewayFeePaise: pgFee,
    sellerPayablePaise: sellerPayable,
  };
}
