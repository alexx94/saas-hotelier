# SaaS Hotelier — Handoff pentru continuarea dezvoltării

> Document de context pentru o sesiune nouă. Citește și `ARCHITECTURE.md` pentru schema DB completă.

---

## Starea curentă a proiectului (16 iun 2026 — Sprint 4.8 complet)

Aplicație PMS multi-tenant funcțională. Tot codul e pe GitHub:
**https://github.com/alexx94/saas-hotelier**

Repo public. `web/.env.local` nu e în repo (exclus corect din `.gitignore`).
Pentru a porni local: `supabase start` → `cd web && cp .env.example .env.local` (completezi cu valorile din output) → `npm install && npm run dev`.

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
      property-select.tsx
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
                          get_stay_constraints + get_booking_restrictions
      stay-rules-dialog.tsx ← reguli durată sejur per tip (min/max stay pe perioade)
      closures-dialog.tsx   ← stop-sell / închideri (toată proprietatea sau un tip)
      arrival-rules-dialog.tsx ← restricții sosire/plecare CTA/CTD (Sprint 4.7)
      restriction-display.ts ← tokens calendar + resolver restricții pe zi (Sprint 4.7)
    promotions/         ← promoții & reduceri comerciale (Sprint 4.8)
      api.ts / hooks.ts ← promotions + promotion_rules CRUD
      promotions-dialog.tsx ← creare/listare promoții (cod/automată + condiții + limită)
    organizations/
      api.ts
      hooks.ts
      context.tsx     ← OrgProvider + useCurrentOrg()
    auth/
      hooks.ts        ← requireSession()
      user-menu.tsx   ← popover trigger pentru meniu user
      settings-dialog.tsx ← dialog setări cu hash routing
  routes/             ← file-based TanStack Router
    __root.tsx
    _app.tsx          ← layout autentificat (sidebar, nav, UserMenu)
    _app/app/
      index.tsx       ← Dashboard
      calendar.tsx
      bookings/
        index.tsx
        $bookingId.tsx
      guests/
        index.tsx
        $guestId.tsx
      properties/
        index.tsx
        $propertyId.tsx
    login.tsx
    signup.tsx
    onboarding.tsx
    p.$slug.tsx       ← pagina publică de rezervare
  components/ui/      ← shadcn/ui (nu modifica direct dacă nu e necesar)
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

---

