-- ============================================================
-- Sprint 10 — Website Builder per proprietate
--
--   Fiecare proprietate poate avea un site public propriu, separat de
--   pagina de rezervare existentă (/p/{slug}): temă, conținut editabil
--   (hero/despre/servicii/hartă/contact), fotografii cu tag opțional pe
--   tipul de cameră. Site-ul are propriul `slug` (distinct de
--   properties.slug) — azi devine un path (/s/{slug}), pe viitor un
--   subdomeniu (vezi decizii în docs/backend/rpc/sites.md).
--
--   Acces public strict prin RPC (public_get_site) — niciun SELECT direct
--   anon pe property_sites/site_photos, ca să putem ascunde coloane interne
--   (org_id, settings) fără să administrăm grants pe coloane per tabel.
--
--   Storage: bucket public `site-photos` (citire CDN), scriere doar pentru
--   staff cu permisiunea de management proprietate (property.edit,
--   reutilizată — nu introducem o permisiune nouă).
-- ============================================================

-- ============ 1. Tabel property_sites (1:1 cu properties) ============

create table property_sites (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  property_id    uuid not null references properties(id) on delete cascade,
  slug           text not null unique,
  theme          text not null default 'serene',  -- fără CHECK: teme noi fără migrare
  is_enabled     boolean not null default false,
  contact_phone  text,
  contact_email  text,
  map_embed_url  text,
  content        jsonb not null default '{
    "hero": {"title": null, "subtitle": null},
    "about": {"enabled": true, "text": null},
    "rooms_teaser": {"enabled": true, "count": 2},
    "services": {"enabled": true, "items": []},
    "map": {"enabled": true},
    "contact": {"enabled": true},
    "pages": {"rooms": true, "book": true}
  }'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (property_id),

  -- slug = viitor subdomeniu (label DNS): lowercase, 3–63 caractere,
  -- fără cratimă la capete, fără caractere speciale
  constraint property_sites_slug_format check (
    slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
    and length(slug) between 3 and 63
  ),
  -- nume rezervate (ar coliziona cu subdomenii/rute tehnice viitoare)
  constraint property_sites_slug_reserved check (
    slug not in ('www','app','api','admin','mail','ftp','site','my-site',
                 'pms','static','cdn','assets')
  ),
  -- doar embed-uri Google Maps — nu acceptăm iframe-uri arbitrare (XSS/clickjacking)
  constraint property_sites_map_embed_format check (
    map_embed_url is null or map_embed_url like 'https://www.google.com/maps/embed%'
  )
);

create index property_sites_org_idx on property_sites (org_id);

create trigger property_sites_set_updated_at
  before update on property_sites
  for each row execute function app.set_updated_at();

-- audit generic (create/update/delete) — reutilizează trigger-ul Sprint 7,
-- ca la promotions/closures. is_enabled tratat ca "activ" (archived/restored).
create trigger property_sites_audit
  after insert or update or delete on property_sites
  for each row execute function app.audit_entity(
    'property_site', 'is_enabled', '{id,org_id,created_at,updated_at}'
  );

-- ============ 2. Tabel site_photos ============

create table site_photos (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  property_id   uuid not null references properties(id) on delete cascade,
  storage_path  text not null,                                          -- {property_id}/{uuid}.{ext}
  unit_type_id  uuid references unit_types(id) on delete set null,      -- null = poză generală
  sort_order    int not null default 0,
  alt           text,
  created_at    timestamptz not null default now()
);

create index site_photos_property_sort_idx on site_photos (property_id, sort_order);

-- fără audit: zgomot (foto = operațiune frecventă, low-stakes)

-- ============ 3. RLS ============

alter table property_sites enable row level security;
alter table site_photos    enable row level security;

-- niciun acces direct pentru anon — tot ce e public trece prin RPC (definer)
revoke all on property_sites, site_photos from anon;

create policy property_sites_select on property_sites for select to authenticated
  using (app.can_access_property(property_id));
create policy property_sites_cud on property_sites for all to authenticated
  using (app.has_permission(org_id, property_id, 'property.edit'))
  with check (app.has_permission(org_id, property_id, 'property.edit'));

create policy site_photos_select on site_photos for select to authenticated
  using (app.can_access_property(property_id));
create policy site_photos_cud on site_photos for all to authenticated
  using (app.has_permission(org_id, property_id, 'property.edit'))
  with check (app.has_permission(org_id, property_id, 'property.edit'));

