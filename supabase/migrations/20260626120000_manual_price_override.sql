-- ============================================================
-- Sprint 9 — Manual Price Override (rezervări din panou)
--
-- Permite rolurilor privilegiate (administrator/manager + owner bypass) să
-- modifice manual prețul unei rezervări create din panou, în 3 moduri:
--   • total      — preț total absolut pentru toată șederea (ex. sync Booking.com)
--   • adjustment — reducere (−) sau adaos (+) pe totalul calculat
--   • per_night  — preț editat manual pentru fiecare noapte
-- În toate cazurile stocarea e aceeași: total_amount + price_breakdown (nopți
-- recalculate). Override-ul manual ÎNLOCUIEȘTE promoția (promotion_id=null,
-- discount_amount=0) — tu setezi numărul final.
--
-- Aplicabil la CREARE (create_booking) și la EDITARE (override_booking_price).
-- Gate nou: permisiunea booking.price_override (RLS-style, în RPC-uri DEFINER).
--
-- Modular: un singur helper pur `app.apply_price_override` face matematica,
-- refolosit de quote_price (preview), create_booking și override_booking_price.
-- ============================================================

-- ============ 1. permisiune nouă: booking.price_override ============
insert into permissions (key, domain, description, sort_order) values
  ('booking.price_override', 'booking', 'Modificare manuală preț rezervare', 16);

-- acordată rolurilor de sistem administrator + manager (owner bypass structural)
insert into role_permissions (role_id, permission_key)
  select r.id, 'booking.price_override' from roles r
  where r.org_id is null and r.slug in ('administrator', 'manager');

-- ============ 2. coloane snapshot pe bookings ============
-- price_override_value: total absolut ('total') sau delta cu semn ('adjustment');
-- NULL pentru 'per_night' (breakdown-ul cară valorile). Metadată = cine/când/notă.
alter table bookings
  add column price_override_kind  text
    check (price_override_kind is null or price_override_kind in ('total','adjustment','per_night')),
  add column price_override_value numeric(12,2),
  add column price_override_by    uuid references auth.users(id),
  add column price_override_at    timestamptz,
  add column price_override_note  text;

-- ============ 3. helper pur: app.apply_price_override ============
-- Primește output-ul compute_price și întoarce un quote ajustat (nopți
-- recalculate + total + marcaj 'override'), FĂRĂ promoție. Pur (fără acces la
-- tabele) → IMMUTABLE. Sursă unică de adevăr pentru preview + creare + editare.
create function app.apply_price_override(
  p_base   jsonb,            -- compute_price output: {nights[], total, currency, ...}
  p_kind   text,             -- 'total' | 'adjustment' | 'per_night' (null = no-op)
  p_value  numeric,          -- total absolut / delta cu semn; null la per_night
  p_nights jsonb default null -- [{date, rate}] pentru per_night
) returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  v_nights   jsonb := coalesce(p_base->'nights', '[]'::jsonb);
  v_n        int   := jsonb_array_length(v_nights);
  v_base_tot numeric := coalesce((p_base->>'total')::numeric, 0);
  v_target   numeric;
  v_out      jsonb := '[]'::jsonb;
  v_night    jsonb;
  v_rate     numeric;
  v_sum      numeric := 0;
  v_i        int;
  v_date     text;
