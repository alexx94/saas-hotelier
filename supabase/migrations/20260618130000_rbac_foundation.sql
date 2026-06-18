-- ============================================================
-- Sprint 6.1 — RBAC Foundation (fundație de date, FĂRĂ enforcement)
--
-- Transformă autorizarea din enum fix (organization_members.role) într-un
-- model RBAC scalabil: roluri → permisiuni granulare, multiple roluri per
-- membru (permisiunile se cumulează), roluri de sistem + spațiu pentru roluri
-- custom per organizație, owner structural separat (pt. transfer/billing).
--
-- ⚠️ ZERO schimbare de comportament: politicile RLS și RPC-urile existente
-- rămân pe enum + is_org_role. Helperii noi (has_permission/user_permissions)
-- sunt aditivi și NU sunt încă apelați de nimic — enforcement-ul vine în 6.2.
--
-- Tranziție fără atingerea codului existent: un trigger pe organization_members
-- sincronizează automat member_roles din enum (owner→Administrator etc.), deci
-- toate fluxurile actuale (create_organization, insert membri) populează noul
-- model singure. În 6.2/6.3, când managementul de roluri devine direct, triggerul
-- și enum-ul se retrag.
--
-- Separarea actorilor (scalabilitate viitoare — vezi docs/backend/rbac.md):
-- catalogul `permissions` și has_permission sunt EXCLUSIV pentru staff
-- (org-scoped). Conturile de oaspeți (self-service, viitor) vor fi un lane
-- separat bazat pe ownership (guests.user_id), niciodată permisiuni de staff.
-- ============================================================

-- ============ 1. owner structural pe organizație ============
-- separat de roluri: 1 owner/org, transferabil; baza pt. billing și
-- garda „cel puțin un owner" (6.3). Owner-ul bypass-ează permisiunile.

alter table organizations
  add column owner_user_id uuid references auth.users(id);

-- backfill din membrul owner curent (create_organization garantează unul).
-- Rămâne NULLABLE în 6.1: NOT NULL + garda „exact un owner" + transfer
-- ownership vin în 6.3 (când inserturile directe din seed/teste sunt înlocuite
-- de fluxuri controlate). Owner-ul are oricum toate permisiunile prin rolul
-- Administrator (vezi triggerul de sync), deci bypass-ul pe owner_user_id e o
-- comoditate structurală, nu singura cale.
update organizations o
set owner_user_id = (
  select user_id from organization_members m
  where m.org_id = o.id and m.role = 'owner'
  order by m.created_at limit 1
);

-- ============ 2. catalog de permisiuni (staff-domain) ============
-- cheie `domeniu.acțiune`; static, seed-only. Grupat ca la Mews
-- (front office / management / housekeeping / finance / administration).

create table permissions (
  key         text primary key,
  domain      text not null,
  description text not null,
  sort_order  int  not null default 0
);

insert into permissions (key, domain, description, sort_order) values
  -- rezervări
  ('booking.view',        'booking',  'Vizualizare rezervări', 10),
  ('booking.create',      'booking',  'Creare rezervări', 11),
  ('booking.edit',        'booking',  'Modificare rezervări (date, status)', 12),
  ('booking.cancel',      'booking',  'Anulare rezervări', 13),
  ('booking.move',        'booking',  'Mutare rezervare pe altă cameră', 14),
  -- calendar
  ('calendar.view',       'calendar', 'Vizualizare calendar', 20),
  -- oaspeți
  ('guest.view',          'guest',    'Vizualizare oaspeți', 30),
  ('guest.create',        'guest',    'Creare oaspeți', 31),
  ('guest.edit',          'guest',    'Modificare oaspeți', 32),
  ('guest.delete',        'guest',    'Ștergere oaspeți', 33),
  -- preț
  ('pricing.view',        'pricing',  'Vizualizare tarife', 40),
  ('pricing.edit',        'pricing',  'Configurare tarife/sezoane', 41),
  -- proprietăți & inventar
  ('property.view',       'property', 'Vizualizare proprietăți', 50),
  ('property.create',     'property', 'Creare proprietăți', 51),
  ('property.edit',       'property', 'Modificare proprietăți', 52),
  ('property.delete',     'property', 'Ștergere proprietăți', 53),
  ('unit.manage',         'property', 'Gestionare camere (status, blocaje)', 54),
  ('unit_type.manage',    'property', 'Gestionare tipuri de cameră', 55),
  -- finanțe
  ('payment.view',        'finance',  'Vizualizare plăți', 60),
  ('payment.record',      'finance',  'Înregistrare încasări', 61),
  ('payment.refund',      'finance',  'Rambursări', 62),
  ('revenue.view',        'finance',  'Vizualizare venit/rapoarte', 63),
  -- panou
  ('dashboard.view',      'dashboard','Vizualizare panou/analytics', 70),
  -- reguli comerciale
  ('promotion.manage',    'commercial','Gestionare promoții', 80),
  ('rules.manage',        'commercial','Gestionare reguli rezervare/restricții', 81),
  -- administrare
  ('user.invite',         'admin',    'Invitare utilizatori', 90),
  ('user.manage',         'admin',    'Gestionare membri (roluri, acces, eliminare)', 91),
  ('role.manage',         'admin',    'Creare/editare roluri custom', 92),
  ('organization.edit',   'admin',    'Editare setări organizație', 93),
  ('organization.billing','admin',    'Acces facturare/abonament', 94),
  ('audit.view',          'admin',    'Vizualizare jurnal de audit', 95);

