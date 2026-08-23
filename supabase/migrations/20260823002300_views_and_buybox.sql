-- =============================================================================
-- NovaMart — 0023 Sellability predicate, Buy Box engine, and client-facing views
--
-- "Is this listing sellable?" is defined exactly once, here, and reused by the
-- storefront, the checkout engine, the search indexer and the Buy Box scorer.
-- Duplicating that predicate is how a marketplace ends up selling suspended
-- sellers' out-of-stock inventory.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- catalog.v_sellable_listings — the single source of "can be bought right now".
-- -----------------------------------------------------------------------------
create or replace view catalog.v_sellable_listings as
select
  l.id                        as listing_id,
  l.seller_id,
  l.sku_id,
  l.product_id,
  pv.id                       as variant_id,
  pv.variant_label,
  l.condition,
  l.fulfillment_model,
  l.min_order_quantity,
  l.max_order_quantity,
  l.handling_time_days,
  l.is_buy_box_eligible,
  l.buy_box_score,
  l.is_buy_box_winner,
  lp.mrp_paise,
  lp.selling_price_paise,
  lp.discount_paise,
  lp.discount_percentage,
  lp.currency,
  -- Total sellable units across active, order-accepting nodes.
  coalesce(inv.available_quantity, 0)   as available_quantity,
  coalesce(inv.warehouse_count, 0)      as warehouse_count,
  sl.display_name                       as seller_name,
  sl.slug                               as seller_slug,
  sl.rating                             as seller_rating,
  sl.rating_count                       as seller_rating_count,
  coalesce(sp.score, 50)                as seller_score,
  coalesce(sp.tier, 'NEW')              as seller_tier,
  coalesce(sp.seller_cancellation_rate, 0) as seller_cancellation_rate,
  coalesce(sp.return_rate, 0)           as seller_return_rate,
  coalesce(sp.on_time_dispatch_rate, 100) as on_time_dispatch_rate,
  p.title                               as product_title,
  p.slug                                as product_slug,
  p.public_id                           as product_public_id,
  p.category_id,
  p.brand_id,
  p.hsn_code,
  p.gst_rate,
  sk.sku_code,
  sk.weight_grams,
  sk.volumetric_weight_grams
from catalog.seller_listings l
join catalog.skus sk            on sk.id = l.sku_id
join catalog.product_variants pv on pv.id = sk.variant_id
join catalog.products p         on p.id = l.product_id
join seller.sellers sl      on sl.id = l.seller_id
join pricing.listing_prices lp on lp.listing_id = l.id
left join seller.seller_performance sp on sp.seller_id = l.seller_id
left join lateral (
  select sum(wi.available_quantity)::integer as available_quantity,
         count(*)::integer                   as warehouse_count
    from inventory.warehouse_inventory wi
    join inventory.warehouses w on w.id = wi.warehouse_id
   where wi.sku_id = l.sku_id
     and wi.seller_id = l.seller_id
     and wi.available_quantity > 0
     and w.is_active
     and w.accepts_new_orders
) inv on true
where l.status = 'ACTIVE'
  and l.archived_at is null
  and sk.status = 'ACTIVE'
  and p.status = 'ACTIVE'
  and p.moderation_status = 'APPROVED'
  and sl.status = 'APPROVED'
  -- Seller vacation suppresses the offer without deactivating the listing.
  and (sl.vacation_from is null or sl.vacation_to is null
       or current_date not between sl.vacation_from and sl.vacation_to)
  and coalesce(inv.available_quantity, 0) > 0;

comment on view catalog.v_sellable_listings is
  'The single definition of a purchasable offer: active listing, active SKU, approved product and seller, stock available.';

-- -----------------------------------------------------------------------------
-- pricing.compute_buy_box_score — configurable weighted scoring (brief §29).
-- Lowest price does not automatically win; seller quality is weighted in and hard
-- gates exclude poor performers entirely.
-- -----------------------------------------------------------------------------
create or replace function pricing.compute_buy_box_score(
  p_listing_id uuid
)
returns numeric
language plpgsql
stable
set search_path = pricing, catalog, pg_catalog
as $$
declare
  v_listing   record;
  v_weights   pricing.buy_box_weights;
  v_min_price public.paise;
  v_price_component      numeric := 0;
  v_seller_component     numeric := 0;
  v_delivery_component   numeric := 0;
  v_stock_component      numeric := 0;
  v_cancel_component     numeric := 0;
  v_return_component     numeric := 0;
  v_rating_component     numeric := 0;
  v_fulfilment_component numeric := 0;
