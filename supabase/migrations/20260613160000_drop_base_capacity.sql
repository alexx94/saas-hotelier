-- ============================================================
-- Migrația 26 (Sprint 4.5 — simplificare ocupare)
--   Scoatem unit_types.base_capacity: nu avea rol funcțional (occupancy pricing
--   e exclus), ocuparea relevantă = doar adulți + copii (max_adults/max_children).
--   Mai simplu de înțeles și de căutat (după nr. adulți, nu după o capacitate de bază).
-- ============================================================

alter table unit_types drop column base_capacity;
-- grantul anon pe `base_capacity` dispare odată cu coloana; max_adults/max_children rămân.

-- ============ Audit fără base_capacity ============

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
                               'max_children', new.max_children, 'base_price', new.base_price));
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

-- ============ public_get_availability fără base_capacity ============

drop function public.public_get_availability(text,date,date,int,int);

create function public.public_get_availability(
  p_slug      text,
  p_check_in  date,
  p_check_out date,
  p_adults    int default 1,
  p_children  int default 0
) returns table (
  unit_type_id    uuid,
  name            text,
  description     jsonb,
  max_adults      int,
  max_children    int,
  price_per_night numeric,
  total_price     numeric,
  currency        char(3),
  available_units int
)
language plpgsql stable security definer set search_path = ''
as $$
declare v_prop record;
begin
  select * into v_prop from public.properties where slug = p_slug and is_published;
  if not found then return; end if;
  if p_check_in < current_date or p_check_out <= p_check_in
     or p_check_out - p_check_in > 365 then
    return;
  end if;

  return query
  select
    a.unit_type_id, a.name, a.description, a.max_adults, a.max_children,
    (pr.q->>'avg_nightly')::numeric,
    (pr.q->>'total')::numeric,
    v_prop.currency,
    a.available_units
  from (
    select t.id as unit_type_id, t.name, t.description,
           t.max_adults, t.max_children, t.sort_order, count(u.id)::int as available_units
    from public.unit_types t
    join public.units u on u.unit_type_id = t.id and u.status = 'active'
    where t.property_id = v_prop.id
      and t.is_active
      and t.max_adults >= p_adults
      and t.max_children >= p_children
      and not exists (
        select 1 from public.bookings b
        where b.unit_id = u.id
          and b.status not in ('cancelled','no_show')
          and b.stay && daterange(p_check_in, p_check_out, '[)')
      )
      and not exists (
        select 1 from public.room_blocks rb
        where rb.unit_id = u.id
          and rb.period && daterange(p_check_in, p_check_out, '[)')
      )
    group by t.id, t.name, t.description, t.max_adults, t.max_children, t.sort_order
  ) a
  cross join lateral (select app.compute_price(a.unit_type_id, p_check_in, p_check_out) as q) pr
  order by a.sort_order, a.name;
end $$;

grant execute on function public.public_get_availability to anon, authenticated;
