-- ============================================================
-- Migrația 25 (Sprint 4.5 — rafinare pricing)
--   1. Fără prioritate numerică pe rate_rules: la suprapunere câștigă
--      cea mai RECENT modificată regulă (updated_at desc). Override rămâne
--      superior season indiferent de recență.
--   2. RPC get_rate_calendar — tarif rezolvat per tip × zi, pentru afișarea
--      prețurilor în celulele calendarului (vizualizare standard/sezon/override).
-- ============================================================

-- ============ 1. Recență în loc de prioritate ============

alter table rate_rules drop column priority;
-- clock_timestamp() (nu now()): captează instantul real al modificării și avansează
-- chiar și în aceeași tranzacție → recența e deterministă, nu un egal nedepartajabil.
alter table rate_rules add column updated_at timestamptz not null default clock_timestamp();

create function app.touch_updated_at_clock() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

create trigger rate_rules_set_updated_at
  before update on rate_rules
  for each row execute function app.touch_updated_at_clock();

-- compute_price: rezolvarea folosește updated_at desc (cea mai recentă modificare),
-- override > season prin (kind='override') desc înaintea recenței.
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

    v_weekend := v_type.weekend_adjustment_type <> 'none'
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

-- ============ 2. RPC: tarif rezolvat per tip × zi (pentru calendar) ============
-- Un rând per (tip activ, noapte) cu rata rezolvată și sursa (base/season/override).
-- Frontend-ul îl indexează pe unit_type_id+zi și pictează prețul în celulele goale.

create function public.get_rate_calendar(
  p_property_id uuid,
  p_from        date,
  p_to          date
) returns table (
  unit_type_id uuid,
  day          date,
  rate         numeric,
  kind         text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not app.can_access_property(p_property_id) then raise exception 'FORBIDDEN'; end if;
  if p_to <= p_from then return; end if;

  return query
  select
    t.id,
    (n->>'date')::date,
    (n->>'rate')::numeric,
    n->>'kind'
  from public.unit_types t
  cross join lateral jsonb_array_elements(
    app.compute_price(t.id, p_from, p_to)->'nights'
  ) as n
  where t.property_id = p_property_id and t.is_active;
end $$;

revoke execute on function public.get_rate_calendar from anon, public;
grant execute on function public.get_rate_calendar to authenticated;
