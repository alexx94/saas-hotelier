-- ============================================================
-- Sprint 8.1 — Housekeeping: actor pe ultima schimbare + numele
-- camerei în auditul de curățenie
--
-- 1. units.cleaning_status_by_email — snapshot al cui a făcut ultima
--    schimbare de curățenie (manual SAU automat, prin Auto Dirty la
--    check-out), pt. panoul housekeeping ("actualizat de X la ora Y").
--    Aceeași convenție ca unit_events.actor_email (snapshot text, fără
--    FK spre auth.users — citit din auth.jwt(), nu necesită join).
-- 2. app.audit_unit(): evenimentul cleaning_status_changed include acum
--    numele camerei (new_data.unit_name) — în Activity Feed (Sprint 7)
--    evenimentele de tip "unit" erau generice ("Cameră: ..."), fără nicio
--    identificare a CĂREI camere. Câmp unilateral (doar new_data, ca
--    "unit" la audit_booking) — EventDiff îl arată fără diff (o singură
--    valoare), nu necesită modificare la componenta generică.
-- ============================================================

alter table units add column cleaning_status_by_email text;

create or replace function app.touch_cleaning_status_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.cleaning_status <> old.cleaning_status then
    new.cleaning_status_at := now();
    new.cleaning_status_by_email := nullif(auth.jwt()->>'email', '');
  end if;
  return new;
end $$;

create or replace function app.audit_unit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_event_type text;
  v_old jsonb := null;
  v_new jsonb := null;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'created';
    v_new := jsonb_build_object('name', new.name, 'status', new.status, 'cleaning_status', new.cleaning_status);
  elsif old.status <> new.status then
    v_event_type := 'status_changed';
    v_old := jsonb_build_object('status', old.status);
    v_new := jsonb_build_object('status', new.status);
    if old.name <> new.name then
      v_old := v_old || jsonb_build_object('name', old.name);
      v_new := v_new || jsonb_build_object('name', new.name);
    end if;
  elsif old.cleaning_status <> new.cleaning_status then
    v_event_type := 'cleaning_status_changed';
    v_old := jsonb_build_object('cleaning_status', old.cleaning_status);
    v_new := jsonb_build_object('cleaning_status', new.cleaning_status, 'unit_name', new.name);
  elsif old.name <> new.name then
    v_event_type := 'renamed';
    v_old := jsonb_build_object('name', old.name);
    v_new := jsonb_build_object('name', new.name);
  else
    return new; -- nimic relevant de auditat
  end if;

  insert into public.unit_events (org_id, unit_id, actor_id, actor_email, event_type, old_data, new_data)
  values (new.org_id, new.id, auth.uid(), nullif(auth.jwt()->>'email', ''), v_event_type, v_old, v_new);

  return new;
end $$;

-- get_housekeeping_board: + cine a făcut ultima schimbare de curățenie
-- (CREATE OR REPLACE nu poate schimba setul de coloane returnate — drop întâi)
drop function if exists public.get_housekeeping_board(uuid);

create function public.get_housekeeping_board(p_property_id uuid)
returns table (
  unit_id                   uuid,
  unit_name                 text,
  unit_type_name            text,
  unit_status               text,
  cleaning_status           text,
  cleaning_status_at        timestamptz,
  cleaning_status_by_email  text,
  occupied_today            boolean,
  arrival_today             boolean,
  departure_today           boolean
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_prop  record;
  v_today date;
begin
  select * into v_prop from public.properties where id = p_property_id;
  if not found then raise exception 'PROPERTY_NOT_FOUND'; end if;
  if not app.can_access_property(p_property_id) then raise exception 'FORBIDDEN'; end if;
  if not app.has_permission(v_prop.org_id, p_property_id, 'unit.manage') then
    raise exception 'FORBIDDEN';
  end if;

  v_today := (now() at time zone v_prop.timezone)::date;

  return query
  select
    u.id,
    u.name,
    ut.name,
    u.status,
    u.cleaning_status,
    u.cleaning_status_at,
    u.cleaning_status_by_email,
    exists (
      select 1 from public.bookings b
      where b.unit_id = u.id
        and b.status = 'checked_in'
        and b.check_in <= v_today and b.check_out > v_today
    ),
    exists (
      select 1 from public.bookings b
      where b.unit_id = u.id
        and b.status in ('pending', 'confirmed')
        and b.check_in = v_today
    ),
    exists (
      select 1 from public.bookings b
      where b.unit_id = u.id
        and b.status = 'checked_in'
        and b.check_out = v_today
    )
  from public.units u
  join public.unit_types ut on ut.id = u.unit_type_id
  where u.property_id = p_property_id
    and u.status <> 'archived'
  order by u.name;
end $$;

revoke execute on function public.get_housekeeping_board(uuid) from anon, public;
grant execute on function public.get_housekeeping_board(uuid) to authenticated;
