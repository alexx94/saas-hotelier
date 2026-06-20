-- ============================================================
-- Sprint 6.3.1 — Gărzi anti-escaladare la management de membri
--
-- Repară două găuri din 6.3:
--  1. Escaladare de privilegii: cineva cu `user.manage` (ex. manager) putea
--     acorda roluri cu MAI MULTE permisiuni decât are el (ex. Administrator).
--     → regula „subset": poți acorda doar roluri ale căror permisiuni le deții
--     și tu (owner-ul le deține pe toate prin bypass).
--  2. Auto-degradare / auto-eliminare: un membru își putea schimba/șterge
--     singur rolurile. → nu îți poți edita propriile roluri și nu te poți
--     auto-elimina (altcineva cu user.manage o face).
-- ============================================================

-- true dacă userul curent deține TOATE permisiunile din rolurile date
create function app.user_covers_roles(p_org_id uuid, p_role_ids uuid[])
returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1
    from unnest(coalesce(p_role_ids, '{}'::uuid[])) rid
    join public.role_permissions rp on rp.role_id = rid
    where rp.permission_key not in (select app.user_permissions(p_org_id))
  );
$$;

-- ============ add_member — + regula subset ============
create or replace function public.add_member(p_org_id uuid, p_email text, p_role_ids uuid[])
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_member_id uuid;
  v_role uuid;
begin
  if not app.has_permission(p_org_id, null, 'user.manage') then raise exception 'FORBIDDEN'; end if;
  if not app.user_covers_roles(p_org_id, p_role_ids) then raise exception 'INSUFFICIENT_GRANT'; end if;

  select id into v_uid from auth.users where lower(email) = lower(trim(p_email));
  if v_uid is null then raise exception 'USER_NOT_FOUND'; end if;
  if exists (select 1 from public.organization_members
             where org_id = p_org_id and user_id = v_uid) then
    raise exception 'ALREADY_MEMBER';
  end if;

  insert into public.organization_members (org_id, user_id, role)
  values (p_org_id, v_uid, 'staff') returning id into v_member_id;

  delete from public.member_roles where member_id = v_member_id;
  foreach v_role in array coalesce(p_role_ids, '{}') loop
    insert into public.member_roles (member_id, role_id) values (v_member_id, v_role);
  end loop;

  return v_member_id;
end $$;

-- ============ set_member_roles — + subset + fără self-edit ============
create or replace function public.set_member_roles(p_member_id uuid, p_role_ids uuid[])
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_target uuid;
  v_role uuid;
begin
  select org_id, user_id into v_org, v_target
  from public.organization_members where id = p_member_id;
  if v_org is null then raise exception 'MEMBER_NOT_FOUND'; end if;
  if not app.has_permission(v_org, null, 'user.manage') then raise exception 'FORBIDDEN'; end if;
  if v_target = auth.uid() then raise exception 'CANNOT_EDIT_SELF'; end if;
  if not app.user_covers_roles(v_org, p_role_ids) then raise exception 'INSUFFICIENT_GRANT'; end if;

  delete from public.member_roles where member_id = p_member_id;
  foreach v_role in array coalesce(p_role_ids, '{}') loop
    insert into public.member_roles (member_id, role_id) values (p_member_id, v_role);
  end loop;
end $$;

-- ============ remove_member — + fără self-removal ============
create or replace function public.remove_member(p_member_id uuid)
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
  if v_uid = auth.uid() then raise exception 'CANNOT_REMOVE_SELF'; end if;
  if v_uid = (select owner_user_id from public.organizations where id = v_org) then
    raise exception 'CANNOT_REMOVE_OWNER';
  end if;

  delete from public.organization_members where id = p_member_id;
end $$;
