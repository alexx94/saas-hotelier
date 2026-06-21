-- ============================================================
-- Sprint 7 — Audit & Event System (extindere)
--
--   Tabelele de audit existente (unit_events, unit_type_events,
--   booking_events) acoperă camere/tipuri/rezervări cu un trigger dedicat
--   per entitate. Extindem acoperirea la tarife/oferte/proprietăți/oaspeți/
--   plăți/blocaje/reguli de rezervare, dar de-acum cu UN SINGUR tabel +
--   UN SINGUR trigger generic — adăugarea unei entități noi pe viitor
--   înseamnă o linie de CREATE TRIGGER, nu un tabel + trigger nou.
--
--   Tabel: entity_events (org_id, property_id opțional, entity_type,
--   entity_id, actor, event_type, old_data, new_data). Diff-ul se face
--   generic pe to_jsonb(OLD/NEW) minus coloanele tehnice excluse (id,
--   org_id, property_id, created_at/updated_at) — afișarea rămâne pe
--   același principiu ca EventDiff: câmp nou auditat = o intrare în
--   registrul de câmpuri din frontend, fără logică nouă pe server.
--
--   RPC public.get_activity_feed: feed unificat per proprietate, UNION
--   peste entity_events + booking_events + unit_events + unit_type_events.
-- ============================================================

-- ============ 1. Tabel entity_events ============

create table entity_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  property_id uuid references properties(id) on delete cascade,  -- null = entitate org-wide (guest)
  entity_type text not null,   -- 'property','guest','payment','rate_rule','promotion',
                                -- 'room_block','stay_rule','arrival_rule','closure'
  entity_id   uuid not null,
  actor_id    uuid,            -- auth.uid(); null pentru scrieri de sistem
  actor_email text,            -- snapshot la momentul acțiunii
  event_type  text not null,   -- 'created','updated','archived','restored','deleted'
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);
create index entity_events_entity_idx on entity_events (entity_type, entity_id, created_at);
create index entity_events_property_idx on entity_events (property_id, created_at);
create index entity_events_org_idx on entity_events (org_id, created_at);

alter table entity_events enable row level security;
revoke all on entity_events from anon;

create policy entity_events_select on entity_events for select to authenticated
  using (
    case
      when property_id is not null then app.can_access_property_row(org_id, property_id)
      else org_id in (select app.user_org_ids())
    end
  );
-- scrisul e exclusiv prin trigger — niciun insert direct din app

-- ============ 2. Trigger generic de audit ============
-- tg_argv[0] = entity_type
-- tg_argv[1] = nume coloană boolean „activ" (gol = entitatea nu are stare arhivare)
-- tg_argv[2] = listă coloane tehnice excluse din diff, ca literal text[] ('{id,org_id,...}')

create function app.audit_entity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_entity_type text := tg_argv[0];
  v_active_col  text := nullif(tg_argv[1], '');
  v_excluded    text[] := tg_argv[2]::text[];
  v_org_id      uuid;
  v_property_id uuid;
  v_entity_id   uuid;
  v_event_type  text;
  v_old         jsonb;
  v_new         jsonb;
  v_row         jsonb;
begin
  if tg_op = 'DELETE' then
    v_org_id := old.org_id;
    v_entity_id := old.id;
    v_old := to_jsonb(old) - v_excluded;
    v_new := null;
    v_event_type := 'deleted';
    v_row := to_jsonb(old);
  elsif tg_op = 'INSERT' then
    v_org_id := new.org_id;
    v_entity_id := new.id;
    v_old := null;
    v_new := to_jsonb(new) - v_excluded;
    v_event_type := 'created';
    v_row := to_jsonb(new);
  else
    v_org_id := new.org_id;
    v_entity_id := new.id;
    v_old := to_jsonb(old) - v_excluded;
    v_new := to_jsonb(new) - v_excluded;
    if v_old = v_new then
      return new;  -- nimic relevant (ex: doar updated_at recalculat de sistem)
    end if;
    if v_active_col is not null
       and (to_jsonb(old)->>v_active_col) is distinct from (to_jsonb(new)->>v_active_col) then
      v_event_type := case when to_jsonb(new)->>v_active_col = 'false' then 'archived' else 'restored' end;
    else
      v_event_type := 'updated';
    end if;
    v_row := to_jsonb(new);
  end if;

  -- property_id: proprietatea însăși e auto-referențială; restul îl citesc din coloana
  -- property_id dacă există pe tabel; rămâne null pentru entități org-wide (ex. guest)
  if v_entity_type = 'property' then
    v_property_id := v_entity_id;
  else
    v_property_id := (v_row->>'property_id')::uuid;
  end if;

  insert into public.entity_events
    (org_id, property_id, entity_type, entity_id, actor_id, actor_email, event_type, old_data, new_data)
  values
    (v_org_id, v_property_id, v_entity_type, v_entity_id, auth.uid(), nullif(auth.jwt()->>'email', ''),
     v_event_type, v_old, v_new);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- ============ 3. Triggere per entitate ============

