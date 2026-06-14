-- ============================================================
-- Migrația 24 (Sprint 4.5 — Pricing Engine & Occupancy Model)
--
--   1. Model capacitate: capacity -> base_capacity / max_adults / max_children
--      (occupancy pricing NU e inclus acum; câmpurile sunt doar constrângeri,
--       schema rămâne pregătită pentru pricing pe ocupare în viitor).
--   2. Config weekend per unit_type (zile + ajustare procent/sumă).
--   3. rate_rules — sezoane + override-uri pe interval, un singur tabel
--      (kind season/override + priority). Override bate season prin prioritate.
--   4. app.compute_price — MOTORUL de preț (sursă unică de adevăr): pentru fiecare
--      noapte rezolvă override > season > base_price, apoi aplică ajustarea weekend.
--      Returnează un breakdown jsonb + total. Folosit identic de quote (UI),
--      creare rezervare (admin + public) și disponibilitatea publică.
--   5. Snapshot pe bookings: adults/children (guests_count devine GENERATED),
--      price_breakdown jsonb + total_amount/unit_price calculate la creare,
--      NICIODATĂ recalculate ulterior.
-- ============================================================

-- ============ 1. Model capacitate pe unit_types ============

alter table unit_types
  add column base_capacity int not null default 2 check (base_capacity > 0),
  add column max_adults    int not null default 2 check (max_adults > 0),
  add column max_children  int not null default 0 check (max_children >= 0);

-- backfill din capacity (audit oprit — nu e o acțiune de operator)
alter table unit_types disable trigger unit_types_audit;
update unit_types set base_capacity = capacity, max_adults = capacity, max_children = 0;
alter table unit_types enable trigger unit_types_audit;

alter table unit_types drop column capacity;

-- ============ 2. Config weekend pe unit_types ============
-- weekend_days: DOW Postgres (0=Duminică … 6=Sâmbătă); default Vineri+Sâmbătă.

alter table unit_types
  add column weekend_adjustment_type text not null default 'none'
    check (weekend_adjustment_type in ('none','percent','amount')),
  add column weekend_adjustment_value numeric(12,2) not null default 0
    check (weekend_adjustment_value >= 0),
  add column weekend_days int2[] not null default '{5,6}';

-- ============ 3. rate_rules — sezoane + override-uri ============

create table rate_rules (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  property_id  uuid not null references properties(id) on delete cascade,
  unit_type_id uuid not null references unit_types(id) on delete cascade,
  kind         text not null check (kind in ('season','override')),
  name         text not null,
  start_date   date not null,
  end_date     date not null,                 -- inclusiv: acoperă nopțile cu data în [start,end]
  price        numeric(12,2) not null check (price >= 0),
  priority     int not null default 0,
  created_at   timestamptz not null default now(),
  check (end_date >= start_date)
);
create index rate_rules_lookup_idx on rate_rules (unit_type_id, start_date, end_date);

alter table rate_rules enable row level security;
revoke all on rate_rules from anon;
-- publicul nu citește rate_rules direct — prețurile vin prin RPC engine (definer)
create policy rate_rules_select on rate_rules for select to authenticated
  using (app.can_access_property(property_id));
create policy rate_rules_cud on rate_rules for all to authenticated
  using (app.is_org_role(org_id, array['owner','manager']))
  with check (app.is_org_role(org_id, array['owner','manager']));

-- ============ 4. MOTORUL de preț — app.compute_price ============
-- Sursa unică de adevăr. Pentru fiecare noapte din [check_in, check_out):
--   rată = override > season > base_price (prioritate desc, apoi created_at desc),
--   apoi ajustare weekend pe rata REZOLVATĂ (nu pe base).
-- Returnează jsonb { currency, nights[], subtotal, total, avg_nightly, night_count }.

