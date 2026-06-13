-- ============================================================
-- Migrația 14 (Sprint 3 — Room Operations, continuare):
--   Audit trail pe tipurile de camere: tabel unit_type_events
--   + trigger app.audit_unit_type (created / updated / archived / restored)
--   Același model ca unit_events (migrația 13).
-- ============================================================

create table unit_type_events (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  unit_type_id  uuid not null references unit_types(id) on delete cascade,
  actor_id      uuid,            -- auth.uid(); null pentru scrieri de sistem
  actor_email   text,            -- snapshot la momentul acțiunii
  event_type    text not null,   -- 'created','updated','archived','restored'
  old_data      jsonb,
  new_data      jsonb,
  created_at    timestamptz not null default now()
);
create index unit_type_events_type_idx on unit_type_events (unit_type_id, created_at);
alter table unit_type_events enable row level security;

create policy unit_type_events_select on unit_type_events for select to authenticated
  using (app.can_access_property(
    (select property_id from unit_types where id = unit_type_id)
  ));
-- scrisul e exclusiv prin trigger — niciun insert direct din app
revoke all on unit_type_events from anon;

-- trigger de audit: search_path = '' + nume calificate (vezi docs/backend/triggers.md)
create function app.audit_unit_type() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_event_type text;
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.unit_type_events (org_id, unit_type_id, actor_id, actor_email, event_type, new_data)
    values (new.org_id, new.id, auth.uid(), nullif(auth.jwt()->>'email', ''), 'created',
            jsonb_build_object('name', new.name, 'capacity', new.capacity, 'base_price', new.base_price));
    return new;
  end if;

  -- diff doar pe câmpurile relevante; un câmp nou auditat = un if în plus aici
  -- + o intrare în registrul TYPE_FIELDS din frontend (unit-type-history-dialog.tsx)
  if old.name <> new.name then
    v_old := v_old || jsonb_build_object('name', old.name);
    v_new := v_new || jsonb_build_object('name', new.name);
  end if;
  if old.capacity <> new.capacity then
    v_old := v_old || jsonb_build_object('capacity', old.capacity);
    v_new := v_new || jsonb_build_object('capacity', new.capacity);
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
    return new; -- nimic relevant de auditat
  end if;

  insert into public.unit_type_events (org_id, unit_type_id, actor_id, actor_email, event_type, old_data, new_data)
  values (new.org_id, new.id, auth.uid(), nullif(auth.jwt()->>'email', ''), v_event_type,
          nullif(v_old, '{}'::jsonb), nullif(v_new, '{}'::jsonb));

  return new;
end $$;

create trigger unit_types_audit
  after insert or update on unit_types
  for each row execute function app.audit_unit_type();
