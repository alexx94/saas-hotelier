-- ============================================================
-- Migrația 5: fix update_booking_dates + tranziții de revenire (undo)
--   1. Fix: 'stay' e coloană GENERATED — nu se poate seta manual în UPDATE
--   2. Tranziții de revenire (undo): fiecare status are o cale înapoi,
--      cu constrângerile menținute (EXCLUDE constraint re-verifică
--      disponibilitatea la reactivarea unei rezervări anulate/no_show)
-- ============================================================

-- ============ 1. Fix update_booking_dates ============
-- Bug: setarea explicită a coloanei generate 'stay' ridica
-- "cannot insert a non-DEFAULT value into column stay" (428C9).
-- 'stay' se recalculează automat din check_in/check_out.

create or replace function public.update_booking_dates(
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
        updated_at = now()
    where id = p_booking_id;
  exception when exclusion_violation then
    raise exception 'UNIT_NOT_AVAILABLE';
  end;
end $$;

-- ============ 2. Tranziții de revenire (undo) ============
-- Fiecare tranziție "înainte" primește o cale de revenire pentru corectarea
-- greșelilor de operare. Separate conceptual de cele forward — un feature
-- viitor de roluri va putea restricționa revenirile la manager/owner.
--
--   forward:  pending → confirmed → checked_in → checked_out
--   revert:   confirmed → pending, checked_in → confirmed,
--             checked_out → checked_in, no_show → confirmed,
--             cancelled → pending (reactivare)
--
-- Constrângerile rămân active la revert:
--   - cancelled/no_show → activ: rândul reintră în EXCLUDE constraint;
--     dacă între timp camera a fost rezervată pe interval, UPDATE-ul
--     eșuează cu exclusion_violation (nu se poate "forța" un undo).
--   - cancelled(blocked) → pending: blocat de CHECK (guest_id null).

create or replace function app.validate_booking_update() returns trigger
language plpgsql as $$
begin
  if new.status <> old.status then
    if not (
      -- forward
      (old.status = 'pending'     and new.status in ('confirmed', 'cancelled')) or
      (old.status = 'confirmed'   and new.status in ('checked_in', 'cancelled', 'no_show')) or
      (old.status = 'checked_in'  and new.status = 'checked_out') or
      (old.status = 'blocked'     and new.status = 'cancelled') or
      -- revert (undo)
      (old.status = 'confirmed'   and new.status = 'pending') or
      (old.status = 'checked_in'  and new.status = 'confirmed') or
      (old.status = 'checked_out' and new.status = 'checked_in') or
      (old.status = 'cancelled'   and new.status = 'pending') or
      (old.status = 'no_show'     and new.status = 'confirmed')
    ) then
      raise exception 'INVALID_STATUS_TRANSITION';
    end if;
  end if;

  -- Datele nu se modifică pe rezervări în status final (revert mai întâi)
  if (new.check_in <> old.check_in or new.check_out <> old.check_out) then
    if old.status in ('cancelled', 'checked_out', 'no_show') then
      raise exception 'BOOKING_NOT_EDITABLE';
    end if;
    if new.check_out <= new.check_in then
      raise exception 'INVALID_DATE_RANGE';
    end if;
  end if;

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
