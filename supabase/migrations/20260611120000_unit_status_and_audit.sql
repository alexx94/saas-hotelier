-- ============================================================
-- Migrația 3: unit status (4 stări) + audit booking_events
--             + reassign_booking + get_available_units
--             + find_or_create_guest
-- ============================================================

-- ============ 1. units.status înlocuiește is_active ============

alter table units
  add column status text not null default 'active'
  check (status in ('active','inactive','out_of_service','archived'));

update units set status = case when is_active then 'active' else 'inactive' end;

alter table units drop column is_active;

-- ============ 2. Trigger: blochează tranziția spre non-activ dacă există rezervări viitoare ============

create function app.check_unit_status_change() returns trigger
language plpgsql as $$
begin
  -- La delete sau tranziție spre orice stare non-activă, verifică rezervări viitoare
  if (tg_op = 'DELETE' or new.status <> 'active') and old.status = 'active' then
    if exists (
      select 1 from bookings
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

create trigger units_status_guard
  before update or delete on units
  for each row execute function app.check_unit_status_change();

-- ============ 3. Audit: tabel booking_events ============

create table booking_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  booking_id  uuid not null references bookings(id) on delete cascade,
  actor_id    uuid,            -- auth.uid(); null dacă e trigger public
  event_type  text not null,   -- 'created','status_changed','reassigned','dates_changed','updated'
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);
create index booking_events_booking_idx on booking_events (booking_id, created_at);
alter table booking_events enable row level security;

create policy booking_events_select on booking_events for select to authenticated
  using (app.can_access_property(
    (select property_id from bookings where id = booking_id)
  ));
-- scrisul e exclusiv prin trigger — niciun insert direct din app
revoke all on booking_events from anon;

-- ============ 4. Trigger audit pe bookings ============

create function app.audit_booking() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_event_type text;
  v_old jsonb := null;
  v_new jsonb := null;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'created';
    v_new := jsonb_build_object(
      'unit_id', new.unit_id, 'unit_type_id', new.unit_type_id,
      'status', new.status, 'check_in', new.check_in, 'check_out', new.check_out
    );
  else
    if old.unit_id <> new.unit_id then
      v_event_type := 'reassigned';
      v_old := jsonb_build_object('unit_id', old.unit_id);
      v_new := jsonb_build_object('unit_id', new.unit_id);
    elsif old.status <> new.status then
      v_event_type := 'status_changed';
      v_old := jsonb_build_object('status', old.status);
      v_new := jsonb_build_object('status', new.status);
    elsif old.check_in <> new.check_in or old.check_out <> new.check_out then
      v_event_type := 'dates_changed';
      v_old := jsonb_build_object('check_in', old.check_in, 'check_out', old.check_out);
      v_new := jsonb_build_object('check_in', new.check_in, 'check_out', new.check_out);
    else
      v_event_type := 'updated';
      v_new := jsonb_build_object('notes', new.notes, 'guests_count', new.guests_count, 'total_amount', new.total_amount);
    end if;
  end if;

  insert into public.booking_events (org_id, booking_id, actor_id, event_type, old_data, new_data)
  values (new.org_id, new.id, auth.uid(), v_event_type, v_old, v_new);

  return new;
end $$;

create trigger bookings_audit
  after insert or update on bookings
  for each row execute function app.audit_booking();

-- ============ 5. Actualizare funcții care foloseau is_active ============

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
  p_notes        text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_type record;
  v_unit record;
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
    order by u.name
  loop
    begin
      insert into public.bookings
        (org_id, property_id, unit_type_id, unit_id, guest_id, status,
         check_in, check_out, guests_count, total_amount, currency, source, notes)
      values
        (v_type.org_id, v_type.property_id, p_unit_type_id, v_unit.id, p_guest_id,
         p_status, p_check_in, p_check_out, p_guests_count, p_total,
         v_type.prop_currency, p_source, p_notes)
      returning id into v_booking_id;
      return v_booking_id;
    exception when exclusion_violation then
      continue;
    end;
  end loop;

  raise exception 'UNIT_NOT_AVAILABLE';
end $$;

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
  group by t.id, t.name, t.description, t.capacity, t.base_price, t.sort_order, p.currency
  order by t.sort_order, t.name;
$$;

-- ============ 6. RPC: get_available_units ============

create function public.get_available_units(
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
    ) as is_free
  from units u
  where u.unit_type_id = p_unit_type_id
    and u.status = 'active'
  order by u.name;
$$;

