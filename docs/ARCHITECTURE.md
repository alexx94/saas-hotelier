# SaaS Hotelier — Arhitectură (MVP)

> Documentul de referință pentru schema DB, RLS și booking engine.
> Stack: React + TS + Tailwind + shadcn/ui + TanStack Router/Query, Supabase (local via Docker în dev).

## Decizii cheie

| Decizie | Alegere | Motiv |
|---|---|---|
| Multi-tenancy | `org_id` pe fiecare tabel + RLS | izolare la nivel DB, fără cross-tenant leakage |
| Anti double-booking | constraint `EXCLUDE` pe `daterange` (btree_gist) | garanție atomică la nivel Postgres, nu doar în aplicație |
| Blocări manuale (mentenanță etc.) | rând în `bookings` cu `status='blocked'`, `guest_id NULL` | un singur constraint EXCLUDE acoperă tot |
| Monedă | `char(3)` ISO 4217 (`RON`, `EUR`, ...) | nu enum hardcodat — orice monedă viitoare merge fără migrare |
| Limbă | UI românește; textele de conținut (descrieri) în `jsonb {"ro": "..."}` | adăugarea EN = doar o cheie nouă în jsonb + fișier de traduceri în frontend |
| Plăți | NU în MVP; `bookings.total_amount + currency` există deja; tabel `payments` se adaugă ulterior | scalare fără refactor |
| Model camere | două niveluri: `unit_types` (tipul vândut public: "Dublă standard") + `units` (camerele fizice: 101, 102...) | creezi tipul o dată + generare bulk camere; rezervarea publică alege tipul, sistemul asignează camera |
| Acces public (booking page) | hibrid: SELECT direct cu anon + RLS pe `properties`/`unit_types` (doar coloane safe, `is_published`); RPC doar pentru disponibilitate și creare booking | `bookings` nu poate fi expus la anon (date guests/sume) — disponibilitatea se calculează server-side; restul rămâne simplu, direct pe tabele |
| Statusuri/surse booking | `text` + CHECK constraint (nu enum Postgres) | adăugare valori noi (ex. `booking_com`) fără migrare de enum |

## 1. Schema bazei de date

