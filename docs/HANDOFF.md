# SaaS Hotelier — Handoff pentru continuarea dezvoltării

> Document de context pentru o sesiune nouă. Citește și `ARCHITECTURE.md` pentru schema DB completă.

---

## Starea curentă a proiectului (22 iun 2026 — Sprint 8 complet)

Aplicație PMS multi-tenant funcțională. Tot codul e pe GitHub:
**https://github.com/alexx94/saas-hotelier**

Repo public. `web/.env.local` nu e în repo (exclus corect din `.gitignore`).
Pentru a porni local: `supabase start` → `cd web && cp .env.example .env.local` (completezi cu valorile din output) → `npm install && npm run dev`.

**Seed local de dezvoltare** (`supabase/seed.sql`, aplicat automat la `supabase db reset`, NU în producție): cont demo **test@hotel.ro / test1234** (owner), 1 proprietate publicată „Hotel Demo", 3 tipuri (11 camere, numerotate 1-11: duble 1-6, triple 7-9, apartamente 10-11), tarife sezon+override, 3 oaspeți, 5 rezervări (trecut/curent/viitor cu prețuri din motorul real), 2 promoții (cod `WELCOME10` + early booking automat), o închidere și un blocaj de cameră. Testele DB (`supabase/tests/db_tests.sql`) folosesc fixture-uri proprii (begin/rollback) și nu interferează cu seed-ul.

---

## Stack tehnic

| Layer | Tehnologie | Versiune notabilă |
|---|---|---|
| Frontend routing | **TanStack Router v1** | file-based, typed params |
| Frontend cache/server state | **TanStack Query v5** | `useQuery` / `useMutation` |
| UI components | shadcn/ui + Tailwind CSS | dark-mode via CSS vars |
| Forms + validare | React Hook Form + Zod | |
| Backend | Supabase local (Docker) | PostgreSQL + Auth + RLS |
| Limbă UI | Română (`web/src/lib/i18n/ro.ts`) | |

---

## Structura codului frontend

