-- ============================================================
-- Sprint 8 — Housekeeping
--
-- Stare de curățenie a camerei, SEPARATĂ de starea operațională
-- (units.status = active/inactive/out_of_service/archived).
--   cleaning_status: clean / dirty / inspected
--   Auto Dirty: la check-out (bookings.status -> 'checked_out'),
--     camera trece automat pe 'dirty' (trigger, nu logică în aplicație —
--     vezi convenția anti-booking-dublu, același principiu: integritate
--     în DB, nu în client).
--
-- RBAC: reutilizează arhitectura Sprint 6 — NICIO permisiune nouă.
--   unit.manage acoperă deja scrierea pe `units` (RLS units_cud) =>
--   housekeeper (are unit.manage) + manager/administrator/owner pot
--   schimba starea de curățenie; reception/finance/readonly NU (RLS).
--   RPC-ul de citire (board) verifică explicit unit.manage (nu doar
--   apartenență org), pentru că panoul e o suprafață operațională
--   dedicată housekeeping-ului, nu un view general ca dashboard-ul.
-- ============================================================

-- ============ 1. coloane noi pe units ============

alter table units
  add column cleaning_status text not null default 'clean'
    check (cleaning_status in ('clean', 'dirty', 'inspected')),
  add column cleaning_status_at timestamptz not null default now();

-- ============ 2. audit extins (același tabel/trigger ca status-ul operațional) ============

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
    v_new := jsonb_build_object('cleaning_status', new.cleaning_status);
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

-- ============ 3. trigger: marchează cleaning_status_at la fiecare schimbare ============

create function app.touch_cleaning_status_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.cleaning_status <> old.cleaning_status then
    new.cleaning_status_at := now();
  end if;
  return new;
end $$;

create trigger units_touch_cleaning_status
  before update on units
  for each row execute function app.touch_cleaning_status_at();

-- ============ 4. Auto Dirty: check-out -> cameră murdară ============
-- SECURITY DEFINER: actorul care face check-out e de regulă recepție
-- (booking.edit), care nu are unit.manage — trigger-ul trebuie să poată
-- scrie pe units indiferent de rolul celui care a apăsat „Check-out".

create function app.checkout_sets_unit_dirty() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'checked_out' and old.status <> 'checked_out' and new.unit_id is not null then
    update public.units
       set cleaning_status = 'dirty'
     where id = new.unit_id
       and cleaning_status <> 'dirty';
  end if;
  return new;
end $$;

create trigger bookings_checkout_sets_unit_dirty
  after update on bookings
  for each row execute function app.checkout_sets_unit_dirty();

-- ============ 5. RPC: panou housekeeping ============
-- O singură trecere per proprietate (camere active+inactive, fără arhivate),
-- adnotată cu ocupare/sosire/plecare azi (în tz proprietății) — același
-- principiu ca get_dashboard_stats (Sprint 5): agregare server-side, în
-- timezone-ul proprietății, fără N+1 din frontend.

create function public.get_housekeeping_board(p_property_id uuid)
returns table (
  unit_id             uuid,
  unit_name           text,
  unit_type_name      text,
  unit_status         text,
  cleaning_status     text,
  cleaning_status_at  timestamptz,
  occupied_today      boolean,
  arrival_today       boolean,
  departure_today     boolean
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

-- ============ 6. RPC: schimbare în masă (selecție multiplă pe mobil/desktop) ============
-- SECURITY INVOKER, ca bulk_update_unit_status — RLS (units_cud / unit.manage)
-- autorizează fiecare rând; nicio cameră nu poate fi blocată funcțional aici
-- (curățenia nu interacționează cu rezervările viitoare), deci fără raport
-- parțial — toate camerele din listă, autorizate, se actualizează.

create function public.bulk_set_unit_cleaning_status(
  p_unit_ids uuid[],
  p_status   text
) returns int
language plpgsql set search_path = ''
as $$
declare
  v_updated int := 0;
begin
  if p_status not in ('clean', 'dirty', 'inspected') then
    raise exception 'INVALID_CLEANING_STATUS';
  end if;
  if p_unit_ids is null or array_length(p_unit_ids, 1) is null then
    return 0;
  end if;
  if array_length(p_unit_ids, 1) > 500 then
    raise exception 'TOO_MANY_UNITS';
  end if;

  update public.units
     set cleaning_status = p_status
   where id = any(p_unit_ids)
     and cleaning_status <> p_status;
  get diagnostics v_updated = row_count;

  return v_updated;
end $$;

revoke execute on function public.bulk_set_unit_cleaning_status from anon, public;
