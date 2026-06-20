-- ============================================================
-- Sprint 6.3 — Member Management, Custom Roles & Profiles
--
-- Partea vizibilă a RBAC: identitate de user (profiles), management de membri
-- (adăugare cont existent după email, roluri multiple, acces per-proprietate,
-- transfer ownership) și editor de roluri custom.
--
-- Separarea actorilor (vezi docs/backend/rbac.md §1): add_member operează DOAR
-- pe lane-ul staff (organization_members). Nu citește/scrie niciodată `guests`.
-- O persoană poate fi guest la altă org și staff aici, fără suprapunere.
--
-- Toate RPC-urile sunt DEFINER cu autorizare explicită pe permisiuni
-- (user.manage / role.manage) sau pe owner structural (transfer_ownership).
-- ============================================================

-- ============ 1. profiles (identitate partajată staff+guest) ============

create table profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;
revoke all on profiles from anon;
grant select, update on profiles to authenticated;

-- văd profilul meu sau al unui coleg de organizație (pt. liste de membri)
create function app.shares_org(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.organization_members m1
    join public.organization_members m2 on m2.org_id = m1.org_id
    where m1.user_id = auth.uid() and m2.user_id = p_user_id
  );
$$;

create policy profiles_select on profiles for select to authenticated
  using (user_id = auth.uid() or app.shares_org(user_id));
create policy profiles_update on profiles for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- profil creat automat la signup (full_name din metadata, dacă există)
create function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, full_name)
  values (new.id, nullif(new.raw_user_meta_data->>'full_name', ''))
  on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- backfill userii existenți
insert into profiles (user_id, full_name)
  select id, nullif(raw_user_meta_data->>'full_name', '') from auth.users
  on conflict (user_id) do nothing;

-- ============ 2. management membri (DEFINER, gate user.manage) ============

-- atașează un CONT EXISTENT (după email) ca membru staff + setează rolurile.
-- Conturile noi (token/email) vin în 6.4. Lane staff — nu atinge `guests`.
create function public.add_member(p_org_id uuid, p_email text, p_role_ids uuid[])
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_member_id uuid;
  v_role uuid;
begin
  if not app.has_permission(p_org_id, null, 'user.manage') then raise exception 'FORBIDDEN'; end if;

  select id into v_uid from auth.users where lower(email) = lower(trim(p_email));
  if v_uid is null then raise exception 'USER_NOT_FOUND'; end if;
  if exists (select 1 from public.organization_members
             where org_id = p_org_id and user_id = v_uid) then
    raise exception 'ALREADY_MEMBER';
  end if;

  -- enum legacy = staff (triggerul seedează Reception); apoi punem rolurile cerute
  insert into public.organization_members (org_id, user_id, role)
  values (p_org_id, v_uid, 'staff') returning id into v_member_id;

  delete from public.member_roles where member_id = v_member_id;
  foreach v_role in array coalesce(p_role_ids, '{}') loop
    insert into public.member_roles (member_id, role_id) values (v_member_id, v_role);
  end loop;

  return v_member_id;
end $$;
revoke execute on function public.add_member(uuid,text,uuid[]) from anon, public;
grant execute on function public.add_member(uuid,text,uuid[]) to authenticated;

-- înlocuiește complet rolurile unui membru
create function public.set_member_roles(p_member_id uuid, p_role_ids uuid[])
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_role uuid;
begin
  select org_id into v_org from public.organization_members where id = p_member_id;
  if v_org is null then raise exception 'MEMBER_NOT_FOUND'; end if;
  if not app.has_permission(v_org, null, 'user.manage') then raise exception 'FORBIDDEN'; end if;

  delete from public.member_roles where member_id = p_member_id;
  foreach v_role in array coalesce(p_role_ids, '{}') loop
    insert into public.member_roles (member_id, role_id) values (p_member_id, v_role);
  end loop;
end $$;
revoke execute on function public.set_member_roles(uuid,uuid[]) from anon, public;
grant execute on function public.set_member_roles(uuid,uuid[]) to authenticated;

-- înlocuiește accesul per-proprietate (gol = toate proprietățile org-ului)
create function public.set_member_property_access(p_member_id uuid, p_property_ids uuid[])
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_prop uuid;
begin
  select org_id into v_org from public.organization_members where id = p_member_id;
  if v_org is null then raise exception 'MEMBER_NOT_FOUND'; end if;
  if not app.has_permission(v_org, null, 'user.manage') then raise exception 'FORBIDDEN'; end if;

  -- proprietățile trebuie să fie ale aceleiași organizații
  if exists (
    select 1 from unnest(coalesce(p_property_ids, '{}')) pid
    where not exists (select 1 from public.properties p where p.id = pid and p.org_id = v_org)
  ) then
    raise exception 'PROPERTY_ORG_MISMATCH';
  end if;

  delete from public.member_property_access where member_id = p_member_id;
  foreach v_prop in array coalesce(p_property_ids, '{}') loop
    insert into public.member_property_access (member_id, property_id) values (p_member_id, v_prop);
  end loop;
end $$;
revoke execute on function public.set_member_property_access(uuid,uuid[]) from anon, public;
grant execute on function public.set_member_property_access(uuid,uuid[]) to authenticated;

