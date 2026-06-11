-- ============================================================
-- Migrația 10 (Sprint 2): statistici oaspete server-side + indexuri paginare
--   1. RPC get_guest_stats — totaluri calculate în DB (nu pe client)
--   2. Indexuri compuse pentru cursor pagination (keyset) pe liste
-- ============================================================

-- ============ 1. RPC: get_guest_stats ============
-- security invoker: RLS pe bookings limitează rândurile la organizațiile
-- userului; un guest_id străin întoarce pur și simplu 0/0/0.
-- "Viitoare" = check-in azi sau mai târziu și neanulată (cancelled/no_show).

create function public.get_guest_stats(p_guest_id uuid)
returns table (total bigint, upcoming bigint, cancelled bigint)
language sql stable
as $$
  select
    count(*) as total,
    count(*) filter (
      where check_in >= current_date and status not in ('cancelled', 'no_show')
    ) as upcoming,
    count(*) filter (where status = 'cancelled') as cancelled
  from public.bookings
  where guest_id = p_guest_id;
$$;

revoke execute on function public.get_guest_stats(uuid) from public, anon;
grant execute on function public.get_guest_stats(uuid) to authenticated;

-- ============ 2. Indexuri pentru keyset pagination ============

-- istoric rezervări per oaspete (profil) + agregatele din get_guest_stats
create index bookings_guest_checkin_id_idx
  on bookings (guest_id, check_in desc, id desc);

-- lista rezervărilor per proprietate, ordonată check_in desc
-- (acoperă și range query-ul din calendar; înlocuiește indexul vechi)
create index bookings_property_checkin_id_idx
  on bookings (property_id, check_in desc, id desc);
drop index if exists bookings_property_checkin_idx;

-- lista oaspeților per organizație, ordonată created_at desc
create index guests_org_created_id_idx
  on guests (org_id, created_at desc, id desc);
