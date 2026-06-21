-- ============================================================
-- Restructurare navigare org → proprietate
--   RPC get_org_dashboard_stats — „vizualizare în ansamblu" pentru
--   home-ul organizației (/org/$orgId): agregă metricile operaționale
--   peste TOATE proprietățile la care actorul are acces, refolosind
--   get_dashboard_stats per proprietate (fiecare în timezone-ul ei).
--
--   Gate: doar actori NERESTRÂNȘI (owner/admin) — cei legați de
--   anumite proprietăți (member_property_access) nu văd agregatul pe
--   org, doar lista lor de lucru (vezi docs/backend/rbac.md §10).
--   Sumele se construiesc din funcția per-proprietate (sursă unică de
--   adevăr), deci definițiile rămân identice; ocuparea se recalculează
--   din totaluri (nu se mediază procentele).
-- ============================================================

create function public.get_org_dashboard_stats(p_org_id uuid)
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
  cancellations_month bigint,
  property_count      bigint
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_prop uuid;
  v_rec  record;
  a bigint := 0; d bigint := 0; ih bigint := 0;
  occ bigint := 0; tot bigint := 0;
  bm bigint := 0; by_ bigint := 0; cm bigint := 0;
  pc bigint := 0;
begin
  if not (p_org_id in (select app.user_org_ids())) then
    raise exception 'FORBIDDEN';
  end if;
  -- actorii restrânși la anumite proprietăți nu primesc agregatul pe org
  if app.actor_property_restricted(p_org_id) then
    raise exception 'FORBIDDEN';
  end if;

  for v_prop in
    select id from public.properties
    where org_id = p_org_id and app.can_access_property(id)
  loop
    select * into v_rec from public.get_dashboard_stats(v_prop);
    a   := a   + v_rec.arrivals_today;
    d   := d   + v_rec.departures_today;
    ih  := ih  + v_rec.in_house_guests;
    occ := occ + v_rec.occupied_units;
    tot := tot + v_rec.total_units;
    bm  := bm  + v_rec.bookings_month;
    by_ := by_ + v_rec.bookings_year;
    cm  := cm  + v_rec.cancellations_month;
    pc  := pc  + 1;
  end loop;

  arrivals_today      := a;
  departures_today    := d;
  in_house_guests     := ih;
  occupied_units      := occ;
  available_units     := greatest(tot - occ, 0);
  total_units         := tot;
  occupancy_pct       := case when tot > 0 then round(occ::numeric * 100 / tot, 1) else 0 end;
  bookings_month      := bm;
  bookings_year       := by_;
  cancellations_month := cm;
  property_count      := pc;
  return next;
end $$;

revoke execute on function public.get_org_dashboard_stats(uuid) from anon, public;
grant execute on function public.get_org_dashboard_stats(uuid) to authenticated;
