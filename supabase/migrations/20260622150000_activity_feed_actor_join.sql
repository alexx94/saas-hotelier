-- ============================================================
-- Sprint 7.1.1 — get_activity_feed: rezolvare server-side a numelui actorului
--
--   Înainte: frontend-ul (activity-feed.tsx) făcea fetch la TOATĂ lista de
--   membri ai org-ului (useMembers) doar pentru a mapa email → full_name —
--   risipitor la scară (2000 hoteluri × 100-200 staff). În plus, booking_events
--   nu are deloc coloana actor_email, deci evenimentele de booking nu arătau
--   niciodată un nume de actor.
--
--   Acum: un singur LEFT JOIN pe public.profiles (PK indexată pe user_id) în
--   subquery-ul exterior `feed`, cu fallback la actor_email (snapshot la
--   momentul acțiunii) când nu există profil sau full_name e NULL. Acoperă
--   și booking_events, ai cărui actor_id e rezolvat acum prin profiles.
-- ============================================================

drop function if exists public.get_activity_feed(uuid, int, int, text[], text[], timestamptz, timestamptz);

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
  actor_name  text,
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
         feed.actor_id, feed.actor_email, coalesce(p.full_name, feed.actor_email) as actor_name,
         feed.event_type, feed.old_data, feed.new_data, feed.created_at
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
  left join public.profiles p on p.user_id = feed.actor_id
  order by feed.created_at desc, feed.id desc
  limit p_limit offset p_offset;
end $$;

revoke all on function public.get_activity_feed(uuid, int, int, text[], text[], timestamptz, timestamptz) from anon, public;
grant execute on function public.get_activity_feed(uuid, int, int, text[], text[], timestamptz, timestamptz) to authenticated;