revoke execute on function public.get_available_units from anon;

-- ============ 7. RPC: reassign_booking ============

create function public.reassign_booking(
  p_booking_id uuid,
  p_unit_id    uuid
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_booking record;
  v_unit    record;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;

  if not app.can_access_property(v_booking.property_id) then
    raise exception 'FORBIDDEN';
  end if;

  if v_booking.status in ('cancelled','checked_out','no_show') then
    raise exception 'BOOKING_NOT_REASSIGNABLE';
  end if;

  select * into v_unit from public.units where id = p_unit_id;
  if not found then raise exception 'UNIT_NOT_FOUND'; end if;
  if v_unit.status <> 'active' then raise exception 'UNIT_NOT_ACTIVE'; end if;
  if v_unit.property_id <> v_booking.property_id then raise exception 'UNIT_WRONG_PROPERTY'; end if;

  begin
    update public.bookings
    set unit_id = p_unit_id,
        unit_type_id = v_unit.unit_type_id,
        updated_at = now()
    where id = p_booking_id;
  exception when exclusion_violation then
    raise exception 'UNIT_NOT_AVAILABLE';
  end;
end $$;

revoke execute on function public.reassign_booking from anon, public;

-- ============ 8. RPC: find_or_create_guest ============

create function public.find_or_create_guest(
  p_org_id    uuid,
  p_full_name text,
  p_email     text default null,
  p_phone     text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_guest_id uuid;
  v_matched  text := null;
  v_clean_phone text;
begin
  -- match pe email (prioritar)
  if p_email is not null and trim(p_email) <> '' then
    select id into v_guest_id from public.guests
    where org_id = p_org_id and lower(trim(email)) = lower(trim(p_email))
    limit 1;
    if found then v_matched := 'email'; end if;
  end if;

  -- match pe telefon (doar cifre)
  if v_guest_id is null and p_phone is not null and trim(p_phone) <> '' then
    v_clean_phone := regexp_replace(trim(p_phone), '\D', '', 'g');
    if length(v_clean_phone) >= 7 then
      select id into v_guest_id from public.guests
      where org_id = p_org_id
        and regexp_replace(trim(phone), '\D', '', 'g') = v_clean_phone
      limit 1;
      if found then v_matched := 'phone'; end if;
    end if;
  end if;

  -- creare dacă nu s-a găsit
  if v_guest_id is null then
    insert into public.guests (org_id, full_name, email, phone)
    values (p_org_id, trim(p_full_name), lower(trim(p_email)), p_phone)
    returning id into v_guest_id;
  end if;

  return jsonb_build_object('guest_id', v_guest_id, 'matched_by', v_matched);
end $$;

grant execute on function public.find_or_create_guest to authenticated;
revoke execute on function public.find_or_create_guest from anon;

-- actualizare public_create_booking să folosească find_or_create_guest
create or replace function public.public_create_booking(
  p_slug         text,
  p_unit_type_id uuid,
  p_check_in     date,
  p_check_out    date,
  p_full_name    text,
  p_email        text,
  p_phone        text default null,
  p_guests_count int default 1,
  p_notes        text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_prop record;
  v_type record;
  v_guest_result jsonb;
  v_guest_id uuid;
  v_booking_id uuid;
begin
  select * into v_prop from public.properties
   where slug = p_slug and is_published;
  if not found then raise exception 'PROPERTY_NOT_FOUND'; end if;

  select * into v_type from public.unit_types
   where id = p_unit_type_id and property_id = v_prop.id and is_active;
  if not found then raise exception 'UNIT_TYPE_NOT_FOUND'; end if;

  if p_check_in < current_date then raise exception 'INVALID_DATES'; end if;
  if p_check_out - p_check_in > 365 then raise exception 'INVALID_DATES'; end if;
  if coalesce(trim(p_full_name), '') = '' or coalesce(trim(p_email), '') = '' then
    raise exception 'GUEST_DETAILS_REQUIRED';
  end if;

  v_guest_result := public.find_or_create_guest(v_prop.org_id, p_full_name, p_email, p_phone);
  v_guest_id := (v_guest_result->>'guest_id')::uuid;

  v_booking_id := app.create_booking_internal(
    p_unit_type_id, null, v_guest_id, p_check_in, p_check_out,
    p_guests_count, 'pending', 'public',
    (p_check_out - p_check_in) * v_type.base_price, p_notes);

  return jsonb_build_object('booking_id', v_booking_id, 'status', 'pending');
end $$;