create trigger properties_audit
  after insert or update or delete on properties
  for each row execute function app.audit_entity('property', '', '{id,org_id,created_at}');

create trigger guests_audit
  after insert or update or delete on guests
  for each row execute function app.audit_entity('guest', '', '{id,org_id,created_at}');

-- plăți: doar create/delete (corecție) — fără update direct, e un ledger
create trigger payments_audit
  after insert or delete on payments
  for each row execute function app.audit_entity(
    'payment', '', '{id,org_id,property_id,booking_id,recorded_by,created_at}'
  );

create trigger rate_rules_audit
  after insert or update or delete on rate_rules
  for each row execute function app.audit_entity(
    'rate_rule', '', '{id,org_id,property_id,created_at,updated_at}'
  );

create trigger promotions_audit
  after insert or update or delete on promotions
  for each row execute function app.audit_entity(
    'promotion', 'is_active', '{id,org_id,property_id,created_at,updated_at,uses_count}'
  );

-- room_blocks: audit deja existent (trigger room_blocks_audit din migrația 18,
-- scrie în unit_events ca block_created/block_updated/block_removed) — nu duplicăm

create trigger stay_rules_audit
  after insert or update or delete on stay_rules
  for each row execute function app.audit_entity('stay_rule', '', '{id,org_id,property_id,created_at,updated_at}');

-- arrival_rules: doar create/delete (fără update în UI)
create trigger arrival_rules_audit
  after insert or delete on arrival_rules
  for each row execute function app.audit_entity('arrival_rule', '', '{id,org_id,property_id,created_at,updated_at}');

-- closures: doar create/delete (fără update în UI)
create trigger closures_audit
  after insert or delete on closures
  for each row execute function app.audit_entity(
    'closure', '', '{id,org_id,property_id,period,created_by,created_at,updated_at}'
  );

-- ============ 4. RPC: feed unificat de activitate, per proprietate ============
-- Union peste toate cele 4 tabele de audit. Autorizare explicită (security
-- definer rulează cu RLS bypass) înainte de orice citire.

create function public.get_activity_feed(
  p_property_id uuid,
  p_limit       int default 21,
  p_offset      int default 0
) returns table (
  id          uuid,
  org_id      uuid,
  property_id uuid,
  entity_type text,
  entity_id   uuid,
  actor_id    uuid,
  actor_email text,
  event_type  text,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare
  v_org_id uuid;
begin
  select p.org_id into v_org_id from public.properties p where p.id = p_property_id;
  if v_org_id is null or not app.can_access_property_row(v_org_id, p_property_id) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select feed.id, feed.org_id, feed.property_id, feed.entity_type, feed.entity_id,
         feed.actor_id, feed.actor_email, feed.event_type, feed.old_data, feed.new_data,
         feed.created_at
  from (
    select ue.id, ue.org_id, u.property_id, 'unit'::text as entity_type, ue.unit_id as entity_id,
           ue.actor_id, ue.actor_email, ue.event_type, ue.old_data, ue.new_data, ue.created_at
    from public.unit_events ue
    join public.units u on u.id = ue.unit_id

    union all
    select ute.id, ute.org_id, t.property_id, 'unit_type', ute.unit_type_id,
           ute.actor_id, ute.actor_email, ute.event_type, ute.old_data, ute.new_data, ute.created_at
    from public.unit_type_events ute
    join public.unit_types t on t.id = ute.unit_type_id

    union all
    select be.id, be.org_id, b.property_id, 'booking', be.booking_id,
           be.actor_id, null::text, be.event_type, be.old_data, be.new_data, be.created_at
    from public.booking_events be
    join public.bookings b on b.id = be.booking_id

    union all
    select ee.id, ee.org_id, ee.property_id, ee.entity_type, ee.entity_id,
           ee.actor_id, ee.actor_email, ee.event_type, ee.old_data, ee.new_data, ee.created_at
    from public.entity_events ee
  ) feed
  where feed.property_id = p_property_id
  order by feed.created_at desc, feed.id desc
  limit p_limit offset p_offset;
end $$;

revoke all on function public.get_activity_feed from anon, public;
grant execute on function public.get_activity_feed to authenticated;