create function app.compute_price(
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
    -- 1. rezolvă regula aplicabilă (override are prioritate peste season)
    select rr.kind, rr.price into v_rule
      from public.rate_rules rr
     where rr.unit_type_id = p_unit_type_id
       and d between rr.start_date and rr.end_date
     order by (rr.kind = 'override') desc, rr.priority desc, rr.created_at desc
     limit 1;

    if found then
      v_rate := v_rule.price;
      v_kind := v_rule.kind;
    else
      v_rate := v_base;
      v_kind := 'base';
    end if;

    -- 2. ajustare weekend pe rata rezolvată
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

revoke execute on function app.compute_price(uuid, date, date) from public, anon, authenticated;

-- ============ 5. quote_price — estimare pentru UI (autorizat) ============

create function public.quote_price(
  p_unit_type_id uuid,
  p_check_in     date,
  p_check_out    date
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_property_id uuid;
begin
  select property_id into v_property_id from public.unit_types where id = p_unit_type_id;
  if v_property_id is null then raise exception 'UNIT_TYPE_NOT_FOUND'; end if;
  if not app.can_access_property(v_property_id) then raise exception 'FORBIDDEN'; end if;
  return app.compute_price(p_unit_type_id, p_check_in, p_check_out);
end $$;

revoke execute on function public.quote_price from anon, public;
grant execute on function public.quote_price to authenticated;

-- ============ 6. Snapshot pe bookings: adults/children + price_breakdown ============

alter table bookings
  add column adults          int not null default 1 check (adults > 0),
  add column children        int not null default 0 check (children >= 0),
  add column price_breakdown jsonb not null default '{}';

-- backfill adults din guests_count (audit + updated_at oprite — nu e acțiune de operator)
alter table bookings disable trigger bookings_audit;
alter table bookings disable trigger bookings_set_updated_at;
update bookings set adults = greatest(guests_count, 1), children = 0;
alter table bookings enable trigger bookings_audit;
alter table bookings enable trigger bookings_set_updated_at;

-- guests_count devine GENERATED (= adults + children) — compatibil cu audit + UI
alter table bookings drop column guests_count;
alter table bookings add column guests_count int
  generated always as (adults + children) stored;

-- ============ 7. Rescriere motor intern de creare (occupancy + snapshot preț) ============

drop function app.create_booking_internal(uuid,uuid,uuid,date,date,int,text,text,numeric,text,text,text,text,numeric);

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
  p_snap_phone   text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_type  record;
  v_unit  record;
  v_guest record;
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

-- ============ 8. RPC admin: create_booking (preț din engine, snapshot) ============

drop function public.create_booking(uuid,date,date,uuid,uuid,int,text,numeric,text);

create function public.create_booking(
  p_unit_type_id uuid,
  p_check_in     date,
  p_check_out    date,
  p_guest_id     uuid default null,
  p_unit_id      uuid default null,
  p_adults       int default 1,
  p_children     int default 0,
  p_status       text default 'confirmed',
  p_notes        text default null
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

  v_quote := app.compute_price(p_unit_type_id, p_check_in, p_check_out);

  return app.create_booking_internal(
    p_unit_type_id, p_unit_id, p_guest_id, p_check_in, p_check_out,
    p_adults, p_children, p_status,
    case when p_status = 'blocked' then 'blocked' else 'admin' end,
    (v_quote->>'total')::numeric, v_quote, (v_quote->>'avg_nightly')::numeric,
    p_notes, null, null, null);
end $$;

revoke execute on function public.create_booking from anon, public;
grant execute on function public.create_booking to authenticated;

-- ============ 9. RPC public: public_create_booking (engine + adults/children) ============

drop function public.public_create_booking(text,uuid,date,date,text,text,text,int,text);

create function public.public_create_booking(
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
    p_notes, p_full_name, p_email, p_phone);

  return jsonb_build_object('booking_id', v_booking_id, 'status', 'pending');
end $$;

grant execute on function public.public_create_booking to anon, authenticated;

-- ============ 10. RPC public: disponibilitate (preț din engine + filtru ocupare) ============

drop function public.public_get_availability(text,date,date);

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
  base_capacity   int,
  max_adults      int,
  max_children    int,
  price_per_night numeric,
  total_price     numeric,
  currency        char(3),
  available_units int
)
language plpgsql stable security definer set search_path = ''
as $$
declare v_prop record;
begin
  select * into v_prop from public.properties where slug = p_slug and is_published;
  if not found then return; end if;
  if p_check_in < current_date or p_check_out <= p_check_in
     or p_check_out - p_check_in > 365 then
    return;
  end if;

  return query
  select
    a.unit_type_id, a.name, a.description, a.base_capacity, a.max_adults, a.max_children,
    (pr.q->>'avg_nightly')::numeric,
    (pr.q->>'total')::numeric,
    v_prop.currency,
    a.available_units
  from (
    select t.id as unit_type_id, t.name, t.description, t.base_capacity,
           t.max_adults, t.max_children, t.sort_order, count(u.id)::int as available_units
    from public.unit_types t
    join public.units u on u.unit_type_id = t.id and u.status = 'active'
    where t.property_id = v_prop.id
      and t.is_active
      and t.max_adults >= p_adults
      and t.max_children >= p_children
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
    group by t.id, t.name, t.description, t.base_capacity, t.max_adults, t.max_children, t.sort_order
  ) a
  cross join lateral (select app.compute_price(a.unit_type_id, p_check_in, p_check_out) as q) pr
  order by a.sort_order, a.name;
end $$;

grant execute on function public.public_get_availability to anon, authenticated;

-- ============ 11. Audit unit_types: capacity -> base_capacity/max_adults/max_children ============

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
            jsonb_build_object('name', new.name, 'base_capacity', new.base_capacity,
                               'max_adults', new.max_adults, 'max_children', new.max_children,
                               'base_price', new.base_price));
    return new;
  end if;

  -- diff doar pe câmpurile relevante; un câmp nou auditat = un if aici
  -- + o intrare în registrul TYPE_FIELDS din frontend (unit-type-history-dialog.tsx)
  if old.name <> new.name then
    v_old := v_old || jsonb_build_object('name', old.name);
    v_new := v_new || jsonb_build_object('name', new.name);
  end if;
  if old.base_capacity <> new.base_capacity then
    v_old := v_old || jsonb_build_object('base_capacity', old.base_capacity);
    v_new := v_new || jsonb_build_object('base_capacity', new.base_capacity);
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

  if old.is_active and not new.is_active then
    v_event_type := 'archived';
  elsif not old.is_active and new.is_active then
    v_event_type := 'restored';
  elsif v_old <> '{}'::jsonb then
    v_event_type := 'updated';
  else
    return new; -- nimic relevant de auditat (ex: doar config weekend)
  end if;

  insert into public.unit_type_events (org_id, unit_type_id, actor_id, actor_email, event_type, old_data, new_data)
  values (new.org_id, new.id, auth.uid(), nullif(auth.jwt()->>'email', ''), v_event_type,
          nullif(v_old, '{}'::jsonb), nullif(v_new, '{}'::jsonb));

  return new;
end $$;

-- ============ 12. Grants anon pe noile coloane de capacitate ============
-- (grantul pe `capacity` a dispărut odată cu coloana; restul coloanelor safe rămân)

grant select (base_capacity, max_adults, max_children) on unit_types to anon;