```
web/src/
  features/           ← logică organizată pe domeniu (feature-based)
    bookings/
      api.ts          ← funcții async pure (fetch/mutate Supabase)
      hooks.ts        ← useQuery/useMutation wrappers + query keys
      booking-form-dialog.tsx
      booking-history.tsx
      reassign-dialog.tsx
      status-badge.tsx
    guests/
      api.ts
      hooks.ts
      guest-combobox.tsx
    properties/
      api.ts
      hooks.ts
      context.tsx     ← PropertyProvider + useCurrentProperty() (proprietatea curentă din URL)
      property-switcher.tsx ← comutator proprietate în sidebar (navighează)
    unit-types/         ← gestionarea camerelor (Sprint 3)
      api.ts
      hooks.ts
      unit-status.ts    ← constante status (labels/badge/dot) reutilizabile
      room-numbering.ts ← parser numerotare bulk ("101-120" sau count+start)
      block-reason.ts   ← motive blocaje + culori calendar + hașuri (tokens)
      unit-rows.tsx     ← rândurile camerelor (selecție, status, istoric)
      bulk-actions-bar.tsx
      add-units-row.tsx
      block-dialog.tsx  ← creare/listare/ștergere blocaje (single + bulk)
      unit-actions-menu.tsx ← meniu rapid pe cameră (folosit în calendar)
      event-history-dialog.tsx ← dialog istoric GENERIC (orice entitate auditată)
      unit-history-dialog.tsx / unit-type-history-dialog.tsx ← wrappere
    pricing/            ← motor de preț + ocupare (Sprint 4.5)
      api.ts / hooks.ts ← rate_rules CRUD + quote_price (estimare)
      rate-rules-dialog.tsx ← gestionare sezoane/override per tip de cameră
      occupancy-stepper.tsx ← stepper +/- adulți/copii (reutilizabil)
      price-breakdown.tsx   ← detaliu preț per noapte (reutilizabil)
      weekend-days-toggle.tsx / weekend-pricing.ts ← config + helper zile weekend
    reservation-rules/  ← reguli de rezervare (Sprint 4.6 + 4.7)
      api.ts / hooks.ts ← stay_rules + closures + arrival_rules CRUD,
                          get_stay_constraints + validateBooking (strat validatori 4.9)
      stay-rules-dialog.tsx ← reguli durată sejur per tip (min/max stay pe perioade)
      closures-dialog.tsx   ← stop-sell / închideri (toată proprietatea sau un tip)
      arrival-rules-dialog.tsx ← restricții sosire/plecare CTA/CTD (Sprint 4.7)
      restriction-display.ts ← tokens calendar + resolver restricții pe zi (Sprint 4.7)
    promotions/         ← promoții & reduceri comerciale (Sprint 4.8)
      api.ts / hooks.ts ← promotions + promotion_rules CRUD
      promotions-dialog.tsx ← creare/listare promoții (cod/automată + condiții + limită)
    dashboard/          ← analytics panou (Sprint 5)
      api.ts / hooks.ts ← get_dashboard_stats + dashboardKeys
      dashboard-cards.tsx ← StatCard reutilizabil + secțiuni Astăzi/Ocupare/Rezervări
    members/            ← management membri (Sprint 6.3)
      api.ts / hooks.ts ← add/set roles/access/remove/transfer + get_org_members
      members-section.tsx ← listă + adăugare + editor (roluri/acces/transfer)
    roles/              ← roluri custom + permisiuni (Sprint 6.3)
      api.ts / hooks.ts ← fetchRoles/Permissions + create/update/delete
      roles-section.tsx ← listă expandabilă + editor permisiuni pe domeniu
    housekeeping/       ← stare curățenie camere + panou mobile-first (Sprint 8)
      api.ts            ← fetchHousekeepingBoard (RPC) + setUnitCleaningStatus + bulkSetUnitCleaningStatus
      hooks.ts          ← useHousekeepingBoard / useSetUnitCleaningStatus / useBulkSetUnitCleaningStatus
      cleaning-status.ts ← registry clean/dirty/inspected (mirror unit-status.ts)
      housekeeping-board.tsx ← carduri tap-friendly, filtre, selecție multiplă + bară bulk
    audit/              ← jurnal de audit unificat + feed activitate (Sprint 7)
      api.ts            ← fetchActivityFeed (RPC get_activity_feed, cu filtre) + fetchEntityEvents
      hooks.ts           ← useActivityFeed (infinite query, staleTime 0 + refetchOnWindowFocus) + auditKeys
      activity-feed.tsx ← panou „Activitate": filtre (tip entitate/eveniment, interval dată), refresh manual
      activity-feed-config.ts ← ACTIVITY_FEED_CONFIG: registry entity_type → label-uri + câmpuri (reutilizează registrele per-feature)
      entity-history-dialog.tsx ← wrapper generic peste event-history-dialog.tsx (unit-types/), parametrizat per entitate
    organizations/
      api.ts
      hooks.ts
      context.tsx     ← OrgProvider + useCurrentOrg() (org curentă din URL /org/$orgId)
      org-switcher.tsx ← comutator organizație în sidebar (navighează la /org/$orgId)
    auth/
      hooks.ts        ← requireSession()
      permissions.ts  ← usePermissions / useHasPermission (RBAC, Sprint 6.2)
      can.tsx         ← <Can permission> gate declarativ
      user-menu.tsx   ← popover trigger pentru meniu user
      settings-dialog.tsx ← dialog setări cu hash routing
  routes/             ← file-based TanStack Router
    __root.tsx
    _app.tsx          ← shell autentificat (doar garda de sesiune + Outlet)
    _app/org/
      index.tsx       ← /org panou „organizațiile tale" (mereu accesibil; NU auto-intră / NU forțează onboarding; empty-state = creează una). Back-nav subtil din OrgSwitcher → „Toate organizațiile"
      $orgId/
        route.tsx     ← layout org: gardă membership + OrgProvider + <AppShell>
        index.tsx     ← home org: grilă proprietăți (+ creare) + vizualizare în ansamblu (owner/admin)
    _app/property/$propertyId/   ← URL scurt: DOAR propertyId (org dedus din property.org_id)
      route.tsx       ← gardă acces (fetchProperty; RLS ascunde → redirect /org) + OrgProvider + PropertyProvider + <AppShell>
      index.tsx       ← Dashboard (per-proprietate)
      calendar.tsx
      housekeeping.tsx ← panou curățenie (Sprint 8), gate <Can permission="unit.manage">
      settings.tsx    ← config proprietate (tipuri camere, prețuri, reguli, promoții, publish)
      bookings/
        index.tsx
        $bookingId.tsx
      guests/
        index.tsx
        $guestId.tsx
    # AppShell (sidebar partajat) = components/app-shell.tsx; OrgSwitcher → /org/$orgId, PropertySwitcher → /property/$propertyId
    login.tsx
    signup.tsx
    onboarding.tsx
    p.$slug.tsx       ← pagina publică de rezervare (lane guest, neatinsă)
  components/ui/      ← shadcn/ui (nu modifica direct dacă nu e necesar)
  components/         ← componente compuse reutilizabile (peste primitive shadcn), ex. multi-select-filter.tsx
  lib/
    supabase.ts
    i18n/
      index.ts        ← funcția t()
      ro.ts           ← toate textele UI
    database.types.ts ← generat din Supabase (nu edita manual)
    utils.ts          ← cn() + altele
    pagination.ts     ← offset pagination (Page, pageRange, toPage, dedupeById)
    errors.ts         ← errorMessage() — extragere mesaj din erori Supabase
    natural-sort.ts   ← naturalCompare ("Camera 9" < "Camera 10")
```

---

## Convenții de cod — respectă-le strict

### 1. Separarea api / hooks / component

Fiecare feature are 3 straturi distincte:

```
api.ts     → funcții async pure, nicio referință la React sau Query
             ex: export async function fetchBookings(propertyId: string): Promise<Booking[]>

hooks.ts   → useQuery / useMutation care înfășoară api.ts
             query keys definite ca obiect constant în același fișier
             ex: export const bookingKeys = { list: (id: string) => ["bookings", id] as const }

component  → apelează DOAR hooks, nu api direct
             nu face fetch manual, nu scrie în Supabase direct
```

**Nu pune logică de fetch în componente** — dacă ai nevoie de date noi, adaugi în `api.ts` + `hooks.ts`, nu inline.

### 2. TanStack Query — cache keys

> **Inventarul complet al cheilor + defaults comportamentale documentate în [`docs/frontend/tanstack-query.md`](../docs/frontend/tanstack-query.md).** Ce urmează e rezumatul de lucru; documentul de mai sus e sursa de adevăr.

**Defaults globale relevante (neschimbate față de TanStack v5 defaults):**
- `staleTime: 0` → orice query e imediat stale; `refetchOnWindowFocus: true` → la revenirea pe tab, toate query-urile active se refetch automat. **Comportament intenționat** — pe un PMS multi-staff datele trebuie să fie proaspete fără refresh manual. Dacă vrei să eviți refetch-ul pe un query specific (ex. form în editare), pune `refetchOnWindowFocus: false` per-query, nu global.

