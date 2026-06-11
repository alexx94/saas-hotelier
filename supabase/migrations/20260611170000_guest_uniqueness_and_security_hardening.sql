-- ============================================================
-- Migrația 7: unicitate oaspeți + hardening securitate RPC/RLS
--   (vezi docs/backend/security-model.md pentru auditul complet)
--
--   1. Normalizare guests (trigger) + dedupe date existente
--   2. Constrângeri de unicitate: (org_id, email) și (org_id, telefon normalizat)
--   3. FIX CRITIC: find_or_create_guest — lipsă verificare apartenență org
--      + executabilă de PUBLIC/anon => oricine putea insera/proba oaspeți
--      în orice organizație. Split intern (app.*) + wrapper cu autorizare.
--   4. create_booking: validare guest_id aparține org-ului
--   5. Grants: revoke PUBLIC pe find_or_create_guest și get_available_units
--   6. RLS organization_members: manager nu mai poate acorda/modifica/șterge 'owner'
--   7. search_path hygiene: check_unit_status_change, generate_units
-- ============================================================

-- ============ 1. Normalizare oaspeți ============

-- telefon: doar cifrele ("+40 722-111.222" -> "40722111222")
-- imutabilă => utilizabilă în index unic pe expresie
create function app.normalize_phone(p_phone text) returns text
language sql immutable strict parallel safe
as $$
  select pg_catalog.regexp_replace(pg_catalog.btrim(p_phone), '\D', '', 'g');
$$;

create function app.normalize_guest_row() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.full_name := trim(new.full_name);
  new.email     := nullif(lower(trim(new.email)), '');
  new.phone     := nullif(trim(new.phone), '');
  return new;
end $$;

create trigger guests_normalize
  before insert or update on guests
  for each row execute function app.normalize_guest_row();

-- normalizează datele existente (trigger-ul face efectiv munca)
update guests set id = id;

-- ============ 2. Dedupe date existente + indexuri unice ============
-- Duplicatele existente se unifică: păstrăm cel mai vechi oaspete,
-- rezervările sunt repunctate către el, restul se șterg.
-- Audit-ul bookings e oprit temporar (repunctarea nu e o acțiune de operator).

alter table bookings disable trigger bookings_audit;
alter table bookings disable trigger bookings_set_updated_at;

-- 2a. duplicate pe (org_id, email)
with dups as (
  select id,
         first_value(id) over (partition by org_id, email
                               order by created_at, id) as keep_id
  from guests
  where email is not null
)
update bookings b set guest_id = d.keep_id
from dups d
where b.guest_id = d.id and d.id <> d.keep_id;

with dups as (
  select id,
         first_value(id) over (partition by org_id, email
                               order by created_at, id) as keep_id
  from guests
  where email is not null
)
delete from guests g
using dups d
where g.id = d.id and d.id <> d.keep_id;

-- 2b. duplicate pe (org_id, telefon normalizat) — după dedupe email
with dups as (
  select id,
         first_value(id) over (partition by org_id, app.normalize_phone(phone)
                               order by created_at, id) as keep_id
  from guests
  where phone is not null and app.normalize_phone(phone) <> ''
)
update bookings b set guest_id = d.keep_id
from dups d
where b.guest_id = d.id and d.id <> d.keep_id;

with dups as (
  select id,
         first_value(id) over (partition by org_id, app.normalize_phone(phone)
                               order by created_at, id) as keep_id
  from guests
  where phone is not null and app.normalize_phone(phone) <> ''
)
delete from guests g
using dups d
where g.id = d.id and d.id <> d.keep_id;

alter table bookings enable trigger bookings_audit;
alter table bookings enable trigger bookings_set_updated_at;

-- 2c. unicitate per organizație: email și telefon, separat (parțiale — NULL permis)
-- email e deja normalizat (lower/trim) de trigger => index direct pe coloană
create unique index guests_org_email_unique
  on guests (org_id, email)
  where email is not null;

create unique index guests_org_phone_unique
  on guests (org_id, app.normalize_phone(phone))
  where phone is not null and app.normalize_phone(phone) <> '';

-- indexul vechi non-unic e acoperit de cel unic
drop index if exists guests_org_email_idx;

-- ============ 3. find_or_create_guest: split intern + autorizare ============

