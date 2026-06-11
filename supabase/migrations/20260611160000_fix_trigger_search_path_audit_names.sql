-- ============================================================
-- Migrația 6: fix search_path în validate_booking_update + nume în audit
--   1. Bug: trigger-ul validate_booking_update citea 'units' nequalificat.
--      Declanșat din RPC-uri security definer cu search_path='' (reassign_booking),
--      tabela nu era găsită -> "A apărut o eroare" la schimbarea camerei.
--   2. Audit: stochează numele camerei (lizibil) în loc de UUID
--      în old_data/new_data, pentru afișare directă în istoric.
-- ============================================================

-- ============ 1. Fix: search_path explicit + tabele calificate ============

create or replace function app.validate_booking_update() returns trigger
language plpgsql set search_path = '' as $$
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
      select 1 from public.units
      where id = new.unit_id
        and status = 'active'
        and property_id = new.property_id
    ) then
      raise exception 'UNIT_NOT_VALID';
    end if;
  end if;

  return new;
end $$;

-- ============ 2. Audit cu nume de cameră lizibile ============
-- Cheia 'unit' (nume) înlocuiește 'unit_id' (uuid) în old_data/new_data.
-- Frontend-ul afișează generic orice câmp înregistrat — nu depinde de event_type.

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
    else
      v_event_type := 'updated';
      v_new := jsonb_build_object('notes', new.notes, 'guests_count', new.guests_count, 'total_amount', new.total_amount);
    end if;
  end if;

  insert into public.booking_events (org_id, booking_id, actor_id, event_type, old_data, new_data)
  values (new.org_id, new.id, auth.uid(), v_event_type, v_old, v_new);

  return new;
end $$;
