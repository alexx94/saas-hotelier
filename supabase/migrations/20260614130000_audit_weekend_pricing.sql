-- ============================================================
-- Migrația 29 (Sprint 4.6 — audit complet pe unit_types)
--
--   Adaugă în auditul tipului de cameră config-ul de WEEKEND
--   (weekend_adjustment_type / value / days), pentru consistență cu base_price
--   (toate afectează prețul rezervărilor viitoare). Durata sejurului (min/max stay)
--   era deja auditată în migrația 28. weekend_days se stochează tot ca DOW int2[];
--   frontend-ul îl randează ca listă de zile (Lu, Ma, …).
-- ============================================================

create or replace function app.audit_unit_type() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_event_type text;
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.unit_type_events (org_id, unit_type_id, actor_id, actor_email, event_type, new_data)
    values (new.org_id, new.id, auth.uid(), nullif(auth.jwt()->>'email', ''), 'created',
            jsonb_build_object('name', new.name, 'max_adults', new.max_adults,
                               'max_children', new.max_children, 'base_price', new.base_price,
                               'min_stay', new.min_stay, 'max_stay', new.max_stay,
                               'weekend_adjustment_type', new.weekend_adjustment_type,
                               'weekend_adjustment_value', new.weekend_adjustment_value,
                               'weekend_days', new.weekend_days));
    return new;
  end if;

  if old.name <> new.name then
    v_old := v_old || jsonb_build_object('name', old.name);
    v_new := v_new || jsonb_build_object('name', new.name);
  end if;
  if old.max_adults <> new.max_adults then
    v_old := v_old || jsonb_build_object('max_adults', old.max_adults);
    v_new := v_new || jsonb_build_object('max_adults', new.max_adults);
  end if;
  if old.max_children <> new.max_children then
    v_old := v_old || jsonb_build_object('max_children', old.max_children);
    v_new := v_new || jsonb_build_object('max_children', new.max_children);
  end if;
  if old.base_price <> new.base_price then
    v_old := v_old || jsonb_build_object('base_price', old.base_price);
    v_new := v_new || jsonb_build_object('base_price', new.base_price);
  end if;
  if old.min_stay <> new.min_stay then
    v_old := v_old || jsonb_build_object('min_stay', old.min_stay);
    v_new := v_new || jsonb_build_object('min_stay', new.min_stay);
  end if;
  if old.max_stay <> new.max_stay then
    v_old := v_old || jsonb_build_object('max_stay', old.max_stay);
    v_new := v_new || jsonb_build_object('max_stay', new.max_stay);
  end if;
  if old.weekend_adjustment_type <> new.weekend_adjustment_type then
    v_old := v_old || jsonb_build_object('weekend_adjustment_type', old.weekend_adjustment_type);
    v_new := v_new || jsonb_build_object('weekend_adjustment_type', new.weekend_adjustment_type);
  end if;
  if old.weekend_adjustment_value <> new.weekend_adjustment_value then
    v_old := v_old || jsonb_build_object('weekend_adjustment_value', old.weekend_adjustment_value);
    v_new := v_new || jsonb_build_object('weekend_adjustment_value', new.weekend_adjustment_value);
  end if;
  if old.weekend_days is distinct from new.weekend_days then
    v_old := v_old || jsonb_build_object('weekend_days', old.weekend_days);
    v_new := v_new || jsonb_build_object('weekend_days', new.weekend_days);
  end if;

  if old.is_active and not new.is_active then
    v_event_type := 'archived';
  elsif not old.is_active and new.is_active then
    v_event_type := 'restored';
  elsif v_old <> '{}'::jsonb then
    v_event_type := 'updated';
  else
    return new;
  end if;

  insert into public.unit_type_events (org_id, unit_type_id, actor_id, actor_email, event_type, old_data, new_data)
  values (new.org_id, new.id, auth.uid(), nullif(auth.jwt()->>'email', ''), v_event_type,
          nullif(v_old, '{}'::jsonb), nullif(v_new, '{}'::jsonb));

  return new;
end $$;