Fiecare feature are un obiect `*Keys` exportat:
```ts
// bookings/hooks.ts
export const bookingKeys = {
  all: ["bookings"] as const,
  list: (propertyId: string) => ["bookings", propertyId] as const,
  range: (propertyId: string, from: string, to: string) =>
    ["bookings", propertyId, { from, to }] as const,
}
```
La `invalidateQueries` folosești mereu din acest obiect, niciodată string literal.

**Liste = offset pagination obligatoriu** (Sprint 2.1) — nicio listă nu aduce „tot" cu un `limit` arbitrar:
- Helper: `lib/pagination.ts` (`Page<T>`, `pageRange`, `toPage` — `pageSize + 1` rânduri, rândul în plus = există pagina următoare, fără `count(*)`; + hook-ul `usePagination()`, pagină 0-based)
- UI: `components/pagination.tsx` (`PaginationControls` — butoane înainte/înapoi)
- Cheia listei: `[entity, scopeId, "list", params]` unde `params` e obiect (`{ search?, page? }` azi, filtre noi mâine). Filtrele se aplică în query **înaintea** range-ului. Hook-ul normalizează params (trim, `page ?? 0`) ca apelanți diferiți să împartă cache-ul.
- La schimbarea oricărui filtru: `pagination.reset()` în același handler (nu useEffect)
- `placeholderData: keepPreviousData` pe orice query paginat
- **Agregări/totaluri = mereu server-side** (RPC, ex. `get_guest_stats`) — niciodată numărate pe client din lista paginată
- **Istoricuri (audit) = „Afișează mai mult"** (Sprint 3): `useInfiniteQuery` peste același offset (`pageRange`/`toPage`, pagini de 15, `created_at desc, id desc`), nu fetch integral — istoricurile cresc nelimitat. La randare se aplică `dedupeById` (offsetul poate aluneca la scrieri concurente). Erorile Supabase se citesc cu `errorMessage()` din `lib/errors.ts` (nu `e instanceof Error` — PostgREST aruncă uneori obiecte simple).

`enabled` în `useQuery` se setează explicit când ai parametri opționali:
```ts
enabled: !!propertyId && !!checkIn
```

### 3. TanStack Router — navigare și hash routing

**Navigare**: mereu prin `useNavigate()` sau `<Link to="...">` — **niciodată** `window.location.href`, `<a href>` intern, sau `history.pushState`.

**Hash routing pentru modals/setări**:
- Pattern URL: `#settings/account`, `#booking/new`, etc.
- Citit reactiv: `const { hash } = useLocation()` — nu ai nevoie de `useEffect` + `addEventListener`
- Scris: `navigate({ to: ".", hash: "settings/account" })` — `to: "."` e obligatoriu
- Închis: `navigate({ to: ".", hash: "" })` — TanStack elimină `#` din URL automat

Exemplu existent: `web/src/features/auth/settings-dialog.tsx` — urmează același pattern.

**Redirect în `beforeLoad`**: `throw redirect({ to: "/login" })` — sintaxa corectă TanStack v1.

### 4. Fără useEffect când nu e nevoie

| Situație | Ce folosești |
|---|---|
| Date din server | `useQuery` |
| State derivat din alte state | calculat inline (fără useState) |
| Valoare derivată din URL (hash/params) | `useLocation()` / `useParams()` — reactiv automat |
| Submit form | `useMutation` + `form.handleSubmit` |
| Fetch la mount | `useQuery` cu `enabled` |

`useEffect` este acceptabil **doar** pentru:
- Subscriptions externe (ex. `supabase.auth.onAuthStateChange`)
- Efecte DOM native (ex. `addEventListener("keydown", ...)` pentru Escape în overlay)
- Sync cu sisteme non-React (timere, biblioteci third-party)

**Nu** pentru: fetch date, sync state derivat, "inițializare" care poate fi `defaultValues` în useForm.

### 5. Fără god components

Dacă un component depășește ~200 de linii sau face mai mult de un lucru, îl spargi.
Modaluri → fișiere separate (`*-dialog.tsx`).
Sub-secțiuni mari → componente locale în același fișier (funcții sus, component principal jos).
Exemplu existent: `BookingTooltip` în `calendar.tsx` — component separat, nu inline.

### 6. Texte UI — mereu prin i18n

Orice text vizibil pentru user: `t("cheia.mea")` din `@/lib/i18n`.
Adaugi cheia în `web/src/lib/i18n/ro.ts` **înainte** să o folosești.
Nu scrie string-uri românești direct în JSX.

### 7. Tipuri TypeScript

Tipurile de date (tabele DB) vin din `Tables<"bookings">` etc. (`@/lib/database.types`).
Tipuri custom extinse se definesc în `api.ts` al feature-ului:
```ts
export type Booking = Tables<"bookings"> & {
  guests: { full_name: string; email: string | null } | null
}
```
Nu duplica tipuri între fișiere — re-exportă dacă ai nevoie în altă parte.

### 8. Stiluri

- Clase Tailwind, nu CSS inline (excepție: `style={{ position: "fixed", top, left }}` pentru poziționare dinamică JS)
- `cn(...)` din `@/lib/utils` pentru clase condiționale
- Variante noi de butoane → `cva` în `button.tsx`, nu `className` ad-hoc
- Mobile first: `flex-col sm:flex-row`, `hidden sm:inline`, etc.

---

## Convenții bază de date