-- elimină un membru (nu owner-ul structural)
create function public.remove_member(p_member_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_uid uuid;
begin
  select org_id, user_id into v_org, v_uid
  from public.organization_members where id = p_member_id;
  if v_org is null then raise exception 'MEMBER_NOT_FOUND'; end if;
  if not app.has_permission(v_org, null, 'user.manage') then raise exception 'FORBIDDEN'; end if;
  if v_uid = (select owner_user_id from public.organizations where id = v_org) then
    raise exception 'CANNOT_REMOVE_OWNER';
  end if;

  delete from public.organization_members where id = p_member_id;  -- cascade member_roles/access
end $$;
revoke execute on function public.remove_member(uuid) from anon, public;
grant execute on function public.remove_member(uuid) to authenticated;

-- transfer ownership: doar owner-ul curent; ținta = membru existent
create function public.transfer_ownership(p_org_id uuid, p_new_user_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_member_id uuid;
  v_admin uuid;
begin
  if (select owner_user_id from public.organizations where id = p_org_id) is distinct from auth.uid() then
    raise exception 'FORBIDDEN';
  end if;
  if p_new_user_id = auth.uid() then raise exception 'ALREADY_OWNER'; end if;

  select id into v_member_id from public.organization_members
  where org_id = p_org_id and user_id = p_new_user_id;
  if v_member_id is null then raise exception 'NOT_A_MEMBER'; end if;

  update public.organizations set owner_user_id = p_new_user_id where id = p_org_id;

  -- noul owner primește rolul Administrator (acces complet)
  select id into v_admin from public.roles where slug = 'administrator' and org_id is null;
  insert into public.member_roles (member_id, role_id)
  values (v_member_id, v_admin) on conflict do nothing;
end $$;
revoke execute on function public.transfer_ownership(uuid,uuid) from anon, public;
grant execute on function public.transfer_ownership(uuid,uuid) to authenticated;

-- ============ 3. roluri custom (DEFINER, gate role.manage) ============

create function public.create_role(p_org_id uuid, p_name text, p_permission_keys text[])
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_role_id uuid;
  v_slug text;
  v_key text;
begin
  if not app.has_permission(p_org_id, null, 'role.manage') then raise exception 'FORBIDDEN'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'NAME_REQUIRED'; end if;

  v_slug := regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then v_slug := 'rol'; end if;

  begin
    insert into public.roles (org_id, slug, name, is_system)
    values (p_org_id, v_slug, trim(p_name), false) returning id into v_role_id;
  exception when unique_violation then
    raise exception 'ROLE_EXISTS';
  end;

  foreach v_key in array coalesce(p_permission_keys, '{}') loop
    insert into public.role_permissions (role_id, permission_key) values (v_role_id, v_key);
  end loop;

  return v_role_id;
end $$;
revoke execute on function public.create_role(uuid,text,text[]) from anon, public;
grant execute on function public.create_role(uuid,text,text[]) to authenticated;

create function public.update_role(p_role_id uuid, p_name text, p_permission_keys text[])
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_role record;
  v_key text;
begin
  select * into v_role from public.roles where id = p_role_id;
  if v_role is null then raise exception 'ROLE_NOT_FOUND'; end if;
  if v_role.is_system or v_role.org_id is null then raise exception 'ROLE_IS_SYSTEM'; end if;
  if not app.has_permission(v_role.org_id, null, 'role.manage') then raise exception 'FORBIDDEN'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'NAME_REQUIRED'; end if;

  update public.roles set name = trim(p_name) where id = p_role_id;
  delete from public.role_permissions where role_id = p_role_id;
  foreach v_key in array coalesce(p_permission_keys, '{}') loop
    insert into public.role_permissions (role_id, permission_key) values (p_role_id, v_key);
  end loop;
end $$;
revoke execute on function public.update_role(uuid,text,text[]) from anon, public;
grant execute on function public.update_role(uuid,text,text[]) to authenticated;

create function public.delete_role(p_role_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_role record;
begin
  select * into v_role from public.roles where id = p_role_id;
  if v_role is null then raise exception 'ROLE_NOT_FOUND'; end if;
  if v_role.is_system or v_role.org_id is null then raise exception 'ROLE_IS_SYSTEM'; end if;
  if not app.has_permission(v_role.org_id, null, 'role.manage') then raise exception 'FORBIDDEN'; end if;

  delete from public.roles where id = p_role_id;  -- cascade role_permissions + member_roles
end $$;
revoke execute on function public.delete_role(uuid) from anon, public;
grant execute on function public.delete_role(uuid) to authenticated;

-- ============ 4. citire pentru UI: lista membrilor cu nume/email ============

create function public.get_org_members(p_org_id uuid)
returns table (
  member_id    uuid,
  user_id      uuid,
  email        text,
  full_name    text,
  is_owner     boolean,
  role_ids     uuid[],
  property_ids uuid[]
)
language sql stable security definer set search_path = '' as $$
  select
    m.id,
    m.user_id,
    u.email::text,
    pr.full_name,
    (m.user_id = o.owner_user_id),
    coalesce((select array_agg(mr.role_id) from public.member_roles mr where mr.member_id = m.id), '{}'),
    coalesce((select array_agg(mpa.property_id) from public.member_property_access mpa
              where mpa.member_id = m.id), '{}')
  from public.organization_members m
  join public.organizations o on o.id = m.org_id
  left join auth.users u on u.id = m.user_id
  left join public.profiles pr on pr.user_id = m.user_id
  where m.org_id = p_org_id
    and p_org_id in (select app.user_org_ids())   -- doar membrii org-ului văd echipa
  order by (m.user_id = o.owner_user_id) desc, pr.full_name nulls last, u.email;
$$;
revoke execute on function public.get_org_members(uuid) from anon, public;
grant execute on function public.get_org_members(uuid) to authenticated;