begin
  if p_kind is null then
    return p_base;  -- fără override
  end if;
  if v_n = 0 then
    raise exception 'PRICE_OVERRIDE_NO_NIGHTS';
  end if;

  if p_kind = 'per_night' then
    if p_nights is null then raise exception 'PRICE_OVERRIDE_NIGHTS_REQUIRED'; end if;
    for v_i in 0 .. v_n - 1 loop
      v_night := v_nights->v_i;
      v_date  := v_night->>'date';
      select round((e->>'rate')::numeric, 2) into v_rate
        from jsonb_array_elements(p_nights) e
       where e->>'date' = v_date
       limit 1;
      if v_rate is null then raise exception 'PRICE_OVERRIDE_NIGHT_MISSING'; end if;
      if v_rate < 0 then raise exception 'PRICE_OVERRIDE_NEGATIVE'; end if;
      v_out := v_out || jsonb_build_object(
        'date', v_date, 'kind', v_night->>'kind', 'base', v_night->'base',
        'rate', v_rate, 'weekend', v_night->'weekend', 'manual', true);
      v_sum := v_sum + v_rate;
    end loop;
  else
    if p_value is null then raise exception 'PRICE_OVERRIDE_VALUE_REQUIRED'; end if;
    if p_kind = 'total' then
      v_target := round(p_value, 2);
    elsif p_kind = 'adjustment' then
      v_target := round(v_base_tot + p_value, 2);
    else
      raise exception 'PRICE_OVERRIDE_INVALID_KIND';
    end if;
    if v_target < 0 then raise exception 'PRICE_OVERRIDE_NEGATIVE'; end if;

    -- distribuie targetul proporțional cu tarifele de bază (split egal dacă baza = 0)
    for v_i in 0 .. v_n - 1 loop
      v_night := v_nights->v_i;
      if v_base_tot > 0 then
        v_rate := round((v_night->>'rate')::numeric * v_target / v_base_tot, 2);
      else
        v_rate := round(v_target / v_n, 2);
      end if;
      v_out := v_out || jsonb_build_object(
        'date', v_night->>'date', 'kind', v_night->>'kind', 'base', v_night->'base',
        'rate', v_rate, 'weekend', v_night->'weekend', 'manual', true);
      v_sum := v_sum + v_rate;
    end loop;
    -- reziduul de rotunjire merge pe ultima noapte ca suma == target exact
    if v_sum <> v_target then
      v_rate := round((v_out->(v_n-1)->>'rate')::numeric + (v_target - v_sum), 2);
      v_out  := jsonb_set(v_out, array[(v_n-1)::text, 'rate'], to_jsonb(v_rate));
      v_sum  := v_target;
    end if;
  end if;

  return jsonb_build_object(
    'currency',    p_base->>'currency',
    'nights',      v_out,
    'subtotal',    v_sum,
    'total',       v_sum,
    'avg_nightly', case when v_n > 0 then round(v_sum / v_n, 2) else 0 end,
    'night_count', v_n,
    'override',    jsonb_build_object('kind', p_kind, 'value', p_value)
  );
end $$;

revoke all on function app.apply_price_override(jsonb, text, numeric, jsonb) from anon, public, authenticated;

