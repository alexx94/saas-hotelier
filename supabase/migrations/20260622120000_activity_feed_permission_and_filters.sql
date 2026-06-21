-- ============================================================
-- Sprint 7.1 — permisiune audit.view pe entity_events/get_activity_feed +
--              filtre (entity_type, event_type, interval dată) + index compus
--
--   audit.view exista deja din Sprint 6.1 (rbac_foundation), acordată
--   structural owner-ului și rolului ADMIN, exclusă explicit din MANAGER și
--   din rolurile custom (is_elevated) — dar nu era verificată nicăieri încă.
--   Refolosim app.has_permission, același pattern ca la payment.refund/
--   pricing.edit/etc. — nicio permisiune nouă, doar cablarea celei existente.
--
--   Filtrele sunt împinse în interiorul fiecărei ramuri UNION ALL (nu în
--   WHERE-ul exterior), ca planner-ul să poată folosi indexul pe fiecare
--   tabel sursă în loc să materializeze tot feed-ul înainte de filtrare.
-- ============================================================

-- ============ 1. entity_events: select gated pe audit.view ============

drop policy if exists entity_events_select on entity_events;
create policy entity_events_select on entity_events for select to authenticated
  using (app.has_permission(org_id, property_id, 'audit.view'));

-- ============ 2. Index compus pentru filtrare eficientă pe tip ============
-- (property_id, created_at) deja exista (entity_events_property_idx) — pentru
-- filtrarea pe entity_type (cea mai frecventă din UI) adăugăm un compus dedicat.

create index entity_events_property_type_idx
  on entity_events (property_id, entity_type, created_at desc);

-- ============ 3. get_activity_feed: permisiune + filtre ============

drop function if exists public.get_activity_feed(uuid, int, int);

create function public.get_activity_feed(
  p_property_id   uuid,
  p_limit         int default 21,
  p_offset        int default 0,
  p_entity_types  text[] default null,
  p_event_types   text[] default null,
  p_date_from     timestamptz default null,
  p_date_to       timestamptz default null
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
  if v_org_id is null or not app.has_permission(v_org_id, p_property_id, 'audit.view') then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select feed.id, feed.org_id, feed.property_id, feed.entity_type, feed.entity_id,
         feed.actor_id, feed.actor_email, feed.event_type, feed.old_data, feed.new_data,
         feed.created_at
  from (
    -- filtru per ramură (entity_type fix => skip ieftin de tot dacă nu e cerut),
    -- + property_id/event_type/interval împinse pe coloana indexată a tabelului sursă
    select ue.id, ue.org_id, u.property_id, 'unit'::text as entity_type, ue.unit_id as entity_id,
           ue.actor_id, ue.actor_email, ue.event_type, ue.old_data, ue.new_data, ue.created_at
    from public.unit_events ue
    join public.units u on u.id = ue.unit_id
    where u.property_id = p_property_id
      and (p_entity_types is null or 'unit' = any(p_entity_types))
      and (p_event_types is null or ue.event_type = any(p_event_types))
      and (p_date_from is null or ue.created_at >= p_date_from)
      and (p_date_to is null or ue.created_at <= p_date_to)

    union all
    select ute.id, ute.org_id, t.property_id, 'unit_type', ute.unit_type_id,
           ute.actor_id, ute.actor_email, ute.event_type, ute.old_data, ute.new_data, ute.created_at
    from public.unit_type_events ute
    join public.unit_types t on t.id = ute.unit_type_id
    where t.property_id = p_property_id
      and (p_entity_types is null or 'unit_type' = any(p_entity_types))
      and (p_event_types is null or ute.event_type = any(p_event_types))
      and (p_date_from is null or ute.created_at >= p_date_from)
      and (p_date_to is null or ute.created_at <= p_date_to)

    union all
    select be.id, be.org_id, b.property_id, 'booking', be.booking_id,
           be.actor_id, null::text, be.event_type, be.old_data, be.new_data, be.created_at
    from public.booking_events be
    join public.bookings b on b.id = be.booking_id
    where b.property_id = p_property_id
      and (p_entity_types is null or 'booking' = any(p_entity_types))
      and (p_event_types is null or be.event_type = any(p_event_types))
      and (p_date_from is null or be.created_at >= p_date_from)
      and (p_date_to is null or be.created_at <= p_date_to)

    union all
    select ee.id, ee.org_id, ee.property_id, ee.entity_type, ee.entity_id,
           ee.actor_id, ee.actor_email, ee.event_type, ee.old_data, ee.new_data, ee.created_at
    from public.entity_events ee
    where ee.property_id = p_property_id
      and (p_entity_types is null or ee.entity_type = any(p_entity_types))
      and (p_event_types is null or ee.event_type = any(p_event_types))
      and (p_date_from is null or ee.created_at >= p_date_from)
      and (p_date_to is null or ee.created_at <= p_date_to)
  ) feed
  order by feed.created_at desc, feed.id desc
  limit p_limit offset p_offset;
end $$;

revoke all on function public.get_activity_feed(uuid, int, int, text[], text[], timestamptz, timestamptz) from anon, public;
grant execute on function public.get_activity_feed(uuid, int, int, text[], text[], timestamptz, timestamptz) to authenticated;
