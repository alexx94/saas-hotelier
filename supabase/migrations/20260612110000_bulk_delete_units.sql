-- ============================================================
-- Migrația 15 (Sprint 3): RPC bulk_delete_units
--   Ștergere în masă cu aceeași logică per cameră ca în UI-ul individual:
--   șterge → dacă are rezervări istorice (FK) dezactivează → dacă are
--   rezervări viitoare (trigger) o raportează ca blocată.
--   SECURITY INVOKER: RLS pe units autorizează (doar owner/manager).
-- ============================================================

create function public.bulk_delete_units(
  p_unit_ids uuid[]
) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_unit        record;
  v_deleted     int := 0;
  v_deactivated int := 0;
  v_blocked     text[] := '{}';
begin
  if p_unit_ids is null or array_length(p_unit_ids, 1) is null then
    return jsonb_build_object('deleted', 0, 'deactivated', 0, 'blocked', '[]'::jsonb);
  end if;
  if array_length(p_unit_ids, 1) > 500 then
    raise exception 'TOO_MANY_UNITS';
  end if;

  for v_unit in
    select id, name from public.units where id = any(p_unit_ids) order by name
  loop
    begin
      delete from public.units where id = v_unit.id;
      if found then v_deleted := v_deleted + 1; end if;
    exception
      when foreign_key_violation then
        -- rezervări istorice → dezactivăm în loc de ștergere
        begin
          update public.units set status = 'inactive'
           where id = v_unit.id and status <> 'inactive';
          if found then v_deactivated := v_deactivated + 1; end if;
        exception when others then
          if sqlerrm like '%UNIT_HAS_FUTURE_BOOKINGS%' then
            v_blocked := v_blocked || v_unit.name;
          else
            raise;
          end if;
        end;
      when others then
        if sqlerrm like '%UNIT_HAS_FUTURE_BOOKINGS%' then
          v_blocked := v_blocked || v_unit.name;
        else
          raise;
        end if;
    end;
  end loop;

  return jsonb_build_object(
    'deleted', v_deleted,
    'deactivated', v_deactivated,
    'blocked', to_jsonb(v_blocked));
end $$;

revoke execute on function public.bulk_delete_units from anon, public;
