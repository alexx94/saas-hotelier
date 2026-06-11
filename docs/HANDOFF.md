# SaaS Hotelier — Handoff pentru continuarea dezvoltării

> Document de context pentru o sesiune nouă. Citește și `ARCHITECTURE.md` pentru schema DB completă.

---

## Starea curentă a proiectului (11 iun 2026)

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
    unit-types/
      api.ts
      hooks.ts
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
      bookings.tsx
      guests.tsx
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

---

## Features implementate (rezumat)

- ✅ Auth (login/signup/logout), onboarding organizație
- ✅ CRUD proprietăți + pagina publică `/p/{slug}`
- ✅ Tipuri de camere + generare bulk + adăugare camere suplimentare la tip existent
- ✅ Stări camere: active/inactive/mentenanță/arhivate (arhivare blocată dacă rezervări viitoare)
- ✅ Rezervări: creare cu alocare auto/manual, estimare cost, schimbare status, mutare cameră, audit trail
- ✅ **Booking lifecycle solid (Sprint 1–1.2)**: tranziții status validate server-side (trigger DB), modificare date rezervare (RPC + UI), undo/revert pe statusuri cu confirmare (modal pentru acțiuni timpurii/revert), istoric cu diff lizibil (vechi → nou), RLS fix
- ✅ Calendar (grilă camere × zile): tip + capacitate per cameră, tooltip detalii la click
- ✅ Oaspeți: search, creare inline cu anti-duplicare pe email/telefon
- ✅ User menu (popover) + dialog setări cu hash routing (`#settings/account`)
- ✅ Mobile responsive: sidebar hamburger, layout adaptat pe toate paginile
- ✅ i18n complet în română

---

## Ce urmează (idei — nicio decizie luată)

- **Payments/facturare** — `bookings.total_amount` există; lipsește tabelul `payments` + UI
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
