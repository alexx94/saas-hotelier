# RPC — Website Builder per proprietate (Sprint 10)

> Site public per proprietate, separat de pagina de rezervare existentă (`/p/{slug}`, vezi [public-api.md](public-api.md)). O proprietate poate avea maxim un site (`property_sites`, 1:1), cu propriul `slug`, temă, conținut editabil (jsonb) și galerie foto (`site_photos`). Acces public **exclusiv** prin RPC (`public_get_site`) — spre deosebire de `properties`/`unit_types`, care sunt SELECT direct + RLS pentru anon.

## Model de date

```
property_sites (1:1 cu properties)
  slug            unic global, format label DNS (lowercase, 3–63 caractere,
                  fără cratimă la capete), listă de nume rezervate — vezi
                  „De ce slug ≤ 63 caractere" mai jos
  theme           text liber, fără CHECK — teme noi fără migrare (contract
                  cu frontend-ul, care are propriul registry de teme)
  is_enabled      site-ul poate fi „oprit" fără să-l ștergi (draft/pauză)
  contact_phone / contact_email / map_embed_url   opționale
  content         jsonb, un singur contract stabil cu frontend-ul (vezi mai jos)

site_photos
  storage_path    path în bucket-ul `site-photos`: {property_id}/{uuid}.{ext}
  unit_type_id    NULL = poză generală; setat = tag „camera din poză"
  sort_order      ordine de afișare (galerie + teaser camere)
```

