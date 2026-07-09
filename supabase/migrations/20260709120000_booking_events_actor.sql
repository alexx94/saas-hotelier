-- ============================================================
-- Booking events — actor_name prin JOIN server-side (pattern identic
-- Sprint 8.2, get_housekeeping_board / get_activity_feed)
--
-- booking_events.actor_id e populat corect (auth.uid(), inclusiv la
-- CREAREA rezervării — triggerul app.audit_booking e corect de la
-- migrația 20260611120000). Dar pagina dedicată a rezervării
-- (`/property/$propertyId/bookings/$bookingId`) citea istoricul cu un
-- select("*") PostgREST brut pe booking_events, fără nicio rezolvare a
-- actorului — userul nu vedea niciodată cine a făcut fiecare acțiune.
-- Activity Feed (get_activity_feed, 20260622150000) rezolvă deja actorul,
-- dar doar pentru feed-ul general — nu pentru istoricul dedicat afișat pe
-- pagina rezervării.
--
-- Fix: RPC nou get_booking_events, cu aceeași autorizare ca restul
-- paginii rezervării (app.can_access_property — nicio permisiune nouă) și
-- rezolvarea numelui identică cu get_housekeeping_board:
--   left join profiles + left join auth.users, coalesce(full_name, email).
-- ============================================================

create function public.get_booking_events(
  p_booking_id uuid,
  p_limit      int default 15,
  p_offset     int default 0
) returns table (
  id          uuid,
  booking_id  uuid,
  event_type  text,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz,
  actor_id    uuid,
  actor_name  text
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_property_id uuid;
begin
  select b.property_id into v_property_id from public.bookings b where b.id = p_booking_id;
  if v_property_id is null then raise exception 'BOOKING_NOT_FOUND'; end if;
  if not app.can_access_property(v_property_id) then raise exception 'FORBIDDEN'; end if;

  return query
  select
    be.id, be.booking_id, be.event_type, be.old_data, be.new_data, be.created_at,
    be.actor_id,
    coalesce(p.full_name, au.email::text) as actor_name
  from public.booking_events be
  left join public.profiles p on p.user_id = be.actor_id
  left join auth.users au on au.id = be.actor_id
  where be.booking_id = p_booking_id
  order by be.created_at desc, be.id desc
  limit p_limit offset p_offset;
end $$;

revoke execute on function public.get_booking_events(uuid, int, int) from public, anon;
grant execute on function public.get_booking_events(uuid, int, int) to authenticated;
