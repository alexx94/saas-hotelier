-- ============================================================
-- Migrația 17 (Sprint 3 — Availability Blocks, arhitectura finală):
--
--   Separarea conceptelor:
--     * units.status      = stare PERMANENTĂ (active/inactive/out_of_service/archived)
--     * room_blocks       = indisponibilitate pe INTERVAL (mentenanță, renovare...)
--   Un block nu mai este o pseudo-rezervare (status='blocked') — tabel dedicat,
--   cu propriul EXCLUDE constraint și validare cross-tabel în triggers.
--
--   1. Curățare abordare anterioară (migrația 16): drop RPC-uri + block_reason
--   2. Tabel room_blocks + RLS + EXCLUDE (block vs block)
--   3. Migrare date: bookings status='blocked' → room_blocks (apoi șterse)
--   4. Triggers de integritate cross-tabel (block↔booking) cu advisory lock
--      per cameră — elimină cursa "Admin A vede liber / Admin B salvează primul"
--   5. Audit: block created/updated/removed → unit_events
--   6. Semantica statusurilor: inactive/out_of_service NU mai cer zero rezervări
--      viitoare (păstrează rezervările, opresc doar rezervările noi);
--      archived rămâne strict (zero rezervări viitoare)
--   7. Availability engine: activ AND fără booking overlap AND fără block overlap
--      (create_booking_internal, get_available_units, public_get_availability)
--   8. RPC-uri: block_unit, bulk_block_units, remove_block (pe room_blocks)
-- ============================================================

-- ============ 1. Curățare abordare anterioară ============

drop function public.block_unit(uuid, date, date, text, text);
drop function public.bulk_block_units(uuid[], date, date, text, text);
drop function public.remove_block(uuid);

-- ============ 2. Tabel room_blocks ============

create table room_blocks (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  property_id  uuid not null references properties(id) on delete cascade,
  unit_id      uuid not null references units(id) on delete cascade,
  start_date   date not null,
  end_date     date not null,
  period       daterange generated always as
               (daterange(start_date, end_date, '[)')) stored,
  reason       text not null default 'other'
               check (reason in ('maintenance','renovation','owner_use','internal_use','other')),
  notes        text,
  created_by   uuid,            -- auth.uid(); null pentru scrieri de sistem/migrare
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_date > start_date),

  -- două block-uri nu se pot suprapune pe aceeași cameră (aceeași garanție
  -- declarativă ca no_double_booking pe bookings)
  constraint no_overlapping_blocks exclude using gist
    (unit_id with =, period with &&)
);
create index room_blocks_unit_idx on room_blocks (unit_id, start_date);
create index room_blocks_property_idx on room_blocks (property_id, start_date);

alter table room_blocks enable row level security;
create policy room_blocks_select on room_blocks for select to authenticated
  using (app.can_access_property(property_id));
create policy room_blocks_cud on room_blocks for all to authenticated
  using (app.can_access_property(property_id))
  with check (app.can_access_property(property_id));
revoke all on room_blocks from anon;

create trigger room_blocks_set_updated_at
  before update on room_blocks
  for each row execute function app.set_updated_at();

-- ============ 3. Migrare date: pseudo-rezervările 'blocked' → room_blocks ============
-- (înainte de crearea trigger-elor de validare, ca migrarea să nu se auto-respingă:
--  rândul sursă încă există în bookings în momentul insert-ului)

insert into room_blocks (org_id, property_id, unit_id, start_date, end_date, reason, notes, created_at)
select org_id, property_id, unit_id, check_in, check_out,
       coalesce(block_reason, 'other'), notes, created_at
from bookings
where status = 'blocked';

delete from bookings where status = 'blocked';

alter table bookings drop column block_reason;

-- ============ 4. Integritate cross-tabel (block ↔ booking) ============
-- EXCLUDE nu poate funcționa între două tabele; validarea trăiește în triggers
-- pe AMBELE direcții, serializată per cameră cu advisory lock tranzacțional —
-- două tranzacții concurente (un block și o rezervare pe aceeași cameră) nu se
-- pot strecura una pe lângă cealaltă.

create function app.validate_room_block() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_unit record;
begin
  select * into v_unit from public.units where id = new.unit_id;
  if not found then raise exception 'UNIT_NOT_FOUND'; end if;
  if v_unit.status <> 'active' then raise exception 'UNIT_NOT_ACTIVE'; end if;

  -- org/property derivate server-side din cameră — clientul nu le poate falsifica
  new.org_id := v_unit.org_id;
  new.property_id := v_unit.property_id;

  perform pg_advisory_xact_lock(hashtextextended(new.unit_id::text, 0));

  if exists (
    select 1 from public.bookings b
    where b.unit_id = new.unit_id
      and b.status not in ('cancelled','no_show')
      and b.stay && daterange(new.start_date, new.end_date, '[)')
  ) then
    raise exception 'BLOCK_OVERLAPS_BOOKING';
  end if;

  return new;
