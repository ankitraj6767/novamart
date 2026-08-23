import type { CodDecision, FulfillmentModel, MoneyDto, OrderStatus, PaymentMethod } from './api';

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export interface CategoryDto {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
  slug: string;
  path: string;
  level: number;
  isLeaf: boolean;
  imageUrl: string | null;
  iconUrl: string | null;
  displayOrder: number;
  children?: CategoryDto[];
}

export interface BrandDto {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  productCount: number;
}

export interface ProductCardDto {
  productId: string;
  publicId: string;
  slug: string;
  title: string;
  brandName: string | null;
  categoryPath: string;
  imageUrl: string | null;
  imageBlurhash: string | null;
  /** Buy Box winner for this product. Null when nothing is sellable. */
  listingId: string | null;
  skuId: string | null;
  sellerId: string | null;
  sellerName: string | null;
  mrp: MoneyDto | null;
  price: MoneyDto | null;
  discountPercentage: number | null;
  inStock: boolean;
  averageRating: number;
  ratingCount: number;
  fulfillmentModel: FulfillmentModel | null;
}

export interface ProductDetailDto extends ProductCardDto {
  subtitle: string | null;
  description: string | null;
  highlights: string[];
  media: ProductMediaDto[];
  variants: VariantDto[];
  specifications: SpecificationGroupDto[];
  attributes: AttributeValueDto[];
  offers: OfferDto[];
  warranty: { type: string | null; months: number | null; summary: string | null };
  countryOfOrigin: string;
  returnPolicy: { window: number; type: string; label: string };
  buyBox: ListingOfferDto | null;
  otherOffers: ListingOfferDto[];
  ratingHistogram: Record<'1' | '2' | '3' | '4' | '5', number>;
}

export interface ProductMediaDto {
  id: string;
  type: 'IMAGE' | 'VIDEO' | 'VIEW_360' | 'DOCUMENT';
  url: string;
  altText: string | null;
  blurhash: string | null;
  width: number | null;
  height: number | null;
  isPrimary: boolean;
}

export interface VariantDto {
  id: string;
  label: string;
  isDefault: boolean;
  skuId: string | null;
  attributes: Array<{ code: string; name: string; value: string; swatchHex: string | null }>;
  inStock: boolean;
  price: MoneyDto | null;
}

export interface SpecificationGroupDto {
  group: string;
  items: Array<{ label: string; value: string }>;
}

export interface AttributeValueDto {
  code: string;
  name: string;
  value: string;
  unit: string | null;
  isKeySpecification: boolean;
}

export interface OfferDto {
  type: 'PROMOTION' | 'COUPON' | 'BANK_OFFER';
  code: string;
  title: string;
  description: string;
  termsUrl: string | null;
}

export interface ListingOfferDto {
  listingId: string;
  sellerId: string;
  sellerName: string;
  sellerRating: number | null;
  condition: string;
  mrp: MoneyDto;
  price: MoneyDto;
  discountPercentage: number;
  availableQuantity: number;
  fulfillmentModel: FulfillmentModel;
  handlingTimeDays: number;
  isBuyBoxWinner: boolean;
}

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

export interface CartDto {
  id: string;
  itemsCount: number;
  /** Advisory display total. Checkout recomputes authoritatively. */
  subtotal: MoneyDto;
  deliveryPincode: string | null;
  appliedCouponCode: string | null;
  /** Grouped by seller, which is how the customer will receive the order. */
  sellerGroups: CartSellerGroupDto[];
  savedForLater: CartItemDto[];
  issues: CartIssueDto[];
}

export interface CartSellerGroupDto {
  sellerId: string;
  sellerName: string;
  items: CartItemDto[];
  subtotal: MoneyDto;
}

export interface CartItemDto {
  id: string;
  listingId: string;
  skuId: string;
  productId: string;
  productSlug: string;
  title: string;
  variantLabel: string | null;
  imageUrl: string | null;
  sellerId: string;
  sellerName: string;
  quantity: number;
  maxQuantity: number;
  mrp: MoneyDto;
  price: MoneyDto;
  lineTotal: MoneyDto;
  availabilityStatus:
    | 'AVAILABLE'
    | 'OUT_OF_STOCK'
    | 'LOW_STOCK'
    | 'PRICE_CHANGED'
    | 'LISTING_INACTIVE'
    | 'SELLER_UNAVAILABLE'
    | 'NOT_SERVICEABLE'
    | 'QUANTITY_LIMITED';
  availableQuantity: number | null;
  estimatedDeliveryDate: string | null;
}

export interface CartIssueDto {
  cartItemId: string;
  code: string;
  message: string;
  blocking: boolean;
}

// ---------------------------------------------------------------------------
// Checkout — the authoritative quote
// ---------------------------------------------------------------------------

export interface CheckoutQuoteDto {
  checkoutSessionId: string;
  expiresAt: string;
  status: string;
  shippingAddressId: string | null;
  deliveryPincode: string | null;
  paymentMethod: PaymentMethod | null;
  breakdown: PriceBreakdownDto;
  sellerGroups: CheckoutSellerGroupDto[];
  /** Output of the COD engine with its reasoning, so the UI can explain a refusal. */
  cod: {
    decision: CodDecision;
    prepayAmount: MoneyDto | null;
    reasons: string[];
  } | null;
  appliedCoupon: { code: string; discount: MoneyDto } | null;
  availableOffers: OfferDto[];
  issues: CartIssueDto[];
  /** True when every line validated and payment may be initiated. */
  payable: boolean;
}

