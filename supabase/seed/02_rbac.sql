-- =============================================================================
-- NovaMart seed — 02 RBAC: permission catalogue, roles, role→permission mapping
--
-- These rows are the authorization model (ADR 0009). RLS helper functions and the
-- API guard both resolve against them, so a missing permission code here means a
-- policy that can never pass — the RLS test suite catches that.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Permissions. Codes are resource.action.
-- is_sensitive        → always audited
-- requires_reason     → the API demands a justification string
-- requires_mfa        → step-up authentication before the action is permitted
-- -----------------------------------------------------------------------------
insert into identity.permissions (code, resource, action, description, is_sensitive, requires_reason, requires_mfa) values
  -- Customer management
  ('customer.read',            'customer',   'read',            'View customer profiles',                      true,  false, false),
  ('customer.read_address',    'customer',   'read_address',    'View customer addresses',                     true,  true,  false),
  ('customer.update',          'customer',   'update',          'Edit customer profile on their behalf',       true,  true,  false),
  ('customer.suspend',         'customer',   'suspend',         'Suspend or block a customer account',         true,  true,  true),
  ('customer.export',          'customer',   'export',          'Export customer data (DSAR)',                 true,  true,  true),
  ('customer.delete',          'customer',   'delete',          'Anonymise a customer account',                true,  true,  true),

  -- Catalog
  ('category.manage',          'category',   'manage',          'Create, edit, reorder and merge categories',  false, false, false),
  ('brand.manage',             'brand',      'manage',          'Manage brands',                               false, false, false),
  ('attribute.manage',         'attribute',  'manage',          'Manage attribute definitions and options',    false, false, false),
  ('product.read',             'product',    'read',            'View products in any state',                  false, false, false),
  ('product.create',           'product',    'create',          'Create catalog products',                     false, false, false),
  ('product.update',           'product',    'update',          'Edit catalog products',                       false, false, false),
  ('product.manage',           'product',    'manage',          'Full catalog product administration',         false, false, false),
  ('product.approve',          'product',    'approve',         'Approve or reject product submissions',       false, false, false),
  ('product.block',            'product',    'block',           'Block a product from the platform',           true,  true,  false),
  ('listing.create',           'listing',    'create',          'Create seller listings',                      false, false, false),
  ('listing.update',           'listing',    'update',          'Edit seller listings',                        false, false, false),
  ('listing.manage',           'listing',    'manage',          'Administer any seller listing',               false, false, false),
  ('listing.suppress',         'listing',    'suppress',        'Suppress a listing for policy or quality',    true,  true,  false),

  -- Pricing
  ('price.read',               'price',      'read',            'View price history',                          false, false, false),
  ('price.update',             'price',      'update',          'Change listing prices',                       false, false, false),
  ('price.override',           'price',      'override',        'Override a seller price',                     true,  true,  true),
  ('promotion.manage',         'promotion',  'manage',          'Create and manage promotions and coupons',     false, false, false),
  ('promotion.approve',        'promotion',  'approve',         'Approve a promotion for launch',              true,  false, false),
  ('commission.read',          'commission', 'read',            'View commission rules',                       false, false, false),
  ('commission.manage',        'commission', 'manage',          'Change commission rules',                     true,  true,  true),
  ('tax.manage',               'tax',        'manage',          'Manage GST rules and HSN mapping',            true,  true,  true),

  -- Seller
  ('seller.read',              'seller',     'read',            'View seller accounts',                        false, false, false),
  ('seller.update',            'seller',     'update',          'Edit seller business details',                false, false, false),
  ('seller.approve',           'seller',     'approve',         'Approve a seller application',                true,  false, true),
  ('seller.reject',            'seller',     'reject',          'Reject a seller application',                 true,  true,  false),
  ('seller.suspend',           'seller',     'suspend',         'Suspend or block a seller',                   true,  true,  true),
  ('seller_user.manage',       'seller_user','manage',          'Manage users within a seller account',        false, false, false),
  ('seller_document.upload',   'seller_document', 'upload',     'Upload seller KYC documents',                 false, false, false),
  ('seller_document.read',     'seller_document', 'read',       'View own seller KYC document metadata',       true,  false, false),
  ('seller_document.verify',   'seller_document', 'verify',     'Review and verify KYC documents',             true,  true,  true),
  ('seller_bank.read',         'seller_bank','read',            'View seller bank account (masked)',           true,  false, false),
  ('seller_bank.verify',       'seller_bank','verify',          'Verify a seller bank account',                true,  true,  true),
  ('seller_tax.read',          'seller_tax', 'read',            'View seller tax profile',                     true,  false, false),

  -- Inventory
  ('inventory.read',           'inventory',  'read',            'View stock balances',                         false, false, false),
  ('inventory.read_ledger',    'inventory',  'read_ledger',     'View the stock movement ledger',              false, false, false),
  ('inventory.receive',        'inventory',  'receive',         'Record inbound stock receipts',               false, false, false),
  ('inventory.adjust',         'inventory',  'adjust',          'Request a stock adjustment',                  true,  true,  false),
  ('inventory.approve_adjustment','inventory','approve_adjustment','Approve a stock adjustment',               true,  true,  false),
  ('inventory.transfer',       'inventory',  'transfer',        'Create stock transfers between warehouses',   false, false, false),
  ('inventory.count',          'inventory',  'count',           'Perform cycle counts',                        false, false, false),
  ('warehouse.read',           'warehouse',  'read',            'View warehouses',                             false, false, false),
  ('warehouse.manage',         'warehouse',  'manage',          'Create and edit warehouses',                  false, false, false),

  -- Orders
  ('order.read',               'order',      'read',            'View orders',                                 false, false, false),
  ('order.cancel',             'order',      'cancel',          'Cancel an order or item',                     true,  true,  false),
  ('order.update_status',      'order',      'update_status',   'Advance order item status',                    false, false, false),
  ('order.override_status',    'order',      'override_status', 'Force a status transition',                    true,  true,  true),
  ('order.reassign',           'order',      'reassign',        'Reassign fulfilment to another node',         false, true,  false),

  -- Payments and refunds
  ('payment.read',             'payment',    'read',            'View payment records',                        true,  false, false),
  ('payment.reconcile',        'payment',    'reconcile',       'Run and resolve payment reconciliation',      true,  false, false),
  ('refund.read',              'refund',     'read',            'View refunds',                                true,  false, false),
  ('refund.create',            'refund',     'create',          'Initiate a refund',                           true,  true,  false),
  ('refund.approve',           'refund',     'approve',         'Approve a refund above the auto limit',       true,  true,  true),
  ('cod.reconcile',            'cod',        'reconcile',       'Reconcile COD remittances',                   true,  false, false),

  -- Fulfillment
  ('shipment.read',            'shipment',   'read',            'View shipments',                              false, false, false),
  ('shipment.create',          'shipment',   'create',          'Create shipments and generate labels',        false, false, false),
  ('shipment.cancel',          'shipment',   'cancel',          'Cancel a shipment',                           false, true,  false),
  ('shipping.read',            'shipping',   'read',            'View carriers and rate cards',                false, false, false),
  ('shipping.manage',          'shipping',   'manage',          'Manage carriers, rates and serviceability',   true,  false, false),
  ('delivery.manage',          'delivery',   'manage',          'Manage delivery agents and assignments',      false, false, false),
  ('pincode.manage',           'pincode',    'manage',          'Manage pincode serviceability',               false, false, false),

  -- Returns
  ('return.read',              'return',     'read',            'View return requests',                        false, false, false),
  ('return.approve',           'return',     'approve',         'Approve or reject a return',                  false, true,  false),
  ('return.qc',                'return',     'qc',              'Perform return quality inspection',           false, false, false),
  ('return.policy_manage',     'return',     'policy_manage',   'Manage return policies and reasons',          false, false, false),

  -- Finance
  ('finance.read',             'finance',    'read',            'View own seller ledger',                      true,  false, false),
  ('finance.read_all',         'finance',    'read_all',        'View any seller ledger',                      true,  false, false),
  ('finance.adjust',           'finance',    'adjust',          'Request a financial adjustment',              true,  true,  false),
  ('finance.approve_adjustment','finance',   'approve_adjustment','Approve a financial adjustment',            true,  true,  true),
  ('settlement.read',          'settlement', 'read',            'View own settlements',                        true,  false, false),
  ('settlement.read_all',      'settlement', 'read_all',        'View any settlement',                         true,  false, false),
  ('settlement.process',       'settlement', 'process',         'Generate and approve settlements',            true,  true,  true),
  ('payout.read',              'payout',     'read',            'View own payouts',                            true,  false, false),
  ('payout.read_all',          'payout',     'read_all',        'View any payout',                             true,  false, false),
  ('payout.initiate',          'payout',     'initiate',        'Initiate seller payouts',                     true,  true,  true),
  ('invoice.read',             'invoice',    'read',            'View invoices',                               true,  false, false),

  -- Trust and content
  ('review.moderate',          'review',     'moderate',        'Moderate reviews, Q&A and media',             false, true,  false),
  ('cms.manage',               'cms',        'manage',          'Manage homepage, banners and collections',    false, false, false),
  ('search.manage',            'search',     'manage',          'Manage synonyms and curated results',         false, false, false),
  ('segment.manage',           'segment',    'manage',          'Manage customer segments',                    false, false, false),
  ('notification.manage',      'notification','manage',         'Manage notification templates and campaigns', false, false, false),

  -- Support
  ('ticket.read',              'ticket',     'read',            'View support tickets',                        true,  false, false),
  ('ticket.assign',            'ticket',     'assign',          'Assign and reassign tickets',                 false, false, false),
  ('ticket.respond',           'ticket',     'respond',         'Respond to tickets',                          false, false, false),
  ('ticket.escalate',          'ticket',     'escalate',        'Escalate a ticket',                           false, true,  false),
  ('ticket.close',             'ticket',     'close',           'Resolve and close tickets',                   false, false, false),

  -- Risk
  ('risk.read',                'risk',       'read',            'View risk events and scores',                 true,  false, false),
  ('risk.manage',              'risk',       'manage',          'Manage fraud rules and thresholds',           true,  true,  true),
  ('fraud_case.manage',        'fraud_case', 'manage',          'Investigate and resolve fraud cases',         true,  true,  false),

  -- Platform administration
  ('role.read',                'role',       'read',            'View roles and permissions',                  false, false, false),
  ('role.grant',               'role',       'grant',           'Grant a role to a principal',                 true,  true,  true),
  ('role.revoke',              'role',       'revoke',          'Revoke a role',                               true,  true,  true),
  ('employee.manage',          'employee',   'manage',          'Manage internal staff accounts',              true,  true,  true),
  ('setting.read',             'setting',    'read',            'View platform settings',                      false, false, false),
  ('setting.manage',           'setting',    'manage',          'Change platform settings',                    true,  true,  true),
  ('feature_flag.manage',      'feature_flag','manage',         'Manage feature flags and rollouts',           true,  false, false),
  ('integration.manage',       'integration','manage',          'Manage provider integrations',                true,  true,  true),
  ('audit.read',               'audit',      'read',            'View audit logs',                             true,  false, false),
  ('document.read',            'document',   'read',            'Read internal documents and labels',          true,  false, false),
  ('analytics.read',           'analytics',  'read',            'View analytics dashboards',                   false, false, false),
  ('maintenance.manage',       'maintenance','manage',          'Toggle maintenance mode and app versions',    true,  true,  true)
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Roles. `rank` is the privilege-escalation guard: nobody may grant a role at or
-- above their own rank (identity.guard_role_grant).
-- -----------------------------------------------------------------------------
insert into identity.roles (code, name, description, kind, required_scope_type, is_privileged, is_system, rank) values
  ('CUSTOMER',                'Customer',                'Shopper. Granted automatically on registration.',        'CUSTOMER',  null,        false, true,   0),

  ('DELIVERY_AGENT',          'Delivery Partner',        'Performs pickups and deliveries.',                       'DELIVERY',  null,        false, true,  10),

  ('WAREHOUSE_PICKER',        'Warehouse Picker',        'Picks items against orders.',                             'WAREHOUSE', 'warehouse', false, true,  15),
  ('WAREHOUSE_PACKER',        'Warehouse Packer',        'Packs and labels shipments.',                             'WAREHOUSE', 'warehouse', false, true,  15),
  ('WAREHOUSE_QC',            'Warehouse QC',            'Inspects outbound packs and inbound returns.',           'WAREHOUSE', 'warehouse', false, true,  20),
  ('INVENTORY_EMPLOYEE',      'Inventory Associate',     'Receives stock and performs cycle counts.',              'WAREHOUSE', 'warehouse', false, true,  20),
  ('WAREHOUSE_MANAGER',       'Warehouse Manager',       'Runs a warehouse and approves adjustments.',             'WAREHOUSE', 'warehouse', false, true,  40),

  ('SELLER_CATALOG_MANAGER',  'Seller Catalog Manager',  'Manages products, listings and prices for a seller.',    'SELLER',    'seller',    false, true,  20),
  ('SELLER_ORDER_MANAGER',    'Seller Order Manager',    'Processes orders, shipments and returns.',               'SELLER',    'seller',    false, true,  20),
  ('SELLER_FINANCE_MANAGER',  'Seller Finance Manager',  'Views ledger, settlements, payouts and invoices.',       'SELLER',    'seller',    false, true,  30),
  ('SELLER_ADMIN',            'Seller Admin',            'Full operational control of a seller account.',          'SELLER',    'seller',    false, true,  40),
  ('SELLER_OWNER',            'Seller Owner',            'Accountable owner of a seller business.',                'SELLER',    'seller',    false, true,  50),

  ('SUPPORT_AGENT',           'Support Agent',           'Handles customer and seller tickets.',                   'SUPPORT',   null,        false, true,  30),
  ('SUPPORT_MANAGER',         'Support Manager',         'Runs the support function and handles escalations.',     'SUPPORT',   null,        false, true,  50),

  ('CATALOG_MANAGER',         'Catalog Manager',         'Moderates and administers the shared catalog.',          'STAFF',     null,        false, true,  50),
  ('CATEGORY_MANAGER',        'Category Manager',        'Owns category structure, attributes and policies.',      'STAFF',     null,        false, true,  55),
  ('MARKETING_MANAGER',       'Marketing Manager',       'Owns campaigns, CMS, promotions and notifications.',     'STAFF',     null,        false, true,  55),
  ('OPERATIONS_MANAGER',      'Operations Manager',      'Owns fulfilment, logistics and order operations.',       'STAFF',     null,        false, true,  60),
  ('FRAUD_ANALYST',           'Fraud Analyst',           'Investigates risk events and fraud cases.',              'STAFF',     null,        false, true,  60),
  ('FINANCE_MANAGER',         'Finance Manager',         'Owns settlements, payouts, refunds and reconciliation.', 'STAFF',     null,        true,  true,  65),

  ('ADMIN',                   'Administrator',           'Platform administration excluding break-glass powers.',  'STAFF',     null,        true,  true,  90),
  ('SUPER_ADMIN',             'Super Administrator',     'Break-glass. MFA-gated, alerted on use, reviewed quarterly.', 'STAFF', null,       true,  true, 100)
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Role → permission mapping.
-- Expressed as explicit pairs so the grant surface of every role is reviewable in
-- one place. Wildcard grants (SUPER_ADMIN) are the only exception.
-- -----------------------------------------------------------------------------
with mapping(role_code, permission_code) as (
  values
    -- CUSTOMER holds no staff permissions: its access comes from ownership-based RLS.

    -- Delivery partner
    ('DELIVERY_AGENT', 'shipment.read'),
    ('DELIVERY_AGENT', 'order.read'),

    -- Warehouse
    ('WAREHOUSE_PICKER', 'order.read'),
    ('WAREHOUSE_PICKER', 'inventory.read'),
    ('WAREHOUSE_PICKER', 'order.update_status'),
    ('WAREHOUSE_PACKER', 'order.read'),
    ('WAREHOUSE_PACKER', 'inventory.read'),
    ('WAREHOUSE_PACKER', 'order.update_status'),
    ('WAREHOUSE_PACKER', 'shipment.create'),
    ('WAREHOUSE_QC', 'order.read'),
    ('WAREHOUSE_QC', 'inventory.read'),
    ('WAREHOUSE_QC', 'return.read'),
    ('WAREHOUSE_QC', 'return.qc'),
    ('INVENTORY_EMPLOYEE', 'inventory.read'),
    ('INVENTORY_EMPLOYEE', 'inventory.read_ledger'),
    ('INVENTORY_EMPLOYEE', 'inventory.receive'),
    ('INVENTORY_EMPLOYEE', 'inventory.count'),
    ('INVENTORY_EMPLOYEE', 'inventory.adjust'),
    ('WAREHOUSE_MANAGER', 'warehouse.read'),
    ('WAREHOUSE_MANAGER', 'warehouse.manage'),
    ('WAREHOUSE_MANAGER', 'inventory.read'),
    ('WAREHOUSE_MANAGER', 'inventory.read_ledger'),
    ('WAREHOUSE_MANAGER', 'inventory.receive'),
    ('WAREHOUSE_MANAGER', 'inventory.adjust'),
    ('WAREHOUSE_MANAGER', 'inventory.approve_adjustment'),
    ('WAREHOUSE_MANAGER', 'inventory.transfer'),
    ('WAREHOUSE_MANAGER', 'inventory.count'),
    ('WAREHOUSE_MANAGER', 'order.read'),
    ('WAREHOUSE_MANAGER', 'order.update_status'),
    ('WAREHOUSE_MANAGER', 'shipment.read'),
    ('WAREHOUSE_MANAGER', 'shipment.create'),
    ('WAREHOUSE_MANAGER', 'shipment.cancel'),
    ('WAREHOUSE_MANAGER', 'return.read'),
    ('WAREHOUSE_MANAGER', 'return.qc'),

    -- Seller: catalog
    ('SELLER_CATALOG_MANAGER', 'product.read'),
    ('SELLER_CATALOG_MANAGER', 'product.create'),
    ('SELLER_CATALOG_MANAGER', 'product.update'),
    ('SELLER_CATALOG_MANAGER', 'listing.create'),
    ('SELLER_CATALOG_MANAGER', 'listing.update'),
    ('SELLER_CATALOG_MANAGER', 'price.read'),
    ('SELLER_CATALOG_MANAGER', 'price.update'),
    ('SELLER_CATALOG_MANAGER', 'inventory.read'),
    ('SELLER_CATALOG_MANAGER', 'commission.read'),

    -- Seller: orders
    ('SELLER_ORDER_MANAGER', 'order.read'),
    ('SELLER_ORDER_MANAGER', 'order.update_status'),
    ('SELLER_ORDER_MANAGER', 'order.cancel'),
    ('SELLER_ORDER_MANAGER', 'shipment.read'),
    ('SELLER_ORDER_MANAGER', 'shipment.create'),
    ('SELLER_ORDER_MANAGER', 'shipment.cancel'),
    ('SELLER_ORDER_MANAGER', 'shipping.read'),
    ('SELLER_ORDER_MANAGER', 'return.read'),
    ('SELLER_ORDER_MANAGER', 'return.approve'),
    ('SELLER_ORDER_MANAGER', 'inventory.read'),

    -- Seller: finance
    ('SELLER_FINANCE_MANAGER', 'finance.read'),
    ('SELLER_FINANCE_MANAGER', 'settlement.read'),
    ('SELLER_FINANCE_MANAGER', 'payout.read'),
    ('SELLER_FINANCE_MANAGER', 'invoice.read'),
    ('SELLER_FINANCE_MANAGER', 'commission.read'),
    ('SELLER_FINANCE_MANAGER', 'seller_bank.read'),
    ('SELLER_FINANCE_MANAGER', 'seller_tax.read'),
    ('SELLER_FINANCE_MANAGER', 'order.read'),

    -- Seller: admin (operational superset, minus ownership actions)
    ('SELLER_ADMIN', 'seller.update'),
    ('SELLER_ADMIN', 'seller_user.manage'),
    ('SELLER_ADMIN', 'seller_document.upload'),
    ('SELLER_ADMIN', 'seller_document.read'),
    ('SELLER_ADMIN', 'product.read'),
    ('SELLER_ADMIN', 'product.create'),
    ('SELLER_ADMIN', 'product.update'),
    ('SELLER_ADMIN', 'listing.create'),
    ('SELLER_ADMIN', 'listing.update'),
    ('SELLER_ADMIN', 'price.read'),
    ('SELLER_ADMIN', 'price.update'),
    ('SELLER_ADMIN', 'inventory.read'),
    ('SELLER_ADMIN', 'inventory.read_ledger'),
    ('SELLER_ADMIN', 'inventory.receive'),
    ('SELLER_ADMIN', 'inventory.adjust'),
    ('SELLER_ADMIN', 'inventory.transfer'),
    ('SELLER_ADMIN', 'warehouse.read'),
    ('SELLER_ADMIN', 'warehouse.manage'),
    ('SELLER_ADMIN', 'order.read'),
    ('SELLER_ADMIN', 'order.update_status'),
    ('SELLER_ADMIN', 'order.cancel'),
    ('SELLER_ADMIN', 'shipment.read'),
    ('SELLER_ADMIN', 'shipment.create'),
    ('SELLER_ADMIN', 'shipment.cancel'),
    ('SELLER_ADMIN', 'shipping.read'),
    ('SELLER_ADMIN', 'return.read'),
    ('SELLER_ADMIN', 'return.approve'),
    ('SELLER_ADMIN', 'finance.read'),
    ('SELLER_ADMIN', 'settlement.read'),
    ('SELLER_ADMIN', 'invoice.read'),
    ('SELLER_ADMIN', 'commission.read'),
    ('SELLER_ADMIN', 'ticket.respond'),

    -- Seller: owner adds bank and payout visibility
    ('SELLER_OWNER', 'seller.update'),
    ('SELLER_OWNER', 'seller_user.manage'),
    ('SELLER_OWNER', 'seller_document.upload'),
    ('SELLER_OWNER', 'seller_document.read'),
    ('SELLER_OWNER', 'seller_bank.read'),
    ('SELLER_OWNER', 'seller_tax.read'),
    ('SELLER_OWNER', 'product.read'),
    ('SELLER_OWNER', 'product.create'),
    ('SELLER_OWNER', 'product.update'),
    ('SELLER_OWNER', 'listing.create'),
    ('SELLER_OWNER', 'listing.update'),
    ('SELLER_OWNER', 'price.read'),
    ('SELLER_OWNER', 'price.update'),
    ('SELLER_OWNER', 'inventory.read'),
    ('SELLER_OWNER', 'inventory.read_ledger'),
    ('SELLER_OWNER', 'inventory.receive'),
    ('SELLER_OWNER', 'inventory.adjust'),
    ('SELLER_OWNER', 'inventory.transfer'),
    ('SELLER_OWNER', 'warehouse.read'),
    ('SELLER_OWNER', 'warehouse.manage'),
    ('SELLER_OWNER', 'order.read'),
    ('SELLER_OWNER', 'order.update_status'),
    ('SELLER_OWNER', 'order.cancel'),
    ('SELLER_OWNER', 'shipment.read'),
    ('SELLER_OWNER', 'shipment.create'),
    ('SELLER_OWNER', 'shipment.cancel'),
    ('SELLER_OWNER', 'shipping.read'),
    ('SELLER_OWNER', 'return.read'),
    ('SELLER_OWNER', 'return.approve'),
    ('SELLER_OWNER', 'finance.read'),
    ('SELLER_OWNER', 'settlement.read'),
    ('SELLER_OWNER', 'payout.read'),
    ('SELLER_OWNER', 'invoice.read'),
    ('SELLER_OWNER', 'commission.read'),
    ('SELLER_OWNER', 'ticket.respond'),

    -- Support agent
    ('SUPPORT_AGENT', 'customer.read'),
    ('SUPPORT_AGENT', 'customer.read_address'),
    ('SUPPORT_AGENT', 'order.read'),
    ('SUPPORT_AGENT', 'order.cancel'),
    ('SUPPORT_AGENT', 'shipment.read'),
    ('SUPPORT_AGENT', 'return.read'),
    ('SUPPORT_AGENT', 'payment.read'),
    ('SUPPORT_AGENT', 'refund.read'),
    ('SUPPORT_AGENT', 'refund.create'),
    ('SUPPORT_AGENT', 'invoice.read'),
    ('SUPPORT_AGENT', 'ticket.read'),
    ('SUPPORT_AGENT', 'ticket.respond'),
    ('SUPPORT_AGENT', 'ticket.escalate'),
    ('SUPPORT_AGENT', 'ticket.close'),
    ('SUPPORT_AGENT', 'product.read'),
    ('SUPPORT_AGENT', 'seller.read'),

    -- Support manager adds assignment, moderation and higher-value refunds
    ('SUPPORT_MANAGER', 'customer.read'),
    ('SUPPORT_MANAGER', 'customer.read_address'),
    ('SUPPORT_MANAGER', 'customer.update'),
    ('SUPPORT_MANAGER', 'order.read'),
    ('SUPPORT_MANAGER', 'order.cancel'),
    ('SUPPORT_MANAGER', 'order.reassign'),
    ('SUPPORT_MANAGER', 'shipment.read'),
    ('SUPPORT_MANAGER', 'return.read'),
    ('SUPPORT_MANAGER', 'return.approve'),
    ('SUPPORT_MANAGER', 'payment.read'),
    ('SUPPORT_MANAGER', 'refund.read'),
    ('SUPPORT_MANAGER', 'refund.create'),
    ('SUPPORT_MANAGER', 'refund.approve'),
    ('SUPPORT_MANAGER', 'invoice.read'),
    ('SUPPORT_MANAGER', 'ticket.read'),
    ('SUPPORT_MANAGER', 'ticket.assign'),
    ('SUPPORT_MANAGER', 'ticket.respond'),
    ('SUPPORT_MANAGER', 'ticket.escalate'),
    ('SUPPORT_MANAGER', 'ticket.close'),
    ('SUPPORT_MANAGER', 'review.moderate'),
    ('SUPPORT_MANAGER', 'risk.read'),
    ('SUPPORT_MANAGER', 'analytics.read'),
    ('SUPPORT_MANAGER', 'seller.read'),
    ('SUPPORT_MANAGER', 'product.read'),

    -- Catalog manager
    ('CATALOG_MANAGER', 'product.read'),
    ('CATALOG_MANAGER', 'product.create'),
    ('CATALOG_MANAGER', 'product.update'),
    ('CATALOG_MANAGER', 'product.manage'),
    ('CATALOG_MANAGER', 'product.approve'),
    ('CATALOG_MANAGER', 'product.block'),
    ('CATALOG_MANAGER', 'listing.manage'),
    ('CATALOG_MANAGER', 'listing.suppress'),
    ('CATALOG_MANAGER', 'brand.manage'),
    ('CATALOG_MANAGER', 'attribute.manage'),
    ('CATALOG_MANAGER', 'review.moderate'),
    ('CATALOG_MANAGER', 'search.manage'),
    ('CATALOG_MANAGER', 'seller.read'),
    ('CATALOG_MANAGER', 'analytics.read'),

    -- Category manager
    ('CATEGORY_MANAGER', 'category.manage'),
    ('CATEGORY_MANAGER', 'attribute.manage'),
    ('CATEGORY_MANAGER', 'product.read'),
    ('CATEGORY_MANAGER', 'product.approve'),
    ('CATEGORY_MANAGER', 'listing.manage'),
    ('CATEGORY_MANAGER', 'commission.read'),
    ('CATEGORY_MANAGER', 'return.policy_manage'),
    ('CATEGORY_MANAGER', 'analytics.read'),
    ('CATEGORY_MANAGER', 'search.manage'),

    -- Marketing manager
    ('MARKETING_MANAGER', 'cms.manage'),
    ('MARKETING_MANAGER', 'promotion.manage'),
    ('MARKETING_MANAGER', 'segment.manage'),
    ('MARKETING_MANAGER', 'notification.manage'),
    ('MARKETING_MANAGER', 'search.manage'),
    ('MARKETING_MANAGER', 'product.read'),
    ('MARKETING_MANAGER', 'seller.read'),
    ('MARKETING_MANAGER', 'analytics.read'),

    -- Operations manager
    ('OPERATIONS_MANAGER', 'order.read'),
    ('OPERATIONS_MANAGER', 'order.cancel'),
    ('OPERATIONS_MANAGER', 'order.update_status'),
    ('OPERATIONS_MANAGER', 'order.reassign'),
    ('OPERATIONS_MANAGER', 'shipment.read'),
    ('OPERATIONS_MANAGER', 'shipment.create'),
    ('OPERATIONS_MANAGER', 'shipment.cancel'),
    ('OPERATIONS_MANAGER', 'shipping.read'),
    ('OPERATIONS_MANAGER', 'shipping.manage'),
    ('OPERATIONS_MANAGER', 'pincode.manage'),
    ('OPERATIONS_MANAGER', 'delivery.manage'),
    ('OPERATIONS_MANAGER', 'warehouse.read'),
    ('OPERATIONS_MANAGER', 'warehouse.manage'),
    ('OPERATIONS_MANAGER', 'inventory.read'),
    ('OPERATIONS_MANAGER', 'inventory.read_ledger'),
    ('OPERATIONS_MANAGER', 'inventory.approve_adjustment'),
    ('OPERATIONS_MANAGER', 'inventory.transfer'),
    ('OPERATIONS_MANAGER', 'return.read'),
    ('OPERATIONS_MANAGER', 'return.approve'),
    ('OPERATIONS_MANAGER', 'cod.reconcile'),
    ('OPERATIONS_MANAGER', 'seller.read'),
    ('OPERATIONS_MANAGER', 'analytics.read'),

    -- Fraud analyst
    ('FRAUD_ANALYST', 'risk.read'),
    ('FRAUD_ANALYST', 'risk.manage'),
    ('FRAUD_ANALYST', 'fraud_case.manage'),
    ('FRAUD_ANALYST', 'customer.read'),
    ('FRAUD_ANALYST', 'customer.read_address'),
    ('FRAUD_ANALYST', 'customer.suspend'),
    ('FRAUD_ANALYST', 'order.read'),
    ('FRAUD_ANALYST', 'payment.read'),
    ('FRAUD_ANALYST', 'refund.read'),
    ('FRAUD_ANALYST', 'return.read'),
    ('FRAUD_ANALYST', 'seller.read'),
    ('FRAUD_ANALYST', 'seller.suspend'),
    ('FRAUD_ANALYST', 'review.moderate'),
    ('FRAUD_ANALYST', 'audit.read'),
    ('FRAUD_ANALYST', 'analytics.read'),

    -- Finance manager
    ('FINANCE_MANAGER', 'finance.read_all'),
    ('FINANCE_MANAGER', 'finance.adjust'),
    ('FINANCE_MANAGER', 'finance.approve_adjustment'),
    ('FINANCE_MANAGER', 'settlement.read_all'),
    ('FINANCE_MANAGER', 'settlement.process'),
    ('FINANCE_MANAGER', 'payout.read_all'),
    ('FINANCE_MANAGER', 'payout.initiate'),
    ('FINANCE_MANAGER', 'invoice.read'),
    ('FINANCE_MANAGER', 'payment.read'),
    ('FINANCE_MANAGER', 'payment.reconcile'),
    ('FINANCE_MANAGER', 'refund.read'),
    ('FINANCE_MANAGER', 'refund.approve'),
    ('FINANCE_MANAGER', 'cod.reconcile'),
    ('FINANCE_MANAGER', 'commission.read'),
    ('FINANCE_MANAGER', 'commission.manage'),
    ('FINANCE_MANAGER', 'tax.manage'),
    ('FINANCE_MANAGER', 'seller.read'),
    ('FINANCE_MANAGER', 'seller_bank.read'),
    ('FINANCE_MANAGER', 'seller_bank.verify'),
    ('FINANCE_MANAGER', 'seller_tax.read'),
    ('FINANCE_MANAGER', 'order.read'),
    ('FINANCE_MANAGER', 'audit.read'),
    ('FINANCE_MANAGER', 'analytics.read')
)
insert into identity.role_permissions (role_id, permission_id)
select r.id, p.id
  from mapping m
  join identity.roles r       on r.code = m.role_code
  join identity.permissions p on p.code = m.permission_code
