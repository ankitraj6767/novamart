-- =============================================================================
-- NovaMart — 0001 Extensions, schemas and baseline privileges
--
-- Establishes the schema-per-domain layout (ADR 0003) and locks down default
-- privileges so nothing is reachable by client roles unless explicitly granted.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions (kept out of public to avoid polluting the client-visible schema)
-- -----------------------------------------------------------------------------
create schema if not exists extensions;

create extension if not exists "pgcrypto"      with schema extensions;  -- gen_random_uuid, digest, hmac
create extension if not exists "citext"        with schema extensions;  -- case-insensitive email
create extension if not exists "pg_trgm"       with schema extensions;  -- fuzzy admin search
create extension if not exists "btree_gist"    with schema extensions;  -- exclusion constraints on ranges
create extension if not exists "unaccent"      with schema extensions;  -- slug normalisation
create extension if not exists "pg_stat_statements" with schema extensions;

-- -----------------------------------------------------------------------------
-- Domain schemas. One bounded context per schema.
-- -----------------------------------------------------------------------------
create schema if not exists api;          -- client-facing views/functions (only exposed schema)
create schema if not exists identity;     -- principals, roles, permissions, addresses
create schema if not exists catalog;      -- categories, brands, attributes, products, listings
create schema if not exists seller;       -- seller businesses, KYC, warehouses
create schema if not exists pricing;      -- prices, promotions, coupons, tax, commission rules
create schema if not exists inventory;    -- stock balances, ledger, reservations
create schema if not exists commerce;     -- cart, checkout, orders, reviews, Q&A
create schema if not exists payments;     -- intents, attempts, transactions, refunds
create schema if not exists fulfillment;  -- geography, serviceability, shipments, tracking
create schema if not exists returns;      -- returns, inspections, replacements
create schema if not exists finance;      -- seller ledger, settlements, payouts, invoices
create schema if not exists marketing;    -- campaigns, CMS, notifications
create schema if not exists support;      -- tickets, messages, SLA
create schema if not exists analytics;    -- event stream, aggregates, risk
create schema if not exists audit;        -- append-only audit and security logs
create schema if not exists platform;     -- flags, settings, outbox, idempotency
create schema if not exists private;      -- internal helpers never exposed anywhere

comment on schema api          is 'Client-facing views and RPCs. The only NovaMart schema exposed through PostgREST.';
comment on schema identity     is 'Principals, RBAC, devices, addresses. Supabase Auth owns credentials; this schema owns authorization.';
comment on schema catalog      is 'Seller-agnostic catalog: categories, brands, attributes, products, variants, SKUs, and seller listings.';
comment on schema seller       is 'Seller businesses, seller users, KYC documents, bank and tax profiles, pickup warehouses.';
comment on schema pricing      is 'Listing prices, price history, promotions, coupons, bank offers, tax rules, commission rules.';
comment on schema inventory    is 'Warehouse stock balances, immutable movement ledger, reservations, adjustments, transfers.';
comment on schema commerce     is 'Cart, wishlist, checkout sessions, orders, order items, reviews and Q&A.';
comment on schema payments     is 'Payment intents, attempts, transactions, webhook events, refunds, reconciliation. No client access.';
comment on schema fulfillment  is 'Geography, pincode serviceability, carriers, shipments, tracking, delivery proof, reverse logistics.';
comment on schema returns      is 'Return requests, evidence, QC inspections, replacements.';
comment on schema finance      is 'Immutable seller ledger, commissions, fees, settlements, payouts, invoices. No client access.';
comment on schema marketing    is 'Campaigns, homepage CMS, banners, collections, notification templates and deliveries.';
comment on schema support      is 'Support tickets, messages, attachments, SLA policies.';
comment on schema analytics    is 'Behavioural event stream, derived aggregates, risk events, fraud rules and cases.';
comment on schema audit        is 'Append-only audit trail and security events. Insert-only for every role.';
comment on schema platform     is 'Feature flags, platform settings, integrations, app version policy, outbox, idempotency keys.';
comment on schema private      is 'Internal helper functions and tables. Never granted to any client role.';

-- -----------------------------------------------------------------------------
-- Baseline privileges: revoke everything, then grant deliberately.
--
-- Postgres grants CREATE and USAGE on `public` to PUBLIC by default, and Supabase
-- adds broad grants for anon/authenticated. We remove those so that every piece of
-- client access in this codebase is an explicit, reviewable GRANT.
-- -----------------------------------------------------------------------------
revoke all on schema public from public;
grant usage on schema public to postgres, anon, authenticated, service_role;

-- Client roles get USAGE only on `api` and `extensions`. Domain schemas stay closed;
-- the few tables clients may read are granted individually in the grants migration.
grant usage on schema api        to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;

-- The backend (service_role) needs to reach every domain schema.
grant usage on schema identity, catalog, seller, pricing, inventory, commerce,
                     payments, fulfillment, returns, finance, marketing, support,
                     analytics, audit, platform
  to service_role;

-- `private` is for the database's own internals only.
revoke all on schema private from anon, authenticated;
grant usage on schema private to postgres, service_role;

-- Nothing may be created in domain schemas by client roles.
revoke create on schema public, api, identity, catalog, seller, pricing, inventory,
                        commerce, payments, fulfillment, returns, finance, marketing,
                        support, analytics, audit, platform, private
  from anon, authenticated;

-- Future objects: no automatic grants to client roles in any domain schema.
alter default privileges in schema identity, catalog, seller, pricing, inventory,
                                  commerce, payments, fulfillment, returns, finance,
                                  marketing, support, analytics, audit, platform, private
  revoke all on tables from anon, authenticated;

alter default privileges in schema identity, catalog, seller, pricing, inventory,
                                  commerce, payments, fulfillment, returns, finance,
                                  marketing, support, analytics, audit, platform, private
  revoke all on sequences from anon, authenticated;

alter default privileges in schema identity, catalog, seller, pricing, inventory,
                                  commerce, payments, fulfillment, returns, finance,
                                  marketing, support, analytics, audit, platform, private
  revoke all on functions from anon, authenticated;

-- The backend keeps full access to future objects in its schemas.
alter default privileges in schema identity, catalog, seller, pricing, inventory,
                                  commerce, payments, fulfillment, returns, finance,
                                  marketing, support, analytics, audit, platform
  grant all on tables to service_role;

alter default privileges in schema identity, catalog, seller, pricing, inventory,
                                  commerce, payments, fulfillment, returns, finance,
                                  marketing, support, analytics, audit, platform
  grant all on sequences to service_role;