```sql
-- extensii
create extension if not exists btree_gist;

-- ============ TENANCY ============
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now()
);

-- legătura user (Supabase auth.users) <-> organizație
create table organization_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('owner','manager','staff')),
  created_at  timestamptz not null default now(),
  unique (org_id, user_id)
);

-- restricție opțională per proprietate (gol = acces la toate proprietățile org-ului)
create table member_property_access (
  member_id   uuid not null references organization_members(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  primary key (member_id, property_id)
);

-- ============ RBAC (Sprint 6.1 — vezi docs/backend/rbac.md) ============
-- organizations.owner_user_id  → owner structural (1/org, transferabil)
-- permissions(key, domain, ...)            catalog static `domeniu.acțiune`
-- roles(id, org_id NULL=sistem, slug, is_system)   roluri sistem + custom/org
-- role_permissions(role_id, permission_key)        ce poate un rol
-- member_roles(member_id, role_id)                 MULTI-rol/membru (union perms)
-- Helperi: app.user_permissions(org), app.has_permission(org, property, key).
-- Enum-ul `role` rămâne ca bridge (trigger sync) până la enforcement (6.2).
-- profiles(user_id pk → auth.users, full_name, avatar_url)  identitate partajată
--   (staff + guest); trigger pe auth.users la signup. Management membri/roluri
--   prin RPC-uri DEFINER (6.3); gărzi anti-escaladare (subset + self) în 6.3.1.

-- ============ INVENTAR ============
create table properties (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  name            text not null,
  slug            text not null unique,          -- URL public: /p/{slug}
  type            text not null default 'hotel'
                  check (type in ('hotel','villa','apartment','hostel','guesthouse')),
  description     jsonb not null default '{}',   -- {"ro": "...", "en": "..."}
  address         text,
  city            text,
  country         char(2) not null default 'RO', -- ISO 3166-1
  timezone        text not null default 'Europe/Bucharest',
  currency        char(3) not null default 'RON',-- ISO 4217
  default_locale  text not null default 'ro',
  is_published    boolean not null default false, -- vizibil pe pagina publică
  settings        jsonb not null default '{}',
  created_at      timestamptz not null default now()
);

-- TIPUL vândut public: "Cameră dublă standard", "Apartament cu 2 camere", "Vila întreagă"
create table unit_types (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  property_id  uuid not null references properties(id) on delete cascade,
  name         text not null,
  description  jsonb not null default '{}',
  -- capacitate (Sprint 4.5 — înlocuiește `capacity`): doar adulți + copii (constrângeri;
  -- occupancy pricing e exclus). `base_capacity` a fost eliminat (migrația 26) — nu avea rol.
  max_adults    int not null default 2 check (max_adults > 0),
  max_children  int not null default 0 check (max_children >= 0),
  base_price   numeric(12,2) not null default 0, -- preț/noapte; fallback pentru pricing engine
  -- config weekend (Sprint 4.5): ajustare pe nopțile de weekend, peste prețul rezolvat
  weekend_adjustment_type  text not null default 'none' check (... in none/percent/amount),
  weekend_adjustment_value numeric(12,2) not null default 0,
  weekend_days  int2[] not null default '{5,6}', -- DOW Postgres; default Vi+Sâ
  is_active    boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

-- Pricing engine (Sprint 4.5, migrațiile 24–25): tabel `rate_rules` (kind season/override)
-- cu prețuri pe interval; funcția `app.compute_price` rezolvă per noapte
-- override > season > base_price (la suprapunere câștigă cea mai RECENT modificată regulă,
-- `updated_at` desc — fără prioritate numerică); weekend = prioritate minimă (doar pe base,
-- nu peste sezon/override). Snapshot imuabil pe
-- bookings (total_amount + price_breakdown jsonb). Sezoane = per tip (UI); override-uri =
-- din calendar (se aplică tuturor camerelor tipului); `get_rate_calendar` pictează tariful
-- pe celulele calendarului. Vezi docs/backend/rpc/pricing.md.

-- CAMERA fizică: "101", "102"... Pe ea stau rezervările și constraint-ul anti-double-booking.
create table units (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  property_id   uuid not null references properties(id) on delete cascade,
  unit_type_id  uuid not null references unit_types(id) on delete cascade,
  name          text not null,                   -- "101"
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (property_id, name)
);
-- Generare bulk: RPC generate_units(unit_type_id, count, prefix, start_number)
--   ex. (.., 10, 'Camera ', 1) -> Camera 1 .. Camera 10, dintr-un singur click în UI.
-- "Vilă întreagă" = un unit_type cu o singură unitate.

-- Ciclu de viață (model Booking.com/Pynbooking):
--  * delete unit_type -> camerele se șterg automat (cascade), nimic manual;
--  * dacă există rezervări (și istorice) -> DB blochează (bookings.unit_id RESTRICT);
--    UI oferă în schimb arhivare: is_active=false (dispare public + din calendar, istoricul rămâne);
--  * modificarea nr. de camere: crește -> generate_units adaugă; scade -> șterge doar
--    camere fără rezervări, altfel le dezactivează.

-- Evoluții ulterioare (vezi migrațiile + CHANGELOG):
--  * migrația 3: is_active -> status text ('active','inactive','out_of_service','archived'),
--    trigger units_status_guard (blochează dezactivarea cu rezervări viitoare);
--  * migrația 13 (Sprint 3): tabel unit_events (audit cine/ce/când per cameră, cu actor_email
--    snapshot, scris exclusiv de trigger-ul units_audit) + RPC bulk_update_unit_status
--    (activare/dezactivare/arhivare în masă, raport per cameră);
--  * migrația 14 (Sprint 3): tabel unit_type_events — același model de audit pe tipuri
--    (created / updated cu diff pe nume/capacitate/preț / archived / restored);
--  * migrația 17 (Sprint 3 — Availability Blocks): separarea conceptelor —
--    units.status = stare PERMANENTĂ (inactive/out_of_service NU mai cer zero
--    rezervări viitoare; doar archived/DELETE rămân stricte), iar indisponibilitatea
--    pe INTERVAL = tabel dedicat room_blocks (EXCLUDE anti-suprapunere block↔block;
--    block↔booking validat în triggers pe ambele direcții, serializat per cameră cu
--    advisory lock). Disponibil = activ ∧ fără booking overlap ∧ fără block overlap.
--    Pseudo-rezervările status='blocked' au fost migrate în room_blocks și eliminate.

-- ============ GUESTS & BOOKINGS ============
create table guests (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  full_name   text not null,
  email       text,
  phone       text,
  notes       text,
  created_at  timestamptz not null default now()
);
create index on guests (org_id, email);

create table bookings (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  property_id   uuid not null references properties(id) on delete cascade,
  unit_type_id  uuid not null references unit_types(id) on delete restrict,
  unit_id       uuid not null references units(id) on delete restrict, -- camera asignată (mutabilă de admin)
  guest_id      uuid references guests(id),       -- NULL la status='blocked'
  status        text not null default 'pending'
                check (status in ('pending','confirmed','cancelled',
                                  'checked_in','checked_out','no_show','blocked')),
  check_in      date not null,
  check_out     date not null,
  stay          daterange generated always as
                (daterange(check_in, check_out, '[)')) stored,
  -- ocupare (Sprint 4.5): adults > 0 obligatoriu; guests_count e GENERATED (= adults+children)
  adults        int not null default 1 check (adults > 0),
  children      int not null default 0 check (children >= 0),
  guests_count  int generated always as (adults + children) stored,
  total_amount  numeric(12,2) not null default 0,  -- snapshot la creare (din pricing engine)
  unit_price    numeric(12,2) not null default 0,  -- media/noapte snapshot
  price_breakdown jsonb not null default '{}',     -- detaliu per-noapte la creare (imuabil)
  currency      char(3) not null,
  source        text not null default 'admin'
                check (source in ('admin','public','blocked')), -- viitor: 'booking_com','airbnb'
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (check_out > check_in),
  check (status = 'blocked' or guest_id is not null),

  -- ⭐ INIMA SISTEMULUI: imposibil două rezervări active suprapuse pe aceeași unitate
  constraint no_double_booking exclude using gist
    (unit_id with =, stay with &&)
    where (status not in ('cancelled','no_show'))
);
```

