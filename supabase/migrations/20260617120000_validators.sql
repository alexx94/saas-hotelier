-- ============================================================
-- Migrația 35 (Sprint 4.9 — Availability & Allocation Engine: strat de validatori)
--
--   Toate verificările de rezervare existau, dar erau INLINE (if...if...if...) în
--   app.create_booking_internal și DUPLICATE în public_get_availability (scara de
--   `reason`), get_available_units, update_booking_dates. Sprint 4.9 le extrage într-un
--   STRAT DE VALIDATORI compozabili, cu o singură sursă de adevăr, refolosit de:
--     · create  (app.create_booking_internal → ridică prima eroare, apoi alocă)
--     · update  (public.update_booking_dates → la schimbarea datelor)
--     · availability (public_get_availability → `reason` = primul cod blocant)
--     · RPC nou public.validate_booking (preview în formularul de recepție)
--
--   Contract uniform: fiecare validator întoarce jsonb { valid, errors[], warnings[] }
--   cu CODURI (vocabularul de excepții al motorului: OCCUPANCY_EXCEEDED, DATES_CLOSED,
--   STAY_TOO_SHORT/LONG, NO_ARRIVAL, NO_DEPARTURE, UNIT_NOT_AVAILABLE, PROMO_INVALID).
--   Frontend-ul mapează codurile la i18n (nicio etichetă UI în DB).
--
--   Validatori:
--     · app.validate_occupancy   — adulți/copii vs capacitatea tipului (FIZIC)
--     · app.validate_stay        — închideri (stop-sell) + min/max stay (SOFT)
--     · app.validate_restrictions— sosire/plecare CTA/CTD (SOFT)
--     · app.validate_availability— cameră fizică liberă (booking+gap+block) (FIZIC)
--     · app.validate_promotion   — cod promo valid/eligibil (COMERCIAL)
--
--   Predicat unic „cameră liberă": app.unit_is_free (booking cu gap + room_block) —
--   înlocuiește cele 4 copii ale aceluiași `not exists ... and not exists ...`.
--
--   Scara canonică de motive: app.booking_block_codes rulează validatorii fizici+soft
--   (fără promo, fără override) și întoarce TOATE codurile în ordinea de prioritate a
--   motorului. validate_booking adaugă deasupra promoția + clasificarea pe severitate
--   (Manager Override coboară SOFT-ul din errors în warnings; FIZIC-ul rămâne eroare).
-- ============================================================

-- ============ 0. Helpers ============

-- jsonb array de stringuri → text[] (pentru a aduna codurile din validatori)
create function app.jsonb_text_array(p jsonb) returns text[]
language sql immutable as $$
  select coalesce(array(select jsonb_array_elements_text(p)), '{}'::text[]);
$$;
revoke execute on function app.jsonb_text_array(jsonb) from public, anon;

-- ordonează codurile după prioritatea motorului (necunoscutele la final)
create function app.order_codes(p text[]) returns text[]
language sql immutable as $$
  select coalesce(array_agg(c order by ord nulls last, c), '{}'::text[])
  from unnest(p) c
  cross join lateral (
    select array_position(array[
      'OCCUPANCY_EXCEEDED','DATES_CLOSED','STAY_TOO_SHORT','STAY_TOO_LONG',
      'NO_ARRIVAL','NO_DEPARTURE','PROMO_INVALID','UNIT_NOT_AVAILABLE'
    ], c) as ord
  ) o;
$$;
revoke execute on function app.order_codes(text[]) from public, anon;

-- predicat unic: o cameră fizică e liberă pe interval (booking cu gap de curățenie +
-- room_block). Sursa de adevăr pentru toți consumatorii (validator, loop de alocare,
-- listă de alocare manuală, availability publică).
create function app.unit_is_free(
  p_unit_id            uuid,
  p_check_in           date,
  p_check_out          date,
  p_gap                int  default 0,
  p_exclude_booking_id uuid default null
) returns boolean
language sql stable security definer set search_path = ''
as $$
  select not exists (
    select 1 from public.bookings b
    where b.unit_id = p_unit_id
      and (p_exclude_booking_id is null or b.id <> p_exclude_booking_id)
      and b.status not in ('cancelled','no_show')
      and b.stay && daterange(p_check_in - coalesce(p_gap,0),
                              p_check_out + coalesce(p_gap,0), '[)')
  ) and not exists (
    select 1 from public.room_blocks rb
    where rb.unit_id = p_unit_id
      and rb.period && daterange(p_check_in, p_check_out, '[)')
  );