**De ce `property_sites` e separat de `properties`**: `properties` rămâne strict inventar/booking (nume, adresă, monedă); `property_sites` e strict prezentare (temă, texte de marketing, contact „vitrină"). Un proiect ulterior de export/duplicare a site-ului nu atinge deloc rezervările.

**Forma exactă a `content`** (contract cu frontend-ul — schimbarea structurii necesită coordonare, nu doar o migrare DB):

```json
{
  "hero": {"title": null, "subtitle": null},
  "about": {"enabled": true, "text": null},
  "rooms_teaser": {"enabled": true, "count": 2},
  "services": {"enabled": true, "items": []},
  "map": {"enabled": true},
  "contact": {"enabled": true},
  "pages": {"rooms": true, "book": true}
}
```

Fiecare secțiune are propriul `enabled` (comutator on/off din UI), fără schemă rigidă pe `services.items` (listă liberă de obiecte, ex. `{icon, title, text}` — frontend-ul decide forma, backend-ul doar persistă jsonb).

## De ce `slug` ≤ 63 caractere (decizie de design)

`property_sites.slug` e distinct de `properties.slug` (care rămâne path public `/p/{slug}` pentru booking). Azi slug-ul devine un path (`/s/{slug}`), dar **e gândit de la început ca viitor subdomeniu** (`{slug}.pilow.app` sau similar) — de aici constrângerile stricte de format:
- lowercase, `[a-z0-9]` + cratime interioare, 3–63 caractere = limita unui label DNS (RFC 1035);
- listă de nume rezervate (`www`, `app`, `api`, `admin`, ...) — coliziune cu subdomenii/rute tehnice curente sau viitoare.

Aplicarea regulii stricte **acum**, cât slug-ul e doar un path, evită o migrare dureroasă de date (rescrierea slug-urilor existente) când se adaugă subdomenii reale.

## De ce `map_embed_url` e restricționat la Google Maps embed

CHECK: `map_embed_url is null or map_embed_url like 'https://www.google.com/maps/embed%'`. Câmpul ajunge direct într-un `<iframe src=...>` pe pagina publică — a accepta orice URL ar deschide clickjacking/XSS prin iframe arbitrar controlat de un chiriaș (staff-ul unei organizații ar putea seta `src` pe orice site). Restricția la un singur prefix cunoscut (embed oficial Google Maps) elimină riscul fără să introducă sanitizare HTML.

## Storage — bucket `site-photos`

Bucket public (`storage.buckets.public = true`) — fotografiile sunt conținut de marketing, nu au nevoie de URL semnat; citirea trece prin CDN-ul Storage. Limită `file_size_limit = 5MB`, `allowed_mime_types = {image/jpeg, image/png, image/webp}` (verificat la coloane existente în schema `storage.buckets` locală înainte de a le folosi).

Politici pe `storage.objects` (bucket `site-photos`):
- **SELECT**: public necondiționat (bucket-ul e public prin design).
- **INSERT/UPDATE/DELETE**: doar `authenticated`, condiționat de `(storage.foldername(name))[1]::uuid` fiind o proprietate pe care userul o poate administra — **aceeași verificare ca pe `property_sites`** (`app.has_permission(org_id, property_id, 'property.edit')`), nu o permisiune nouă de storage. Path așteptat: `{property_id}/{uuid}.{ext}` — primul segment de folder identifică proprietatea.

## Scalare viitoare: path → subdomeniu → domeniu custom

Modelul de acces public e gândit explicit ca 3 trepte, fără să blocheze niciuna dintre ele:

1. **Azi (Sprint 10)**: `property_sites.slug` = path (`/s/{slug}`), rezolvat prin `public_get_site(slug)`. Un singur slug global (unic), fără tabel suplimentar.
2. **Subdomeniu** (viitor): `{slug}.pilow.app` — **același** `slug`, doar rutarea se schimbă (DNS wildcard + frontend citește subdomeniul din `Host` header în loc de path param). Motiv pentru care regulile de format DNS-label sunt aplicate de acum: zero migrare de date la acest pas.
3. **Domeniu custom** (viitor, tabel nou `site_domains`): `hotel-cutare.ro` → CNAME către infrastructura noastră, cu verificare de proprietate (TXT record) și certificat TLS automat. `site_domains(property_site_id, domain, verified_at, ...)` — `property_sites` nu se modifică, doar se adaugă un tabel de rezolvare `domain → property_site_id`, cu `public_get_site` primind un parametru alternativ (`p_domain`) sau o funcție soră.

## `public.public_get_site(p_slug text) returns jsonb`

**Scop**: vitrina publică completă a unui site — echivalentul „hidratării" paginii `/s/{slug}` într-un singur round-trip.

**Întoarce** `null` dacă: slug-ul nu există, `property_sites.is_enabled = false`, sau proprietatea asociată nu e `is_published`. Altfel:

```jsonc
{
  "site": {
    "slug": "...", "theme": "...",
    "contact_phone": "...", "contact_email": "...", "map_embed_url": "...",
    "content": { /* vezi contractul de mai sus */ }
  },
  "property": {
    "name": "...", "slug": "...",       // property.slug — necesar RPC-urilor de booking existente (/p/{slug})
    "type": "...", "description": {"ro": "..."},
    "address": "...", "city": "...", "country": "RO",
    "currency": "RON", "default_locale": "ro"
  },
  "unit_types": [
    {"id", "name", "description", "max_adults", "max_children",
     "base_price", "min_stay", "sort_order"}   // doar is_active, ordonate sort_order
  ],
  "photos": [
    {"id", "storage_path", "unit_type_id", "sort_order", "alt"}   // ordonate sort_order, created_at
  ]
}
```

**Nu expune**: `org_id`, `settings`, `is_published`, `id`-ul proprietății sau orice altă coloană internă — doar câmpurile enumerate explicit (construite cu `jsonb_build_object`, nu `to_jsonb(row)`).

| | |
|---|---|
| Migrație | `20260705120000` |
| Security | DEFINER, `plpgsql stable`, `set search_path = ''` |
| Grants | revocat de la `public`; acordat explicit `anon` + `authenticated` |
| Autorizare | implicită prin filtre (`is_enabled`, `is_published`) — nicio verificare suplimentară necesară, e API public |

## `public.is_site_slug_available(p_slug text) returns boolean`

**Scop**: verificare de disponibilitate slug în formularul de creare/editare a site-ului (admin). RLS ascunde site-urile altor organizații de la SELECT direct, deci o verificare de unicitate **globală** (slug e unic la nivel de instanță, nu per-org) trebuie să bypasseze RLS — de aici `security definer`.

Comparație case-insensitive (`upper(slug) = upper(p_slug)`) — deși CHECK-ul de format impune deja lowercase la insert, verificarea de disponibilitate acceptă orice caz de la client.

| | |
|---|---|
| Migrație | `20260705120000` |
| Security | DEFINER, `sql stable`, `set search_path = ''` |
| Grants | revocat de la `public, anon`; acordat doar `authenticated` |

## RLS — `property_sites` / `site_photos`

| Tabel | SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| `property_sites` | `app.can_access_property(property_id)` | `app.has_permission(org_id, property_id, 'property.edit')` |
| `site_photos` | `app.can_access_property(property_id)` | `app.has_permission(org_id, property_id, 'property.edit')` |

**Nicio permisiune nouă** — reutilizează `property.edit` (Sprint 6.1, deja acordată rolurilor `administrator`/`manager`), în linie cu decizia arhitecturală: website builder-ul e o extensie a managementului de proprietate, nu un domeniu RBAC separat.

**Anon**: `revoke all` pe ambele tabele — spre deosebire de `properties`/`unit_types` (SELECT direct + grant pe coloane), aici **totul** trece prin `public_get_site`, pentru că `content`/`theme` conțin text liber de marketing care nu justifică managementul de grants pe coloane și pentru că un singur RPC simplifică viitoarea adăugare a rezolvării pe subdomeniu/domeniu custom (un singur punct de intrare de schimbat, nu politici RLS).

## Audit

`property_sites` are trigger-ul generic `app.audit_entity('property_site', 'is_enabled', ...)` (Sprint 7) — create/update/delete vizibile în Activity Feed, cu `is_enabled` tratat ca stare de arhivare (`archived`/`restored` în loc de `updated` generic la comutare on/off).

`site_photos` **nu** e auditat — încărcarea/ștergerea de poze e o operațiune frecventă, low-stakes; auditul ar adăuga zgomot fără valoare operațională (aceeași decizie ca la excluderea `room_blocks` din `promotions`-style audit).

## Erori

`public_get_site` nu ridică excepții — întoarce `null` pentru orice caz „nu există/nu e vizibil public", indiferent de motiv (site inexistent, dezactivat, sau proprietate nepublicată). Frontend-ul tratează `null` uniform ca 404.

## Frontend (implementare viitoare — nu face parte din acest sprint)

Backend-ul e gata pentru: `features/sites/` cu editor de conținut (`content` jsonb), upload galerie (Storage direct din client, cu path `{property_id}/{uuid}.{ext}`), comutator `is_enabled`, verificare disponibilitate slug live (`is_site_slug_available`). Pagina publică `/s/{slug}` consumă `public_get_site` într-un singur fetch.