### Indexare
```sql
create index on organization_members (user_id);
create index on properties (org_id);
create index on unit_types (property_id);
create index on units (property_id);
create index on units (unit_type_id);
create index on bookings (property_id, check_in);
create index on bookings (org_id, created_at desc);
create index on bookings using gist (unit_id, stay); -- creat implicit de EXCLUDE, verificat
```

### Extensii (parțial implementate)
- `payments(booking_id, amount, currency, provider, status)` — ✅ implementat (Sprint 4).
- `rate_rules(unit_type_id, kind, daterange, price)` — ✅ implementat (Sprint 4.5): `base_price` e fallback; preț per **tip** (nu per cameră), via `app.compute_price`; la suprapunere câștigă cea mai recent modificată regulă.
- **Reguli de rezervare** — ✅ implementat (Sprint 4.6, migrația `20260614120000`): strat modular de restricții, separat de preț și de `room_blocks`.
  - `unit_types.min_stay`/`max_stay` (1..30, `max_stay >= min_stay`) = durată sejur globală per tip.
  - `stay_rules(unit_type_id, daterange, min_stay?, max_stay?)` = suprascrieri pe perioade; rezolvate pe **data de check-in** (`app.resolve_stay`), recență `updated_at` ca `rate_rules`.
  - `closures(property_id, unit_type_id?, daterange, reason)` = **stop-sell / closed dates** cu scope (`unit_type_id` NULL = toată proprietatea). Distinct de `room_blocks`: oprește vânzarea unui produs, **nu** blochează camere fizice. Fără EXCLUDE (suprapunere benignă). `app.is_closed` verifică ambele scope-uri.
  - Enforcement în `app.create_booking_internal` (admin + public): `STAY_TOO_SHORT`, `STAY_TOO_LONG`, `DATES_CLOSED`. RPC `get_stay_constraints` pentru UI; `public_get_availability` filtrează închiderile + durata. Vezi `docs/backend/rpc/reservation-rules.md`.
- Channel manager: `source` primește valori noi; tabel `channel_connections` + `external_refs(booking_id, channel, external_id)` — viitor.
- **Website builder per proprietate** — ✅ implementat (Sprint 10, migrația `20260705120000`): `property_sites(property_id, slug, theme, is_enabled, content jsonb, ...)` (1:1 cu `properties`) + `site_photos(property_id, storage_path, unit_type_id?, sort_order)`, separate strict de inventar/booking. Acces public exclusiv prin RPC (`public_get_site`/`is_site_slug_available`), nu SELECT direct + RLS ca la `properties`/`unit_types`. Bucket Storage public `site-photos` — prima folosire Storage în proiect. Detalii complete (model de date, decizii de slug/securitate, scalare path→subdomeniu→domeniu custom): [`docs/backend/rpc/sites.md`](backend/rpc/sites.md).

## 2. RLS — strategie