begin
  select * into v_listing from catalog.v_sellable_listings where listing_id = p_listing_id;
  if v_listing.listing_id is null then
    return null;  -- not sellable, therefore not eligible
  end if;

  -- Category profile if one exists, else the platform default.
  select * into v_weights
    from pricing.buy_box_weights w
   where w.is_active
     and (w.category_id = v_listing.category_id or w.category_id is null)
   order by case when w.category_id is null then 1 else 0 end
   limit 1;

  if v_weights.id is null then
    return null;  -- no scoring profile configured
  end if;

  -- Hard gates. A listing failing any of these never wins, whatever its price.
  if not v_listing.is_buy_box_eligible then return null; end if;
  if v_weights.require_in_stock and v_listing.available_quantity <= 0 then return null; end if;
  if v_listing.seller_score < v_weights.min_seller_score then return null; end if;
  if v_listing.seller_cancellation_rate > v_weights.max_cancellation_rate then return null; end if;
  if v_listing.seller_return_rate > v_weights.max_return_rate then return null; end if;

  -- Price: scored relative to the cheapest sellable offer for the same SKU, so the
  -- component is comparable across price bands.
  select min(selling_price_paise) into v_min_price
    from catalog.v_sellable_listings
   where sku_id = v_listing.sku_id;

  if v_min_price is not null and v_listing.selling_price_paise > 0 then
    v_price_component := greatest(
      0,
      100 - (((v_listing.selling_price_paise - v_min_price)::numeric / v_min_price) * 100 * 4)
    );
    v_price_component := least(v_price_component, 100);
  else
    v_price_component := 100;
  end if;

  v_seller_component := v_listing.seller_score;

  -- Faster handling scores higher; 0 days = 100, 7+ days = 0.
  v_delivery_component := greatest(0, 100 - (v_listing.handling_time_days * 100.0 / 7));

  -- Stock depth, saturating at 50 units: deep stock reduces cancellation risk.
  v_stock_component := least(100, (v_listing.available_quantity::numeric / 50) * 100);

  v_cancel_component := greatest(0, 100 - (v_listing.seller_cancellation_rate * 10));
  v_return_component := greatest(0, 100 - (v_listing.seller_return_rate * 4));
  v_rating_component := coalesce(v_listing.seller_rating, 3.5) * 20;

  -- Platform-fulfilled offers get a deliberate advantage: NovaMart controls the
  -- delivery experience and therefore the promise.
  v_fulfilment_component := case v_listing.fulfillment_model
                              when 'NOVAMART_FULFILLED'  then 100
                              when 'WAREHOUSE_FULFILLED' then 85
                              when 'SELLER_FULFILLED'    then 60
                              else 40
                            end;

  return round(
      (v_price_component      * v_weights.weight_price
     + v_seller_component     * v_weights.weight_seller_score
     + v_delivery_component   * v_weights.weight_delivery_speed
     + v_stock_component      * v_weights.weight_stock_depth
     + v_cancel_component     * v_weights.weight_cancellation_rate
     + v_return_component     * v_weights.weight_return_rate
     + v_rating_component     * v_weights.weight_seller_rating
     + v_fulfilment_component * v_weights.weight_fulfillment_model
      ) / 100,
    4);
end;
$$;

comment on function pricing.compute_buy_box_score(uuid) is
  'Weighted Buy Box score with hard quality gates. Weights are configurable per category at runtime.';

-- Recomputes scores and elects the winner for a SKU. Called by the Buy Box worker
-- after price, stock, listing or seller-performance changes.
create or replace function pricing.recompute_buy_box(p_sku_id uuid)
returns uuid
language plpgsql
volatile
set search_path = pricing, catalog, pg_catalog
as $$
declare
  v_listing_id uuid;
  v_score      numeric;
  v_winner_id  uuid;
  v_best       numeric := -1;
