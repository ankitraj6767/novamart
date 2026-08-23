-- ============================================================================
-- Fix: fulfillment.calculate_shipping_charge returned bigint where the signature
-- declares public.paise, making the function unusable by any caller.
--
-- The failure:
--   ERROR 42804: structure of query does not match function result type
--   DETAIL: Returned type bigint does not match expected type public.paise in column 7.
--
-- Why: arithmetic over a domain type yields the domain's BASE type. `v_subtotal` and
-- `v_gst` are both public.paise, but `v_subtotal + v_gst` is plain bigint, and
-- RETURN QUERY requires an exact match against the declared TABLE(...) column types.
-- The other six columns are returned as bare variables, so they kept their domain and
-- only the computed seventh column tripped the check.
--
-- Every column is now cast explicitly. That is deliberate rather than casting only the
-- broken one: any future edit that turns a bare variable into an expression would
-- otherwise reintroduce exactly this bug.
--
-- Found by the checkout engine calling it for the first time. Nothing else in the
-- platform had exercised it, so a rate-card lookup for any real basket would have
-- failed with a 500.
-- ============================================================================

create or replace function fulfillment.calculate_shipping_charge(
  p_rate_card_id           uuid,
  p_zone_code              text,
  p_chargeable_weight_grams integer,
  p_declared_value_paise   public.paise default 0,
  p_is_cod                 boolean default false
)
returns table (
  base_paise      public.paise,
  weight_paise    public.paise,
  cod_fee_paise   public.paise,
  insurance_paise public.paise,
  fuel_paise      public.paise,
  gst_paise       public.paise,
  total_paise     public.paise
)
language plpgsql
stable
set search_path = fulfillment, private, pg_catalog
as $$
declare
  v_card  fulfillment.carrier_rate_cards;
  v_slab  fulfillment.carrier_rate_slabs;
  v_extra_steps integer;
  v_base  public.paise;
  v_weight public.paise;
  v_cod   public.paise;
  v_ins   public.paise;
  v_fuel  public.paise;
  v_subtotal public.paise;
  v_gst   public.paise;
begin
  select * into v_card from fulfillment.carrier_rate_cards where id = p_rate_card_id;
  if v_card.id is null then
    raise exception 'Rate card % not found', p_rate_card_id using errcode = 'no_data_found';
  end if;

  -- Pick the slab whose base weight is the largest that still fits, else the smallest.
  select * into v_slab
    from fulfillment.carrier_rate_slabs s
   where s.rate_card_id = p_rate_card_id
     and s.zone_code = p_zone_code
   order by case when s.base_weight_grams <= p_chargeable_weight_grams then 0 else 1 end,
            s.base_weight_grams desc
   limit 1;

  if v_slab.id is null then
    raise exception 'No rate slab for zone % on rate card %', p_zone_code, p_rate_card_id
      using errcode = 'no_data_found', hint = 'SHIPPING_UNAVAILABLE';
  end if;

  v_base := v_slab.base_charge_paise;

  v_extra_steps := greatest(
    0,
    ceil((p_chargeable_weight_grams - v_slab.base_weight_grams)::numeric / v_slab.additional_step_grams)::integer
  );
  v_weight := v_extra_steps * v_slab.additional_charge_paise;

  v_cod := case
             when p_is_cod then greatest(
               v_card.cod_fee_paise,
               private.apply_percentage(p_declared_value_paise, v_card.cod_fee_percentage)
             )
             else 0
           end;

  v_ins  := private.apply_percentage(p_declared_value_paise, v_card.insurance_percentage);
  v_fuel := private.apply_percentage(v_base + v_weight, v_card.fuel_surcharge_percentage);

  v_subtotal := greatest(v_base + v_weight + v_cod + v_ins + v_fuel, v_slab.min_charge_paise);
  v_gst := private.apply_percentage(v_subtotal, v_card.gst_rate);

  return query select v_base::public.paise,
                      v_weight::public.paise,
                      v_cod::public.paise,
                      v_ins::public.paise,
                      v_fuel::public.paise,
                      v_gst::public.paise,
                      (v_subtotal + v_gst)::public.paise;
end;
$$;

comment on function fulfillment.calculate_shipping_charge(uuid, text, integer, public.paise, boolean) is
  'Shipping charge for a chargeable weight in a zone: base + weight steps + COD fee + '
  'insurance + fuel surcharge, floored at the slab minimum, plus GST. Every returned '
  'column is cast to public.paise because arithmetic over a domain yields its base type '
  'and RETURN QUERY demands an exact match.';