-- ============ 4. quote_price: preview cu override (preview-ul folosește același helper) ============
drop function if exists public.quote_price(uuid, date, date, text);
create function public.quote_price(
  p_unit_type_id  uuid,
  p_check_in      date,
  p_check_out     date,
  p_promo_code    text default null,
  p_override_kind text default null,
  p_override_value numeric default null,
  p_override_nights jsonb default null
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_property_id uuid;
  v_quote  jsonb;
  v_promo  jsonb;
  v_subtotal numeric;
  v_disc   numeric;
begin
  select property_id into v_property_id from public.unit_types where id = p_unit_type_id;
  if v_property_id is null then raise exception 'UNIT_TYPE_NOT_FOUND'; end if;
  if not app.can_access_property(v_property_id) then raise exception 'FORBIDDEN'; end if;

  v_quote := app.compute_price(p_unit_type_id, p_check_in, p_check_out);

  -- override manual înlocuiește complet promoția (preview = exact ce se va salva)
  if p_override_kind is not null then
    return app.apply_price_override(v_quote, p_override_kind, p_override_value, p_override_nights);
  end if;

  v_subtotal := (v_quote->>'total')::numeric;
  v_promo    := app.resolve_promotion(p_unit_type_id, p_check_in, p_check_out, v_subtotal, p_promo_code, now());
  v_disc     := coalesce((v_promo->>'discount_amount')::numeric, 0);

  return v_quote || jsonb_build_object(
    'subtotal',  v_subtotal,
    'discount',  v_disc,
    'total',     v_subtotal - v_disc,
    'promotion', v_promo
  );
end $$;
revoke execute on function public.quote_price(uuid,date,date,text,text,numeric,jsonb) from anon, public;
grant execute on function public.quote_price(uuid,date,date,text,text,numeric,jsonb) to authenticated;

-- ============ 5. create_booking_internal — 4 params noi de override + skip promo ============
drop function app.create_booking_internal(uuid,uuid,uuid,date,date,int,int,text,text,numeric,jsonb,numeric,text,text,text,text,boolean,text);
create function app.create_booking_internal(
  p_unit_type_id uuid,
  p_unit_id      uuid,
  p_guest_id     uuid,
  p_check_in     date,
  p_check_out    date,
  p_adults       int,
  p_children     int,
  p_status       text,
  p_source       text,
  p_total        numeric,
  p_breakdown    jsonb,
  p_unit_price   numeric,
  p_notes        text,
  p_snap_name    text default null,
  p_snap_email   text default null,
  p_snap_phone   text default null,
  p_override     boolean default false,
  p_promo_code   text default null,
  p_ovr_kind     text default null,
  p_ovr_value    numeric default null,
  p_ovr_by       uuid default null,
  p_ovr_note     text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_type    record;
  v_unit    record;
  v_guest   record;
  v_val     jsonb;
  v_gap     int;
  v_promo   jsonb;
  v_promo_id uuid;
  v_discount numeric;
  v_final_total numeric;
  v_breakdown jsonb;
  v_chk     uuid;
  v_booking_id uuid;
begin
  select t.*, p.currency as prop_currency
    into v_type
    from public.unit_types t
    join public.properties p on p.id = t.property_id
   where t.id = p_unit_type_id;
  if not found then raise exception 'UNIT_TYPE_NOT_FOUND'; end if;
  if p_check_out <= p_check_in then raise exception 'INVALID_DATES'; end if;

  -- TOATE verificările printr-o singură sursă; prima eroare oprește crearea
  v_val := app.validate_booking(p_unit_type_id, p_unit_id, p_check_in, p_check_out,
                                p_adults, p_children, p_promo_code, p_override, now());
  if not (v_val->>'valid')::boolean then
    raise exception '%', (v_val->'errors'->>0);
  end if;

  -- override manual ÎNLOCUIEȘTE promoția: total = ce a venit deja ajustat de caller
  if p_ovr_kind is not null then
    v_promo_id := null;
    v_discount := 0;
  else
    -- promoție: rezolvă cea mai bună pentru snapshot + totalul final
    v_promo := app.resolve_promotion(p_unit_type_id, p_check_in, p_check_out, p_total, p_promo_code, now());
    if coalesce((v_promo->>'applied')::boolean, false) then
      v_promo_id := (v_promo->>'promotion_id')::uuid;
      v_discount := coalesce((v_promo->>'discount_amount')::numeric, 0);
    else
      v_promo_id := null;
      v_discount := 0;
    end if;
  end if;
  v_final_total := p_total - v_discount;
  v_breakdown := coalesce(p_breakdown, '{}'::jsonb);
  if v_promo_id is not null then
    v_breakdown := v_breakdown || jsonb_build_object('promotion', v_promo);
  end if;

  v_gap := coalesce(v_type.turnover_days, 0);

  if p_guest_id is not null then
    select full_name, email, phone into v_guest
    from public.guests where id = p_guest_id;
  end if;

  for v_unit in
    select u.* from public.units u
    where u.unit_type_id = p_unit_type_id
      and u.status = 'active'
      and (p_unit_id is null or u.id = p_unit_id)
      and app.unit_is_free(u.id, p_check_in, p_check_out, v_gap)
    order by u.name
  loop
    begin
      insert into public.bookings
        (org_id, property_id, unit_type_id, unit_id, guest_id, status,
         check_in, check_out, adults, children, total_amount, unit_price,
         price_breakdown, currency, source, notes,
         promotion_id, discount_amount,
         booked_full_name, booked_email, booked_phone,
         price_override_kind, price_override_value, price_override_by,
         price_override_at, price_override_note)
      values
        (v_type.org_id, v_type.property_id, p_unit_type_id, v_unit.id, p_guest_id,
         p_status, p_check_in, p_check_out, p_adults, p_children, v_final_total, p_unit_price,
         v_breakdown, v_type.prop_currency, p_source, p_notes,
         v_promo_id, v_discount,
         coalesce(nullif(trim(p_snap_name), ''), v_guest.full_name),
         coalesce(nullif(lower(trim(p_snap_email)), ''), v_guest.email),
         coalesce(nullif(trim(p_snap_phone), ''), v_guest.phone),
         p_ovr_kind, p_ovr_value, p_ovr_by,
         case when p_ovr_kind is not null then now() else null end, p_ovr_note)
      returning id into v_booking_id;

      if v_promo_id is not null then
        update public.promotions
           set uses_count = uses_count + 1
         where id = v_promo_id and (max_uses is null or uses_count < max_uses)
        returning id into v_chk;
        if not found then raise exception 'PROMO_LIMIT_REACHED'; end if;
      end if;

      return v_booking_id;
    exception
      when exclusion_violation then
        continue; -- altă rezervare a câștigat cursa pe camera asta
      when others then
        if sqlerrm like '%UNIT_BLOCKED%' then
          continue; -- un block a apărut între timp
        end if;
        raise;
    end;
  end loop;

  raise exception 'UNIT_NOT_AVAILABLE';
end $$;
revoke execute on function app.create_booking_internal(uuid,uuid,uuid,date,date,int,int,text,text,numeric,jsonb,numeric,text,text,text,text,boolean,text,text,numeric,uuid,text)
  from anon, authenticated, public;

-- ============ 6. create_booking — params de override + gate booking.price_override ============
drop function public.create_booking(uuid,date,date,uuid,uuid,int,int,text,text,boolean,text);
create function public.create_booking(
  p_unit_type_id uuid,
  p_check_in     date,
  p_check_out    date,
  p_guest_id     uuid default null,
  p_unit_id      uuid default null,
  p_adults       int default 1,
  p_children     int default 0,
  p_status       text default 'confirmed',
  p_notes        text default null,
  p_override     boolean default false,
  p_promo_code   text default null,
  p_price_override_kind   text default null,
  p_price_override_value  numeric default null,
  p_price_override_nights jsonb default null,
  p_price_override_note   text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_type  record;
  v_quote jsonb;
  v_has_override boolean;
begin
  select * into v_type from public.unit_types where id = p_unit_type_id;
  if not found then raise exception 'UNIT_TYPE_NOT_FOUND'; end if;
  if not app.has_permission(v_type.org_id, v_type.property_id, 'booking.create') then
    raise exception 'FORBIDDEN';
  end if;
  if p_status not in ('pending','confirmed','blocked') then raise exception 'INVALID_STATUS'; end if;
  if p_status <> 'blocked' and p_guest_id is null then raise exception 'GUEST_REQUIRED'; end if;
  if p_guest_id is not null and not exists (
    select 1 from public.guests g where g.id = p_guest_id and g.org_id = v_type.org_id
  ) then
    raise exception 'GUEST_NOT_FOUND';
  end if;
  if p_override and not app.has_permission(v_type.org_id, null, 'booking.override') then
    raise exception 'OVERRIDE_FORBIDDEN';
  end if;

  -- override de preț = doar pe rezervări reale (nu blocaje) + permisiune dedicată
  v_has_override := p_status <> 'blocked' and p_price_override_kind is not null;
  if v_has_override and not app.has_permission(v_type.org_id, v_type.property_id, 'booking.price_override') then
    raise exception 'PRICE_OVERRIDE_FORBIDDEN';
  end if;

  v_quote := app.compute_price(p_unit_type_id, p_check_in, p_check_out);
  if v_has_override then
    v_quote := app.apply_price_override(v_quote, p_price_override_kind, p_price_override_value, p_price_override_nights);
  end if;

  return app.create_booking_internal(
    p_unit_type_id, p_unit_id, p_guest_id, p_check_in, p_check_out,
    p_adults, p_children, p_status,
    case when p_status = 'blocked' then 'blocked' else 'admin' end,
    (v_quote->>'total')::numeric, v_quote, (v_quote->>'avg_nightly')::numeric,
    p_notes, null, null, null, p_override,
    case when p_status = 'blocked' or v_has_override then null else p_promo_code end,
    case when v_has_override then p_price_override_kind else null end,
    case when v_has_override then p_price_override_value else null end,
    case when v_has_override then auth.uid() else null end,
    case when v_has_override then p_price_override_note else null end);
end $$;
revoke execute on function public.create_booking(uuid,date,date,uuid,uuid,int,int,text,text,boolean,text,text,numeric,jsonb,text) from anon, public;
grant execute on function public.create_booking(uuid,date,date,uuid,uuid,int,int,text,text,boolean,text,text,numeric,jsonb,text) to authenticated;

-- ============ 7. override_booking_price — editare preț pe rezervare existentă ============
-- p_kind = null → curăță override-ul (revine la prețul calculat de motor, fără promo).
-- Gate booking.price_override. Eliberează promoția existentă (decrement uses_count).
create function public.override_booking_price(
  p_booking_id uuid,
  p_kind       text default null,
  p_value      numeric default null,
  p_nights     jsonb default null,
  p_note       text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_b     record;
  v_base  jsonb;
  v_quote jsonb;
begin
  select * into v_b from public.bookings where id = p_booking_id;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if not app.has_permission(v_b.org_id, v_b.property_id, 'booking.price_override') then
    raise exception 'FORBIDDEN';
  end if;
  if v_b.status in ('cancelled', 'blocked') then raise exception 'BOOKING_NOT_EDITABLE'; end if;
  if p_kind is not null and p_kind not in ('total','adjustment','per_night') then
    raise exception 'PRICE_OVERRIDE_INVALID_KIND';
  end if;

  v_base := app.compute_price(v_b.unit_type_id, v_b.check_in, v_b.check_out);
  if p_kind is null then
    v_quote := v_base;  -- revenire la prețul motorului
  else
    v_quote := app.apply_price_override(v_base, p_kind, p_value, p_nights);
  end if;

  -- override-ul trece rezervarea pe preț manual → eliberează promoția veche
  if v_b.promotion_id is not null then
    update public.promotions set uses_count = greatest(uses_count - 1, 0)
     where id = v_b.promotion_id;
  end if;

  update public.bookings set
    total_amount    = (v_quote->>'total')::numeric,
    unit_price      = (v_quote->>'avg_nightly')::numeric,
    price_breakdown = v_quote,
    promotion_id    = null,
    discount_amount = 0,
    price_override_kind  = p_kind,
    price_override_value = case when p_kind = 'per_night' then null else p_value end,
    price_override_by    = case when p_kind is null then null else auth.uid() end,
    price_override_at    = case when p_kind is null then null else now() end,
    price_override_note  = case when p_kind is null then null else p_note end
  where id = p_booking_id;
end $$;
revoke execute on function public.override_booking_price(uuid,text,numeric,jsonb,text) from anon, public;
grant execute on function public.override_booking_price(uuid,text,numeric,jsonb,text) to authenticated;
