-- ============================================================
-- Migrația 4: booking lifecycle enforcement
--   1. Trigger BEFORE UPDATE — validare tranziții status server-side
--   2. RPC update_booking_dates — modificare date cu validare disponibilitate
--   3. Fix RLS bookings_update — adaugă WITH CHECK
-- ============================================================

-- ============ 1. Trigger: validare tranziții status + guard date/unit ============

create function app.validate_booking_update() returns trigger
language plpgsql as $$
begin
  -- Guard tranziții status
  if new.status <> old.status then
    -- Statusuri terminale: imuabile
    if old.status in ('cancelled', 'checked_out', 'no_show') then
      raise exception 'INVALID_STATUS_TRANSITION';
    end if;

    -- Hartă tranziții permise (identică cu frontend nextStatuses)
    if not (
      (old.status = 'pending'    and new.status in ('confirmed', 'cancelled')) or
      (old.status = 'confirmed'  and new.status in ('checked_in', 'cancelled', 'no_show')) or
      (old.status = 'checked_in' and new.status = 'checked_out') or
      (old.status = 'blocked'    and new.status = 'cancelled')
    ) then
      raise exception 'INVALID_STATUS_TRANSITION';
    end if;
  end if;

  -- Guard modificare date: nu se pot schimba pe rezervări terminale
  if (new.check_in <> old.check_in or new.check_out <> old.check_out) then
    if old.status in ('cancelled', 'checked_out', 'no_show') then
      raise exception 'BOOKING_NOT_EDITABLE';
    end if;
    if new.check_out <= new.check_in then
      raise exception 'INVALID_DATE_RANGE';
    end if;
  end if;

  -- Guard schimbare unitate directă: camera trebuie activă și pe aceeași proprietate
  if new.unit_id is distinct from old.unit_id then
    if not exists (
      select 1 from units
      where id = new.unit_id
        and status = 'active'
        and property_id = new.property_id
    ) then
      raise exception 'UNIT_NOT_VALID';
    end if;
  end if;

  return new;
end $$;

create trigger bookings_update_guard
  before update on bookings
  for each row execute function app.validate_booking_update();

-- ============ 2. RPC: update_booking_dates ============

create function public.update_booking_dates(
  p_booking_id uuid,
  p_check_in   date,
  p_check_out  date
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

  if v_booking.status in ('cancelled', 'checked_out', 'no_show') then
    raise exception 'BOOKING_NOT_EDITABLE';
  end if;

  if p_check_out <= p_check_in then
    raise exception 'INVALID_DATE_RANGE';
  end if;

  begin
    update public.bookings
    set check_in   = p_check_in,
        check_out  = p_check_out,
        stay       = daterange(p_check_in, p_check_out, '[)'),
        updated_at = now()
    where id = p_booking_id;
  exception when exclusion_violation then
    raise exception 'UNIT_NOT_AVAILABLE';
  end;
end $$;

revoke execute on function public.update_booking_dates from anon, public;
grant execute on function public.update_booking_dates to authenticated;

-- ============ 3. Fix RLS: adaugă WITH CHECK pe bookings_update ============

drop policy if exists bookings_update on bookings;

create policy bookings_update on bookings for update to authenticated
  using (app.can_access_property(property_id))
  with check (app.can_access_property(property_id));
