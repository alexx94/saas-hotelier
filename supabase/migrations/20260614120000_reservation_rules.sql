-- ============================================================
-- Migrația 28 (Sprint 4.6 — Reservation Rules Engine)
--
--   Strat MODULAR de restricții de rezervare, separat de preț (rate_rules)
--   și de blocajele fizice de cameră (room_blocks):
--
--   1. min_stay / max_stay GLOBALE per tip de cameră (unit_types).
--   2. stay_rules — restricții de durată pe PERIOADĂ (per tip), cheiate pe
--      data de check-in (standard hotelier). Recență la suprapunere (updated_at).
--   3. closures — stop-sell / closed dates cu SCOPE: unit_type_id NULL = toată
--      proprietatea; setat = un singur tip. NU atinge camerele fizice (spre
--      deosebire de room_blocks, care scot o cameră anume din uz).
--   4. app.resolve_stay + app.is_closed — funcții de rezolvare (sursă unică).
--   5. Enforcement în app.create_booking_internal (admin + public trec prin el):
--      DATES_CLOSED, STAY_TOO_SHORT, STAY_TOO_LONG.
--   6. RPC get_stay_constraints (UI admin) + public_get_availability rescris
--      (filtrează închiderile + durata, returnează min/max stay rezolvate).
--
--   Ocuparea (max_adults/max_children) era deja validată (OCCUPANCY_EXCEEDED) —
--   neschimbată aici.
-- ============================================================

-- ============ 1. min/max stay global pe unit_types ============

alter table unit_types
  add column min_stay int not null default 1  check (min_stay between 1 and 30),
  add column max_stay int not null default 30 check (max_stay between 1 and 30),
  add constraint unit_types_stay_order check (max_stay >= min_stay);

-- coloane safe pentru pagina publică (resolved stay e expus prin RPC, dar
-- valorile de bază pot fi citite direct ca restul coloanelor de capacitate)
grant select (min_stay, max_stay) on unit_types to anon;

-- ============ 2. stay_rules — restricții de durată pe perioadă ============
-- Model identic ca rate_rules: recență pe updated_at (clock_timestamp), RLS la fel.
-- min_stay/max_stay nullable: null = moștenește valoarea globală a tipului.

create table stay_rules (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  property_id  uuid not null references properties(id) on delete cascade,
  unit_type_id uuid not null references unit_types(id) on delete cascade,
  name         text not null,
  start_date   date not null,
  end_date     date not null,                 -- inclusiv (cheiat pe data de check-in)
  min_stay     int check (min_stay between 1 and 30),
  max_stay     int check (max_stay between 1 and 30),
  updated_at   timestamptz not null default clock_timestamp(),
  created_at   timestamptz not null default now(),
  check (end_date >= start_date),
  check (max_stay is null or min_stay is null or max_stay >= min_stay),
  -- o regulă fără nicio restricție n-ar avea sens
  check (min_stay is not null or max_stay is not null)
);
create index stay_rules_lookup_idx on stay_rules (unit_type_id, start_date, end_date);

alter table stay_rules enable row level security;
revoke all on stay_rules from anon;
create policy stay_rules_select on stay_rules for select to authenticated
  using (app.can_access_property(property_id));
create policy stay_rules_cud on stay_rules for all to authenticated
  using (app.is_org_role(org_id, array['owner','manager']))
  with check (app.is_org_role(org_id, array['owner','manager']));

create trigger stay_rules_set_updated_at
  before update on stay_rules
  for each row execute function app.touch_updated_at_clock();

-- ============ 3. closures — stop-sell / closed dates (cu scope) ============

create table closures (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  property_id  uuid not null references properties(id) on delete cascade,
  unit_type_id uuid references unit_types(id) on delete cascade,  -- NULL = toată proprietatea
  start_date   date not null,
  end_date     date not null,
  period       daterange generated always as
               (daterange(start_date, end_date, '[)')) stored,
  reason       text not null default 'other'
               check (reason in ('seasonal','event','maintenance','other')),
  notes        text,
  created_by   uuid,            -- auth.uid()
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_date > start_date)
  -- fără EXCLUDE: suprapunerea închiderilor e benignă (idempotentă)
);
create index closures_property_idx  on closures (property_id, start_date);
create index closures_unit_type_idx on closures (unit_type_id, start_date);

alter table closures enable row level security;
revoke all on closures from anon;
create policy closures_select on closures for select to authenticated
  using (app.can_access_property(property_id));
create policy closures_cud on closures for all to authenticated
  using (app.is_org_role(org_id, array['owner','manager']))
  with check (app.is_org_role(org_id, array['owner','manager']));

create trigger closures_set_updated_at
  before update on closures
  for each row execute function app.set_updated_at();

-- ============ 4. Funcții de rezolvare (sursă unică de adevăr) ============

