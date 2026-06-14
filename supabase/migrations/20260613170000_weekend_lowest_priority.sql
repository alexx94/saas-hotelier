-- ============================================================
-- Migrația 27 (Sprint 4.5 — weekend = prioritate minimă)
--   Standard industrie: un tarif explicit (sezon / override) este prețul dorit
--   exact de operator — NU se mai adaugă suprataxa de weekend peste el.
--   Ordine: override > season > (base + weekend). Ajustarea de weekend se aplică
--   DOAR pe nopțile rămase pe prețul de bază.
-- ============================================================

create or replace function app.compute_price(
  p_unit_type_id uuid,
  p_check_in     date,
  p_check_out    date
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_type    record;
  v_rule    record;
  d         date;
  v_base    numeric;
  v_rate    numeric;
  v_kind    text;
  v_weekend boolean;
  v_nights  jsonb := '[]'::jsonb;
  v_total   numeric := 0;
  v_count   int := 0;
begin
  select t.*, p.currency as prop_currency
    into v_type
    from public.unit_types t
    join public.properties p on p.id = t.property_id
   where t.id = p_unit_type_id;
  if not found then raise exception 'UNIT_TYPE_NOT_FOUND'; end if;
  if p_check_out <= p_check_in then raise exception 'INVALID_DATES'; end if;

  v_base := v_type.base_price;

  for d in
    select generate_series(p_check_in, p_check_out - 1, interval '1 day')::date
  loop
    -- override > season; în rest, cea mai recent modificată regulă câștigă
    select rr.kind, rr.price into v_rule
      from public.rate_rules rr
     where rr.unit_type_id = p_unit_type_id
       and d between rr.start_date and rr.end_date
     order by (rr.kind = 'override') desc, rr.updated_at desc
     limit 1;

    if found then
      v_rate := v_rule.price;
      v_kind := v_rule.kind;
    else
      v_rate := v_base;
      v_kind := 'base';
    end if;

    -- weekend = prioritate minimă: se aplică DOAR pe prețul de bază, nu peste
    -- sezon/override (acelea sunt deja prețuri explicite, dorite ca atare).
    v_weekend := v_kind = 'base'
                 and v_type.weekend_adjustment_type <> 'none'
                 and extract(dow from d)::int = any(v_type.weekend_days);
    if v_weekend then
      if v_type.weekend_adjustment_type = 'percent' then
        v_rate := round(v_rate * (1 + v_type.weekend_adjustment_value / 100), 2);
      else
        v_rate := v_rate + v_type.weekend_adjustment_value;
      end if;
    end if;

    v_total := v_total + v_rate;
    v_count := v_count + 1;
    v_nights := v_nights || jsonb_build_object(
      'date', d, 'kind', v_kind, 'base', v_base, 'rate', v_rate, 'weekend', v_weekend);
  end loop;

  return jsonb_build_object(
    'currency',    v_type.prop_currency,
    'nights',      v_nights,
    'subtotal',    v_total,
    'total',       v_total,
    'avg_nightly', case when v_count > 0 then round(v_total / v_count, 2) else 0 end,
    'night_count', v_count
  );
end $$;
