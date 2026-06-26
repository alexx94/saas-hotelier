-- Sprint 9.1: editare notă pe rezervare existentă (din pagina rezervării, nu doar
-- la creare). Refolosește permisiunea existentă booking.edit — recepția (care
-- deja poate edita date/status) trebuie să poată adăuga o notă. Nicio coloană
-- nouă (bookings.notes există din schema inițială) și niciun trigger de audit
-- nou — app.audit_booking deja prinde generic schimbările pe `notes` (event
-- 'updated').

create function public.update_booking_notes(
  p_booking_id uuid,
  p_notes      text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_booking record;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if not app.has_permission(v_booking.org_id, v_booking.property_id, 'booking.edit') then
    raise exception 'FORBIDDEN';
  end if;

  update public.bookings
  set notes = nullif(trim(p_notes), ''),
      updated_at = now()
  where id = p_booking_id;
end $$;

revoke execute on function public.update_booking_notes(uuid, text) from anon, public;
grant execute on function public.update_booking_notes(uuid, text) to authenticated;