-- min/max stay efective pentru un tip la o anumită dată de SOSIRE:
-- regula pe perioadă (cea mai recent modificată la suprapunere) suprascrie globalul.
create function app.resolve_stay(
  p_unit_type_id uuid,
  p_check_in     date
) returns table (min_stay int, max_stay int)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_type record;
  v_rule record;
begin
  select t.min_stay, t.max_stay into v_type
    from public.unit_types t where t.id = p_unit_type_id;
  if not found then raise exception 'UNIT_TYPE_NOT_FOUND'; end if;

  select sr.min_stay, sr.max_stay into v_rule
    from public.stay_rules sr
   where sr.unit_type_id = p_unit_type_id
     and p_check_in between sr.start_date and sr.end_date
   order by sr.updated_at desc
   limit 1;

  min_stay := coalesce(v_rule.min_stay, v_type.min_stay);
  max_stay := coalesce(v_rule.max_stay, v_type.max_stay);
  return next;
end $$;

revoke execute on function app.resolve_stay(uuid, date) from public, anon, authenticated;

-- proprietatea sau tipul e închis (stop-sell) pe intervalul cerut?
create function app.is_closed(
  p_property_id  uuid,
  p_unit_type_id uuid,
  p_check_in     date,
  p_check_out    date
) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.closures c
    where c.property_id = p_property_id
      and (c.unit_type_id is null or c.unit_type_id = p_unit_type_id)
      and c.period && daterange(p_check_in, p_check_out, '[)')
  );
$$;

revoke execute on function app.is_closed(uuid, uuid, date, date) from public, anon, authenticated;

-- ============ 5. Enforcement în motorul intern de creare ============
-- Aceeași semnătură ca migrația 24 (occupancy + snapshot preț); adăugăm doar
-- verificarea de închideri + durată înainte de bucla de alocare.

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
  p_snap_phone   text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_type   record;
  v_unit   record;
  v_guest  record;
  v_stay   record;
  v_nights int;
  v_booking_id uuid;
begin
  select t.*, p.currency as prop_currency
    into v_type
    from public.unit_types t
    join public.properties p on p.id = t.property_id
   where t.id = p_unit_type_id;
  if not found then raise exception 'UNIT_TYPE_NOT_FOUND'; end if;
  if p_check_out <= p_check_in then raise exception 'INVALID_DATES'; end if;

  -- occupancy: adulți obligatoriu > 0, în limitele tipului
  if p_adults < 1 or p_adults > v_type.max_adults
     or p_children > v_type.max_children then
    raise exception 'OCCUPANCY_EXCEEDED';
  end if;

  -- stop-sell / closed dates (proprietate sau tip) pe interval
  if app.is_closed(v_type.property_id, p_unit_type_id, p_check_in, p_check_out) then
    raise exception 'DATES_CLOSED';
  end if;

  -- durata sejurului vs reguli (rezolvate pe data de check-in)
  v_nights := p_check_out - p_check_in;
  select * into v_stay from app.resolve_stay(p_unit_type_id, p_check_in);
  if v_nights < v_stay.min_stay then raise exception 'STAY_TOO_SHORT'; end if;
  if v_nights > v_stay.max_stay then raise exception 'STAY_TOO_LONG'; end if;

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
          and b.stay && daterange(p_check_in, p_check_out, '[)')
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

revoke execute on function app.create_booking_internal(uuid,uuid,uuid,date,date,int,int,text,text,numeric,jsonb,numeric,text,text,text,text)
  from public, anon, authenticated;

-- ============ 6. RPC: get_stay_constraints (UI admin) ============
-- Min/max stay efective pentru un tip + dată de check-in (limitează check-out-ul în formular).

create function public.get_stay_constraints(
  p_unit_type_id uuid,
  p_check_in     date
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_property_id uuid;
  v_stay record;
begin
  select property_id into v_property_id from public.unit_types where id = p_unit_type_id;
  if v_property_id is null then raise exception 'UNIT_TYPE_NOT_FOUND'; end if;
  if not app.can_access_property(v_property_id) then raise exception 'FORBIDDEN'; end if;

  select * into v_stay from app.resolve_stay(p_unit_type_id, p_check_in);
  return jsonb_build_object('min_stay', v_stay.min_stay, 'max_stay', v_stay.max_stay);
end $$;

revoke execute on function public.get_stay_constraints from anon, public;
grant execute on function public.get_stay_constraints to authenticated;

-- ============ 7. public_get_availability — filtru închideri + durată ============
-- Schimbăm tipul de retur (adăugăm min_stay/max_stay) → drop + recreate.

drop function public.public_get_availability(text,date,date,int,int);

create function public.public_get_availability(
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
      and not exists (
        select 1 from public.bookings b
        where b.unit_id = u.id
          and b.status not in ('cancelled','no_show')
          and b.stay && daterange(p_check_in, p_check_out, '[)')
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

-- ============ 8. Audit unit_types: include min_stay/max_stay ============

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
                               'min_stay', new.min_stay, 'max_stay', new.max_stay));
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
