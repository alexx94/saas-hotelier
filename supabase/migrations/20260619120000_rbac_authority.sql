-- ============================================================
-- Sprint 6.3.2 — Autoritate prin permisiuni „elevate" + tier-uri
--
-- Autoritatea (cine pe cine gestionează) NU mai e „cine are mai multe
-- permisiuni" (ambiguu) și nici ranguri numerice pe roluri (strică rolurile
-- custom). Vine dintr-un set FIX de permisiuni ELEVATE (control peste
-- utilizatori/organizație). Rolurile custom nu pot conține permisiuni elevate
-- → sunt mereu „de bază" (tier 0), deci nu există ambiguitate „rol X peste Y".
--
-- Tier:  OWNER(3, owner_user_id structural)  >  ADMIN(2, are role.manage)
--      >  MANAGER(1, are user.manage)        >  BASE(0)
--
-- Reguli: gestionezi doar tier STRICT mai mic; acorzi doar roluri de tier mai
-- mic; manager doar în proprietățile la care are acces; rolurile custom forțat
-- de bază; acces la proprietăți doar cât ai și tu.
-- ============================================================

-- ============ 1. permisiuni elevate ============
alter table permissions add column is_elevated boolean not null default false;
update permissions set is_elevated = true
  where key in ('user.invite','user.manage','role.manage',
                'organization.edit','organization.billing','audit.view');

-- ============ 2. helperi de tier/autoritate ============

-- tier-ul implicat de un set de chei de permisiuni
create function app.tier_of_keys(p_keys text[]) returns int
language sql immutable set search_path = '' as $$
  select case
    when 'role.manage' = any(p_keys) then 2
    when 'user.manage' = any(p_keys) then 1
    else 0
  end;
$$;

-- tier-ul unui rol (din permisiunile lui)
create function app.role_tier(p_role_id uuid) returns int
language sql stable security definer set search_path = '' as $$
  select app.tier_of_keys(coalesce(
    (select array_agg(permission_key) from public.role_permissions where role_id = p_role_id),
    '{}'::text[]));
$$;

-- tier-ul max al unei liste de roluri
create function app.roles_tier(p_role_ids uuid[]) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select max(app.role_tier(rid))
                   from unnest(coalesce(p_role_ids,'{}'::uuid[])) rid), 0);
$$;

-- tier-ul unui membru (owner structural = 3)
create function app.member_tier(p_member_id uuid) returns int
language plpgsql stable security definer set search_path = '' as $$
declare v_keys text[]; v_is_owner boolean;
begin
  select (o.owner_user_id = m.user_id) into v_is_owner
  from public.organization_members m
  join public.organizations o on o.id = m.org_id
  where m.id = p_member_id;
  if v_is_owner then return 3; end if;

  select coalesce(array_agg(rp.permission_key), '{}') into v_keys
  from public.member_roles mr
  join public.role_permissions rp on rp.role_id = mr.role_id
  where mr.member_id = p_member_id;
  return app.tier_of_keys(v_keys);
end $$;

-- tier-ul actorului curent în organizație
create function app.actor_tier(p_org_id uuid) returns int
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.organizations o
                 where o.id = p_org_id and o.owner_user_id = auth.uid()) then 3
    when 'role.manage' in (select app.user_permissions(p_org_id)) then 2
    when 'user.manage' in (select app.user_permissions(p_org_id)) then 1
    else 0
  end;
$$;

