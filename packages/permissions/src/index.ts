/**
 * Permission and role catalogue.
 *
 * Mirrors supabase/seed/02_rbac.sql. The database is the authority at runtime; this
 * gives the API guard, the consoles and the tests compile-time safety so a typo in a
 * permission string is a build error rather than a silent 403.
 */

export const PERMISSIONS = {
  // Customer
  CUSTOMER_READ: 'customer.read',
  CUSTOMER_READ_ADDRESS: 'customer.read_address',
  CUSTOMER_UPDATE: 'customer.update',
  CUSTOMER_SUSPEND: 'customer.suspend',
  CUSTOMER_EXPORT: 'customer.export',
  CUSTOMER_DELETE: 'customer.delete',

  // Catalog
  CATEGORY_MANAGE: 'category.manage',
  BRAND_MANAGE: 'brand.manage',
  ATTRIBUTE_MANAGE: 'attribute.manage',
  PRODUCT_READ: 'product.read',
  PRODUCT_CREATE: 'product.create',
  PRODUCT_UPDATE: 'product.update',
  PRODUCT_MANAGE: 'product.manage',
  PRODUCT_APPROVE: 'product.approve',
  PRODUCT_BLOCK: 'product.block',
  LISTING_CREATE: 'listing.create',
  LISTING_UPDATE: 'listing.update',
  LISTING_MANAGE: 'listing.manage',
  LISTING_SUPPRESS: 'listing.suppress',

  // Pricing
  PRICE_READ: 'price.read',
  PRICE_UPDATE: 'price.update',
  PRICE_OVERRIDE: 'price.override',
  PROMOTION_MANAGE: 'promotion.manage',
  PROMOTION_APPROVE: 'promotion.approve',
  COMMISSION_READ: 'commission.read',
  COMMISSION_MANAGE: 'commission.manage',
  TAX_MANAGE: 'tax.manage',

  // Seller
  SELLER_READ: 'seller.read',
  SELLER_UPDATE: 'seller.update',
  SELLER_APPROVE: 'seller.approve',
  SELLER_REJECT: 'seller.reject',
  SELLER_SUSPEND: 'seller.suspend',
  SELLER_USER_MANAGE: 'seller_user.manage',
  SELLER_DOCUMENT_UPLOAD: 'seller_document.upload',
  SELLER_DOCUMENT_READ: 'seller_document.read',
  SELLER_DOCUMENT_VERIFY: 'seller_document.verify',
  SELLER_BANK_READ: 'seller_bank.read',
  SELLER_BANK_VERIFY: 'seller_bank.verify',
  SELLER_TAX_READ: 'seller_tax.read',

  // Inventory
  INVENTORY_READ: 'inventory.read',
  INVENTORY_READ_LEDGER: 'inventory.read_ledger',
  INVENTORY_RECEIVE: 'inventory.receive',
  INVENTORY_ADJUST: 'inventory.adjust',
  INVENTORY_APPROVE_ADJUSTMENT: 'inventory.approve_adjustment',
  INVENTORY_TRANSFER: 'inventory.transfer',
  INVENTORY_COUNT: 'inventory.count',
  WAREHOUSE_READ: 'warehouse.read',
  WAREHOUSE_MANAGE: 'warehouse.manage',

  // Orders
  ORDER_READ: 'order.read',
  ORDER_CANCEL: 'order.cancel',
  ORDER_UPDATE_STATUS: 'order.update_status',
  ORDER_OVERRIDE_STATUS: 'order.override_status',
  ORDER_REASSIGN: 'order.reassign',

  // Payments
  PAYMENT_READ: 'payment.read',
  PAYMENT_RECONCILE: 'payment.reconcile',
  REFUND_READ: 'refund.read',
  REFUND_CREATE: 'refund.create',
  REFUND_APPROVE: 'refund.approve',
  COD_RECONCILE: 'cod.reconcile',

  // Fulfillment
  SHIPMENT_READ: 'shipment.read',
  SHIPMENT_CREATE: 'shipment.create',
  SHIPMENT_CANCEL: 'shipment.cancel',
  SHIPPING_READ: 'shipping.read',
  SHIPPING_MANAGE: 'shipping.manage',
  DELIVERY_MANAGE: 'delivery.manage',
  PINCODE_MANAGE: 'pincode.manage',

  // Returns
  RETURN_READ: 'return.read',
  RETURN_APPROVE: 'return.approve',
  RETURN_QC: 'return.qc',
  RETURN_POLICY_MANAGE: 'return.policy_manage',

  // Finance
  FINANCE_READ: 'finance.read',
  FINANCE_READ_ALL: 'finance.read_all',
  FINANCE_ADJUST: 'finance.adjust',
  FINANCE_APPROVE_ADJUSTMENT: 'finance.approve_adjustment',
  SETTLEMENT_READ: 'settlement.read',
  SETTLEMENT_READ_ALL: 'settlement.read_all',
  SETTLEMENT_PROCESS: 'settlement.process',
  PAYOUT_READ: 'payout.read',
  PAYOUT_READ_ALL: 'payout.read_all',
  PAYOUT_INITIATE: 'payout.initiate',
  INVOICE_READ: 'invoice.read',

  // Trust and content
  REVIEW_MODERATE: 'review.moderate',
  CMS_MANAGE: 'cms.manage',
  SEARCH_MANAGE: 'search.manage',
  SEGMENT_MANAGE: 'segment.manage',
  NOTIFICATION_MANAGE: 'notification.manage',

  // Support
  TICKET_READ: 'ticket.read',
  TICKET_ASSIGN: 'ticket.assign',
  TICKET_RESPOND: 'ticket.respond',
  TICKET_ESCALATE: 'ticket.escalate',
  TICKET_CLOSE: 'ticket.close',

  // Risk
  RISK_READ: 'risk.read',
  RISK_MANAGE: 'risk.manage',
  FRAUD_CASE_MANAGE: 'fraud_case.manage',

  // Platform
  ROLE_READ: 'role.read',
  ROLE_GRANT: 'role.grant',
  ROLE_REVOKE: 'role.revoke',
  EMPLOYEE_MANAGE: 'employee.manage',
  SETTING_READ: 'setting.read',
  SETTING_MANAGE: 'setting.manage',
  FEATURE_FLAG_MANAGE: 'feature_flag.manage',
  INTEGRATION_MANAGE: 'integration.manage',
  AUDIT_READ: 'audit.read',
  DOCUMENT_READ: 'document.read',
  ANALYTICS_READ: 'analytics.read',
  MAINTENANCE_MANAGE: 'maintenance.manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLES = {
  CUSTOMER: 'CUSTOMER',
  DELIVERY_AGENT: 'DELIVERY_AGENT',
  WAREHOUSE_PICKER: 'WAREHOUSE_PICKER',
  WAREHOUSE_PACKER: 'WAREHOUSE_PACKER',
  WAREHOUSE_QC: 'WAREHOUSE_QC',
  INVENTORY_EMPLOYEE: 'INVENTORY_EMPLOYEE',
  WAREHOUSE_MANAGER: 'WAREHOUSE_MANAGER',
  SELLER_CATALOG_MANAGER: 'SELLER_CATALOG_MANAGER',
  SELLER_ORDER_MANAGER: 'SELLER_ORDER_MANAGER',
  SELLER_FINANCE_MANAGER: 'SELLER_FINANCE_MANAGER',
  SELLER_ADMIN: 'SELLER_ADMIN',
  SELLER_OWNER: 'SELLER_OWNER',
  SUPPORT_AGENT: 'SUPPORT_AGENT',
  SUPPORT_MANAGER: 'SUPPORT_MANAGER',
  CATALOG_MANAGER: 'CATALOG_MANAGER',
  CATEGORY_MANAGER: 'CATEGORY_MANAGER',
  MARKETING_MANAGER: 'MARKETING_MANAGER',
  OPERATIONS_MANAGER: 'OPERATIONS_MANAGER',
  FRAUD_ANALYST: 'FRAUD_ANALYST',
  FINANCE_MANAGER: 'FINANCE_MANAGER',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/** Which console a role may reach. Enforced by middleware in each Next.js app. */
export const ROLE_CONSOLE: Record<Role, 'storefront' | 'seller' | 'admin' | 'operations' | 'support'> = {
  CUSTOMER: 'storefront',
  DELIVERY_AGENT: 'operations',
  WAREHOUSE_PICKER: 'operations',
  WAREHOUSE_PACKER: 'operations',
  WAREHOUSE_QC: 'operations',
  INVENTORY_EMPLOYEE: 'operations',
  WAREHOUSE_MANAGER: 'operations',
  SELLER_CATALOG_MANAGER: 'seller',
  SELLER_ORDER_MANAGER: 'seller',
  SELLER_FINANCE_MANAGER: 'seller',
  SELLER_ADMIN: 'seller',
  SELLER_OWNER: 'seller',
  SUPPORT_AGENT: 'support',
  SUPPORT_MANAGER: 'support',
  CATALOG_MANAGER: 'admin',
  CATEGORY_MANAGER: 'admin',
  MARKETING_MANAGER: 'admin',
  OPERATIONS_MANAGER: 'operations',
  FRAUD_ANALYST: 'admin',
  FINANCE_MANAGER: 'admin',
  ADMIN: 'admin',
  SUPER_ADMIN: 'admin',
};

/** Permissions that always require a reason string and always produce an audit row. */
export const REASON_REQUIRED_PERMISSIONS: ReadonlySet<string> = new Set([
  PERMISSIONS.CUSTOMER_READ_ADDRESS,
  PERMISSIONS.CUSTOMER_UPDATE,
  PERMISSIONS.CUSTOMER_SUSPEND,
  PERMISSIONS.CUSTOMER_EXPORT,
  PERMISSIONS.CUSTOMER_DELETE,
  PERMISSIONS.PRODUCT_BLOCK,
  PERMISSIONS.LISTING_SUPPRESS,
  PERMISSIONS.PRICE_OVERRIDE,
  PERMISSIONS.COMMISSION_MANAGE,
  PERMISSIONS.TAX_MANAGE,
  PERMISSIONS.SELLER_REJECT,
  PERMISSIONS.SELLER_SUSPEND,
  PERMISSIONS.SELLER_DOCUMENT_VERIFY,
  PERMISSIONS.SELLER_BANK_VERIFY,
  PERMISSIONS.INVENTORY_ADJUST,
  PERMISSIONS.INVENTORY_APPROVE_ADJUSTMENT,
  PERMISSIONS.ORDER_CANCEL,
  PERMISSIONS.ORDER_OVERRIDE_STATUS,
  PERMISSIONS.ORDER_REASSIGN,
  PERMISSIONS.REFUND_CREATE,
  PERMISSIONS.REFUND_APPROVE,
  PERMISSIONS.RETURN_APPROVE,
  PERMISSIONS.FINANCE_ADJUST,
  PERMISSIONS.FINANCE_APPROVE_ADJUSTMENT,
  PERMISSIONS.SETTLEMENT_PROCESS,
  PERMISSIONS.PAYOUT_INITIATE,
  PERMISSIONS.REVIEW_MODERATE,
  PERMISSIONS.TICKET_ESCALATE,
  PERMISSIONS.RISK_MANAGE,
  PERMISSIONS.FRAUD_CASE_MANAGE,
  PERMISSIONS.ROLE_GRANT,
  PERMISSIONS.ROLE_REVOKE,
  PERMISSIONS.EMPLOYEE_MANAGE,
  PERMISSIONS.SETTING_MANAGE,
  PERMISSIONS.INTEGRATION_MANAGE,
  PERMISSIONS.MAINTENANCE_MANAGE,
  PERMISSIONS.SHIPMENT_CANCEL,
]);

/** Permissions requiring step-up authentication before the action proceeds. */
export const MFA_REQUIRED_PERMISSIONS: ReadonlySet<string> = new Set([
  PERMISSIONS.CUSTOMER_SUSPEND,
  PERMISSIONS.CUSTOMER_EXPORT,
  PERMISSIONS.CUSTOMER_DELETE,
  PERMISSIONS.PRICE_OVERRIDE,
  PERMISSIONS.COMMISSION_MANAGE,
  PERMISSIONS.TAX_MANAGE,
  PERMISSIONS.SELLER_APPROVE,
  PERMISSIONS.SELLER_SUSPEND,
  PERMISSIONS.SELLER_DOCUMENT_VERIFY,
  PERMISSIONS.SELLER_BANK_VERIFY,
  PERMISSIONS.ORDER_OVERRIDE_STATUS,
  PERMISSIONS.REFUND_APPROVE,
  PERMISSIONS.FINANCE_APPROVE_ADJUSTMENT,
  PERMISSIONS.SETTLEMENT_PROCESS,
  PERMISSIONS.PAYOUT_INITIATE,
  PERMISSIONS.RISK_MANAGE,
  PERMISSIONS.ROLE_GRANT,
  PERMISSIONS.ROLE_REVOKE,
  PERMISSIONS.EMPLOYEE_MANAGE,
  PERMISSIONS.SETTING_MANAGE,
  PERMISSIONS.INTEGRATION_MANAGE,
  PERMISSIONS.MAINTENANCE_MANAGE,
]);

export type ScopeType = 'seller' | 'warehouse' | 'region' | 'category';

/** Roles that must be granted with a scope, and which scope type. */
export const ROLE_REQUIRED_SCOPE: Partial<Record<Role, ScopeType>> = {
  SELLER_CATALOG_MANAGER: 'seller',
  SELLER_ORDER_MANAGER: 'seller',
  SELLER_FINANCE_MANAGER: 'seller',
  SELLER_ADMIN: 'seller',
  SELLER_OWNER: 'seller',
  WAREHOUSE_PICKER: 'warehouse',
  WAREHOUSE_PACKER: 'warehouse',
  WAREHOUSE_QC: 'warehouse',
  INVENTORY_EMPLOYEE: 'warehouse',
  WAREHOUSE_MANAGER: 'warehouse',
};

export function requiresReason(permission: string): boolean {
  return REASON_REQUIRED_PERMISSIONS.has(permission);
}

export function requiresMfa(permission: string): boolean {
  return MFA_REQUIRED_PERMISSIONS.has(permission);
}