-- ============ 3. roluri (sistem globale + custom per org) ============

create table roles (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references organizations(id) on delete cascade,  -- null = rol de sistem
  slug        text not null,
  name        text not null,
  description text,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now()
);
-- unicitate slug: globală pt. roluri de sistem, per-org pt. cele custom
create unique index roles_system_slug_idx on roles (slug) where org_id is null;
create unique index roles_org_slug_idx    on roles (org_id, slug) where org_id is not null;
create index roles_org_idx on roles (org_id);

create table role_permissions (
  role_id        uuid not null references roles(id) on delete cascade,
  permission_key text not null references permissions(key) on delete cascade,
  primary key (role_id, permission_key)
);

-- multiple roluri per membru → permisiunile se cumulează (union)
create table member_roles (
  member_id uuid not null references organization_members(id) on delete cascade,
  role_id   uuid not null references roles(id) on delete cascade,
  primary key (member_id, role_id)
);
create index member_roles_role_idx on member_roles (role_id);

-- ============ 4. seed roluri de sistem ============

insert into roles (slug, name, description, is_system) values
  ('administrator', 'Administrator', 'Acces complet (echivalent owner)', true),
  ('manager',       'Manager',       'Operațional complet + management utilizatori', true),
  ('reception',     'Recepție',      'Front office: rezervări, oaspeți, încasări', true),
  ('housekeeping',  'Housekeeping',  'Curățenie: calendar și status camere', true),
  ('finance',       'Finanțe',       'Plăți, rambursări, rapoarte de venit', true),
  ('readonly',      'Doar citire',   'Vizualizare, fără modificări', true);

-- administrator = toate permisiunile
insert into role_permissions (role_id, permission_key)
  select r.id, p.key from roles r cross join permissions p
  where r.slug = 'administrator' and r.org_id is null;

-- manager = tot, mai puțin facturarea, managementul de roluri și ștergerea de proprietăți
insert into role_permissions (role_id, permission_key)
  select r.id, p.key from roles r cross join permissions p
  where r.slug = 'manager' and r.org_id is null
    and p.key not in ('organization.billing', 'role.manage', 'property.delete');

-- reception = front office
insert into role_permissions (role_id, permission_key)
  select r.id, p.key from roles r cross join permissions p
  where r.slug = 'reception' and r.org_id is null
    and p.key in ('booking.view','booking.create','booking.edit','booking.cancel','booking.move',
                  'calendar.view','guest.view','guest.create','guest.edit',
                  'payment.view','payment.record','dashboard.view');

-- housekeeping
insert into role_permissions (role_id, permission_key)
  select r.id, p.key from roles r cross join permissions p
  where r.slug = 'housekeeping' and r.org_id is null
    and p.key in ('calendar.view','booking.view','unit.manage');

-- finance
insert into role_permissions (role_id, permission_key)
  select r.id, p.key from roles r cross join permissions p
  where r.slug = 'finance' and r.org_id is null
    and p.key in ('payment.view','payment.record','payment.refund','revenue.view',
                  'booking.view','dashboard.view');

-- readonly = toate permisiunile *.view
insert into role_permissions (role_id, permission_key)
  select r.id, p.key from roles r cross join permissions p
  where r.slug = 'readonly' and r.org_id is null
    and p.key like '%.view';

-- ============ 5. sincronizare member_roles ↔ enum (bridge de tranziție) ============
-- Cât timp enum-ul există (6.1), el e sursa: orice insert/update de rol pe
-- organization_members reflectă mapped system role în member_roles, fără să
-- atingem codul existent. Atinge DOAR rolurile de sistem (nu rolurile custom,
-- care vor fi gestionate direct din UI în 6.3).

create function app.sync_member_role() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_slug text;
  v_role_id uuid;
begin
  v_slug := case new.role
    when 'owner'   then 'administrator'
    when 'manager' then 'manager'
    else 'reception'
  end;
  select id into v_role_id from public.roles where slug = v_slug and org_id is null;

  -- scoate vechile roluri de sistem auto-atribuite, pune-l pe cel mapat
  delete from public.member_roles mr
    using public.roles r
   where mr.member_id = new.id and mr.role_id = r.id and r.is_system;
  insert into public.member_roles (member_id, role_id)
    values (new.id, v_role_id)
    on conflict do nothing;
  return new;
