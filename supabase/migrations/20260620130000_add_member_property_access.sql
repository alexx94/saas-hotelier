-- ============================================================
-- add_member: selecție explicită de proprietăți la invitare
--
-- Înainte, accesul noului membru se deducea implicit: actor restrâns →
-- moștenea scope-ul actorului; actor nerestrâns → acces complet. Acum
-- invitarea poate cere EXPLICIT proprietățile (ca editorul de acces), cu
-- aceleași gărzi anti-escaladare ca `set_member_property_access`:
--   • „toate" (listă goală) = acces complet → permis doar dacă actorul nu e
--     restrâns la proprietăți;
--   • fiecare proprietate cerută trebuie să fie a org-ului (PROPERTY_ORG_MISMATCH)
--     ȘI accesibilă actorului (PROPERTY_FORBIDDEN) — nu poți „hardcoda" acces la
--     o proprietate la care nici tu nu ai acces.
--
-- p_property_ids IS NULL = comportamentul vechi (moștenire/complet), păstrat
-- pentru apelanții cu 3 argumente. Param nou cu default ⇒ DROP întâi funcția
-- veche (altfel apel ambiguu — vezi capcana documentată).
-- ============================================================

drop function if exists public.add_member(uuid, text, uuid[]);

create function public.add_member(
  p_org_id uuid, p_email text, p_role_ids uuid[], p_property_ids uuid[] default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_member_id uuid;
  v_role uuid;
  v_prop uuid;
begin
  if not app.has_permission(p_org_id, null, 'user.manage') then raise exception 'FORBIDDEN'; end if;
  if not app.can_grant_roles(p_org_id, p_role_ids) then raise exception 'ROLE_EXCEEDS_YOURS'; end if;
  if not app.user_covers_roles(p_org_id, p_role_ids) then raise exception 'INSUFFICIENT_GRANT'; end if;

  select id into v_uid from auth.users where lower(email) = lower(trim(p_email));
  if v_uid is null then raise exception 'USER_NOT_FOUND'; end if;
  if exists (select 1 from public.organization_members where org_id = p_org_id and user_id = v_uid) then
    raise exception 'ALREADY_MEMBER';
  end if;

  insert into public.organization_members (org_id, user_id, role)
  values (p_org_id, v_uid, 'staff') returning id into v_member_id;
  delete from public.member_roles where member_id = v_member_id;
  foreach v_role in array coalesce(p_role_ids, '{}') loop
    insert into public.member_roles (member_id, role_id) values (v_member_id, v_role);
  end loop;

  if p_property_ids is null then
    -- DEFAULT (fără selecție explicită): actor restrâns → moștenește exact scope-ul
    -- lui (altfel ar acorda acces complet = bypass); actor nerestrâns → fără rânduri
    -- mpa = acces la toate proprietățile org-ului.
    if app.actor_property_restricted(p_org_id) then
      insert into public.member_property_access (member_id, property_id)
        select v_member_id, ampa.property_id
        from public.organization_members am
        join public.member_property_access ampa on ampa.member_id = am.id
        where am.org_id = p_org_id and am.user_id = auth.uid();
    end if;
  else
    -- SELECȚIE EXPLICITĂ (aceleași reguli ca set_member_property_access):
    --  „toate" (listă goală) = acces complet → doar dacă actorul nu e restrâns
    if cardinality(p_property_ids) = 0 and app.actor_property_restricted(p_org_id) then
      raise exception 'PROPERTY_FORBIDDEN';
    end if;
    if exists (
      select 1 from unnest(p_property_ids) pid
      where not exists (select 1 from public.properties p where p.id = pid and p.org_id = p_org_id)
    ) then raise exception 'PROPERTY_ORG_MISMATCH'; end if;
    if exists (
      select 1 from unnest(p_property_ids) pid where not app.can_access_property(pid)
    ) then raise exception 'PROPERTY_FORBIDDEN'; end if;

    foreach v_prop in array p_property_ids loop
      insert into public.member_property_access (member_id, property_id) values (v_member_id, v_prop);
    end loop;
  end if;

  return v_member_id;
end $$;
revoke execute on function public.add_member(uuid,text,uuid[],uuid[]) from anon, public;
grant execute on function public.add_member(uuid,text,uuid[],uuid[]) to authenticated;
