-- ============================================================
-- Migrația 8: snapshot oaspete pe rezervare + matching diferențiat pe încredere
--   (vezi docs/backend/rpc/guests.md)
--
--   1. bookings primește snapshot: booked_full_name/email/phone — datele
--      oaspetelui DIN MOMENTUL rezervării. Profilul (guests) rămâne sursa
--      vie, modificabilă; rezervările din trecut nu se ating.
--   2. Matching pe niveluri de încredere:
--      - trusted (staff autentificat): match email apoi telefon + profilul
--        se actualizează cu datele noi (completare/corectare)
--      - untrusted (pagina publică, anon): match DOAR pe email exact,
--        profilul NU se modifică niciodată (anti-abuz: date fictive,
--        suprascriere profil, atașare la profil greșit prin telefon fals)
-- ============================================================

-- ============ 1. Snapshot pe bookings ============

alter table bookings
  add column booked_full_name text,
  add column booked_email     text,
  add column booked_phone     text;

-- backfill din profilurile curente (cea mai bună aproximare disponibilă);
-- audit-ul e oprit — nu e o acțiune de operator
alter table bookings disable trigger bookings_audit;
alter table bookings disable trigger bookings_set_updated_at;

update bookings b
set booked_full_name = g.full_name,
    booked_email     = g.email,
    booked_phone     = g.phone
from guests g
where g.id = b.guest_id;

alter table bookings enable trigger bookings_audit;
alter table bookings enable trigger bookings_set_updated_at;

-- ============ 2. find_or_create_guest_internal cu nivel de încredere ============

drop function app.find_or_create_guest_internal(uuid,text,text,text);

create function app.find_or_create_guest_internal(
  p_org_id    uuid,
  p_full_name text,
  p_email     text default null,
  p_phone     text default null,
  p_trusted   boolean default true
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_name       text := nullif(trim(p_full_name), '');
  v_email      text := nullif(lower(trim(p_email)), '');
  v_phone      text := nullif(trim(p_phone), '');
  v_phone_norm text := nullif(app.normalize_phone(p_phone), '');
  v_guest_id   uuid;
  v_matched    text;
  attempt      int;
begin
  if v_name is null then
    raise exception 'GUEST_NAME_REQUIRED';
  end if;

  for attempt in 1..2 loop
    -- match pe email (ambele niveluri de încredere)
    if v_email is not null then
      select id into v_guest_id from public.guests
      where org_id = p_org_id and email = v_email;
      if found then v_matched := 'email'; exit; end if;
    end if;

    -- match pe telefon: DOAR trusted (telefonul de pe pagina publică
    -- poate fi fictiv — nu atașăm rezervarea la profilul altcuiva)
    if p_trusted and v_phone_norm is not null then
      select id into v_guest_id from public.guests
      where org_id = p_org_id
        and phone is not null
        and app.normalize_phone(phone) = v_phone_norm
      limit 1;
      if found then v_matched := 'phone'; exit; end if;
    end if;

    begin
      insert into public.guests (org_id, full_name, email, phone)
      values (p_org_id, v_name, v_email, v_phone)
      returning id into v_guest_id;
      exit;
    exception when unique_violation then
      if not p_trusted and v_phone is not null then
        -- untrusted: coliziunea poate veni de la un telefon (fals?) deja
        -- existent la alt profil — inserăm fără telefon; numărul tastat
        -- rămâne oricum în snapshot-ul rezervării
        begin
          insert into public.guests (org_id, full_name, email)
          values (p_org_id, v_name, v_email)
          returning id into v_guest_id;
          exit;
        exception when unique_violation then
          v_guest_id := null; -- race pe email -> reluăm căutarea
        end;
      else
        v_guest_id := null;   -- race -> reluăm căutarea
      end if;
    end;
  end loop;

  if v_guest_id is null then
    raise exception 'GUEST_CONFLICT';
  end if;

  -- trusted: profilul se actualizează cu datele noi (rezervările vechi
  -- își păstrează snapshot-ul; doar profilul e viu)
  if p_trusted and v_matched is not null then
    begin
      update public.guests set
        full_name = coalesce(v_name, full_name),
        email     = coalesce(email, v_email),
        phone     = coalesce(v_phone, phone)
      where id = v_guest_id;
      if v_matched = 'email' and v_phone is not null then
        -- telefon nou pentru profilul găsit după email
        update public.guests set phone = v_phone where id = v_guest_id;
      end if;
    exception when unique_violation then
      null; -- email/telefonul nou aparține altui profil — păstrăm valorile vechi
    end;
  end if;

  return jsonb_build_object('guest_id', v_guest_id, 'matched_by', v_matched);
end $$;

revoke execute on function app.find_or_create_guest_internal(uuid,text,text,text,boolean)
  from public, anon, authenticated;

-- wrapper-ul pentru staff: trusted
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
  return app.find_or_create_guest_internal(p_org_id, p_full_name, p_email, p_phone, true);
end $$;

-- ============ 3. create_booking_internal scrie snapshot-ul ============
-- p_snap_*: datele introduse la rezervare; NULL => se copiază din profil
-- (cazul admin — operatorul a selectat un profil existent)

drop function app.create_booking_internal(uuid,uuid,uuid,date,date,int,text,text,numeric,text);

create function app.create_booking_internal(
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
    exception when exclusion_violation then
      continue; -- race: altcineva a luat camera între select și insert
    end;
  end loop;

  raise exception 'UNIT_NOT_AVAILABLE';
end $$;

revoke execute on function app.create_booking_internal(uuid,uuid,uuid,date,date,int,text,text,numeric,text,text,text,text)
  from public, anon, authenticated;

-- ============ 4. public_create_booking: untrusted + snapshot cu datele tastate ============

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

  -- untrusted: match doar pe email, profilul existent NU se modifică
  v_guest_id := (app.find_or_create_guest_internal(
                   v_prop.org_id, p_full_name, p_email, p_phone, false)->>'guest_id')::uuid;

  -- snapshot = exact ce a tastat vizitatorul la această rezervare
  v_booking_id := app.create_booking_internal(
    p_unit_type_id, null, v_guest_id, p_check_in, p_check_out,
    p_guests_count, 'pending', 'public',
    (p_check_out - p_check_in) * v_type.base_price, p_notes,
    p_full_name, p_email, p_phone);

  return jsonb_build_object('booking_id', v_booking_id, 'status', 'pending');
end $$;
