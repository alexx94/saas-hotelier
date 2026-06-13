-- ============================================================
-- Migrația 13 (Sprint 3 — Room Operations):
--   1. Audit trail camere: tabel unit_events + trigger app.audit_unit
--   2. RPC bulk_update_unit_status — activare/dezactivare/arhivare în masă,
--      cu raport per cameră (actualizate vs blocate de rezervări viitoare)
--   3. generate_units: validare p_start_number (suport interval "101-120")
-- ============================================================

-- ============ 1. Audit trail camere ============

create table unit_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  unit_id     uuid not null references units(id) on delete cascade,
  actor_id    uuid,            -- auth.uid(); null pentru scrieri de sistem
  actor_email text,            -- snapshot la momentul acțiunii (fără join spre auth.users)
  event_type  text not null,   -- 'created','status_changed','renamed'
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);
create index unit_events_unit_idx on unit_events (unit_id, created_at);
alter table unit_events enable row level security;

create policy unit_events_select on unit_events for select to authenticated
  using (app.can_access_property(
    (select property_id from units where id = unit_id)
  ));
-- scrisul e exclusiv prin trigger — niciun insert direct din app
revoke all on unit_events from anon;

-- trigger de audit: search_path = '' + nume calificate (vezi docs/backend/triggers.md)
create function app.audit_unit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_event_type text;
  v_old jsonb := null;
  v_new jsonb := null;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'created';
    v_new := jsonb_build_object('name', new.name, 'status', new.status);
  elsif old.status <> new.status then
    v_event_type := 'status_changed';
    v_old := jsonb_build_object('status', old.status);
    v_new := jsonb_build_object('status', new.status);
    if old.name <> new.name then
      v_old := v_old || jsonb_build_object('name', old.name);
      v_new := v_new || jsonb_build_object('name', new.name);
    end if;
  elsif old.name <> new.name then
    v_event_type := 'renamed';
    v_old := jsonb_build_object('name', old.name);
    v_new := jsonb_build_object('name', new.name);
  else
    return new; -- nimic relevant de auditat
  end if;

  insert into public.unit_events (org_id, unit_id, actor_id, actor_email, event_type, old_data, new_data)
  values (new.org_id, new.id, auth.uid(), nullif(auth.jwt()->>'email', ''), v_event_type, v_old, v_new);

  return new;
end $$;

create trigger units_audit
  after insert or update on units
  for each row execute function app.audit_unit();

-- ============ 2. RPC: operațiuni bulk pe stările camerelor ============
-- SECURITY INVOKER: RLS pe units autorizează (doar owner/manager prin units_cud).
-- Camerele blocate de trigger-ul units_status_guard (rezervări viitoare) sunt
-- sărite și raportate pe nume — restul se actualizează (comportament parțial,
-- ca în PMS-urile mari: nu pici tot batch-ul pentru o cameră ocupată).

create function public.bulk_update_unit_status(
  p_unit_ids uuid[],
  p_status   text
) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_unit    record;
  v_updated int := 0;
  v_blocked text[] := '{}';
begin
  if p_status not in ('active','inactive','out_of_service','archived') then
    raise exception 'INVALID_STATUS';
  end if;
  if p_unit_ids is null or array_length(p_unit_ids, 1) is null then
    return jsonb_build_object('updated', 0, 'blocked', '[]'::jsonb);
  end if;
  if array_length(p_unit_ids, 1) > 500 then
    raise exception 'TOO_MANY_UNITS';
  end if;

  for v_unit in
    select id, name from public.units
    where id = any(p_unit_ids) and status <> p_status
    order by name
  loop
    begin
      -- found = false dacă RLS nu permite update (ex. rol staff) — nu numărăm
      update public.units set status = p_status where id = v_unit.id;
      if found then v_updated := v_updated + 1; end if;
    exception when others then
      if sqlerrm like '%UNIT_HAS_FUTURE_BOOKINGS%' then
        v_blocked := v_blocked || v_unit.name;
      else
        raise;
      end if;
    end;
  end loop;

  return jsonb_build_object('updated', v_updated, 'blocked', to_jsonb(v_blocked));
end $$;

revoke execute on function public.bulk_update_unit_status from anon, public;

-- ============ 3. generate_units: validare număr de start ============
-- Identică cu versiunea din migrația 7, plus guard pe p_start_number —
-- frontend-ul trimite acum start explicit (interval "101-120" sau count + start).

create or replace function public.generate_units(
  p_unit_type_id uuid,
  p_count        int,
  p_prefix       text default 'Camera ',
  p_start_number int default 1
) returns int
language plpgsql set search_path = ''
as $$
declare
  v_type     record;
  v_inserted int := 0;
  i          int;
  v_limit    int;
begin
  if p_count < 1 or p_count > 500 then
    raise exception 'INVALID_COUNT';
  end if;
  if p_start_number < 1 or p_start_number > 1000000 then
    raise exception 'INVALID_START';
  end if;
  i := p_start_number;
  -- security invoker: RLS pe unit_types/units autorizează (doar owner/manager)
  select * into v_type from public.unit_types where id = p_unit_type_id;
  if not found then
    raise exception 'UNIT_TYPE_NOT_FOUND';
  end if;
  v_limit := p_start_number + p_count + 10000;
  while v_inserted < p_count and i < v_limit loop
    insert into public.units (org_id, property_id, unit_type_id, name)
    values (v_type.org_id, v_type.property_id, p_unit_type_id, p_prefix || i)
    on conflict (property_id, name) do nothing;
    if found then
      v_inserted := v_inserted + 1;
    end if;
    i := i + 1;
  end loop;
  return v_inserted;
end $$;