## Features implementate (rezumat)

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
- ✅ **Sprint 4.8 — Promotions & Commercial Rules**: strat comercial de promoții (`promotions` + `promotion_rules`), separat de motorul de preț. Reduceri cu **cod** (ex. SUMMER10) sau **automate** prin condiții AND: `min_nights` (stay/long stay), `min_advance_days` (early booking), `max_advance_hours` (last minute) — tabel generic, extensibil fără schimbare de schemă. `discount_type` percent/amount, scope `unit_type_id` (null=toate), ferestre sejur+rezervare, `max_uses`/`uses_count`, `is_active`. **O singură promoție/rezervare** (cea mai mare reducere; codul are prioritate), **snapshot imuabil** (`bookings.promotion_id` + `discount_amount`), **limită atomică** la creare. Sursă unică `app.resolve_promotion` (admin + public). RPC `quote_price` extins + `public_preview_promo`; `create_booking`/`public_create_booking` cu `p_promo_code`. UI: dialog „Promoții" pe proprietate + câmp cod în formularul de rezervare (admin) și pe pagina publică, cu preview reducere; `PriceBreakdown` arată subtotal/reducere/total. Erori `PROMO_INVALID`/`PROMO_LIMIT_REACHED`. Teste DB TEST 62–70. Doc: [`docs/backend/rpc/promotions.md`](backend/rpc/promotions.md)
- ✅ **Sprint 4.7 — Stay Restrictions**: restricții de **sosire/plecare** (`arrival_rules`) unificate — pe zi a săptămânii (`weekdays`, ex. „fără sosiri Vi/Sâ") SAU pe dată fixă (`weekdays` NULL = CTA/CTD pe interval), cu `no_arrival` (CTA) / `no_departure` (CTD) și scope proprietate/tip (uniunea = cea mai restrictivă). **Gap de curățenie** `unit_types.turnover_days` (0..7) = constrângere fizică (extinde conflictul cu `gap` nopți pe ambele capete) → scade disponibilitatea peste tot. **Manager Override** (`p_override`, doar owner/manager) bypass-ează stratul soft (sosire/plecare, CTA/CTD, closures, min/max stay); fizicul (double-booking, blocaje, ocupare, gap) rămâne mereu; public = HARD. Enforcement în `create_booking_internal` + `update_booking_dates` (doar pe schimbarea datelor). RPC `get_booking_restrictions` (toate motivele simultan), `app.check_arrival_departure`. UI: dialog „Restricții sosire/plecare" pe proprietate (CTA/CTD debifate la deschidere) + stepper „Pauză de pregătire" în formularul de tip + panou cu toate motivele și comutator Manager Override în formularul de creare/editare date. **Calendar**: turnover = bară hașurată 🧹 după plecare; restricții sosire/plecare = marcaje de colț (ambră/violet) + legendă (tokens centralizați în `restriction-display.ts`, resolver O(reguli×zile)/lună). Teste DB TEST 55–61. Doc: [`docs/backend/rpc/stay-restrictions.md`](backend/rpc/stay-restrictions.md)
- ✅ **Sprint 4.6 — Reservation Rules Engine**: strat modular de restricții, separat de preț și de `room_blocks`. **min/max stay** global per tip (`unit_types.min_stay/max_stay`, 1..30, max≥min) + **`stay_rules`** pe perioade (suprascriu globalul, cheiat pe data de check-in, recență ca `rate_rules`). **`closures`** = stop-sell / closed dates cu **scope** (`unit_type_id` NULL = toată proprietatea; setat = un tip) — **distinct de `room_blocks`**: oprește vânzarea unui produs, nu blochează camere fizice. Enforcement în `app.create_booking_internal` (admin + public): `STAY_TOO_SHORT/LONG`, `DATES_CLOSED`. RPC `get_stay_constraints` (limitează check-out-ul în formular); `public_get_availability` filtrează închiderile + durata și întoarce min/max stay. UI: dialog „Reguli durată" per tip + buton „Stop sell / Închideri" la nivel de proprietate (`features/reservation-rules/`); formularul de rezervare limitează check-out-ul + afișează „Sejur minim". Occupancy (`max_adults/max_children`) era deja implementat. Teste DB TEST 45–52. Doc: [`docs/backend/rpc/reservation-rules.md`](backend/rpc/reservation-rules.md)
- ✅ **Sprint 4 — Pricing & Revenue**: snapshot preț/noapte pe rezervare (`bookings.unit_price`); **payments ledger** (`payments` — kind payment/refund, status pending/completed/failed, provider+provider_ref pregătite pentru Stripe & e-factură); stare plată = agregat cached (`payment_status` unpaid/partial/paid/refunded + `amount_paid`) întreținut de trigger din ledger; RPC `record_payment` + `get_revenue_summary` (venit azi/lună/an, server-side, în tz proprietății); feature frontend `payments/` (card plăți pe rezervare, dialog încasare/rambursare, carduri venit pe dashboard, coloană stare în listă); helper `lib/money.ts`. Doc: [`docs/backend/rpc/payments.md`](backend/rpc/payments.md)
- ✅ User menu (popover) + dialog setări cu hash routing (`#settings/account`)
- ✅ Mobile responsive: sidebar hamburger, layout adaptat pe toate paginile
- ✅ i18n complet în română

---

## Ce urmează (idei — nicio decizie luată)

- **Plăți reale** — `payments` ledger e pregătit (provider/provider_ref/status); de adăugat integrarea Stripe (webhook → insert `provider='stripe'`, `status` din eveniment) + e-factură (`provider_ref` = serie factură)
- **Email notifications** — confirmare rezervare, reminder check-in
- **Multi-user**: invitare membri în organizație (tabelul `organization_members` există)
- **Pagina publică mai completă** — descriere proprietate, galerie, disponibilitate pe calendar
- **Setări extinse** — `#settings/notifications`, `#settings/billing` etc. (SECTIONS array e scalabil în `settings-dialog.tsx`)
- **Export** — CSV rezervări, rapoarte ocupare
- **Dashboard** — statistici reale (acum e placeholder)

---

## Fișiere de referință importante

| Fișier | De ce e important |
|---|---|
| [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) | Schema DB completă, RLS, decizii de design |
| [`docs/backend/README.md`](backend/README.md) | **Documentația backend**: inventar RPC-uri, securitate, RLS, triggers |
| [`docs/CHANGELOG.md`](CHANGELOG.md) | Ce s-a implementat per sprint, cu detalii despre cum s-a procedat |
| [`web/src/features/bookings/hooks.ts`](../web/src/features/bookings/hooks.ts) | Pattern canonic api/hooks cu query keys |
| [`web/src/features/bookings/reassign-dialog.tsx`](../web/src/features/bookings/reassign-dialog.tsx) | Pattern de referință pentru dialog-uri de acțiune pe booking |
| [`web/src/features/auth/settings-dialog.tsx`](../web/src/features/auth/settings-dialog.tsx) | Pattern hash routing cu TanStack |
| [`web/src/routes/_app.tsx`](../web/src/routes/_app.tsx) | Layout principal, sidebar, navigare |
| [`web/src/lib/i18n/ro.ts`](../web/src/lib/i18n/ro.ts) | Toate textele UI |
| [`supabase/migrations/`](../supabase/migrations/) | Istoricul schemei DB |
