-- ============================================================
-- SaaS Hotelier — RLS + funcții helper + RPC-uri
-- ============================================================

-- rolurile API au nevoie de usage pe schema app ca să evalueze politicile RLS
grant usage on schema app to anon, authenticated;

-- ============ HELPERS (security definer => nu intră în recursie cu RLS) ============

create function app.user_org_ids() returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select org_id from public.organization_members where user_id = auth.uid();
$$;

create function app.user_role(p_org_id uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select role from public.organization_members
  where org_id = p_org_id and user_id = auth.uid();
$$;

-- membru al org-ului proprietății ȘI (fără restricții per-property SAU are acces explicit)
create function app.can_access_property(p_property_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.properties p
    join public.organization_members m
      on m.org_id = p.org_id and m.user_id = auth.uid()
    where p.id = p_property_id
      and (
        not exists (select 1 from public.member_property_access a
                    where a.member_id = m.id)
        or exists (select 1 from public.member_property_access a
                   where a.member_id = m.id and a.property_id = p_property_id)
      )
  );
$$;

create function app.is_org_role(p_org_id uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members
    where org_id = p_org_id and user_id = auth.uid() and role = any(p_roles)
  );
$$;

-- ============ ENABLE RLS PE TOT ============

alter table organizations          enable row level security;
alter table organization_members   enable row level security;
alter table member_property_access enable row level security;
alter table properties             enable row level security;
alter table unit_types             enable row level security;
alter table units                  enable row level security;
alter table guests                 enable row level security;
alter table bookings               enable row level security;

-- ============ GRANTS (anon vede DOAR vitrina publică) ============

revoke all on all tables in schema public from anon;
grant select (id, name, slug, type, description, address, city, country,
              timezone, currency, default_locale, is_published)
  on properties to anon;
grant select (id, property_id, name, description, capacity, base_price,
              is_active, sort_order)
  on unit_types to anon;

-- ============ POLICIES ============

-- organizations
create policy org_select on organizations for select
  using (id in (select app.user_org_ids()));
create policy org_update on organizations for update
  using (app.is_org_role(id, array['owner']));
create policy org_delete on organizations for delete
  using (app.is_org_role(id, array['owner']));
-- insert: doar prin RPC create_organization (atomic org + owner)

-- organization_members
create policy members_select on organization_members for select
  using (org_id in (select app.user_org_ids()));
create policy members_insert on organization_members for insert
  with check (app.is_org_role(org_id, array['owner','manager']));
create policy members_update on organization_members for update
  using (app.is_org_role(org_id, array['owner','manager']));
create policy members_delete on organization_members for delete
  using (app.is_org_role(org_id, array['owner','manager']));

-- member_property_access
create policy mpa_select on member_property_access for select
  using (exists (select 1 from organization_members m
                 where m.id = member_id
                   and m.org_id in (select app.user_org_ids())));
create policy mpa_all on member_property_access for all
  using (exists (select 1 from organization_members m
                 where m.id = member_id
                   and app.is_org_role(m.org_id, array['owner','manager'])));

-- properties
create policy properties_select on properties for select to authenticated
  using (org_id in (select app.user_org_ids()));
create policy properties_public_select on properties for select to anon
  using (is_published);
create policy properties_insert on properties for insert
  with check (app.is_org_role(org_id, array['owner','manager']));
create policy properties_update on properties for update
  using (app.is_org_role(org_id, array['owner','manager']));
create policy properties_delete on properties for delete
  using (app.is_org_role(org_id, array['owner']));

-- unit_types
create policy unit_types_select on unit_types for select to authenticated
  using (app.can_access_property(property_id));
create policy unit_types_public_select on unit_types for select to anon
  using (is_active and exists (select 1 from properties p
                               where p.id = property_id and p.is_published));
create policy unit_types_cud on unit_types for all
  using (app.is_org_role(org_id, array['owner','manager']))
  with check (app.is_org_role(org_id, array['owner','manager']));

-- units
create policy units_select on units for select to authenticated
  using (app.can_access_property(property_id));
create policy units_cud on units for all
  using (app.is_org_role(org_id, array['owner','manager']))
  with check (app.is_org_role(org_id, array['owner','manager']));

-- guests (orice membru al org-ului)
create policy guests_all on guests for all
  using (org_id in (select app.user_org_ids()))
  with check (org_id in (select app.user_org_ids()));

-- bookings — NICIODATĂ anon
create policy bookings_select on bookings for select to authenticated
  using (app.can_access_property(property_id));
create policy bookings_insert on bookings for insert to authenticated
  with check (app.can_access_property(property_id));
create policy bookings_update on bookings for update to authenticated
  using (app.can_access_property(property_id));
create policy bookings_delete on bookings for delete to authenticated
  using (app.is_org_role(org_id, array['owner']));

-- ============ RPC: creare organizație (atomic org + owner) ============

create function public.create_organization(p_name text, p_slug text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  insert into public.organizations (name, slug)
  values (p_name, p_slug) returning id into v_org_id;
  insert into public.organization_members (org_id, user_id, role)
  values (v_org_id, auth.uid(), 'owner');
  return v_org_id;
end $$;

revoke execute on function public.create_organization from anon, public;

-- ============ RPC: generare bulk camere ============
-- security invoker: respectă RLS (doar owner/manager pot insera units)

create function public.generate_units(
  p_unit_type_id uuid,
  p_count        int,
  p_prefix       text default 'Camera ',
  p_start_number int default 1
) returns int
language plpgsql
as $$
declare
  v_type record;
  v_inserted int := 0;
  i int;
begin
  if p_count < 1 or p_count > 500 then
    raise exception 'INVALID_COUNT';
  end if;
  select * into v_type from unit_types where id = p_unit_type_id;
  if not found then
    raise exception 'UNIT_TYPE_NOT_FOUND';
  end if;
  for i in p_start_number .. p_start_number + p_count - 1 loop
    insert into units (org_id, property_id, unit_type_id, name)
    values (v_type.org_id, v_type.property_id, p_unit_type_id, p_prefix || i)
    on conflict (property_id, name) do nothing;
    if found then v_inserted := v_inserted + 1; end if;
  end loop;
  return v_inserted;
end $$;

revoke execute on function public.generate_units from anon, public;

-- ============ Booking engine intern ============
-- alege o cameră liberă și inserează atomic; retry pe race (23P01)

create function app.create_booking_internal(
  p_unit_type_id uuid,
  p_unit_id      uuid,      -- null => auto-asignare
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
      and u.is_active
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
      continue; -- race: altcineva a luat camera între select și insert
    end;
  end loop;

  raise exception 'UNIT_NOT_AVAILABLE';
end $$;

revoke execute on function app.create_booking_internal(uuid,uuid,uuid,date,date,int,text,text,numeric,text) from anon, authenticated, public;

-- ============ RPC admin: creare booking ============

create function public.create_booking(
  p_unit_type_id uuid,
  p_check_in     date,
  p_check_out    date,
  p_guest_id     uuid default null,
  p_unit_id      uuid default null,
  p_guests_count int default 1,
  p_status       text default 'confirmed',
  p_total        numeric default null,
  p_notes        text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_type record;
  v_total numeric;
begin
  select * into v_type from public.unit_types where id = p_unit_type_id;
  if not found then raise exception 'UNIT_TYPE_NOT_FOUND'; end if;
  -- autorizare explicită (suntem security definer)
  if not app.can_access_property(v_type.property_id) then
    raise exception 'FORBIDDEN';
  end if;
  if p_status not in ('pending','confirmed','blocked') then
    raise exception 'INVALID_STATUS';
  end if;
  if p_status <> 'blocked' and p_guest_id is null then
    raise exception 'GUEST_REQUIRED';
  end if;
  v_total := coalesce(p_total, (p_check_out - p_check_in) * v_type.base_price);
  return app.create_booking_internal(
    p_unit_type_id, p_unit_id, p_guest_id, p_check_in, p_check_out,
    p_guests_count, p_status,
    case when p_status = 'blocked' then 'blocked' else 'admin' end,
    v_total, p_notes);
end $$;

revoke execute on function public.create_booking from anon, public;

-- ============ RPC public: disponibilitate ============

create function public.public_get_availability(
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
    t.id,
    t.name,
    t.description,
    t.capacity,
    t.base_price,
    t.base_price * (p_check_out - p_check_in),
    p.currency,
    count(u.id)::int
  from public.properties p
  join public.unit_types t on t.property_id = p.id and t.is_active
  join public.units u      on u.unit_type_id = t.id and u.is_active
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

grant execute on function public.public_get_availability to anon, authenticated;

-- ============ RPC public: creare rezervare (pending) ============

create function public.public_create_booking(
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

  insert into public.guests (org_id, full_name, email, phone)
  values (v_prop.org_id, trim(p_full_name), lower(trim(p_email)), p_phone)
  returning id into v_guest_id;

  v_booking_id := app.create_booking_internal(
    p_unit_type_id, null, v_guest_id, p_check_in, p_check_out,
    p_guests_count, 'pending', 'public',
    (p_check_out - p_check_in) * v_type.base_price, p_notes);

  return jsonb_build_object('booking_id', v_booking_id, 'status', 'pending');
end $$;

grant execute on function public.public_create_booking to anon, authenticated;