-- ============ 4. Storage: bucket site-photos ============

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-photos', 'site-photos', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- SELECT public (citire CDN) — bucket marcat public, dar politica explicită
-- e mai clară decât a te baza doar pe `public=true` (comportament Storage).
create policy site_photos_storage_select on storage.objects for select to public
  using (bucket_id = 'site-photos');

-- scriere: doar authenticated, doar dacă primul folder din path (property_id)
-- e o proprietate pe care userul o poate administra (aceeași permisiune ca
-- pe property_sites — property.edit). (storage.foldername(objects.name))[1] e
-- text, cast la uuid; path invalid (nu-uuid) => cast eșuează => nu potrivește
-- nimic. IMPORTANT: `name` calificat explicit cu `objects` — `properties` are
-- propria coloană `name` (numele proprietății), iar un `name` neambiguizat aici
-- s-ar rezolva la `properties.name` (umbrire de coloană în subquery-ul EXISTS),
-- nu la calea fișierului din storage.objects.
create policy site_photos_storage_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'site-photos'
    and exists (
      select 1 from properties p
      where p.id = ((storage.foldername(objects.name))[1])::uuid
        and app.has_permission(p.org_id, p.id, 'property.edit')
    )
  );

create policy site_photos_storage_update on storage.objects for update to authenticated
  using (
    bucket_id = 'site-photos'
    and exists (
      select 1 from properties p
      where p.id = ((storage.foldername(objects.name))[1])::uuid
        and app.has_permission(p.org_id, p.id, 'property.edit')
    )
  )
  with check (
    bucket_id = 'site-photos'
    and exists (
      select 1 from properties p
      where p.id = ((storage.foldername(objects.name))[1])::uuid
        and app.has_permission(p.org_id, p.id, 'property.edit')
    )
  );

create policy site_photos_storage_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'site-photos'
    and exists (
      select 1 from properties p
      where p.id = ((storage.foldername(objects.name))[1])::uuid
        and app.has_permission(p.org_id, p.id, 'property.edit')
    )
  );

-- ============ 5. RPC: public_get_site(slug) ============
-- Vitrina publică a site-ului. DEFINER (bypass RLS pt. proprietate/unit_types/
-- foto), search_path gol, doar anon+authenticated. NULL dacă site-ul nu
-- există, e dezactivat, sau proprietatea nu e publicată. Nu expune coloane
-- interne (org_id, settings, is_published).

create function public.public_get_site(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_site     record;
  v_property record;
  v_result   jsonb;
begin
  select * into v_site from public.property_sites where slug = lower(p_slug) and is_enabled;
  if not found then return null; end if;

  select * into v_property from public.properties
   where id = v_site.property_id and is_published;
  if not found then return null; end if;

  select jsonb_build_object(
    'site', jsonb_build_object(
      'slug', v_site.slug,
      'theme', v_site.theme,
      'contact_phone', v_site.contact_phone,
      'contact_email', v_site.contact_email,
      'map_embed_url', v_site.map_embed_url,
      'content', v_site.content
    ),
    'property', jsonb_build_object(
      'name', v_property.name,
      'slug', v_property.slug,
      'type', v_property.type,
      'description', v_property.description,
      'address', v_property.address,
      'city', v_property.city,
      'country', v_property.country,
      'currency', v_property.currency,
      'default_locale', v_property.default_locale
    ),
    'unit_types', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'name', t.name,
        'description', t.description,
        'max_adults', t.max_adults,
        'max_children', t.max_children,
        'base_price', t.base_price,
        'min_stay', t.min_stay,
        'sort_order', t.sort_order
      ) order by t.sort_order, t.name)
      from public.unit_types t
      where t.property_id = v_property.id and t.is_active
    ), '[]'::jsonb),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ph.id,
        'storage_path', ph.storage_path,
        'unit_type_id', ph.unit_type_id,
        'sort_order', ph.sort_order,
        'alt', ph.alt
      ) order by ph.sort_order, ph.created_at)
      from public.site_photos ph
      where ph.property_id = v_property.id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;

revoke execute on function public.public_get_site(text) from public, anon, authenticated;
grant execute on function public.public_get_site(text) to anon, authenticated;

-- ============ 6. RPC: is_site_slug_available(slug) ============
-- Verificare globală de unicitate (RLS ascunde site-urile altor org-uri,
-- deci trebuie definer). Doar authenticated (folosit din formularul admin).

create function public.is_site_slug_available(p_slug text) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.property_sites where upper(slug) = upper(p_slug)
  );
$$;

revoke execute on function public.is_site_slug_available(text) from public, anon;
grant execute on function public.is_site_slug_available(text) to authenticated;
