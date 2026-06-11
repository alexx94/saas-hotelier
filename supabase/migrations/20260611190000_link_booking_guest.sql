-- ============================================================
-- Migrația 9 (Sprint 2): asociere manuală profil oaspete pe rezervare
--   1. RPC link_booking_guest — re-leagă o rezervare de alt profil
--      (procesarea manuală a rezervărilor publice; snapshot-ul rămâne)
--   2. Audit: eveniment 'guest_changed' cu numele oaspeților
-- ============================================================

-- ============ 1. RPC: link_booking_guest ============

create function public.link_booking_guest(
  p_booking_id uuid,
  p_guest_id   uuid
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_booking record;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;

  if not app.can_access_property(v_booking.property_id) then
    raise exception 'FORBIDDEN';
  end if;

  if v_booking.status = 'blocked' then
    raise exception 'BOOKING_NOT_LINKABLE';
  end if;

  -- profilul trebuie să fie din aceeași organizație
  if not exists (
    select 1 from public.guests g
    where g.id = p_guest_id and g.org_id = v_booking.org_id
  ) then
    raise exception 'GUEST_NOT_FOUND';
  end if;

  -- doar referința se schimbă; snapshot-ul (booked_*) rămâne al rezervării
  update public.bookings set guest_id = p_guest_id where id = p_booking_id;
end $$;

revoke execute on function public.link_booking_guest(uuid,uuid) from public, anon;
grant execute on function public.link_booking_guest(uuid,uuid) to authenticated;

-- ============ 2. Audit: eveniment guest_changed ============

create or replace function app.audit_booking() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_event_type text;
  v_old jsonb := null;
  v_new jsonb := null;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'created';
    v_new := jsonb_build_object(
      'unit', (select name from public.units where id = new.unit_id),
      'status', new.status, 'check_in', new.check_in, 'check_out', new.check_out
    );
  else
    if old.unit_id <> new.unit_id then
      v_event_type := 'reassigned';
      v_old := jsonb_build_object('unit', (select name from public.units where id = old.unit_id));
      v_new := jsonb_build_object('unit', (select name from public.units where id = new.unit_id));
    elsif old.status <> new.status then
      v_event_type := 'status_changed';
      v_old := jsonb_build_object('status', old.status);
      v_new := jsonb_build_object('status', new.status);
    elsif old.check_in <> new.check_in or old.check_out <> new.check_out then
      v_event_type := 'dates_changed';
      v_old := jsonb_build_object('check_in', old.check_in, 'check_out', old.check_out);
      v_new := jsonb_build_object('check_in', new.check_in, 'check_out', new.check_out);
    elsif old.guest_id is distinct from new.guest_id then
      v_event_type := 'guest_changed';
      v_old := jsonb_build_object('guest', (select full_name from public.guests where id = old.guest_id));
      v_new := jsonb_build_object('guest', (select full_name from public.guests where id = new.guest_id));
    else
      v_event_type := 'updated';
      v_new := jsonb_build_object('notes', new.notes, 'guests_count', new.guests_count, 'total_amount', new.total_amount);
    end if;
  end if;

  insert into public.booking_events (org_id, booking_id, actor_id, event_type, old_data, new_data)
  values (new.org_id, new.id, auth.uid(), v_event_type, v_old, v_new);

  return new;
end $$;
