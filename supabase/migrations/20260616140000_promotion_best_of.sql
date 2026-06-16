-- ============================================================
-- Migrația 33 (Sprint 4.8 — promoții „best-of", non-stacking)
--
--   Reducerile rămân NON-stacking (o singură promoție/rezervare, ca în PMS-urile
--   mari), DAR rezolvarea trece de la „codul are prioritate absolută" la „best-of":
--   dintre codul introdus ȘI promoțiile automate eligibile se aplică cea mai mare
--   reducere. Astfel un cod nu poate da niciodată un rezultat mai prost decât oferta
--   automată pe care clientul ar pierde-o.
--
--   `app.resolve_promotion` câștigă în rezultat și `code_matched` (codul introdus a
--   corespuns unei promoții eligibile — indiferent dacă a câștigat sau a fost depășit
--   de o automată). Frontend-ul îl folosește pentru mesajul „cod invalid".
-- ============================================================

create or replace function app.resolve_promotion(
  p_unit_type_id uuid,
  p_check_in     date,
  p_check_out    date,
  p_subtotal     numeric,
  p_code         text,
  p_now          timestamptz
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_property uuid;
  v_nights   int;
  v_adv_days int;
  v_adv_hours numeric;
  v_code     text := nullif(upper(trim(p_code)), '');
  v_code_matched boolean := false;
  r          record;
  v_disc     numeric;
  v_best_disc numeric := 0;
  v_found    boolean := false;
  v_best     record;
begin
  select property_id into v_property from public.unit_types where id = p_unit_type_id;
  if v_property is null then return jsonb_build_object('applied', false); end if;

  v_nights    := p_check_out - p_check_in;
  v_adv_days  := p_check_in - (p_now)::date;
  v_adv_hours := extract(epoch from (p_check_in::timestamp - p_now)) / 3600.0;

  for r in
    select pr.* from public.promotions pr
    where pr.property_id = v_property
      and pr.is_active
      and (pr.unit_type_id is null or pr.unit_type_id = p_unit_type_id)
      -- best-of: mereu promoțiile AUTOMATE; plus codul introdus (dacă există)
      and (pr.code is null or (v_code is not null and upper(pr.code) = v_code))
      and (pr.stay_start is null or p_check_in >= pr.stay_start)
      and (pr.stay_end   is null or p_check_in <= pr.stay_end)
      and (pr.book_start is null or (p_now)::date >= pr.book_start)
      and (pr.book_end   is null or (p_now)::date <= pr.book_end)
      and (pr.max_uses is null or pr.uses_count < pr.max_uses)
      and not exists (
        select 1 from public.promotion_rules rl
        where rl.promotion_id = pr.id
          and not (
            (rl.rule_type = 'min_nights'        and v_nights    >= rl.value) or
            (rl.rule_type = 'min_advance_days'  and v_adv_days   >= rl.value) or
            (rl.rule_type = 'max_advance_hours' and v_adv_hours  <= rl.value and v_adv_hours >= 0)
          )
      )
  loop
    if r.code is not null and v_code is not null and upper(r.code) = v_code then
      v_code_matched := true;
    end if;
    if r.discount_type = 'percent' then
      v_disc := round(p_subtotal * r.discount_value / 100.0, 2);
    else
      v_disc := r.discount_value;
    end if;
    v_disc := least(greatest(v_disc, 0), p_subtotal);
    if v_disc > v_best_disc or not v_found then
      v_best_disc := v_disc; v_best := r; v_found := true;
    end if;
  end loop;

  if not v_found then
    return jsonb_build_object('applied', false, 'code_matched', v_code_matched,
      'reason', case when v_code is not null then 'INVALID' else null end);
  end if;

  return jsonb_build_object(
    'applied',         true,
    'code_matched',    v_code_matched,
    'promotion_id',    v_best.id,
    'code',            v_best.code,
    'name',            v_best.name,
    'discount_type',   v_best.discount_type,
    'discount_value',  v_best.discount_value,
    'discount_amount', v_best_disc
  );
end $$;