end $$;

create trigger room_blocks_validate
  before insert or update on room_blocks
  for each row execute function app.validate_room_block();

create function app.check_booking_block_overlap() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- statusurile inactive nu ocupă camera
  if new.status in ('cancelled','no_show') then return new; end if;

  -- la update: re-verificăm doar dacă ceva relevant s-a schimbat
  -- (cameră, interval, sau revenirea dintr-un status inactiv)
  if tg_op = 'UPDATE'
     and new.unit_id = old.unit_id
     and new.check_in = old.check_in
     and new.check_out = old.check_out
     and old.status not in ('cancelled','no_show') then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.unit_id::text, 0));

  if exists (
    select 1 from public.room_blocks rb
    where rb.unit_id = new.unit_id
      and rb.period && daterange(new.check_in, new.check_out, '[)')
  ) then
    raise exception 'UNIT_BLOCKED';
  end if;

  return new;
end $$;

create trigger bookings_block_guard
  before insert or update on bookings
  for each row execute function app.check_booking_block_overlap();

-- ============ 5. Audit: block-urile intră în istoricul camerei ============

create function app.audit_room_block() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_event text;
  v_old jsonb := null;
  v_new jsonb := null;
  v_org uuid;
  v_unit uuid;
begin
  if tg_op = 'INSERT' then
    v_event := 'block_created';
    v_new := jsonb_build_object('block_start', new.start_date, 'block_end', new.end_date, 'block_reason', new.reason);
    v_org := new.org_id; v_unit := new.unit_id;
  elsif tg_op = 'DELETE' then
    v_event := 'block_removed';
    v_old := jsonb_build_object('block_start', old.start_date, 'block_end', old.end_date, 'block_reason', old.reason);
    v_org := old.org_id; v_unit := old.unit_id;
  else
    v_event := 'block_updated';
    v_old := jsonb_build_object('block_start', old.start_date, 'block_end', old.end_date, 'block_reason', old.reason);
    v_new := jsonb_build_object('block_start', new.start_date, 'block_end', new.end_date, 'block_reason', new.reason);
    v_org := new.org_id; v_unit := new.unit_id;
  end if;

  insert into public.unit_events (org_id, unit_id, actor_id, actor_email, event_type, old_data, new_data)
  values (v_org, v_unit, auth.uid(), nullif(auth.jwt()->>'email', ''), v_event, v_old, v_new);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger room_blocks_audit
  after insert or update or delete on room_blocks
  for each row execute function app.audit_room_block();

-- ============ 6. Semantica statusurilor ============
-- inactive / out_of_service: rezervările existente RĂMÂN, doar rezervările noi
-- sunt oprite (engine-ul filtrează status='active'). Doar scoaterea definitivă
-- din exploatare (archived sau DELETE) cere zero rezervări viitoare.

create or replace function app.check_unit_status_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' or (new.status = 'archived' and old.status <> 'archived') then
    if exists (
      select 1 from public.bookings
      where unit_id = old.id
        and check_in > current_date
        and status not in ('cancelled', 'no_show')
    ) then
      raise exception 'UNIT_HAS_FUTURE_BOOKINGS';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- ============ 7. Availability engine: status + bookings + room_blocks ============

-- 7a. motorul intern de creare (alocare auto/manual) — semnătura cu snapshot
--     oaspete din migrația 8; adăugat doar filtrul + guard-ul pe room_blocks
create or replace function app.create_booking_internal(
  p_unit_type_id uuid,
  p_unit_id      uuid,
  p_guest_id     uuid,
  p_check_in     date,
  p_check_out    date,
  p_guests_count int,
  p_status       text,
  p_source       text,
  p_total        numeric,
  p_notes        text,
  p_snap_name    text default null,
  p_snap_email   text default null,
  p_snap_phone   text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_type record;
  v_unit record;
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
  if p_guests_count > v_type.capacity then raise exception 'CAPACITY_EXCEEDED'; end if;

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
         check_in, check_out, guests_count, total_amount, currency, source, notes,
         booked_full_name, booked_email, booked_phone)
      values
        (v_type.org_id, v_type.property_id, p_unit_type_id, v_unit.id, p_guest_id,
         p_status, p_check_in, p_check_out, p_guests_count, p_total,
         v_type.prop_currency, p_source, p_notes,
         coalesce(nullif(trim(p_snap_name), ''), v_guest.full_name),
         coalesce(nullif(lower(trim(p_snap_email)), ''), v_guest.email),
         coalesce(nullif(trim(p_snap_phone), ''), v_guest.phone))
      returning id into v_booking_id;
      return v_booking_id;
    exception
      when exclusion_violation then
        continue; -- altă rezervare a câștigat cursa pe camera asta — încearcă următoarea
      when others then
        if sqlerrm like '%UNIT_BLOCKED%' then
          continue; -- un block a apărut între timp — încearcă următoarea
        end if;
        raise;
    end;
  end loop;

  raise exception 'UNIT_NOT_AVAILABLE';