RLS activat pe **toate** tabelele. Două funcții helper (`security definer`, `stable`):

```sql
create function app.user_org_ids() returns setof uuid ... ;
-- org-urile userului curent (auth.uid())

create function app.can_access_property(p_property_id uuid) returns boolean ... ;
-- membru al org-ului proprietății ȘI (fără restricții per-property SAU are rândul în member_property_access)
```

| Tabel | SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| organizations | membru | doar `owner` |
| organization_members | membru al org | `owner`/`manager` |
| properties | membru org **+ anon dacă `is_published`** | `owner`/`manager` |
| unit_types | `can_access_property` **+ anon dacă proprietatea e publicată** | `owner`/`manager` |
| units | `can_access_property` | `owner`/`manager` |
| guests | membru org | membru org (orice rol) |
| bookings | `can_access_property` — **niciodată anon** | `staff`+: insert/update; delete doar `owner` |

**Acces public (anon) — hibrid:**
- `properties` + `unit_types`: SELECT direct cu RLS (`is_published = true`) și **grant doar pe coloanele safe** (fără `settings`, `org_id` etc.). Simplu și cache-abil.
- Disponibilitate: RPC `public_get_availability(slug, from, to)` — obligatoriu RPC, pentru că necesită citire din `bookings`, care nu se expune la anon sub nicio formă. Returnează doar `{unit_type_id, date libere, nr. camere libere}`.
- Creare rezervare: RPC `public_create_booking(...)` — atomic, validează server-side, forțează `status='pending'` + `source='public'`. Anon nu are INSERT direct.

## 3. Booking engine

### Disponibilitate
O cameră e liberă pe `[check_in, check_out)` dacă nu există booking activ cu `stay && daterange(...)`. Range `[)` = ziua de check-out e liberă pentru următorul check-in (standard hotelier). Un *tip* e disponibil dacă are cel puțin o cameră liberă pe interval.

### Creare atomică + auto-asignare cameră
Totul printr-o singură funcție `create_booking(...)` (RPC). Rezervarea vine pe **unit_type**; funcția:
1. validări (date, capacity, tip activ)
2. alege o cameră liberă a tipului (cea cu cele mai puține goluri în calendar, simplu: prima liberă) și `insert into bookings ...`
3. conflict (race cu altă rezervare) → Postgres aruncă `exclusion_violation (23P01)` → reîncearcă cu următoarea cameră liberă; dacă nu mai există → eroare `UNIT_NOT_AVAILABLE`

Adminul poate muta ulterior rezervarea pe altă cameră (update `unit_id`, protejat de același constraint).

Nu există fereastră de race condition: constraint-ul EXCLUDE e verificat de Postgres în aceeași tranzacție cu insert-ul. Check-ul de disponibilitate din UI e doar UX (feedback rapid), nu sursa de adevăr.

## 4. Frontend — structură

```
src/
  app/                    # bootstrap: router, providers, QueryClient
  components/ui/          # shadcn
  lib/                    # supabase client, utils, i18n
  features/
    auth/
    organizations/
    properties/
    units/
    bookings/             # + calendar
    guests/
    public-booking/       # pagina publică (rute /p/$slug)
  routes/                 # TanStack Router (file-based)
```

- **Fiecare feature**: `api/` (funcții Supabase tipate), `hooks/` (TanStack Query), `components/`, `schemas.ts` (Zod).
- **Query keys**: `[feature, scope?, id?, params?]` — ex. `['bookings', propertyId, {month}]`, invalidare pe prefix.
- **i18n**: toate stringurile UI prin dicționar (`lib/i18n`), doar `ro.ts` în MVP; EN = un fișier nou.
- Tipuri DB generate cu `supabase gen types typescript`.

## 5. Faze de implementare

1. **DB core**: `supabase init/start`, migrații (schema de mai sus), seed, test SQL anti-double-booking ✅ criteriu: două inserturi suprapuse → al doilea eșuează
2. **RLS + RPC-uri**: politici + funcții publice + teste de izolare cross-tenant
3. **Scaffold frontend**: Vite + librării + auth (login, signup → creează org)
4. **Admin**: properties CRUD + unit_types CRUD cu generare bulk camere ("10 camere" → un click)
5. **Bookings**: calendar (grilă unități × zile), creare/editare booking, statusuri, guests
6. **Public booking page**: `/p/{slug}` — căutare disponibilitate + formular rezervare
7. **Polish**: dashboard cu ocupare, validări, empty states