end $$;

create trigger member_roles_sync
  after insert or update of role on organization_members
  for each row execute function app.sync_member_role();

-- backfill membrii existenți (triggerul acoperă doar inserturile viitoare)
insert into member_roles (member_id, role_id)
  select m.id, r.id
  from organization_members m
  join roles r on r.org_id is null and r.slug = case m.role
    when 'owner' then 'administrator' when 'manager' then 'manager' else 'reception' end
  on conflict do nothing;

-- ============ 6. guard cross-tenant pe member_roles ============
-- un membru poate primi DOAR roluri de sistem (org_id null) sau roluri ale
-- propriei organizații — niciodată un rol custom din altă org.

create function app.check_member_role_org() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_member_org uuid;
  v_role_org   uuid;
begin
  select org_id into v_member_org from public.organization_members where id = new.member_id;
  select org_id into v_role_org   from public.roles where id = new.role_id;
  if v_role_org is not null and v_role_org <> v_member_org then
    raise exception 'ROLE_ORG_MISMATCH';
  end if;
  return new;
end $$;

create trigger member_roles_org_guard
  before insert or update on member_roles
  for each row execute function app.check_member_role_org();

-- ============ 7. helperi de autorizare (ADITIVI — neapelați încă) ============
-- Devin primitiva de enforcement în 6.2. Definer + search_path='' (nu intră
-- în recursie cu RLS pe organization_members/member_roles).

-- toate permisiunile efective ale userului curent într-o organizație
create function app.user_permissions(p_org_id uuid) returns setof text
language sql stable security definer set search_path = '' as $$
  -- owner structural → toate permisiunile
  select p.key from public.permissions p
  where exists (
    select 1 from public.organizations o
    where o.id = p_org_id and o.owner_user_id = auth.uid()
  )
  union
  -- union peste toate rolurile membrului
  select rp.permission_key
  from public.organization_members m
  join public.member_roles mr     on mr.member_id = m.id
  join public.role_permissions rp on rp.role_id = mr.role_id
  where m.org_id = p_org_id and m.user_id = auth.uid();
$$;

-- enforcement rule (spec §5.3): permisiune validă DOAR dacă userul are
-- permisiunea ȘI are acces la proprietate (când p_property_id e dat)
create function app.has_permission(p_org_id uuid, p_property_id uuid, p_key text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select
    exists (
      select 1 from public.organizations o
      where o.id = p_org_id and o.owner_user_id = auth.uid()
    )
    or (
      exists (
        select 1
        from public.organization_members m
        join public.member_roles mr     on mr.member_id = m.id
        join public.role_permissions rp on rp.role_id = mr.role_id
        where m.org_id = p_org_id and m.user_id = auth.uid()
          and rp.permission_key = p_key
      )
      and (p_property_id is null or app.can_access_property(p_property_id))
    );
$$;

-- ============ 8. RLS + grants pe tabelele noi ============

alter table permissions      enable row level security;
alter table roles            enable row level security;
alter table role_permissions enable row level security;
alter table member_roles     enable row level security;

revoke all on permissions, roles, role_permissions, member_roles from anon;
grant select on permissions, roles, role_permissions, member_roles to authenticated;

-- permissions: catalog public-intern (orice user autentificat îl poate citi)
create policy permissions_select on permissions for select to authenticated
  using (true);

-- roles: rolurile de sistem (org_id null) sunt vizibile tuturor; cele custom
-- doar membrilor org-ului. Scrierea (roluri custom) vine în 6.3.
create policy roles_select on roles for select to authenticated
  using (org_id is null or org_id in (select app.user_org_ids()));

-- role_permissions: vizibile dacă rolul e vizibil
create policy role_permissions_select on role_permissions for select to authenticated
  using (exists (
    select 1 from roles r
    where r.id = role_id and (r.org_id is null or r.org_id in (select app.user_org_ids()))
  ));

-- member_roles: vizibile membrilor org-ului; scrierea trece prin trigger
-- (definer) în 6.1, managementul direct vine în 6.3
create policy member_roles_select on member_roles for select to authenticated
  using (exists (
    select 1 from organization_members m
    where m.id = member_id and m.org_id in (select app.user_org_ids())
  ));

-- ============ 9. create_organization setează owner-ul structural ============
-- organizațiile noi primesc owner_user_id; insertul de membru owner declanșează
-- triggerul de sync → rolul Administrator. Comportament neschimbat altfel.

create or replace function public.create_organization(p_name text, p_slug text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  insert into public.organizations (name, slug, owner_user_id)
  values (p_name, p_slug, auth.uid()) returning id into v_org_id;
  insert into public.organization_members (org_id, user_id, role)
  values (v_org_id, auth.uid(), 'owner');
  return v_org_id;
end $$;

revoke execute on function public.create_organization from anon, public;