begin
  -- Score every candidate.
  for v_listing_id in
    select l.id from catalog.seller_listings l
     where l.sku_id = p_sku_id and l.status = 'ACTIVE'
  loop
    v_score := pricing.compute_buy_box_score(v_listing_id);

    update catalog.seller_listings
       set buy_box_score = v_score,
           is_buy_box_winner = false
     where id = v_listing_id;

    if v_score is not null and v_score > v_best then
      v_best := v_score;
      v_winner_id := v_listing_id;
    end if;
  end loop;

  if v_winner_id is not null then
    update catalog.seller_listings set is_buy_box_winner = true where id = v_winner_id;
  end if;

  return v_winner_id;
end;
$$;

revoke all on function pricing.recompute_buy_box(uuid) from public, anon, authenticated;
grant execute on function pricing.recompute_buy_box(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- catalog.v_product_cards — the denormalised shape every listing surface needs
-- (PLP, carousels, search fallback, recommendations). Built on the Buy Box winner.
-- -----------------------------------------------------------------------------
create or replace view catalog.v_product_cards as
select
  p.id                          as product_id,
  p.public_id,
  p.slug,
  p.title,
  p.subtitle,
  p.category_id,
  c.name                        as category_name,
  c.path                        as category_path,
  p.brand_id,
  b.name                        as brand_name,
  b.slug                        as brand_slug,
  -- Winning offer for the default variant.
  bb.listing_id,
  bb.sku_id,
  bb.seller_id,
  bb.seller_name,
  bb.mrp_paise,
  bb.selling_price_paise,
  bb.discount_paise,
  bb.discount_percentage,
  bb.available_quantity,
  bb.fulfillment_model,
  bb.handling_time_days,
  -- Social proof.
  coalesce(rs.average_rating, 0) as average_rating,
  coalesce(rs.rating_count, 0)   as rating_count,
  coalesce(rs.ranking_score, 0)  as rating_ranking_score,
  -- Primary image.
  pm.public_url                  as primary_image_url,
  pm.blurhash                    as primary_image_blurhash,
  p.popularity_score,
  p.created_at
from catalog.products p
join catalog.categories c on c.id = p.category_id
left join catalog.brands b on b.id = p.brand_id
left join commerce.product_rating_summary rs on rs.product_id = p.id
left join lateral (
  select public_url, blurhash
    from catalog.product_media m
   where m.product_id = p.id
     and m.media_type = 'IMAGE'
     and m.moderation_status = 'APPROVED'
   order by m.is_primary desc, m.display_order, m.created_at
   limit 1
) pm on true
left join lateral (
  -- The best offer across all of the product's SKUs.
  select vl.*
    from catalog.v_sellable_listings vl
   where vl.product_id = p.id
   order by vl.is_buy_box_winner desc, vl.buy_box_score desc nulls last, vl.selling_price_paise
   limit 1
) bb on true
where p.status = 'ACTIVE'
  and p.moderation_status = 'APPROVED';

comment on view catalog.v_product_cards is
  'Denormalised product card built on the Buy Box winner. Used by PLP, carousels and recommendations.';

-- =============================================================================
-- api schema — the ONLY schema exposed through PostgREST. Every object here is a
-- deliberate, reviewed piece of client-readable surface.
-- =============================================================================

-- Navigation tree. Read by both storefronts on every page, so it is cache-friendly.
create or replace view api.categories as
select
  c.id,
  c.parent_id,
  c.code,
  c.name,
  c.name_hi,
  c.slug,
  c.path,
  c.level,
  c.is_leaf,
  c.image_url,
  c.icon_url,
  c.display_order,
  c.show_in_navigation,
  c.show_in_home_grid,
  c.seo_title,
  c.seo_description
from catalog.categories c
where c.is_active
  and c.merged_into_id is null;

comment on view api.categories is 'Public category tree for navigation and SEO routes.';

create or replace view api.brands as
select b.id, b.name, b.slug, b.logo_url, b.description, b.display_order,
       b.is_featured, b.product_count, b.seo_title, b.seo_description
from catalog.brands b
where b.is_active;

-- Category attribute definitions, so filter sidebars are entirely data-driven.
create or replace view api.category_filters as
select
  ca.category_id,
  ad.id           as attribute_id,
  ad.code         as attribute_code,
  ad.name         as attribute_name,
  ad.name_hi      as attribute_name_hi,
  ad.data_type,
  ad.unit,
  ad.input_type,
  ca.display_order,
  ca.is_key_specification,
  -- Options, restricted to the category's allowlist when one is configured.
  coalesce(
    (select jsonb_agg(jsonb_build_object(
              'id', o.id, 'value', o.value, 'label', o.label, 'label_hi', o.label_hi,
              'swatch_hex', o.swatch_hex, 'swatch_image_url', o.swatch_image_url,
              'numeric_value', o.numeric_value)
            order by o.display_order)
       from catalog.attribute_options o
      where o.attribute_id = ad.id
        and o.is_active
        and (ca.allowed_option_ids is null or o.id = any (ca.allowed_option_ids))),
    '[]'::jsonb
  ) as options
from catalog.category_attributes ca
join catalog.attribute_definitions ad on ad.id = ca.attribute_id
where ca.is_filterable
  and ad.is_active
  and ad.is_filterable;

comment on view api.category_filters is 'Data-driven filter definitions per category (brief §22).';

-- Homepage sections, already filtered by schedule. Audience filtering happens in
-- the API/BFF layer, which knows the caller's segments.
create or replace view api.home_sections as
select
  hs.id,
  hs.code,
  hs.section_type,
  hs.title,
  hs.title_hi,
  hs.subtitle,
  hs.configuration,
  hs.position,
  hs.surfaces,
  hs.audience_segments,
  hs.audience_states,
  hs.audience_city_tiers,
  hs.min_app_version,
  hs.campaign_id,
  coalesce(
    (select jsonb_agg(jsonb_build_object(
              'id', bn.id, 'alt_text', bn.alt_text,
              'image_url_mobile', bn.image_url_mobile,
              'image_url_desktop', bn.image_url_desktop,
              'image_url_tablet', bn.image_url_tablet,
              'background_color', bn.background_color,
              'link_type', bn.link_type, 'link_target', bn.link_target,
              'cta_label', bn.cta_label)
            order by bn.position)
       from marketing.banners bn
      where bn.home_section_id = hs.id
        and bn.status = 'ACTIVE'
        and (bn.starts_at is null or bn.starts_at <= now())
        and (bn.ends_at is null or bn.ends_at > now())),
    '[]'::jsonb
  ) as banners
from marketing.home_sections hs
where hs.status = 'ACTIVE'
  and (hs.starts_at is null or hs.starts_at <= now())
  and (hs.ends_at is null or hs.ends_at > now());

comment on view api.home_sections is 'The homepage as data. Clients render whatever this returns (brief §48).';

-- Public settings only. is_public gates what a client may read.
create or replace view api.public_settings as
select ps.key, ps.value, ps.value_type
from platform.platform_settings ps
where ps.is_public;

-- App version / maintenance policy, read by the Flutter apps at launch (brief §83).
create or replace view api.app_version_policy as
select app, platform, minimum_version, latest_version,
       force_update_message, soft_update_message, store_url,
       maintenance_mode, maintenance_message, maintenance_until
from platform.app_version_policies;

-- Pincode serviceability, safe to expose: it is public commercial information.
create or replace view api.pincode_serviceability as
select
  p.pincode,
  ct.name        as city,
  d.name         as district,
  st.name        as state,
  st.code        as state_code,
  p.zone_code,
  p.is_serviceable,
  p.prepaid_available,
  p.cod_available,
  p.default_sla_days,
  p.is_oda,
  (p.suspended_until is not null and p.suspended_until >= current_date) as is_suspended
from fulfillment.pincodes p
join fulfillment.cities ct    on ct.id = p.city_id
join fulfillment.districts d  on d.id = p.district_id
join fulfillment.states st    on st.code = p.state_code;

-- Active return reasons, so the returns UI is data-driven.
create or replace view api.return_reasons as
select code, label, label_hi, category, requires_evidence, min_evidence_count,
       allowed_resolutions, display_order
from returns.return_reasons
where is_active;

-- Published help centre content.
create or replace view api.help_articles as
select id, slug, audience, title, body_html, summary, locale, tags,
       display_order, seo_title, seo_description, published_at
from support.help_articles
where status = 'PUBLISHED';