- **Orice schimbare DB** → fișier nou în `supabase/migrations/` cu timestamp `YYYYMMDDHHMMSS_descriere.sql`
- **Nu modifica** migrații existente — adaugă una nouă cu `CREATE OR REPLACE` sau `ALTER`
- **RPC functions**: semnătura (parametri) e contractul cu frontend-ul. Dacă o schimbi, regenerezi `database.types.ts`:
  ```
  supabase gen types typescript --local > web/src/lib/database.types.ts
  ```
- **RLS**: orice tabel nou trebuie să aibă RLS activat + politici. Vezi `20260610110000_rls_and_rpc.sql` ca referință.
- **Anti double-booking**: `EXCLUDE USING gist (daterange(check_in, check_out) WITH &&)` pe `bookings` — nu înlocui cu logică în aplicație.
- **Documentația backend** (RPC-uri, RLS, triggers, model de securitate): `docs/backend/` — orice RPC/trigger/politică nouă se documentează acolo (checklist în `docs/backend/rpc/README.md`).
- **Grants pe funcții noi**: Postgres dă implicit EXECUTE la PUBLIC — întotdeauna `revoke ... from public, anon` + grant explicit. RPC security definer = autorizare explicită în primele linii (`app.can_access_property` / `app.user_org_ids`).
- **Unicitate oaspeți**: per org, pe email și pe telefon normalizat (indexuri unice parțiale + trigger de normalizare, migrația 7). Creare cu dedupe → RPC `find_or_create_guest`; insert direct poate da `23505` → mesajul `guests.duplicate`.

**Capcane tehnice (lecții învățate — nu le repeta):**
- `bookings.stay` e coloană **GENERATED** — nu o seta manual în INSERT/UPDATE; se calculează din check_in/check_out
- Orice funcție **trigger care citește tabele** trebuie să aibă `set search_path = ''` + nume calificate (`public.units`) — RPC-urile security definer rulează cu search_path gol și trigger-ele moștenesc asta
- Tranzițiile de status (forward + revert/undo) sunt validate în trigger DB `app.validate_booking_update` și oglindite în `web/src/features/bookings/status-rules.ts` — **modifică-le în ambele locuri simultan**
- `revertStatuses` e separat de `nextStatuses` intenționat — feature viitor de roluri va restricționa undo-ul la manager/owner
- Istoricul (audit) se afișează generic prin registrul `FIELDS` din `event-diff.tsx` — câmp nou în audit = o intrare în registru, fără logică pe event_type
- **Integritate cross-tabel (block↔booking)**: EXCLUDE nu funcționează între două tabele — validarea stă în triggers pe AMBELE direcții (`room_blocks_validate`, `bookings_block_guard`), serializate per cameră cu `pg_advisory_xact_lock`. Orice constrângere viitoare între două tabele urmează același pattern.
- **Culori de domeniu = registre centralizate** (`status-badge.tsx`, `unit-status.ts`, `block-reason.ts`), nu clase prin componente; tot ce e structural (hover, hașuri, fundaluri) stă pe tokens de temă (variabile CSS oklch din `index.css`). Hover pe suprafețe cu conținut randat = overlay separat (`bg-foreground/5`), nu înlocuire de background.
- **Dialog cu `useState` derivat din props ale părintelui → montează-l condiționat** (`{open && <Dialog .../>}`), niciodată necondiționat cu `open` doar ca prop. Un `useState(propCondiție ? a : b)` e un lazy initializer — citește `propCondiție` o singură dată, la montare; dacă dialogul e montat înainte ca datele părintelui (ex. `useQuery`) să se fi încărcat, starea inițială rămâne blocată pe valoarea greșită pentru toată sesiunea, indiferent ce devine prop-ul ulterior. Bug reprodus la `AddMemberDialog` (Sprint 6.4.1) — vezi `MemberEditor` din același fișier pentru pattern-ul corect (deja montat condiționat de `editing &&`).
- **`beforeLoad` al unei rute trebuie să precarce TOT ce citesc Provider-ii de context randați de acea rută**, nu doar entitatea principală a rutei. `/property/$propertyId` precarcă `property` dar randează și `OrgProvider` (care are nevoie de lista de organizații) — omiterea ei a dus la `currentOrg` undefined la navigare directă (Sprint 6.4.1). Query-urile independente din `beforeLoad` se pornesc **în paralel** (`Promise`-uri create înainte de primul `await`), nu secvențial — altfel navigarea așteaptă suma round-trip-urilor, nu maximul.

---

## Features implementate (rezumat)

