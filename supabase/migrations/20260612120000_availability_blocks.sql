-- ============================================================
-- Migrația 16 (Sprint 3 — Availability Blocks):
--   Blocaje de disponibilitate pe interval, fără a schimba statusul permanent
--   al camerei. Un blocaj = rezervare status='blocked' fără oaspete:
--   refolosește constrângerea EXCLUDE (no_double_booking) ca SINGURĂ sursă
--   de adevăr pentru suprapuneri (block vs rezervare vs alt block).
--
--   1. Coloană block_reason (motiv structurat: mentenanță/renovare/...)
--   2. RPC block_unit       — blochează O cameră pe interval
--   3. RPC bulk_block_units  — blochează mai multe, sare peste suprapuneri
--   4. RPC remove_block      — șterge un blocaj (camera redevine disponibilă)
-- ============================================================

-- ============ 1. Motiv structurat pe blocaje ============

alter table bookings add column block_reason text
  check (block_reason is null or block_reason in
    ('maintenance','renovation','owner_use','internal_use','other'));

-- ============ 2. RPC: blocare o cameră pe interval ============

create function public.block_unit(
  p_unit_id uuid,
  p_start   date,
  p_end     date,
  p_reason  text default 'other',
  p_notes   text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_unit       record;
  v_currency   char(3);
  v_booking_id uuid;
begin
  if p_end <= p_start then raise exception 'INVALID_DATES'; end if;
  if coalesce(p_reason, 'other') not in
     ('maintenance','renovation','owner_use','internal_use','other') then
    raise exception 'INVALID_REASON';
  end if;

  select u.*, p.currency into v_unit
    from public.units u
    join public.properties p on p.id = u.property_id
   where u.id = p_unit_id;
  if not found then raise exception 'UNIT_NOT_FOUND'; end if;
  if not app.can_access_property(v_unit.property_id) then raise exception 'FORBIDDEN'; end if;
  if v_unit.status <> 'active' then raise exception 'UNIT_NOT_ACTIVE'; end if;

  begin
    insert into public.bookings
      (org_id, property_id, unit_type_id, unit_id, guest_id, status,
       check_in, check_out, guests_count, total_amount, currency, source,
       block_reason, notes)
    values
      (v_unit.org_id, v_unit.property_id, v_unit.unit_type_id, p_unit_id, null, 'blocked',
       p_start, p_end, 1, 0, v_unit.currency, 'blocked',
       coalesce(p_reason, 'other'), p_notes)
    returning id into v_booking_id;
  exception when exclusion_violation then
    raise exception 'BLOCK_OVERLAPS';
  end;

  return v_booking_id;
end $$;

revoke execute on function public.block_unit from anon, public;
grant execute on function public.block_unit to authenticated;

-- ============ 3. RPC: blocare în masă ============
-- Sare peste camerele unde intervalul se suprapune cu o rezervare/block existent
-- și le raportează pe nume. Doar camerele active sunt procesate.

create function public.bulk_block_units(
  p_unit_ids uuid[],
  p_start    date,
  p_end      date,
  p_reason   text default 'other',
  p_notes    text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_unit    record;
  v_blocked int := 0;
  v_skipped text[] := '{}';
begin
  if p_end <= p_start then raise exception 'INVALID_DATES'; end if;
  if coalesce(p_reason, 'other') not in
     ('maintenance','renovation','owner_use','internal_use','other') then
    raise exception 'INVALID_REASON';
  end if;
  if p_unit_ids is null or array_length(p_unit_ids, 1) is null then
    return jsonb_build_object('blocked', 0, 'skipped', '[]'::jsonb);
  end if;
  if array_length(p_unit_ids, 1) > 500 then raise exception 'TOO_MANY_UNITS'; end if;

  for v_unit in
    select u.*, p.currency as prop_currency
      from public.units u
      join public.properties p on p.id = u.property_id
     where u.id = any(p_unit_ids) and u.status = 'active'
       and app.can_access_property(u.property_id)
     order by u.name
  loop
    begin
      insert into public.bookings
        (org_id, property_id, unit_type_id, unit_id, guest_id, status,
         check_in, check_out, guests_count, total_amount, currency, source,
         block_reason, notes)
      values
        (v_unit.org_id, v_unit.property_id, v_unit.unit_type_id, v_unit.id, null, 'blocked',
         p_start, p_end, 1, 0, v_unit.prop_currency, 'blocked',
         coalesce(p_reason, 'other'), p_notes);
      v_blocked := v_blocked + 1;
    exception when exclusion_violation then
      v_skipped := v_skipped || v_unit.name;
    end;
  end loop;

  return jsonb_build_object('blocked', v_blocked, 'skipped', to_jsonb(v_skipped));
end $$;

revoke execute on function public.bulk_block_units from anon, public;
grant execute on function public.bulk_block_units to authenticated;

-- ============ 4. RPC: ștergere blocaj ============
-- Șterge rândul (camera redevine disponibilă). Nu atinge rezervările reale:
-- verifică explicit status='blocked'.

create function public.remove_block(p_booking_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_b record;
begin
  select * into v_b from public.bookings where id = p_booking_id;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if not app.can_access_property(v_b.property_id) then raise exception 'FORBIDDEN'; end if;
  if v_b.status <> 'blocked' then raise exception 'NOT_A_BLOCK'; end if;

  delete from public.bookings where id = p_booking_id;
end $$;

revoke execute on function public.remove_block from anon, public;
grant execute on function public.remove_block to authenticated;