export interface CheckoutSellerGroupDto {
  sellerId: string;
  sellerName: string;
  items: CheckoutItemDto[];
  subtotal: MoneyDto;
  shipping: MoneyDto;
  promisedDeliveryDate: string | null;
  warehouseId: string | null;
}

export interface CheckoutItemDto {
  listingId: string;
  skuId: string;
  title: string;
  variantLabel: string | null;
  imageUrl: string | null;
  quantity: number;
  mrp: MoneyDto;
  price: MoneyDto;
  lineTotal: MoneyDto;
  validationStatus: string;
  validationMessage: string | null;
}

export interface PriceBreakdownDto {
  itemsSubtotal: MoneyDto;
  sellerDiscount: MoneyDto;
  platformDiscount: MoneyDto;
  couponDiscount: MoneyDto;
  promotionDiscount: MoneyDto;
  bankOfferDiscount: MoneyDto;
  totalDiscount: MoneyDto;
  shipping: MoneyDto;
  codFee: MoneyDto;
  giftWrap: MoneyDto;
  tax: MoneyDto;
  totalPayable: MoneyDto;
  /** Rule ids that fired, for support and dispute resolution. */
  appliedRules: AppliedRuleDto[];
}

export interface AppliedRuleDto {
  kind: 'PROMOTION' | 'COUPON' | 'BANK_OFFER' | 'COMMISSION' | 'TAX' | 'SHIPPING';
  id: string | null;
  code: string | null;
  label: string;
  amountPaise: number;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export interface OrderSummaryDto {
  id: string;
  orderNumber: string;
  placedAt: string;
  status: OrderStatus;
  fulfillmentSummary: string;
  paymentMethod: PaymentMethod;
  paymentStatus: string;
  itemsCount: number;
  totalPayable: MoneyDto;
  previewImages: string[];
  primaryTitle: string;
}

export interface OrderDetailDto extends OrderSummaryDto {
  breakdown: PriceBreakdownDto;
  shippingAddress: AddressDto;
  billingAddress: AddressDto | null;
  items: OrderItemDto[];
  timeline: OrderTimelineEntryDto[];
  invoiceAvailable: boolean;
  cancellable: boolean;
  isCod: boolean;
  promisedDeliveryDate: string | null;
}

export interface OrderItemDto {
  id: string;
  itemNumber: string;
  productId: string;
  productSlug: string;
  title: string;
  variantLabel: string | null;
  imageUrl: string | null;
  skuCode: string;
  sellerId: string;
  sellerName: string;
  quantity: number;
  status: OrderStatus;
  unitPrice: MoneyDto;
  lineTotal: MoneyDto;
  promisedDeliveryDate: string | null;
  deliveredAt: string | null;
  returnEligibleUntil: string | null;
  returnable: boolean;
  cancellable: boolean;
  shipment: ShipmentSummaryDto | null;
  refundStatus: string | null;
}

export interface OrderTimelineEntryDto {
  at: string;
  titleKey: string;
  descriptionKey: string | null;
  params: Record<string, unknown>;
  icon: string | null;
}

export interface ShipmentSummaryDto {
  id: string;
  reference: string;
  status: string;
  carrierName: string | null;
  awbNumber: string | null;
  trackingUrl: string | null;
  estimatedDeliveryDate: string | null;
  events: Array<{ at: string; status: string; description: string; location: string | null }>;
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export interface AddressDto {
  id: string;
  label: 'HOME' | 'WORK' | 'OTHER';
  recipientName: string;
  recipientPhone: string;
  alternatePhone: string | null;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  locality: string | null;
  city: string;
  stateCode: string;
  stateName?: string;
  pincode: string;
  countryCode: 'IN';
  isDefault: boolean;
  deliveryInstructions: string | null;
}

export interface ProfileDto {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  preferredLocale: string;
  accountStatus: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  lifetimeOrderCount: number;
  roles: string[];
  permissions: string[];
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export interface PaymentSessionDto {
  paymentIntentId: string;
  orderId: string;
  orderNumber: string;
  provider: string;
  amount: MoneyDto;
  paymentMethod: PaymentMethod;
  /** Provider handoff data. Publishable values only, never a secret. */
  providerSession: Record<string, unknown>;
  expiresAt: string | null;
  /** COD orders are confirmed immediately; no provider handoff is needed. */
  requiresProviderFlow: boolean;
}

export interface PaymentStatusDto {
  paymentIntentId: string;
  orderId: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  orderStatus: OrderStatus;
  amount: MoneyDto;
  capturedAmount: MoneyDto;
  failureCode: string | null;
  failureReason: string | null;
  /** True once a verified server-side source confirmed the outcome. */
  verified: boolean;
}

// ---------------------------------------------------------------------------
// CMS
// ---------------------------------------------------------------------------

export interface HomeSectionDto {
  id: string;
  code: string;
  type: string;
  title: string | null;
  subtitle: string | null;
  position: number;
  configuration: Record<string, unknown>;
  banners: BannerDto[];
  /** Resolved server-side for product-bearing section types. */
  products?: ProductCardDto[];
  categories?: CategoryDto[];
}

export interface BannerDto {
  id: string;
  altText: string;
  imageUrlMobile: string;
  imageUrlDesktop: string | null;
  imageUrlTablet: string | null;
  backgroundColor: string | null;
  linkType: string;
  linkTarget: string | null;
  ctaLabel: string | null;
}

export interface ServiceabilityDto {
  pincode: string;
  city: string;
  state: string;
  stateCode: string;
  isServiceable: boolean;
  prepaidAvailable: boolean;
  codAvailable: boolean;
  estimatedDays: number;
  isSuspended: boolean;
}