- ✅ **Sprint 8 — Housekeeping**: stare de curățenie a camerei (`units.cleaning_status`: clean/dirty/inspected + `cleaning_status_at`), **separată** de starea operațională (`units.status`, Sprint 3) — curățenia nu blochează vânzarea camerei. **Auto Dirty**: trigger pe `bookings` (`app.checkout_sets_unit_dirty`) trece camera pe `dirty` automat la check-out, indiferent de rolul actorului (SECURITY DEFINER, ca audit-ul). **RBAC: zero permisiuni noi** — reutilizează `unit.manage` (Sprint 6.1, deja acordată rolului de sistem `housekeeping`); RLS `units_cud` gatează scrierea, iar RPC-ul de citire `get_housekeeping_board` verifică explicit `unit.manage` (nu doar membership — mai strict ca `get_dashboard_stats`). RPC nou `bulk_set_unit_cleaning_status` (selecție multiplă, INVOKER, RLS decide per rând). Audit extins pe trigger-ul existent `app.audit_unit` (ramură `cleaning_status_changed`, fără tabel nou) — vizibil automat în istoricul camerei și în Activity Feed (Sprint 7). Frontend **mobile-first** (`features/housekeeping/`): panou cu carduri tap-friendly, filtru „Necesită atenție" implicit, selecție multiplă cu „Selectează tot" (pe filtrul activ) + bară de acțiuni bulk; rută + nav nouă (`/property/$propertyId/housekeeping`), gate pe `unit.manage`; fiecare cameră arată „Nume actor · oră" pe ultima schimbare (`units.cleaning_status_by` uuid, capturat și pe Auto Dirty; numele rezolvat **server-side prin JOIN** `profiles`, nu mapare client-side — vezi Sprint 8.2). Evenimentul de audit `cleaning_status_changed` include numele camerei (`unit_name`). Teste DB TEST 102–106. Doc: [`docs/backend/rpc/housekeeping.md`](backend/rpc/housekeeping.md)
- ✅ **Sprint 8.2 — Actor prin JOIN server-side**: rezolvarea numelui actorului (housekeeping + Activity Feed) mutată din client (`useMembers` + hartă email→nume, ineficient la 2000 hoteluri × 100-200 angajați) în SQL. `get_housekeeping_board` și `get_activity_feed` fac `left join profiles on user_id = actor_id` cu `coalesce(full_name, email_snapshot)`; JOIN-ul e rapid (point lookup în PK-ul lui `profiles`, indiferent de mărime) și nu depinde de FK (coloanele de audit `actor_id` rămân intenționat fără FK, pentru imutabilitate). Reparat și booking events (nu aveau snapshot email → apăreau fără autor). + housekeeping „Selectează tot" (frontend). Teste DB TEST 106–107. Doc: [`audit.md`](backend/rpc/audit.md)
- ✅ **Sprint 7/7.1 — Audit & Activity Feed**: tabel generic `entity_events` + trigger generic `app.audit_entity` extind audit-ul existent (Sprint 3) la `properties`/`guests`/`payments`/`rate_rules`/`promotions`/`stay_rules`/`arrival_rules`/`closures` (create/update/archive/restore/delete). Feed unificat `get_activity_feed` (UNION peste toate sursele de audit, cu filtre `entity_types`/`event_types`/interval dată, index `entity_events_property_type_idx`). Gated pe permisiunea `audit.view` (**reutilizată** din Sprint 6.1, nu permisiune nouă) — RLS + gardă în RPC, nav și butoane „Istoric" gate-uite cu `<Can>`. Frontend `features/audit/` (panou cu filtre, cache cu `staleTime: 0` + refresh manual, paginare „Afișează mai mult"); `components/multi-select-filter.tsx` extras ca filtru reutilizabil. Teste TEST 98–101 (**289 PASS**). Doc: [`docs/backend/rpc/audit.md`](backend/rpc/audit.md)
- ✅ Auth (login/signup/logout), onboarding organizație
- ✅ CRUD proprietăți + pagina publică `/p/{slug}`
- ✅ Tipuri de camere + generare bulk + adăugare camere suplimentare la tip existent
- ✅ Stări camere: active/inactive/mentenanță/arhivate (arhivare blocată dacă rezervări viitoare)
- ✅ **Sprint 3 — Room Operations**: numerotare flexibilă la generare bulk (interval „101-120" sau count + start, parser în `unit-types/room-numbering.ts`), operațiuni bulk pe selecție (activare/dezactivare/arhivare, RPC `bulk_update_unit_status` cu raport parțial — camerele blocate de rezervări viitoare sunt listate pe nume), audit trail per cameră (`unit_events` + trigger `units_audit`, cu `actor_email`) și per tip de cameră (`unit_type_events`: preț/capacitate/nume + arhivare/reactivare); UI generic `event-history-dialog.tsx` cu wrappere per entitate, `EventDiff` reutilizabil cu registru de câmpuri injectabil; ștergerea tipului cu rezervări viitoare dă mesaj explicativ (nu doar eroare în consolă)
- ✅ **Sprint 3 — Availability Blocks**: statusul camerei = stare permanentă (`inactive`/`out_of_service` permise cu rezervări viitoare — rezervările rămân, doar cele noi sunt oprite; `archived` strict); indisponibilitate pe interval = tabel `room_blocks` (motiv structurat, EXCLUDE block↔block, triggers cross-tabel block↔booking cu advisory lock per cameră); availability = activ ∧ fără booking ∧ fără block (engine + pagina publică); UI: `block-dialog.tsx` (single + bulk, listă/ștergere blocaje), calendar cu badge status + celule gri pe camere non-active și bare hașurate pentru block-uri; blocajele intră în istoricul camerei
- ✅ Rezervări: creare cu alocare auto/manual, estimare cost, schimbare status, mutare cameră, audit trail
- ✅ **Booking lifecycle solid (Sprint 1–1.2)**: tranziții status validate server-side (trigger DB), modificare date rezervare (RPC + UI), undo/revert pe statusuri cu confirmare (modal pentru acțiuni timpurii/revert), istoric cu diff lizibil (vechi → nou), RLS fix
- ✅ Calendar (grilă camere × zile): tip + capacitate per cameră, tooltip detalii la click
- ✅ Oaspeți: search, creare inline cu anti-duplicare pe email/telefon
- ✅ **Sprint 2 — Guest Experience**: profil oaspete (`/app/guests/{id}`: editare, ștergere blocată dacă are rezervări, istoric paginat, statistici server-side total/viitoare/anulate via `get_guest_stats`), pagina rezervării (`/app/bookings/{id}`) cu snapshot vs profil + re-asociere profil (`link_booking_guest`), offset pagination pe toate listele (rezervări 20, oaspeți 20, istoric profil 15)
- ✅ **Sprint 4.5 — Pricing Engine & Occupancy**: capacitate = `max_adults`/`max_children` (înlocuiesc `capacity`; `base_capacity` eliminat — fără rol); ocupare adulți/copii ca steppere +/- peste tot (admin, public, formular tip cameră; adulți min 1, copii min 0; max = tipul ales sau 25); motor de preț **dinamic** `app.compute_price` — **sezoane** (per tip) + **override-uri** („tarif preferențial", din calendar, toate camerele tipului); override > sezon, iar la suprapunere în același kind câștigă cea mai recent modificată regulă (fără prioritate numerică); suprataxă weekend configurabilă; **snapshot imuabil** la creare (`total_amount` + `price_breakdown` jsonb). Calendarul pictează tariful pe celulele goale (`get_rate_calendar`). RPC noi: `quote_price`, `get_rate_calendar`. Validare „fără date trecute" doar în UI. occupancy pricing exclus intenționat. Feature `pricing/` (RateRulesDialog seasons, OverrideDialog, OccupancyStepper, PriceBreakdown). Doc: [`docs/backend/rpc/pricing.md`](backend/rpc/pricing.md)
- ✅ **Sprint 4.9 — Availability & Allocation Engine (strat de validatori)**: toate verificările de rezervare (occupancy/stay/restrictions/availability/promotion), înainte inline în `create_booking_internal` și duplicate în availability, extrase în **validatori SQL compozabili** `app.validate_*`, fiecare `{valid, errors[], warnings[]}` cu coduri. Orchestrator `app.validate_booking` (clasifică FIZIC=mereu eroare / SOFT=override→warning / COMERCIAL), predicat unic `app.unit_is_free`, scară canonică `app.booking_block_codes` (sursă unică, refolosită de `public_get_availability` pentru `reason`). RPC nou `validate_booking` (preview formular, înlocuiește `get_booking_restrictions`); `create_booking_internal`/`update_booking_dates`/`get_available_units` rescrise pe noul strat. Frontend: `useValidateBooking` + panou errors/warnings în formularul de creare + editare date. **Curățat drift Docker** (funcții orfane dintr-o versiune ștearsă) cu `supabase db reset`. Teste DB TEST 59 + 74 + 75 + 76 (181 PASS). Doc: [`docs/backend/rpc/validators.md`](backend/rpc/validators.md)
- ✅ **Sprint 4.8 — Promotions & Commercial Rules**: strat comercial de promoții (`promotions` + `promotion_rules`), separat de motorul de preț. Reduceri cu **cod** (ex. SUMMER10) sau **automate** prin condiții AND: `min_nights` (stay/long stay), `min_advance_days` (early booking), `max_advance_hours` (last minute) — tabel generic, extensibil fără schimbare de schemă. `discount_type` percent/amount, scope `unit_type_id` (null=toate), ferestre sejur+rezervare, `max_uses`/`uses_count`, `is_active`. **O singură promoție/rezervare** (cea mai mare reducere; codul are prioritate), **snapshot imuabil** (`bookings.promotion_id` + `discount_amount`), **limită atomică** la creare. Sursă unică `app.resolve_promotion` (admin + public). RPC `quote_price` extins + `public_preview_promo`; `create_booking`/`public_create_booking` cu `p_promo_code`. UI: dialog „Promoții" pe proprietate + câmp cod în formularul de rezervare (admin) și pe pagina publică, cu preview reducere; `PriceBreakdown` arată subtotal/reducere/total. Erori `PROMO_INVALID`/`PROMO_LIMIT_REACHED`. Teste DB TEST 62–70. Doc: [`docs/backend/rpc/promotions.md`](backend/rpc/promotions.md)
- ✅ **Sprint 4.7 — Stay Restrictions**: restricții de **sosire/plecare** (`arrival_rules`) unificate — pe zi a săptămânii (`weekdays`, ex. „fără sosiri Vi/Sâ") SAU pe dată fixă (`weekdays` NULL = CTA/CTD pe interval), cu `no_arrival` (CTA) / `no_departure` (CTD) și scope proprietate/tip (uniunea = cea mai restrictivă). **Gap de curățenie** `unit_types.turnover_days` (0..7) = constrângere fizică (extinde conflictul cu `gap` nopți pe ambele capete) → scade disponibilitatea peste tot. **Manager Override** (`p_override`, doar owner/manager) bypass-ează stratul soft (sosire/plecare, CTA/CTD, closures, min/max stay); fizicul (double-booking, blocaje, ocupare, gap) rămâne mereu; public = HARD. Enforcement în `create_booking_internal` + `update_booking_dates` (doar pe schimbarea datelor). RPC `get_booking_restrictions` (toate motivele simultan), `app.check_arrival_departure`. UI: dialog „Restricții sosire/plecare" pe proprietate (CTA/CTD debifate la deschidere) + stepper „Pauză de pregătire" în formularul de tip + panou cu toate motivele și comutator Manager Override în formularul de creare/editare date. **Calendar**: turnover = bară hașurată 🧹 după plecare; restricții sosire/plecare = marcaje de colț (ambră/violet) + legendă (tokens centralizați în `restriction-display.ts`, resolver O(reguli×zile)/lună). Teste DB TEST 55–61. Doc: [`docs/backend/rpc/stay-restrictions.md`](backend/rpc/stay-restrictions.md)
- ✅ **Sprint 4.6 — Reservation Rules Engine**: strat modular de restricții, separat de preț și de `room_blocks`. **min/max stay** global per tip (`unit_types.min_stay/max_stay`, 1..30, max≥min) + **`stay_rules`** pe perioade (suprascriu globalul, cheiat pe data de check-in, recență ca `rate_rules`). **`closures`** = stop-sell / closed dates cu **scope** (`unit_type_id` NULL = toată proprietatea; setat = un tip) — **distinct de `room_blocks`**: oprește vânzarea unui produs, nu blochează camere fizice. Enforcement în `app.create_booking_internal` (admin + public): `STAY_TOO_SHORT/LONG`, `DATES_CLOSED`. RPC `get_stay_constraints` (limitează check-out-ul în formular); `public_get_availability` filtrează închiderile + durata și întoarce min/max stay. UI: dialog „Reguli durată" per tip + buton „Stop sell / Închideri" la nivel de proprietate (`features/reservation-rules/`); formularul de rezervare limitează check-out-ul + afișează „Sejur minim". Occupancy (`max_adults/max_children`) era deja implementat. Teste DB TEST 45–52. Doc: [`docs/backend/rpc/reservation-rules.md`](backend/rpc/reservation-rules.md)
- ✅ **Sprint 4 — Pricing & Revenue**: snapshot preț/noapte pe rezervare (`bookings.unit_price`); **payments ledger** (`payments` — kind payment/refund, status pending/completed/failed, provider+provider_ref pregătite pentru Stripe & e-factură); stare plată = agregat cached (`payment_status` unpaid/partial/paid/refunded + `amount_paid`) întreținut de trigger din ledger; RPC `record_payment` + `get_revenue_summary` (venit azi/lună/an, server-side, în tz proprietății); feature frontend `payments/` (card plăți pe rezervare, dialog încasare/rambursare, carduri venit pe dashboard, coloană stare în listă); helper `lib/money.ts`. Doc: [`docs/backend/rpc/payments.md`](backend/rpc/payments.md)
- ✅ **Sprint 6.4.1 — Bugfix-uri post-restructurare URL org/proprietate**: dialogul „Adaugă membru" nu oferea selecția de proprietăți pentru actori restrânși (montare necondiționată + `useState` cu lazy initializer stale pe `actorRestricted`) — fix prin montare condiționată de `addOpen`, ca la `MemberEditor`; extras `PropertyAccessFields` (elimină duplicarea blocului de acces dintre cele două dialoguri). Crash „Cannot read properties of undefined (reading 'name')" la navigare directă pe `/property/$propertyId` — `OrgProvider` avea nevoie de lista de organizații, dar `beforeLoad` nu o precărca (doar `/org/$orgId` o făcea); fix: `ensureQueryData` pe lista de org-uri în `beforeLoad`, pornit în paralel cu fetch-ul proprietății. Verificare server-side (fără cod nou): rulat `db_tests.sql` complet — **266 PASS**, confirmă că gărzile anti-escaladare pe acces proprietăți (TEST 95b/97f, 93d/96c/97e, 87c/97c, 92a/93b) acoperă corect cazurile de bypass. Detalii: [`CHANGELOG.md`](CHANGELOG.md).
- ✅ **Sprint 6.3.2/6.3.3 — Autoritate, ierarhie clară & bugfix-uri**: model de autoritate prin **permisiuni „elevate" + tier-uri** (OWNER>ADMIN(`role.manage`)>MANAGER(`user.manage`)>BASE) — gestionezi doar tier strict mai mic, acorzi doar roluri sub tine, manager doar în proprietățile lui, roluri custom forțat de bază. **Ierarhie clară**: owner=tot+billing/abonament; admin=users/roluri/proprietăți(creare/ștergere)+org, fără billing; manager=operațional în proprietățile lui, **fără creare proprietăți**. **Bugfix critic**: adăugarea de proprietăți era blocată (RLS `can_access_property` re-interoga `properties` → `INSERT...RETURNING` eșua); fix `can_access_property_row(org_id,id)` pe coloane. Frontend: cache golit la logout, gate `<Can>` peste tot (gata cu fals „succes"), membri cu owner-first/„tu"/paginare + `useAuthority`, **org switcher** în sidebar. Teste TEST 92–94 (**253 PASS**). Doc: [`rbac.md §10`](backend/rbac.md)
- ✅ **Sprint 6.3 — Member Management, Custom Roles & Profiles**: identitate `profiles` (+ trigger signup, nume editabil); management membri (`#settings/members`): adăugare cont existent după email (`add_member`), roluri multiple, acces per-proprietate segmentat, transfer ownership, eliminare — toate prin RPC-uri DEFINER gate pe `user.manage`/owner; editor roluri custom (`#settings/roles`, gate `role.manage`) cu permisiuni grupate pe domeniu + roluri expandabile (catalog lazy). **Gărzi anti-escaladare (6.3.1)**: regula subset (nu acorzi roluri peste permisiunile tale → `INSUFFICIENT_GRANT`) + fără self-modificare (`CANNOT_EDIT_SELF`/`CANNOT_REMOVE_SELF`). Confirmare cu tastat (email) la remove/transfer. Separare staff/guest păstrată (`add_member` nu atinge `guests`). Teste TEST 85–92 (**242 PASS**). Doc: [`docs/backend/rpc/members.md`](backend/rpc/members.md). **Bugfix**: butonul „Salvează" la rezervare (zod 4 `.uuid()` respingea uuid-uri seed → `.min(1)`).
- ✅ **Sprint 6.2 — RBAC Enforcement**: autorizarea de scriere pe domeniile operaționale (bookings/guests/pricing/properties/units/payments/promotions/reguli) trece de la enum (`is_org_role`) la permisiuni granulare (`app.has_permission`) — RLS + gărzi în RPC-uri. Permisiune `booking.override` (Manager Override). RPC `get_my_permissions` + frontend `usePermissions`/`<Can>` (`features/auth/`) cu nav filtrat și gate-uri pe acțiuni. Admin (org/membri) rămâne pe enum (→ 6.3). Teste TEST 80–84 (**213 PASS**). Doc: [`docs/frontend/permissions.md`](frontend/permissions.md) + [`rbac.md §9`](backend/rbac.md)
- ✅ **Sprint 6.1 — RBAC Foundation** (fundație DB, fără enforcement): autorizarea trece de la enum fix (`owner/manager/staff`) la model **roluri → permisiuni granulare**, multiple roluri/membru (union), roluri de sistem + spațiu pt. custom, owner structural separat (`organizations.owner_user_id`). Tabele `permissions/roles/role_permissions/member_roles`; helperii `app.has_permission`/`app.user_permissions` (aditivi, încă neapelați — enforcement în 6.2). **Zero regresie**: trigger `sync_member_role` oglindește enum-ul în `member_roles`, deci codul existent populează noul model fără modificări. **Separare actori staff/guest** documentată pt. conturi de oaspeți viitoare (fără suprapunere). Teste TEST 79. **Doc master + roadmap 6.1–6.6: [`docs/backend/rbac.md`](backend/rbac.md)**
- ✅ **Sprint 5 — Analytics & Dashboard**: panou operațional în stil Mews. RPC unic `get_dashboard_stats` (agregare server-side, în tz proprietății, o trecere `FILTER` peste `bookings` + `count` pe `units`): sosiri/plecări azi, oaspeți în casă, grad de ocupare, camere ocupate/disponibile (`occupied ⊆ active` → invariant `ocupate+disponibile=total`), rezervări create lună/an + anulări lună. Venitul rămâne separat (`get_revenue_summary`, reutilizat). Feature `dashboard/` (api/hooks + `StatCard` reutilizabil + secțiuni `Astăzi/Ocupare/Rezervări`, toate pe același query → un fetch). Invalidare `dashboardKeys.all` la mutații pe rezervări + pe camere active. UI simplu (redesign viitor: doar `StatCard` se schimbă). Teste DB TEST 78. Doc: [`docs/backend/rpc/dashboard.md`](backend/rpc/dashboard.md)
- ✅ User menu (popover) + dialog setări cu hash routing (`#settings/account`)
- ✅ Mobile responsive: sidebar hamburger, layout adaptat pe toate paginile
- ✅ i18n complet în română

---

## Ce urmează (idei — nicio decizie luată)

- **Plăți reale** — `payments` ledger e pregătit (provider/provider_ref/status); de adăugat integrarea Stripe (webhook → insert `provider='stripe'`, `status` din eveniment) + e-factură (`provider_ref` = serie factură)
- **Email notifications** — confirmare rezervare, reminder check-in
- **Multi-user / RBAC**: fundația e gata (Sprint 6.1), enforcement operațional (6.2), management membri + roluri custom + profiles (6.3), invitații (link/token, email-ready, încă neimplementat). Audit operațional livrat (Sprint 7 — `entity_events`, gated pe `audit.view`); rămâne deschis un jurnal generic de **acțiuni administrative** (schimbări de rol/permisiuni/membri — distinct de auditul operațional pe entități, vezi [`docs/backend/rbac.md` §7](backend/rbac.md)) + 6.6 planuri & limite. Roadmap complet cu status: [`docs/backend/rbac.md`](backend/rbac.md)
- **Pagina publică mai completă** — descriere proprietate, galerie, disponibilitate pe calendar
- **Setări extinse** — `#settings/notifications`, `#settings/billing` etc. (SECTIONS array e scalabil în `settings-dialog.tsx`)
- **Export** — CSV rezervări, rapoarte ocupare
- **Dashboard extins** — bază operațională livrată (Sprint 5); de adăugat: serii temporale/grafice, RevPAR/ADR, comparații perioadă, occupancy care scade și blocajele (acum doar bookings)

---

## Fișiere de referință importante

| Fișier | De ce e important |
|---|---|
| [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) | Schema DB completă, RLS, decizii de design |
| [`docs/backend/README.md`](backend/README.md) | **Documentația backend**: inventar RPC-uri, securitate, RLS, triggers |
| [`docs/backend/rbac.md`](backend/rbac.md) | **RBAC & multi-tenant** (Sprint 6): model actori staff/guest, roluri/permisiuni, roadmap 6.1–6.6 |
| [`docs/CHANGELOG.md`](CHANGELOG.md) | Ce s-a implementat per sprint, cu detalii despre cum s-a procedat |
| [`web/src/features/bookings/hooks.ts`](../web/src/features/bookings/hooks.ts) | Pattern canonic api/hooks cu query keys |
| [`web/src/features/bookings/reassign-dialog.tsx`](../web/src/features/bookings/reassign-dialog.tsx) | Pattern de referință pentru dialog-uri de acțiune pe booking |
| [`web/src/features/auth/settings-dialog.tsx`](../web/src/features/auth/settings-dialog.tsx) | Pattern hash routing cu TanStack |
| [`web/src/routes/_app.tsx`](../web/src/routes/_app.tsx) | Layout principal, sidebar, navigare |
| [`web/src/lib/i18n/ro.ts`](../web/src/lib/i18n/ro.ts) | Toate textele UI |
| [`supabase/migrations/`](../supabase/migrations/) | Istoricul schemei DB |
