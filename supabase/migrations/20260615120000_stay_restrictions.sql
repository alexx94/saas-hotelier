-- ============================================================
-- Migrația 30 (Sprint 4.7 — Stay Restrictions)
--
--   Strat de restricții de SOSIRE / PLECARE + GAP de curățenie, separat de:
--     · stay_rules / unit_types.min_stay  (durata sejurului — Sprint 4.6)
--     · closures                          (stop-sell / produs închis — Sprint 4.6)
--     · room_blocks                       (blocaj fizic pe o cameră — Sprint 3)
--
--   1. arrival_rules — restricții de sosire/plecare, model UNIFICAT:
--        weekdays NULL = toată perioada (CTA/CTD pe interval, ex. „20 Dec")
--        weekdays=[5,6] = doar acele zile (DOW restrictions, ex. „fără sosiri Vi/Sâ")
--        no_arrival  = Closed To Arrival   (nu începi sejur pe ziua care se potrivește)
--        no_departure = Closed To Departure (nu termini sejur pe ziua care se potrivește)
--      Scope: unit_type_id NULL = toată proprietatea; setat = un tip. Ierarhia
--      Property > Room Type aplică UNIUNEA restricțiilor (cea mai restrictivă), cu
--      override explicit la nivel de booking (Manager Override, vezi mai jos).
--
--   2. unit_types.turnover_days — gap minim (curățenie/turnover) între rezervări
--      pe ACEEAȘI unitate fizică. Extinde intervalul de conflict cu `gap` nopți pe
--      ambele capete (simetric) → scade automat disponibilitatea peste tot. E o
--      constrângere FIZICĂ (ca double-booking) → nu se poate override.
--
--   3. app.check_arrival_departure — rezolvă restricțiile de sosire/plecare și
--      întoarce TOATE motivele (text[]) ca UI-ul să le poată afișa simultan.
--
--   4. Manager Override: p_override boolean (doar owner/manager) bypass-ează stratul
--      SOFT (arrival/departure, CTA/CTD, closures, min/max stay). Fizicul rămâne
--      mereu validat (double-booking, blocaje, ocupare, gap). Public = mereu hard.
--
--   5. Enforcement în app.create_booking_internal + public.update_booking_dates
--      (extinderi de sejur). RPC nou get_booking_restrictions (preview UI). Filtre
--      noi în public_get_availability + get_available_units (gap + sosire/plecare).
--
--   Notă „business date": check_in/check_out sunt date LOCALE ale proprietății
--   (nu timestamp UTC), deci DOW-ul e neambiguu — se evaluează direct pe ele.
-- ============================================================

-- ============ 1. unit_types.turnover_days (gap de curățenie) ============

alter table unit_types
  add column turnover_days int not null default 0 check (turnover_days between 0 and 7);

-- ============ 2. arrival_rules — restricții de sosire / plecare ============
-- Model identic ca stay_rules/closures: scope nullable, RLS la fel, fără grant anon
-- (restricțiile ajung la public doar prin RPC DEFINER).

create table arrival_rules (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  property_id  uuid not null references properties(id) on delete cascade,
  unit_type_id uuid references unit_types(id) on delete cascade,  -- NULL = toată proprietatea
  name         text not null,
  start_date   date not null,
  end_date     date not null,                  -- inclusiv (fereastra în care se aplică regula)
  weekdays     int[],                          -- NULL/gol = orice zi; altfel doar aceste DOW (0=Du..6=Sâ)
  no_arrival   boolean not null default false, -- CTA pe zilele care se potrivesc
  no_departure boolean not null default false, -- CTD pe zilele care se potrivesc
  updated_at   timestamptz not null default clock_timestamp(),
  created_at   timestamptz not null default now(),
  check (end_date >= start_date),
  -- o regulă fără nicio restricție n-ar avea sens
  check (no_arrival or no_departure),
  -- weekdays poate conține doar DOW valide 0..6
  check (weekdays is null or weekdays <@ array[0,1,2,3,4,5,6])
);
create index arrival_rules_lookup_idx on arrival_rules (property_id, start_date, end_date);
create index arrival_rules_type_idx   on arrival_rules (unit_type_id, start_date);

alter table arrival_rules enable row level security;
revoke all on arrival_rules from anon;
create policy arrival_rules_select on arrival_rules for select to authenticated
  using (app.can_access_property(property_id));
create policy arrival_rules_cud on arrival_rules for all to authenticated
  using (app.is_org_role(org_id, array['owner','manager']))
  with check (app.is_org_role(org_id, array['owner','manager']));

create trigger arrival_rules_set_updated_at
  before update on arrival_rules
  for each row execute function app.touch_updated_at_clock();

-- ============ 3. Rezolvare restricții de sosire/plecare (sursă unică) ============
-- Întoarce TOATE motivele aplicabile (text[]) — uniunea regulilor property+type.
-- Codurile: NO_ARRIVAL (sosirea interzisă pe check_in), NO_DEPARTURE (plecarea
-- interzisă pe check_out). UI-ul le afișează simultan (cerința „toate motivele").

create function app.check_arrival_departure(
  p_property_id  uuid,
  p_unit_type_id uuid,
  p_check_in     date,
  p_check_out    date
) returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(distinct code), '{}')
  from (
    -- sosirea (check_in) cade pe o regulă no_arrival care îi acoperă data+ziua?
    select 'NO_ARRIVAL'::text as code
    from public.arrival_rules r
    where r.property_id = p_property_id
      and (r.unit_type_id is null or r.unit_type_id = p_unit_type_id)
      and r.no_arrival
      and p_check_in between r.start_date and r.end_date
      and (r.weekdays is null or extract(dow from p_check_in)::int = any(r.weekdays))
    union all
    -- plecarea (check_out) cade pe o regulă no_departure care îi acoperă data+ziua?
    select 'NO_DEPARTURE'
    from public.arrival_rules r
    where r.property_id = p_property_id
      and (r.unit_type_id is null or r.unit_type_id = p_unit_type_id)
      and r.no_departure
      and p_check_out between r.start_date and r.end_date
      and (r.weekdays is null or extract(dow from p_check_out)::int = any(r.weekdays))
  ) reasons;
$$;

revoke execute on function app.check_arrival_departure(uuid, uuid, date, date) from public, anon, authenticated;

-- ============ 4. Rescriere motor intern de creare (override + gap + arrival) ============
-- Semnătura din 4.6 (16 param) + p_override boolean. Drop necesar (param nou = overload).

drop function app.create_booking_internal(uuid,uuid,uuid,date,date,int,int,text,text,numeric,jsonb,numeric,text,text,text,text);

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
  p_override     boolean default false   -- Manager Override: bypass stratul SOFT
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_type    record;
  v_unit    record;
  v_guest   record;
  v_stay    record;
  v_nights  int;
  v_gap     int;
  v_booking_id uuid;
begin
  select t.*, p.currency as prop_currency
    into v_type
    from public.unit_types t
    join public.properties p on p.id = t.property_id
   where t.id = p_unit_type_id;
  if not found then raise exception 'UNIT_TYPE_NOT_FOUND'; end if;
  if p_check_out <= p_check_in then raise exception 'INVALID_DATES'; end if;

  -- occupancy: adulți obligatoriu > 0, în limitele tipului (FIZIC — nu se override)
  if p_adults < 1 or p_adults > v_type.max_adults
     or p_children > v_type.max_children then
    raise exception 'OCCUPANCY_EXCEEDED';
  end if;

  -- ── strat SOFT (politici) — bypass-at de Manager Override ──
  if not p_override then
    -- stop-sell / closed dates (proprietate sau tip) pe interval
    if app.is_closed(v_type.property_id, p_unit_type_id, p_check_in, p_check_out) then
      raise exception 'DATES_CLOSED';
    end if;

    -- durata sejurului vs reguli (rezolvate pe data de check-in)
    v_nights := p_check_out - p_check_in;
    select * into v_stay from app.resolve_stay(p_unit_type_id, p_check_in);
    if v_nights < v_stay.min_stay then raise exception 'STAY_TOO_SHORT'; end if;
    if v_nights > v_stay.max_stay then raise exception 'STAY_TOO_LONG'; end if;

    -- restricții de sosire / plecare (CTA/CTD + DOW)
    if 'NO_ARRIVAL'   = any(app.check_arrival_departure(v_type.property_id, p_unit_type_id, p_check_in, p_check_out)) then
      raise exception 'NO_ARRIVAL';
    end if;
    if 'NO_DEPARTURE' = any(app.check_arrival_departure(v_type.property_id, p_unit_type_id, p_check_in, p_check_out)) then
      raise exception 'NO_DEPARTURE';
    end if;
  end if;

  -- gap de curățenie: extinde intervalul de conflict pe ambele capete (FIZIC)
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
      and not exists (
        select 1 from public.bookings b
        where b.unit_id = u.id
          and b.status not in ('cancelled','no_show')
          and b.stay && daterange(p_check_in - v_gap, p_check_out + v_gap, '[)')
      )
      and not exists (
        select 1 from public.room_blocks rb
        where rb.unit_id = u.id
          and rb.period && daterange(p_check_in, p_check_out, '[)')
      )
    order by u.name
  loop
    begin
      insert into public.bookings
        (org_id, property_id, unit_type_id, unit_id, guest_id, status,
         check_in, check_out, adults, children, total_amount, unit_price,
         price_breakdown, currency, source, notes,
         booked_full_name, booked_email, booked_phone)
      values
        (v_type.org_id, v_type.property_id, p_unit_type_id, v_unit.id, p_guest_id,
         p_status, p_check_in, p_check_out, p_adults, p_children, p_total, p_unit_price,
         coalesce(p_breakdown, '{}'::jsonb), v_type.prop_currency, p_source, p_notes,
         coalesce(nullif(trim(p_snap_name), ''), v_guest.full_name),
         coalesce(nullif(lower(trim(p_snap_email)), ''), v_guest.email),
         coalesce(nullif(trim(p_snap_phone), ''), v_guest.phone))
      returning id into v_booking_id;
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

revoke execute on function app.create_booking_internal(uuid,uuid,uuid,date,date,int,int,text,text,numeric,jsonb,numeric,text,text,text,text,boolean)
  from public, anon, authenticated;

-- ============ 5. create_booking (admin) — param p_override (owner/manager) ============

drop function public.create_booking(uuid,date,date,uuid,uuid,int,int,text,text);

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
  p_override     boolean default false
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_type  record;
  v_quote jsonb;
begin
  select * into v_type from public.unit_types where id = p_unit_type_id;
  if not found then raise exception 'UNIT_TYPE_NOT_FOUND'; end if;
  if not app.can_access_property(v_type.property_id) then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('pending','confirmed','blocked') then raise exception 'INVALID_STATUS'; end if;
  if p_status <> 'blocked' and p_guest_id is null then raise exception 'GUEST_REQUIRED'; end if;
  -- guard cross-tenant: oaspetele trebuie să fie din aceeași organizație
  if p_guest_id is not null and not exists (
    select 1 from public.guests g where g.id = p_guest_id and g.org_id = v_type.org_id
  ) then
    raise exception 'GUEST_NOT_FOUND';
  end if;
  -- override-ul de restricții e rezervat owner/manager (recepția simplă nu poate forța)
  if p_override and not app.is_org_role(v_type.org_id, array['owner','manager']) then
    raise exception 'OVERRIDE_FORBIDDEN';
  end if;

  v_quote := app.compute_price(p_unit_type_id, p_check_in, p_check_out);

  return app.create_booking_internal(
    p_unit_type_id, p_unit_id, p_guest_id, p_check_in, p_check_out,
    p_adults, p_children, p_status,
    case when p_status = 'blocked' then 'blocked' else 'admin' end,
    (v_quote->>'total')::numeric, v_quote, (v_quote->>'avg_nightly')::numeric,
    p_notes, null, null, null, p_override);
end $$;

revoke execute on function public.create_booking(uuid,date,date,uuid,uuid,int,int,text,text,boolean) from anon, public;
grant execute on function public.create_booking(uuid,date,date,uuid,uuid,int,int,text,text,boolean) to authenticated;

-- ============ 6. public_create_booking — restricțiile rămân HARD (fără override) ============
-- Semnătura e neschimbată; doar pasăm explicit p_override => false la motor.

create or replace function public.public_create_booking(
  p_slug         text,
  p_unit_type_id uuid,
  p_check_in     date,
  p_check_out    date,
  p_full_name    text,
  p_email        text,
  p_phone        text default null,
  p_adults       int default 1,
  p_children     int default 0,
  p_notes        text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_prop  record;
  v_type  record;
  v_quote jsonb;
  v_guest_id uuid;
  v_booking_id uuid;
begin
  select * into v_prop from public.properties where slug = p_slug and is_published;
  if not found then raise exception 'PROPERTY_NOT_FOUND'; end if;

  select * into v_type from public.unit_types
   where id = p_unit_type_id and property_id = v_prop.id and is_active;
  if not found then raise exception 'UNIT_TYPE_NOT_FOUND'; end if;

  if p_check_in < current_date then raise exception 'INVALID_DATES'; end if;
  if p_check_out - p_check_in > 365 then raise exception 'INVALID_DATES'; end if;
  if coalesce(trim(p_full_name), '') = '' or coalesce(trim(p_email), '') = '' then
    raise exception 'GUEST_DETAILS_REQUIRED';
  end if;

  v_quote := app.compute_price(p_unit_type_id, p_check_in, p_check_out);

  v_guest_id := (app.find_or_create_guest_internal(
                   v_prop.org_id, p_full_name, p_email, p_phone, false)->>'guest_id')::uuid;

  v_booking_id := app.create_booking_internal(
    p_unit_type_id, null, v_guest_id, p_check_in, p_check_out,
    p_adults, p_children, 'pending', 'public',
    (v_quote->>'total')::numeric, v_quote, (v_quote->>'avg_nightly')::numeric,
    p_notes, p_full_name, p_email, p_phone, false);

  return jsonb_build_object('booking_id', v_booking_id, 'status', 'pending');
end $$;

grant execute on function public.public_create_booking to anon, authenticated;

-- ============ 7. update_booking_dates — enforcement la schimbarea datelor + override ============
-- „Se ignoră la modificări care nu vizează datele" → aici se aplică DOAR pe schimbarea
-- de date (caz de extindere de sejur, unde Manager Override e relevant).

drop function public.update_booking_dates(uuid,date,date);

create function public.update_booking_dates(
  p_booking_id uuid,
  p_check_in   date,
  p_check_out  date,
  p_override   boolean default false
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_booking record;
  v_stay    record;
  v_gap     int;
  v_nights  int;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;

  if not app.can_access_property(v_booking.property_id) then
    raise exception 'FORBIDDEN';
  end if;

  if v_booking.status in ('cancelled', 'checked_out', 'no_show') then
    raise exception 'BOOKING_NOT_EDITABLE';
  end if;

  if p_check_out <= p_check_in then
    raise exception 'INVALID_DATE_RANGE';
  end if;

  if p_override and not app.is_org_role(v_booking.org_id, array['owner','manager']) then
    raise exception 'OVERRIDE_FORBIDDEN';
  end if;

  -- strat SOFT (politici) — doar dacă datele chiar se schimbă și nu e override
  if not p_override
     and (p_check_in <> v_booking.check_in or p_check_out <> v_booking.check_out) then
    if app.is_closed(v_booking.property_id, v_booking.unit_type_id, p_check_in, p_check_out) then
      raise exception 'DATES_CLOSED';
    end if;
    v_nights := p_check_out - p_check_in;
    select * into v_stay from app.resolve_stay(v_booking.unit_type_id, p_check_in);
    if v_nights < v_stay.min_stay then raise exception 'STAY_TOO_SHORT'; end if;
    if v_nights > v_stay.max_stay then raise exception 'STAY_TOO_LONG'; end if;
    if 'NO_ARRIVAL'   = any(app.check_arrival_departure(v_booking.property_id, v_booking.unit_type_id, p_check_in, p_check_out)) then
      raise exception 'NO_ARRIVAL';
    end if;
    if 'NO_DEPARTURE' = any(app.check_arrival_departure(v_booking.property_id, v_booking.unit_type_id, p_check_in, p_check_out)) then
      raise exception 'NO_DEPARTURE';
    end if;
  end if;

  -- gap de curățenie (FIZIC — mereu validat) vs celelalte rezervări pe aceeași unitate
  select coalesce(turnover_days, 0) into v_gap from public.unit_types where id = v_booking.unit_type_id;
  if v_gap > 0 and v_booking.unit_id is not null and exists (
    select 1 from public.bookings b
    where b.unit_id = v_booking.unit_id
      and b.id <> p_booking_id
      and b.status not in ('cancelled','no_show')
      and b.stay && daterange(p_check_in - v_gap, p_check_out + v_gap, '[)')
  ) then
    raise exception 'UNIT_NOT_AVAILABLE';
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

-- ============ 8. get_booking_restrictions — preview UI (toate motivele soft) ============
-- Agregă TOATE motivele soft pentru un tip + interval, ca formularul de recepție să le
-- afișeze simultan și să propună Manager Override.

create function public.get_booking_restrictions(
  p_unit_type_id uuid,
  p_check_in     date,
  p_check_out    date
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_type    record;
  v_stay    record;
  v_reasons text[] := '{}';
begin
  select t.*, p.id as prop_id into v_type
    from public.unit_types t join public.properties p on p.id = t.property_id
   where t.id = p_unit_type_id;
  if not found then raise exception 'UNIT_TYPE_NOT_FOUND'; end if;
  if not app.can_access_property(v_type.property_id) then raise exception 'FORBIDDEN'; end if;
  if p_check_out <= p_check_in then return jsonb_build_object('reasons', '[]'::jsonb); end if;

  if app.is_closed(v_type.property_id, p_unit_type_id, p_check_in, p_check_out) then
    v_reasons := v_reasons || 'DATES_CLOSED';
  end if;

  select * into v_stay from app.resolve_stay(p_unit_type_id, p_check_in);
  if p_check_out - p_check_in < v_stay.min_stay then v_reasons := v_reasons || 'STAY_TOO_SHORT'; end if;
  if p_check_out - p_check_in > v_stay.max_stay then v_reasons := v_reasons || 'STAY_TOO_LONG'; end if;

  v_reasons := v_reasons || app.check_arrival_departure(v_type.property_id, p_unit_type_id, p_check_in, p_check_out);

  return jsonb_build_object('reasons', to_jsonb(v_reasons));
end $$;

revoke execute on function public.get_booking_restrictions from anon, public;
grant execute on function public.get_booking_restrictions to authenticated;

-- ============ 9. get_available_units — gap de curățenie la alocarea manuală ============

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
language sql stable
as $$
  select
    u.id,
    u.name,
    u.status,
    not exists (
      select 1 from bookings b
      where b.unit_id = u.id
        and (p_exclude_booking_id is null or b.id <> p_exclude_booking_id)
        and b.status not in ('cancelled','no_show')
        and b.stay && daterange(
              p_check_in  - coalesce(t.turnover_days, 0),
              p_check_out + coalesce(t.turnover_days, 0), '[)')
    ) and not exists (
      select 1 from room_blocks rb
      where rb.unit_id = u.id
        and rb.period && daterange(p_check_in, p_check_out, '[)')
    ) as is_free
  from units u
  join unit_types t on t.id = u.unit_type_id
  where u.unit_type_id = p_unit_type_id
    and u.status = 'active'
  order by u.name;
$$;

-- ============ 10. public_get_availability — gap + filtru sosire/plecare ============
-- Semnătură + coloane neschimbate (4.6); doar corpul: gap pe conflict + excludem
-- tipurile cu sosirea/plecarea închisă pe datele cerute.

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
  currency        char(3),
  available_units int
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_prop   record;
  v_nights int;
begin
  select * into v_prop from public.properties where slug = p_slug and is_published;
  if not found then return; end if;
  if p_check_in < current_date or p_check_out <= p_check_in
     or p_check_out - p_check_in > 365 then
    return;
  end if;
  v_nights := p_check_out - p_check_in;

  return query
  select
    a.unit_type_id, a.name, a.description, a.max_adults, a.max_children,
    a.min_stay, a.max_stay,
    (pr.q->>'avg_nightly')::numeric,
    (pr.q->>'total')::numeric,
    v_prop.currency,
    a.available_units
  from (
    select t.id as unit_type_id, t.name, t.description,
           t.max_adults, t.max_children, t.sort_order,
           rs.min_stay, rs.max_stay,
           count(u.id)::int as available_units
    from public.unit_types t
    join public.units u on u.unit_type_id = t.id and u.status = 'active'
    cross join lateral app.resolve_stay(t.id, p_check_in) rs
    where t.property_id = v_prop.id
      and t.is_active
      and t.max_adults >= p_adults
      and t.max_children >= p_children
      and v_nights between rs.min_stay and rs.max_stay
      and not app.is_closed(v_prop.id, t.id, p_check_in, p_check_out)
      and app.check_arrival_departure(v_prop.id, t.id, p_check_in, p_check_out) = '{}'
      and not exists (
        select 1 from public.bookings b
        where b.unit_id = u.id
          and b.status not in ('cancelled','no_show')
          and b.stay && daterange(
                p_check_in  - coalesce(t.turnover_days, 0),
                p_check_out + coalesce(t.turnover_days, 0), '[)')
      )
      and not exists (
        select 1 from public.room_blocks rb
        where rb.unit_id = u.id
          and rb.period && daterange(p_check_in, p_check_out, '[)')
      )
    group by t.id, t.name, t.description, t.max_adults, t.max_children,
             t.sort_order, rs.min_stay, rs.max_stay
  ) a
  cross join lateral (select app.compute_price(a.unit_type_id, p_check_in, p_check_out) as q) pr
  order by a.sort_order, a.name;
end $$;

grant execute on function public.public_get_availability to anon, authenticated;

-- ============ 11. Audit unit_types: include turnover_days ============

create or replace function app.audit_unit_type() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_event_type text;
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.unit_type_events (org_id, unit_type_id, actor_id, actor_email, event_type, new_data)
    values (new.org_id, new.id, auth.uid(), nullif(auth.jwt()->>'email', ''), 'created',
            jsonb_build_object('name', new.name, 'max_adults', new.max_adults,
                               'max_children', new.max_children, 'base_price', new.base_price,
                               'min_stay', new.min_stay, 'max_stay', new.max_stay,
                               'turnover_days', new.turnover_days,
                               'weekend_adjustment_type', new.weekend_adjustment_type,
                               'weekend_adjustment_value', new.weekend_adjustment_value,
                               'weekend_days', new.weekend_days));
    return new;
  end if;

  if old.name <> new.name then
    v_old := v_old || jsonb_build_object('name', old.name);
    v_new := v_new || jsonb_build_object('name', new.name);
  end if;
  if old.max_adults <> new.max_adults then
    v_old := v_old || jsonb_build_object('max_adults', old.max_adults);
    v_new := v_new || jsonb_build_object('max_adults', new.max_adults);
  end if;
  if old.max_children <> new.max_children then
    v_old := v_old || jsonb_build_object('max_children', old.max_children);
    v_new := v_new || jsonb_build_object('max_children', new.max_children);
  end if;
  if old.base_price <> new.base_price then
    v_old := v_old || jsonb_build_object('base_price', old.base_price);
    v_new := v_new || jsonb_build_object('base_price', new.base_price);
  end if;
  if old.min_stay <> new.min_stay then
    v_old := v_old || jsonb_build_object('min_stay', old.min_stay);
    v_new := v_new || jsonb_build_object('min_stay', new.min_stay);
  end if;
  if old.max_stay <> new.max_stay then
    v_old := v_old || jsonb_build_object('max_stay', old.max_stay);
    v_new := v_new || jsonb_build_object('max_stay', new.max_stay);
  end if;
  if old.turnover_days <> new.turnover_days then
    v_old := v_old || jsonb_build_object('turnover_days', old.turnover_days);
    v_new := v_new || jsonb_build_object('turnover_days', new.turnover_days);
  end if;
  if old.weekend_adjustment_type <> new.weekend_adjustment_type then
    v_old := v_old || jsonb_build_object('weekend_adjustment_type', old.weekend_adjustment_type);
    v_new := v_new || jsonb_build_object('weekend_adjustment_type', new.weekend_adjustment_type);
  end if;
  if old.weekend_adjustment_value <> new.weekend_adjustment_value then
    v_old := v_old || jsonb_build_object('weekend_adjustment_value', old.weekend_adjustment_value);
    v_new := v_new || jsonb_build_object('weekend_adjustment_value', new.weekend_adjustment_value);
  end if;
  if old.weekend_days is distinct from new.weekend_days then
    v_old := v_old || jsonb_build_object('weekend_days', old.weekend_days);
    v_new := v_new || jsonb_build_object('weekend_days', new.weekend_days);
  end if;

  if old.is_active and not new.is_active then
    v_event_type := 'archived';
  elsif not old.is_active and new.is_active then
    v_event_type := 'restored';
  elsif v_old <> '{}'::jsonb then
    v_event_type := 'updated';
  else
    return new;
  end if;

  insert into public.unit_type_events (org_id, unit_type_id, actor_id, actor_email, event_type, old_data, new_data)
  values (new.org_id, new.id, auth.uid(), nullif(auth.jwt()->>'email', ''), v_event_type,
          nullif(v_old, '{}'::jsonb), nullif(v_new, '{}'::jsonb));

  return new;
end $$;