-- pot acorda rolurile? (fiecare tier < tier-ul meu)
create function app.can_grant_roles(p_org_id uuid, p_role_ids uuid[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from unnest(coalesce(p_role_ids,'{}'::uuid[])) rid
    where app.role_tier(rid) >= app.actor_tier(p_org_id)
  );
$$;

-- pot gestiona membrul? (user.manage + tier strict mai mare + proprietăți)
create function app.can_manage_member(p_member_id uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_at int; v_tt int;
begin
  select org_id into v_org from public.organization_members where id = p_member_id;
  if v_org is null then return false; end if;
  if not app.has_permission(v_org, null, 'user.manage') then return false; end if;
  v_at := app.actor_tier(v_org);
  v_tt := app.member_tier(p_member_id);
  if v_at <= v_tt then return false; end if;
  -- manager (tier 1, non-admin): poate gestiona DOAR ținte explicit restrânse la
  -- proprietăți pe care le are și el. O țintă cu acces complet (fără restricții)
  -- vede proprietăți pe care managerul nu le are → doar admin/owner o gestionează.
  if v_at < 2 then
    if not exists (select 1 from public.member_property_access
                   where member_id = p_member_id) then
      return false;
    end if;
    if exists (select 1 from public.member_property_access mpa
               where mpa.member_id = p_member_id
                 and not app.can_access_property(mpa.property_id)) then
      return false;
    end if;
  end if;
  return true;
end $$;

-- actorul curent e restrâns la anumite proprietăți în org? (are rânduri mpa)
create function app.actor_property_restricted(p_org_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    join public.member_property_access a on a.member_id = m.id
    where m.org_id = p_org_id and m.user_id = auth.uid()
  );
$$;

-- ============ 3. recreare RPC-uri management cu tier-uri ============

create or replace function public.add_member(p_org_id uuid, p_email text, p_role_ids uuid[])
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_member_id uuid; v_role uuid;
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

  -- dacă actorul e RESTRÂNS la proprietăți, noul membru moștenește exact acel
  -- scope (altfel ar primi acces COMPLET implicit = bypass al restricției actorului)
  if app.actor_property_restricted(p_org_id) then
    insert into public.member_property_access (member_id, property_id)
      select v_member_id, ampa.property_id
      from public.organization_members am
      join public.member_property_access ampa on ampa.member_id = am.id
      where am.org_id = p_org_id and am.user_id = auth.uid();
  end if;

  return v_member_id;
end $$;

create or replace function public.set_member_roles(p_member_id uuid, p_role_ids uuid[])
returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_target uuid; v_role uuid;
begin
  select org_id, user_id into v_org, v_target
  from public.organization_members where id = p_member_id;
  if v_org is null then raise exception 'MEMBER_NOT_FOUND'; end if;
  if v_target = auth.uid() then raise exception 'CANNOT_EDIT_SELF'; end if;
  if not app.can_manage_member(p_member_id) then raise exception 'NOT_AUTHORIZED_OVER_MEMBER'; end if;
  if not app.can_grant_roles(v_org, p_role_ids) then raise exception 'ROLE_EXCEEDS_YOURS'; end if;
  if not app.user_covers_roles(v_org, p_role_ids) then raise exception 'INSUFFICIENT_GRANT'; end if;

  delete from public.member_roles where member_id = p_member_id;
  foreach v_role in array coalesce(p_role_ids, '{}') loop
    insert into public.member_roles (member_id, role_id) values (p_member_id, v_role);
  end loop;
end $$;

create or replace function public.set_member_property_access(p_member_id uuid, p_property_ids uuid[])
returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_target uuid; v_prop uuid;
begin
  select org_id, user_id into v_org, v_target
  from public.organization_members where id = p_member_id;
  if v_org is null then raise exception 'MEMBER_NOT_FOUND'; end if;
  if v_target = auth.uid() then raise exception 'CANNOT_EDIT_SELF'; end if;
  if not app.can_manage_member(p_member_id) then raise exception 'NOT_AUTHORIZED_OVER_MEMBER'; end if;

  -- „toate proprietățile" (listă goală) = acces complet → permis DOAR dacă
  -- actorul însuși are acces la toate (nu e restrâns). Altfel un admin restrâns
  -- ar putea acorda acces complet (bypass) selectând „toate".
  if cardinality(coalesce(p_property_ids, '{}')) = 0
     and app.actor_property_restricted(v_org) then
    raise exception 'PROPERTY_FORBIDDEN';
  end if;

  -- proprietățile trebuie să fie ale org-ului ȘI accesibile actorului
  if exists (
    select 1 from unnest(coalesce(p_property_ids, '{}')) pid
    where not exists (select 1 from public.properties p where p.id = pid and p.org_id = v_org)
  ) then raise exception 'PROPERTY_ORG_MISMATCH'; end if;
  if exists (
    select 1 from unnest(coalesce(p_property_ids, '{}')) pid
    where not app.can_access_property(pid)
  ) then raise exception 'PROPERTY_FORBIDDEN'; end if;

  delete from public.member_property_access where member_id = p_member_id;
  foreach v_prop in array coalesce(p_property_ids, '{}') loop
    insert into public.member_property_access (member_id, property_id) values (p_member_id, v_prop);
  end loop;
end $$;

create or replace function public.remove_member(p_member_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_uid uuid;
begin
  select org_id, user_id into v_org, v_uid
  from public.organization_members where id = p_member_id;
  if v_org is null then raise exception 'MEMBER_NOT_FOUND'; end if;
  if v_uid = auth.uid() then raise exception 'CANNOT_REMOVE_SELF'; end if;
  if v_uid = (select owner_user_id from public.organizations where id = v_org) then
    raise exception 'CANNOT_REMOVE_OWNER';
  end if;
  if not app.can_manage_member(p_member_id) then raise exception 'NOT_AUTHORIZED_OVER_MEMBER'; end if;

  delete from public.organization_members where id = p_member_id;
end $$;

-- ============ 4. roluri custom forțat de bază ============
-- gate pe user.manage (manager+ pot crea roluri DE BAZĂ); permisiunile elevate
-- sunt interzise în rolurile custom → nu se poate fabrica un rol cu putere de admin.

create or replace function public.create_role(p_org_id uuid, p_name text, p_permission_keys text[])
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_role_id uuid; v_slug text; v_key text;
begin
  if not app.has_permission(p_org_id, null, 'user.manage') then raise exception 'FORBIDDEN'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'NAME_REQUIRED'; end if;
  if exists (select 1 from public.permissions
             where key = any(coalesce(p_permission_keys,'{}')) and is_elevated) then
    raise exception 'ELEVATED_NOT_ALLOWED';
  end if;

  v_slug := trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then v_slug := 'rol'; end if;
  begin
    insert into public.roles (org_id, slug, name, is_system)
    values (p_org_id, v_slug, trim(p_name), false) returning id into v_role_id;
  exception when unique_violation then raise exception 'ROLE_EXISTS'; end;

  foreach v_key in array coalesce(p_permission_keys, '{}') loop
    insert into public.role_permissions (role_id, permission_key) values (v_role_id, v_key);
  end loop;
  return v_role_id;
end $$;

create or replace function public.update_role(p_role_id uuid, p_name text, p_permission_keys text[])
returns void
language plpgsql security definer set search_path = '' as $$
declare v_role record; v_key text;
begin
  select * into v_role from public.roles where id = p_role_id;
  if v_role is null then raise exception 'ROLE_NOT_FOUND'; end if;
  if v_role.is_system or v_role.org_id is null then raise exception 'ROLE_IS_SYSTEM'; end if;
  if not app.has_permission(v_role.org_id, null, 'user.manage') then raise exception 'FORBIDDEN'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'NAME_REQUIRED'; end if;
  if exists (select 1 from public.permissions
             where key = any(coalesce(p_permission_keys,'{}')) and is_elevated) then
    raise exception 'ELEVATED_NOT_ALLOWED';
  end if;

  update public.roles set name = trim(p_name) where id = p_role_id;
  delete from public.role_permissions where role_id = p_role_id;
  foreach v_key in array coalesce(p_permission_keys, '{}') loop
    insert into public.role_permissions (role_id, permission_key) values (p_role_id, v_key);
  end loop;
end $$;

create or replace function public.delete_role(p_role_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_role record;
begin
  select * into v_role from public.roles where id = p_role_id;
  if v_role is null then raise exception 'ROLE_NOT_FOUND'; end if;
  if v_role.is_system or v_role.org_id is null then raise exception 'ROLE_IS_SYSTEM'; end if;
  if not app.has_permission(v_role.org_id, null, 'user.manage') then raise exception 'FORBIDDEN'; end if;
  delete from public.roles where id = p_role_id;
end $$;

-- ============ 5. scoping vizibilitate proprietăți ============
-- un membru restrâns nici nu VEDE alte proprietăți (switcher/liste).
--
-- IMPORTANT: NU folosim can_access_property(id) aici — acela re-interoghează
-- tabelul `properties`, iar la INSERT...RETURNING (ce face PostgREST .insert()
-- .select()) rândul nou nu e încă vizibil funcției `stable` → ar bloca crearea.
-- Varianta pe coloanele rândului (org_id, id) evaluează corect pe NEW.
create function app.can_access_property_row(p_org_id uuid, p_property_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org_id and m.user_id = auth.uid()
      and (
        not exists (select 1 from public.member_property_access a where a.member_id = m.id)
        or exists (select 1 from public.member_property_access a
                   where a.member_id = m.id and a.property_id = p_property_id)
      )
  );
$$;

drop policy if exists properties_select on properties;
create policy properties_select on properties for select to authenticated
  using (app.can_access_property_row(org_id, id));