end $$;

revoke execute on function app.create_booking_internal(uuid,uuid,uuid,date,date,int,text,text,numeric,text,text,text,text)
  from public, anon, authenticated;

-- 7b. lista camerelor cu liber/ocupat (alocare manuală + reasignare)
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
        and b.stay && daterange(p_check_in, p_check_out, '[)')
    ) and not exists (
      select 1 from room_blocks rb
      where rb.unit_id = u.id
        and rb.period && daterange(p_check_in, p_check_out, '[)')
    ) as is_free
  from units u
  where u.unit_type_id = p_unit_type_id
    and u.status = 'active'
  order by u.name;
$$;

-- 7c. disponibilitatea publică
create or replace function public.public_get_availability(
  p_slug      text,
  p_check_in  date,
  p_check_out date
) returns table (
  unit_type_id    uuid,
  name            text,
  description     jsonb,
  capacity        int,
  price_per_night numeric,
  total_price     numeric,
  currency        char(3),
  available_units int
)
language sql stable security definer set search_path = ''
as $$
  select
    t.id, t.name, t.description, t.capacity,
    t.base_price,
    t.base_price * (p_check_out - p_check_in),
    p.currency,
    count(u.id)::int
  from public.properties p
  join public.unit_types t on t.property_id = p.id and t.is_active
  join public.units u      on u.unit_type_id = t.id and u.status = 'active'
  where p.slug = p_slug
    and p.is_published
    and p_check_in >= current_date
    and p_check_out > p_check_in
    and p_check_out - p_check_in <= 365
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
  group by t.id, t.name, t.description, t.capacity, t.base_price, t.sort_order, p.currency
  order by t.sort_order, t.name;
$$;

-- ============ 8. RPC-uri pe room_blocks ============
-- SECURITY INVOKER: RLS autorizează; trigger-ele validează (sursa unică).

create function public.block_unit(
  p_unit_id uuid,
  p_start   date,
  p_end     date,
  p_reason  text default 'other',
  p_notes   text default null
) returns uuid
language plpgsql set search_path = ''
as $$
declare
  v_block_id uuid;
begin
  if p_end <= p_start then raise exception 'INVALID_DATES'; end if;
  begin
    -- org/property sunt suprascrise de trigger din cameră
    insert into public.room_blocks (org_id, property_id, unit_id, start_date, end_date, reason, notes, created_by)
    select u.org_id, u.property_id, u.id, p_start, p_end, coalesce(p_reason, 'other'), p_notes, auth.uid()
    from public.units u where u.id = p_unit_id
    returning id into v_block_id;
  exception when exclusion_violation then
    raise exception 'BLOCK_OVERLAPS';
  end;
  if v_block_id is null then raise exception 'UNIT_NOT_FOUND'; end if;
  return v_block_id;
end $$;

revoke execute on function public.block_unit from anon, public;

create function public.bulk_block_units(
  p_unit_ids uuid[],
  p_start    date,
  p_end      date,
  p_reason   text default 'other',
  p_notes    text default null
) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_unit    record;
  v_blocked int := 0;
  v_skipped text[] := '{}';
begin
  if p_end <= p_start then raise exception 'INVALID_DATES'; end if;
  if p_unit_ids is null or array_length(p_unit_ids, 1) is null then
    return jsonb_build_object('blocked', 0, 'skipped', '[]'::jsonb);
  end if;
  if array_length(p_unit_ids, 1) > 500 then raise exception 'TOO_MANY_UNITS'; end if;

  for v_unit in
    select u.id, u.name, u.org_id, u.property_id
    from public.units u
    where u.id = any(p_unit_ids)
    order by u.name
  loop
    begin
      insert into public.room_blocks (org_id, property_id, unit_id, start_date, end_date, reason, notes, created_by)
      values (v_unit.org_id, v_unit.property_id, v_unit.id, p_start, p_end,
              coalesce(p_reason, 'other'), p_notes, auth.uid());
      v_blocked := v_blocked + 1;
    exception
      when exclusion_violation then
        v_skipped := v_skipped || v_unit.name;   -- se suprapune cu alt block
      when others then
        if sqlerrm like '%BLOCK_OVERLAPS_BOOKING%' or sqlerrm like '%UNIT_NOT_ACTIVE%' then
          v_skipped := v_skipped || v_unit.name; -- rezervări pe interval / cameră non-activă
        else
          raise;
        end if;
    end;
  end loop;

  return jsonb_build_object('blocked', v_blocked, 'skipped', to_jsonb(v_skipped));
end $$;

revoke execute on function public.bulk_block_units from anon, public;

create function public.remove_block(p_block_id uuid) returns void
language plpgsql set search_path = ''
as $$
begin
  delete from public.room_blocks where id = p_block_id;
  if not found then raise exception 'BLOCK_NOT_FOUND'; end if;
end $$;

revoke execute on function public.remove_block from anon, public;
