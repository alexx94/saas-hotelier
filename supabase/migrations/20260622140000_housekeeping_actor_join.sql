-- ============================================================
-- Sprint 8.2 — Housekeeping: actorul ultimei schimbări prin JOIN, nu
-- mapare client-side
--
-- Varianta anterioară (20260622130000) stoca un snapshot text de email și
-- frontend-ul rezolva email -> nume aducând TOATĂ lista de membri ai org-ului
-- (get_org_members) doar pentru a face un lookup. Pe o organizație cu sute de
-- angajați, asta e ineficient: un fetch + o listă întreagă pentru a afișa
-- numele pe câteva camere. Fix: stocăm `auth.uid()` (uuid), iar
-- get_housekeeping_board face JOIN direct pe `profiles` (+ `auth.users` pt.
-- fallback email dacă nu există nume) — un singur RPC, fără fetch separat.
-- ============================================================

alter table units drop column cleaning_status_by_email;
alter table units add column cleaning_status_by uuid references auth.users(id);

create or replace function app.touch_cleaning_status_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.cleaning_status <> old.cleaning_status then
    new.cleaning_status_at := now();
    new.cleaning_status_by := auth.uid();
  end if;
  return new;
end $$;

-- get_housekeeping_board: JOIN pe profiles/auth.users, nu mai întoarce email
-- brut — întoarce direct numele afișabil (sau email, dacă nu există profil
-- cu nume completat).
drop function if exists public.get_housekeeping_board(uuid);

create function public.get_housekeeping_board(p_property_id uuid)
returns table (
  unit_id                   uuid,
  unit_name                 text,
  unit_type_name            text,
  unit_status               text,
  cleaning_status           text,
  cleaning_status_at        timestamptz,
  cleaning_status_by_name   text,
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
    coalesce(p.full_name, au.email::text),
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
  left join public.profiles p on p.user_id = u.cleaning_status_by
  left join auth.users au on au.id = u.cleaning_status_by
  where u.property_id = p_property_id
    and u.status <> 'archived'
  order by u.name;
end $$;

revoke execute on function public.get_housekeeping_board(uuid) from anon, public;
grant execute on function public.get_housekeeping_board(uuid) to authenticated;