$$;
revoke execute on function app.unit_is_free(uuid,date,date,int,uuid) from public, anon, authenticated;

-- ============ 1. Validatori (fiecare → { valid, errors[], warnings[] }) ============

-- occupancy: adulți obligatoriu ≥ 1, în limitele tipului (FIZIC)
create function app.validate_occupancy(
  p_unit_type_id uuid, p_adults int, p_children int
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_type record; v_err text[] := '{}';
begin
  select max_adults, max_children into v_type
    from public.unit_types where id = p_unit_type_id;
  if not found then
    return jsonb_build_object('valid', false,
      'errors', to_jsonb(array['UNIT_TYPE_NOT_FOUND']), 'warnings', '[]'::jsonb);
  end if;
  if p_adults < 1 or p_adults > v_type.max_adults or p_children > v_type.max_children then
    v_err := array['OCCUPANCY_EXCEEDED'];
  end if;
  return jsonb_build_object('valid', v_err = '{}',
    'errors', to_jsonb(v_err), 'warnings', '[]'::jsonb);
end $$;
revoke execute on function app.validate_occupancy(uuid,int,int) from public, anon, authenticated;

-- stay: stop-sell (closures) + durata sejurului vs reguli rezolvate (SOFT)
create function app.validate_stay(
  p_unit_type_id uuid, p_check_in date, p_check_out date
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_prop uuid; v_stay record; v_nights int; v_err text[] := '{}';
begin
  select property_id into v_prop from public.unit_types where id = p_unit_type_id;
  if v_prop is null then
    return jsonb_build_object('valid', false,
      'errors', to_jsonb(array['UNIT_TYPE_NOT_FOUND']), 'warnings', '[]'::jsonb);
  end if;
  v_nights := p_check_out - p_check_in;
  if app.is_closed(v_prop, p_unit_type_id, p_check_in, p_check_out) then
    v_err := v_err || 'DATES_CLOSED'::text;
  end if;
  select * into v_stay from app.resolve_stay(p_unit_type_id, p_check_in);
  if v_nights < v_stay.min_stay then v_err := v_err || 'STAY_TOO_SHORT'::text; end if;
  if v_nights > v_stay.max_stay then v_err := v_err || 'STAY_TOO_LONG'::text; end if;
  return jsonb_build_object('valid', v_err = '{}',
    'errors', to_jsonb(v_err), 'warnings', '[]'::jsonb);
end $$;
revoke execute on function app.validate_stay(uuid,date,date) from public, anon, authenticated;

-- restrictions: sosire/plecare CTA/CTD (SOFT)
create function app.validate_restrictions(
  p_unit_type_id uuid, p_check_in date, p_check_out date
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_prop uuid; v_codes text[]; v_err text[] := '{}';
begin
  select property_id into v_prop from public.unit_types where id = p_unit_type_id;
  if v_prop is null then
    return jsonb_build_object('valid', false,
      'errors', to_jsonb(array['UNIT_TYPE_NOT_FOUND']), 'warnings', '[]'::jsonb);
  end if;
  v_codes := app.check_arrival_departure(v_prop, p_unit_type_id, p_check_in, p_check_out);
  if 'NO_ARRIVAL'   = any(v_codes) then v_err := v_err || 'NO_ARRIVAL'::text;   end if;
  if 'NO_DEPARTURE' = any(v_codes) then v_err := v_err || 'NO_DEPARTURE'::text; end if;
  return jsonb_build_object('valid', v_err = '{}',
    'errors', to_jsonb(v_err), 'warnings', '[]'::jsonb);
end $$;
revoke execute on function app.validate_restrictions(uuid,date,date) from public, anon, authenticated;

-- availability: există cel puțin o cameră fizică liberă (booking+gap+block) (FIZIC).
-- p_unit_id setat = exact acea cameră; p_exclude_booking_id = ignoră propria rezervare
-- (editare de date). La editare nu cerem status active (camera găzduiește deja rezervarea).
create function app.validate_availability(
  p_unit_type_id       uuid,
  p_unit_id            uuid,
  p_check_in           date,
  p_check_out          date,
  p_exclude_booking_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_gap int; v_cnt int; v_err text[] := '{}'; v_warn text[] := '{}'; v_editing boolean;
begin
  select coalesce(turnover_days,0) into v_gap from public.unit_types where id = p_unit_type_id;
  if not found then
    return jsonb_build_object('valid', false,
      'errors', to_jsonb(array['UNIT_TYPE_NOT_FOUND']), 'warnings', '[]'::jsonb);
  end if;
  v_editing := (p_unit_id is not null and p_exclude_booking_id is not null);
  -- plafonat la 2: distinge 0 (sold out) / 1 (LAST_UNIT) / 2+ — scurtcircuitează pe tipuri
  -- cu multe camere (nu evaluează unit_is_free pe toate dacă primele 2 sunt libere)
  select count(*) into v_cnt from (
    select 1
      from public.units u
     where u.unit_type_id = p_unit_type_id
       and (u.status = 'active' or v_editing)
       and (p_unit_id is null or u.id = p_unit_id)
       and app.unit_is_free(u.id, p_check_in, p_check_out, v_gap, p_exclude_booking_id)
     limit 2
  ) s;
  if v_cnt = 0 then
    v_err := array['UNIT_NOT_AVAILABLE'];
  elsif v_cnt = 1 and p_unit_id is null then
    v_warn := array['LAST_UNIT'];   -- ultima cameră liberă (informativ)
  end if;
  return jsonb_build_object('valid', v_err = '{}',
    'errors', to_jsonb(v_err), 'warnings', to_jsonb(v_warn));
end $$;
revoke execute on function app.validate_availability(uuid,uuid,date,date,uuid) from public, anon, authenticated;

-- promotion: codul introdus e valid/eligibil (COMERCIAL). best-of → o automată mai bună
-- poate „aplica" chiar dacă codul a fost depășit; PROMO_INVALID doar dacă NIMIC nu s-a
-- aplicat când un cod a fost cerut (oglindă a regulii din motor).
create function app.validate_promotion(
  p_unit_type_id uuid, p_check_in date, p_check_out date,
  p_subtotal numeric, p_code text, p_now timestamptz
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_promo jsonb; v_err text[] := '{}'; v_warn text[] := '{}';
        v_code text := nullif(trim(coalesce(p_code,'')), '');
begin
  v_promo := app.resolve_promotion(p_unit_type_id, p_check_in, p_check_out, p_subtotal, p_code, p_now);
  if v_code is not null and not coalesce((v_promo->>'applied')::boolean, false) then
    v_err := array['PROMO_INVALID'];
  elsif coalesce((v_promo->>'applied')::boolean, false) then
    v_warn := array['PROMO_APPLIED'];
  end if;
  return jsonb_build_object('valid', v_err = '{}',
    'errors', to_jsonb(v_err), 'warnings', to_jsonb(v_warn));
end $$;
revoke execute on function app.validate_promotion(uuid,date,date,numeric,text,timestamptz) from public, anon, authenticated;

-- ============ 2. Scara canonică de motive (sursă unică de ordine) ============
-- Rulează validatorii FIZICI + SOFT (fără promo, fără override) și întoarce TOATE
-- codurile blocante în ordinea de prioritate a motorului. Folosit de availability
-- (primul cod = reason) și de orchestrator.
create function app.booking_block_codes(
  p_unit_type_id       uuid,
  p_unit_id            uuid,
  p_check_in           date,
  p_check_out          date,
  p_adults             int,
  p_children           int,
  p_exclude_booking_id uuid default null
) returns text[]
language plpgsql stable security definer set search_path = ''
as $$
declare v text[] := '{}';
begin
  v := v || app.jsonb_text_array((app.validate_occupancy(p_unit_type_id, p_adults, p_children))->'errors');
  v := v || app.jsonb_text_array((app.validate_stay(p_unit_type_id, p_check_in, p_check_out))->'errors');
  v := v || app.jsonb_text_array((app.validate_restrictions(p_unit_type_id, p_check_in, p_check_out))->'errors');
  v := v || app.jsonb_text_array((app.validate_availability(p_unit_type_id, p_unit_id, p_check_in, p_check_out, p_exclude_booking_id))->'errors');
  return app.order_codes(v);
end $$;
revoke execute on function app.booking_block_codes(uuid,uuid,date,date,int,int,uuid) from public, anon, authenticated;

-- ============ 3. Orchestrator app.validate_booking ============
-- Întoarce { valid, errors[], warnings[] }. Severitatea:
--   FIZIC (OCCUPANCY_EXCEEDED, UNIT_NOT_AVAILABLE) = mereu eroare.
--   SOFT  (DATES_CLOSED, STAY_*, NO_ARRIVAL/DEPARTURE) = eroare, dar Manager Override
--          le coboară în warnings.
--   COMERCIAL (PROMO_INVALID) = mereu eroare; PROMO_APPLIED / LAST_UNIT = warnings.
create function app.validate_booking(
  p_unit_type_id       uuid,
  p_unit_id            uuid,
  p_check_in           date,
  p_check_out          date,
  p_adults             int,
  p_children           int,
  p_promo_code         text        default null,
  p_override           boolean     default false,
  p_now                timestamptz default now(),
  p_exclude_booking_id uuid        default null
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_prop      uuid;
  v_subtotal  numeric;
  v_codes     text[];
  v_errors    text[] := '{}';
  v_warnings  text[] := '{}';
  v_hard      constant text[] := array['OCCUPANCY_EXCEEDED','UNIT_NOT_AVAILABLE'];
  c           text;
  v_promo     jsonb;
begin
  -- precondiții: tip există + date valide (fără ele nu putem evalua nimic)
  select property_id into v_prop from public.unit_types where id = p_unit_type_id;
  if v_prop is null then
    return jsonb_build_object('valid', false,
      'errors', to_jsonb(array['UNIT_TYPE_NOT_FOUND']), 'warnings', '[]'::jsonb);
  end if;
  if p_check_out <= p_check_in then
    return jsonb_build_object('valid', false,
      'errors', to_jsonb(array['INVALID_DATES']), 'warnings', '[]'::jsonb);
  end if;

  -- scara fizic+soft, ordonată; clasifică pe severitate
  v_codes := app.booking_block_codes(p_unit_type_id, p_unit_id, p_check_in, p_check_out,
                                     p_adults, p_children, p_exclude_booking_id);
  foreach c in array v_codes loop
    if c = any(v_hard) then
      v_errors := v_errors || c;            -- FIZIC: mereu eroare
    elsif p_override then
      v_warnings := v_warnings || c;        -- SOFT sub override → warning
    else
      v_errors := v_errors || c;            -- SOFT → eroare
    end if;
  end loop;
  if 'LAST_UNIT' = any(app.jsonb_text_array(
       (app.validate_availability(p_unit_type_id, p_unit_id, p_check_in, p_check_out, p_exclude_booking_id))->'warnings')) then
    v_warnings := v_warnings || 'LAST_UNIT'::text;
  end if;

  -- promoție (comercial): cod invalid = eroare mereu; aplicată = warning
  v_subtotal := (app.compute_price(p_unit_type_id, p_check_in, p_check_out)->>'total')::numeric;
  v_promo := app.validate_promotion(p_unit_type_id, p_check_in, p_check_out, v_subtotal, p_promo_code, p_now);
  v_errors   := v_errors   || app.jsonb_text_array(v_promo->'errors');
  v_warnings := v_warnings || app.jsonb_text_array(v_promo->'warnings');

  v_errors := app.order_codes(v_errors);
  return jsonb_build_object('valid', v_errors = '{}',
    'errors', to_jsonb(v_errors), 'warnings', to_jsonb(v_warnings));
end $$;
revoke execute on function app.validate_booking(uuid,uuid,date,date,int,int,text,boolean,timestamptz,uuid)
  from public, anon, authenticated;

-- ============ 4. RPC public.validate_booking (preview formular recepție) ============
-- Înlocuiește get_booking_restrictions (care întorcea doar motive soft). Acum dă toată
-- imaginea: errors[] (blocante) + warnings[] (soft forțate prin override / promoție / etc).
create function public.validate_booking(
  p_unit_type_id uuid,
  p_check_in     date,
  p_check_out    date,
  p_adults       int     default 1,
  p_children     int     default 0,
  p_unit_id      uuid    default null,
  p_promo_code   text    default null,
  p_override     boolean default false
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_type record;
begin
  select id, org_id, property_id into v_type from public.unit_types where id = p_unit_type_id;
  if not found then raise exception 'UNIT_TYPE_NOT_FOUND'; end if;
  if not app.can_access_property(v_type.property_id) then raise exception 'FORBIDDEN'; end if;
  -- override e previzualizat doar pentru owner/manager (recepția simplă vede tot ca eroare)
  if p_override and not app.is_org_role(v_type.org_id, array['owner','manager']) then
    p_override := false;
  end if;
  return app.validate_booking(p_unit_type_id, p_unit_id, p_check_in, p_check_out,
                              p_adults, p_children, p_promo_code, p_override, now());
end $$;
revoke execute on function public.validate_booking(uuid,date,date,int,int,uuid,text,boolean) from anon, public;
grant execute on function public.validate_booking(uuid,date,date,int,int,uuid,text,boolean) to authenticated;

-- get_booking_restrictions e înlocuit complet de validate_booking
drop function public.get_booking_restrictions(uuid,date,date);

-- ============ 5. create_booking_internal — rulează orchestratorul, apoi alocă ============
-- Semnătura din 4.8 (18 param), neschimbată. Înlocuim blocul inline de verificări cu un
-- singur app.validate_booking (ridicăm prima eroare). Promoția se REZOLVĂ tot aici pentru
-- snapshot-ul de preț + consumul atomic; bucla de alocare folosește app.unit_is_free.
create or replace function app.create_booking_internal(
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
  p_promo_code   text default null
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

  -- promoție: rezolvă cea mai bună pentru snapshot + totalul final
  v_promo := app.resolve_promotion(p_unit_type_id, p_check_in, p_check_out, p_total, p_promo_code, now());
  if coalesce((v_promo->>'applied')::boolean, false) then
    v_promo_id := (v_promo->>'promotion_id')::uuid;
    v_discount := coalesce((v_promo->>'discount_amount')::numeric, 0);
  else
    v_promo_id := null;
    v_discount := 0;
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
         booked_full_name, booked_email, booked_phone)
      values
        (v_type.org_id, v_type.property_id, p_unit_type_id, v_unit.id, p_guest_id,
         p_status, p_check_in, p_check_out, p_adults, p_children, v_final_total, p_unit_price,
         v_breakdown, v_type.prop_currency, p_source, p_notes,
         v_promo_id, v_discount,
         coalesce(nullif(trim(p_snap_name), ''), v_guest.full_name),
         coalesce(nullif(lower(trim(p_snap_email)), ''), v_guest.email),
         coalesce(nullif(trim(p_snap_phone), ''), v_guest.phone))
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
revoke execute on function app.create_booking_internal(uuid,uuid,uuid,date,date,int,int,text,text,numeric,jsonb,numeric,text,text,text,text,boolean,text)
  from public, anon, authenticated;

-- ============ 6. update_booking_dates — orchestratorul la schimbarea datelor ============
create or replace function public.update_booking_dates(
  p_booking_id uuid,
  p_check_in   date,
  p_check_out  date,
  p_override   boolean default false
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_booking record;
  v_val     jsonb;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if not app.can_access_property(v_booking.property_id) then raise exception 'FORBIDDEN'; end if;
  if v_booking.status in ('cancelled', 'checked_out', 'no_show') then
    raise exception 'BOOKING_NOT_EDITABLE';
  end if;
  if p_check_out <= p_check_in then raise exception 'INVALID_DATE_RANGE'; end if;
  if p_override and not app.is_org_role(v_booking.org_id, array['owner','manager']) then
    raise exception 'OVERRIDE_FORBIDDEN';
  end if;

  -- doar la schimbarea efectivă a datelor rulăm validatorii (TOATE, exclude propria rezervare)
  if p_check_in <> v_booking.check_in or p_check_out <> v_booking.check_out then
    v_val := app.validate_booking(v_booking.unit_type_id, v_booking.unit_id, p_check_in, p_check_out,
                                  v_booking.adults, v_booking.children, null, p_override, now(), p_booking_id);
    if not (v_val->>'valid')::boolean then
      raise exception '%', (v_val->'errors'->>0);
    end if;
  end if;

  begin
    update public.bookings
    set check_in   = p_check_in,
        check_out  = p_check_out,
        updated_at = now()
    where id = p_booking_id;
  exception when exclusion_violation then
    raise exception 'UNIT_NOT_AVAILABLE';
  end;
end $$;
revoke execute on function public.update_booking_dates(uuid,date,date,boolean) from anon, public;
grant execute on function public.update_booking_dates(uuid,date,date,boolean) to authenticated;

-- ============ 7. get_available_units — predicat unic unit_is_free ============
-- Devine security definer: predicatul app.unit_is_free e definer-only, deci nu poate fi
-- apelat din context invoker. Izolarea de tenant e asigurată explicit (can_access_property).
create or replace function public.get_available_units(
  p_unit_type_id       uuid,
  p_check_in           date,
  p_check_out          date,
  p_exclude_booking_id uuid default null
) returns table (
  unit_id   uuid,
  name      text,
  status    text,
  is_free   boolean
)
language sql stable security definer set search_path = ''
as $$
  select u.id, u.name, u.status,
    app.unit_is_free(u.id, p_check_in, p_check_out,
                     coalesce(t.turnover_days, 0), p_exclude_booking_id) as is_free
  from public.units u
  join public.unit_types t on t.id = u.unit_type_id
  where u.unit_type_id = p_unit_type_id
    and u.status = 'active'
    and app.can_access_property(t.property_id)
  order by u.name;
$$;
revoke execute on function public.get_available_units(uuid,date,date,uuid) from anon, public;
grant execute on function public.get_available_units(uuid,date,date,uuid) to authenticated;

-- ============ 8. public_get_availability — reason din scara canonică ============
-- Aceeași semnătură + coloane (4.8). Înlocuim scara inline `case` cu app.booking_block_codes
-- (sursă unică) și predicatul de cameră liberă cu app.unit_is_free. Vocabularul public de
-- `reason` (OCCUPANCY/CLOSED/UNAVAILABLE) e mapat din codurile de excepție la final.
create or replace function public.public_get_availability(
  p_slug      text,
  p_check_in  date,
  p_check_out date,
  p_adults    int default 1,
  p_children  int default 0
) returns table (
  unit_type_id    uuid,
  name            text,
  description     jsonb,
  max_adults      int,
  max_children    int,
  min_stay        int,
  max_stay        int,
  price_per_night numeric,
  total_price     numeric,
  discount        numeric,
  promo_label     text,
  currency        char(3),
  available_units int,
  reason          text
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_prop record;
begin
  select * into v_prop from public.properties where slug = p_slug and is_published;
  if not found then return; end if;
  if p_check_in < current_date or p_check_out <= p_check_in
     or p_check_out - p_check_in > 365 then
    return;
  end if;

  return query
  select
    t.id, t.name, t.description, t.max_adults, t.max_children,
    rs.min_stay, rs.max_stay,
    (pr.q->>'avg_nightly')::numeric,
    (pr.q->>'total')::numeric,
    case when reason.r is null then coalesce((promo.j->>'discount_amount')::numeric, 0) else 0 end,
    case when reason.r is null and (promo.j->>'applied')::boolean
         then coalesce(promo.j->>'code', promo.j->>'name') end,
    v_prop.currency,
    avail.cnt,
    reason.r
  from public.unit_types t
  cross join lateral app.resolve_stay(t.id, p_check_in) rs
  cross join lateral (
    select count(u.id)::int as cnt
    from public.units u
    where u.unit_type_id = t.id
      and u.status = 'active'
      and app.unit_is_free(u.id, p_check_in, p_check_out, coalesce(t.turnover_days, 0))
  ) avail
  -- scara canonică (sursă unică) → primul cod, mapat la vocabularul public
  cross join lateral (
    select (app.booking_block_codes(t.id, null, p_check_in, p_check_out, p_adults, p_children))[1] as code
  ) bc
  cross join lateral (
    select case bc.code
      when 'OCCUPANCY_EXCEEDED' then 'OCCUPANCY'
      when 'DATES_CLOSED'       then 'CLOSED'
      when 'UNIT_NOT_AVAILABLE' then 'UNAVAILABLE'
      else bc.code
    end as r
  ) reason
  cross join lateral (select app.compute_price(t.id, p_check_in, p_check_out) as q) pr
  cross join lateral (
    select case when reason.r is null
                then app.resolve_promotion(t.id, p_check_in, p_check_out,
                                           (pr.q->>'total')::numeric, null, now())
                else '{}'::jsonb end as j
  ) promo
  where t.property_id = v_prop.id
    and t.is_active
  order by t.sort_order, t.name;
end $$;
grant execute on function public.public_get_availability to anon, authenticated;