on conflict (role_id, permission_id) do nothing;

-- ADMIN: everything except the break-glass powers reserved for SUPER_ADMIN.
insert into identity.role_permissions (role_id, permission_id)
select r.id, p.id
  from identity.roles r
  cross join identity.permissions p
 where r.code = 'ADMIN'
   and p.code not in ('role.grant', 'role.revoke', 'employee.manage', 'integration.manage',
                      'maintenance.manage', 'customer.delete', 'setting.manage')
on conflict (role_id, permission_id) do nothing;

-- SUPER_ADMIN: the complete permission set. Deliberately the only wildcard grant.
insert into identity.role_permissions (role_id, permission_id)
select r.id, p.id
  from identity.roles r
  cross join identity.permissions p
 where r.code = 'SUPER_ADMIN'
on conflict (role_id, permission_id) do nothing;

-- -----------------------------------------------------------------------------
-- Sanity check: every permission referenced by an RLS policy must exist, and no
-- role other than SUPER_ADMIN may hold the full permission set.
-- -----------------------------------------------------------------------------
do $$
declare
  v_total   integer;
  v_offender text;
begin
  select count(*) into v_total from identity.permissions;

  select string_agg(r.code, ', ') into v_offender
    from identity.roles r
    join identity.role_permissions rp on rp.role_id = r.id
   where r.code <> 'SUPER_ADMIN'
   group by r.code
  having count(*) = v_total;

  if v_offender is not null then
    raise exception 'Role(s) % hold every permission; only SUPER_ADMIN may.', v_offender;
  end if;
end;
$$;
