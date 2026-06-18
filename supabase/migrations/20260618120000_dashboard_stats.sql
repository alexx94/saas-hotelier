-- ============================================================
-- Sprint 5 — Analytics & Dashboard
--   RPC get_dashboard_stats — metrici operaționale pentru panou,
--   calculate server-side, în timezone-ul proprietății (o singură
--   trecere peste bookings + un count pe units). Venitul rămâne
--   separat (get_revenue_summary), reutilizat de cardul „Venit".
--
-- Definiții:
--   arrivals_today / departures_today — rezervări reale cu check_in /
--     check_out = azi (exclus anulări/no-show/blocaje).
--   in_house_guests — suma persoanelor din sejururile care acoperă azi
--     (check_in <= azi < check_out).
--   occupied_units — camere distincte cu o rezervare reală care acoperă
--     azi; available_units = camere active − ocupate.
--   occupancy_pct — ocupate / camere active * 100.
--   bookings_month / bookings_year — rezervări create luna / anul curent
--     (volum comercial; exclude blocajele de tip status='blocked').
--   cancellations_month — rezervări anulate luna curentă (după updated_at,
--     proxy pentru momentul anulării — nu avem cancelled_at dedicat).
-- ============================================================

create function public.get_dashboard_stats(p_property_id uuid)
returns table (
  arrivals_today      bigint,
  departures_today    bigint,
  in_house_guests     bigint,
  occupied_units      bigint,
  available_units     bigint,
  total_units         bigint,
  occupancy_pct       numeric,
  bookings_month      bigint,
  bookings_year       bigint,
  cancellations_month bigint
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_prop     record;
  v_today    date;
  v_total    bigint;
  v_occupied bigint;
begin
  select * into v_prop from public.properties where id = p_property_id;
  if not found then raise exception 'PROPERTY_NOT_FOUND'; end if;
  if not app.can_access_property(p_property_id) then raise exception 'FORBIDDEN'; end if;

  v_today := (now() at time zone v_prop.timezone)::date;

  -- numitorul ocupării: camerele vandabile (status='active', ca în engine)
  select count(*) into v_total
  from public.units
  where property_id = p_property_id and status = 'active';

  -- camere ocupate azi (distinct, doar camere active → occupied ⊆ total,
  -- deci ocupate + disponibile = total fără surprize)
  select count(distinct b.unit_id) into v_occupied
  from public.bookings b
  join public.units u on u.id = b.unit_id and u.status = 'active'
  where b.property_id = p_property_id
    and b.status not in ('cancelled','no_show','blocked')
    and b.check_in <= v_today and b.check_out > v_today;

  return query
  with b as (
    select
      status, guests_count, check_in, check_out,
      (created_at at time zone v_prop.timezone)::date as created_d,
      (updated_at at time zone v_prop.timezone)::date as updated_d
    from public.bookings
    where property_id = p_property_id
  )
  select
    count(*) filter (
      where status not in ('cancelled','no_show','blocked') and check_in = v_today
    )::bigint,
    count(*) filter (
      where status not in ('cancelled','no_show','blocked') and check_out = v_today
    )::bigint,
    coalesce(sum(guests_count) filter (
      where status not in ('cancelled','no_show','blocked')
        and check_in <= v_today and check_out > v_today
    ), 0)::bigint,
    v_occupied,
    greatest(v_total - v_occupied, 0),
    v_total,
    case when v_total > 0
      then round(v_occupied::numeric * 100 / v_total, 1)
      else 0 end,
    count(*) filter (
      where status <> 'blocked'
        and date_trunc('month', created_d) = date_trunc('month', v_today)
    )::bigint,
    count(*) filter (
      where status <> 'blocked'
        and date_trunc('year', created_d) = date_trunc('year', v_today)
    )::bigint,
    count(*) filter (
      where status = 'cancelled'
        and date_trunc('month', updated_d) = date_trunc('month', v_today)
    )::bigint
  from b;
end $$;

revoke execute on function public.get_dashboard_stats(uuid) from anon, public;
grant execute on function public.get_dashboard_stats(uuid) to authenticated;
