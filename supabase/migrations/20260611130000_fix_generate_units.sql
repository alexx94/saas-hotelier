-- Fix generate_units: sare peste numerele deja ocupate în loc să se oprească
-- Astfel al doilea tip de cameră cu același prefix nu mai primește 0 camere.
create or replace function public.generate_units(
  p_unit_type_id uuid,
  p_count        int,
  p_prefix       text default 'Camera ',
  p_start_number int default 1
) returns int
language plpgsql
as $$
declare
  v_type     record;
  v_inserted int := 0;
  i          int := p_start_number;
  v_limit    int;
begin
  if p_count < 1 or p_count > 500 then
    raise exception 'INVALID_COUNT';
  end if;
  select * into v_type from unit_types where id = p_unit_type_id;
  if not found then
    raise exception 'UNIT_TYPE_NOT_FOUND';
  end if;
  -- limită de siguranță: nu iterăm la infinit dacă există un număr mare de coliziuni
  v_limit := p_start_number + p_count + 10000;
  while v_inserted < p_count and i < v_limit loop
    insert into units (org_id, property_id, unit_type_id, name)
    values (v_type.org_id, v_type.property_id, p_unit_type_id, p_prefix || i)
    on conflict (property_id, name) do nothing;
    if found then
      v_inserted := v_inserted + 1;
    end if;
    i := i + 1;
  end loop;
  return v_inserted;
end $$;