-- varianta internă: FĂRĂ verificare de autorizare — apelabilă DOAR din alte
-- funcții definer (public_create_booking rulează ca anon, fără org membership)
create function app.find_or_create_guest_internal(
  p_org_id    uuid,
  p_full_name text,
  p_email     text default null,
  p_phone     text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_email      text := nullif(lower(trim(p_email)), '');
  v_phone_norm text := nullif(app.normalize_phone(p_phone), '');
  v_guest_id   uuid;
  v_matched    text;
  attempt      int;
begin
  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'GUEST_NAME_REQUIRED';
  end if;

  for attempt in 1..2 loop
    -- match pe email (prioritar), apoi pe telefon — aceleași chei ca indexurile unice
    if v_email is not null then
      select id into v_guest_id from public.guests
      where org_id = p_org_id and email = v_email;
      if found then v_matched := 'email'; exit; end if;
    end if;

    if v_phone_norm is not null then
      select id into v_guest_id from public.guests
      where org_id = p_org_id
        and phone is not null
        and app.normalize_phone(phone) = v_phone_norm
      limit 1;
      if found then v_matched := 'phone'; exit; end if;
    end if;

    begin
      insert into public.guests (org_id, full_name, email, phone)
      values (p_org_id, p_full_name, p_email, p_phone)
      returning id into v_guest_id;
      exit;
    exception when unique_violation then
      -- race: o cerere concurentă a creat același oaspete -> reluăm căutarea
      v_guest_id := null;
    end;
  end loop;

  if v_guest_id is null then
    raise exception 'GUEST_CONFLICT';
  end if;

  return jsonb_build_object('guest_id', v_guest_id, 'matched_by', v_matched);
end $$;

revoke execute on function app.find_or_create_guest_internal(uuid,text,text,text)
  from public, anon, authenticated;

-- wrapper-ul expus prin API: verifică apartenența la organizație
create or replace function public.find_or_create_guest(
  p_org_id    uuid,
  p_full_name text,
  p_email     text default null,
  p_phone     text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if p_org_id not in (select app.user_org_ids()) then
    raise exception 'FORBIDDEN';
  end if;
  return app.find_or_create_guest_internal(p_org_id, p_full_name, p_email, p_phone);
end $$;

revoke execute on function public.find_or_create_guest(uuid,text,text,text)
  from public, anon;
grant execute on function public.find_or_create_guest(uuid,text,text,text)
  to authenticated;

-- public_create_booking folosește varianta internă (anon nu e membru al org-ului)
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

  v_guest_id := (app.find_or_create_guest_internal(
                   v_prop.org_id, p_full_name, p_email, p_phone)->>'guest_id')::uuid;

  v_booking_id := app.create_booking_internal(
    p_unit_type_id, null, v_guest_id, p_check_in, p_check_out,
    p_guests_count, 'pending', 'public',
    (p_check_out - p_check_in) * v_type.base_price, p_notes);

  return jsonb_build_object('booking_id', v_booking_id, 'status', 'pending');
end $$;

-- ============ 4. create_booking: guest-ul trebuie să aparțină org-ului ============

create or replace function public.create_booking(
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
  -- guard cross-tenant: guest-ul trebuie să fie din aceeași organizație
  if p_guest_id is not null and not exists (
    select 1 from public.guests g
    where g.id = p_guest_id and g.org_id = v_type.org_id
  ) then
    raise exception 'GUEST_NOT_FOUND';
  end if;
  v_total := coalesce(p_total, (p_check_out - p_check_in) * v_type.base_price);
  return app.create_booking_internal(
    p_unit_type_id, p_unit_id, p_guest_id, p_check_in, p_check_out,
    p_guests_count, p_status,
    case when p_status = 'blocked' then 'blocked' else 'admin' end,
    v_total, p_notes);
end $$;

-- ============ 5. Grants: eliminare execute rezidual pe PUBLIC ============
-- (migrațiile anterioare au revocat doar 'anon'; grant-ul implicit PUBLIC=X rămânea)

revoke execute on function public.get_available_units(uuid,date,date,uuid) from public;
-- find_or_create_guest: revocat deja la pasul 3

-- ============ 6. RLS organization_members: fără escaladare manager -> owner ============

drop policy members_insert on organization_members;
drop policy members_update on organization_members;
drop policy members_delete on organization_members;

-- doar un owner poate acorda rolul 'owner'
create policy members_insert on organization_members for insert
  with check (app.is_org_role(org_id, array['owner','manager'])
              and (role <> 'owner' or app.is_org_role(org_id, array['owner'])));

-- manager nu poate modifica rândurile owner-ilor și nici promova pe cineva la owner
create policy members_update on organization_members for update
  using (app.is_org_role(org_id, array['owner'])
         or (app.is_org_role(org_id, array['owner','manager']) and role <> 'owner'))
  with check (app.is_org_role(org_id, array['owner','manager'])
              and (role <> 'owner' or app.is_org_role(org_id, array['owner'])));

-- manager nu poate șterge un owner
create policy members_delete on organization_members for delete
  using (app.is_org_role(org_id, array['owner'])
         or (app.is_org_role(org_id, array['owner','manager']) and role <> 'owner'));

-- ============ 7. search_path hygiene (aceeași clasă de bug ca migrația 6) ============

create or replace function app.check_unit_status_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (tg_op = 'DELETE' or new.status <> 'active') and old.status = 'active' then
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

create or replace function public.generate_units(
  p_unit_type_id uuid,
  p_count        int,
  p_prefix       text default 'Camera ',
  p_start_number int default 1
) returns int
language plpgsql set search_path = ''
as $$
declare
  v_type     record;
  v_inserted int := 0;
  i          int := p_start_number;
  v_limit    int;
begin
  if p_count < 1 or p_count > 500 then
    raise exception 'INVALID_COUNT';
  end if;
  -- security invoker: RLS pe unit_types/units autorizează (doar owner/manager)
  select * into v_type from public.unit_types where id = p_unit_type_id;
  if not found then
    raise exception 'UNIT_TYPE_NOT_FOUND';
  end if;
  v_limit := p_start_number + p_count + 10000;
  while v_inserted < p_count and i < v_limit loop
    insert into public.units (org_id, property_id, unit_type_id, name)
    values (v_type.org_id, v_type.property_id, p_unit_type_id, p_prefix || i)
    on conflict (property_id, name) do nothing;
    if found then
      v_inserted := v_inserted + 1;
    end if;
    i := i + 1;
  end loop;
  return v_inserted;
end $$;
