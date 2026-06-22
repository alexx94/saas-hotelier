# RPC — Housekeeping (Sprint 8)

> Stare de **curățenie** a camerei (`clean`/`dirty`/`inspected`), separată de starea **operațională** (`units.status`: active/inactive/out_of_service/archived — Sprint 3). RBAC reutilizat integral din Sprint 6: **nicio permisiune nouă** — `unit.manage` (deja existentă, deja acordată rolului de sistem `housekeeping`) gatează totul, server-side.

## Coloane noi pe `units`

| Coloană | Definiție |
|---|---|
| `cleaning_status` | `clean` (implicit) / `dirty` / `inspected` |
| `cleaning_status_at` | momentul ultimei schimbări — actualizat automat de trigger `units_touch_cleaning_status` (BEFORE UPDATE), nu de aplicație |
| `cleaning_status_by` | `uuid` (FK `auth.users`) — actorul ultimei schimbări, din `auth.uid()`, setat de același trigger. Capturat indiferent dacă schimbarea e manuală sau automată (Auto Dirty) — e cine a declanșat efectiv acțiunea (housekeeper care marchează cameră, SAU recepția care a apăsat check-out), nu un „system user" artificial. (migrația `20260622130000`, reconvertit din text-email la uuid în `20260622140000` — vezi mai jos) |

## Auto Dirty — `app.checkout_sets_unit_dirty()` (trigger pe `bookings`)

La `bookings.status -> 'checked_out'`, camera asociată trece automat pe `dirty` (dacă nu era deja). **SECURITY DEFINER**: actorul care face check-out e de regulă recepție (`booking.edit`), care nu are `unit.manage` — trigger-ul scrie pe `units` indiferent de rolul celui ce a apăsat „Check-out", la fel cum `app.audit_unit`/`app.audit_booking` scriu audit indiferent de rol. Nicio logică de „auto vs manual" în date — actorul înregistrat în `unit_events` e cel care a declanșat checkout-ul (consistent, nu un „system user" artificial).

Nu există tranziție inversă automată: dacă un check-out e anulat (`checked_out -> checked_in`), camera rămâne pe statusul de curățenie curent.

## `get_housekeeping_board(p_property_id) returns table(...)`

**Scop**: panoul housekeeping — o trecere per proprietate (camere active+inactive, fără arhivate), adnotată cu ocupare/sosire/plecare **azi** (în tz-ul proprietății). Aceeași filozofie ca `get_dashboard_stats` (Sprint 5): agregare server-side, fără N+1 din frontend.

| Coloană | Definiție |
|---|---|
| `unit_id` / `unit_name` / `unit_type_name` / `unit_status` | identitate cameră |
| `cleaning_status` / `cleaning_status_at` | starea de curățenie curentă + când |
| `cleaning_status_by_name` | **numele afișabil** al actorului ultimei schimbări — `coalesce(profiles.full_name, auth.users.email)`, rezolvat prin JOIN **în RPC**, nu pe frontend (vezi nota de mai jos) |
| `occupied_today` | există o ședere `checked_in` care acoperă azi |
| `arrival_today` | există o rezervare `pending`/`confirmed` cu `check_in = azi` |
| `departure_today` | există o ședere `checked_in` cu `check_out = azi` |

| | |
|---|---|
| Migrație | `20260622100000` |
| Security | DEFINER, `stable` (`set search_path = ''`) |
| Grants | `authenticated` ✅ · `anon`/PUBLIC ❌ |
| Autorizare | `app.can_access_property` (izolare tenant) **și** `app.has_permission(org_id, property_id, 'unit.manage')` → `FORBIDDEN`. Verificare dublă, intenționat: panoul e o suprafață operațională dedicată housekeeping-ului, nu un view general ca dashboard-ul (acolo permisiunile `*.view` sunt gatate doar în UI — vezi `rbac.md` §enforcement). Reception/finance/readonly sunt membri ai org-ului și văd proprietatea, dar nu pot citi panoul. |
| Frontend | `features/housekeeping/api.ts` → `fetchHousekeepingBoard()`, hook `useHousekeepingBoard`, randat în `housekeeping-board.tsx` |

**Numele actorului = JOIN în RPC, nu mapare client-side** (migrația `20260622140000`, fix după revizuire). Prima variantă stoca un snapshot de email pe `units` și frontend-ul rezolva email→nume aducând **toată lista de membri ai organizației** (`get_org_members`) doar pentru un lookup pe câteva camere — ineficient la organizații cu mulți angajați (fetch + listă întreagă, doar ca să afișezi 5-10 nume). Fix: `cleaning_status_by` stochează `uuid`-ul actorului, iar `get_housekeeping_board` face `LEFT JOIN profiles` (+ `LEFT JOIN auth.users` pentru fallback dacă nu există `full_name`) și întoarce direct `cleaning_status_by_name` — un singur RPC, zero fetch-uri suplimentare pe frontend, zero `useMemo`/Map de rezolvare.

## `bulk_set_unit_cleaning_status(p_unit_ids, p_status) returns int`

Schimbare în masă (selecție multiplă pe mobil/desktop). **SECURITY INVOKER** — ca `bulk_update_unit_status` (Sprint 3): RLS (`units_cud` / `unit.manage`) autorizează fiecare rând individual; rândurile pe care actorul nu are voie sunt pur și simplu omise din `UPDATE` (0 din numărul returnat), fără excepție. Fără raport parțial pe nume (ca la statusul operațional) — curățenia nu interacționează cu rezervările viitoare, deci nimic nu poate fi „blocat".

| | |
|---|---|
| Migrație | `20260622100000` |
| Security | INVOKER (implicit) |
| Grants | `authenticated` ✅ · `anon`/PUBLIC ❌ |
| Frontend | `features/housekeeping/api.ts` → `bulkSetUnitCleaningStatus()`, hook `useBulkSetUnitCleaningStatus`. UI: mod de selecție multiplă cu „Selectează tot" (bifează camerele din **filtrul activ**) + bară de acțiuni bulk (Sprint 8.2). Trimite array-ul de id-uri (un singur `UPDATE ... WHERE id = ANY(...)`); fără variantă `WHERE property_id` — diferența e insesizabilă la 100-200 camere, iar array-ul păstrează granularitatea pe filtru + RLS per rând. |

## Scrierea individuală (fără RPC)

`setUnitCleaningStatus()` (api.ts) face un `UPDATE units SET cleaning_status = ...` direct prin supabase-js, identic cu `setUnitStatus` (statusul operațional, Sprint 3) — RLS (`units_cud`) e suficientă, nu e nevoie de un RPC dedicat pentru schimbarea unei singure camere.

## Audit

`app.audit_unit()` (trigger existent pe `units`, Sprint 3) e extins cu o ramură `cleaning_status_changed` — același tabel `unit_events`, același trigger, niciun tabel nou. Înregistrarea e generică (`old_data`/`new_data` jsonb) și se afișează automat:
- în istoricul camerei (`unit-history-dialog.tsx`, via registry `UNIT_FIELDS`/`UNIT_EVENT_LABEL` din `unit-fields.ts`)
- în Activity Feed unificat (Sprint 7), via `ACTIVITY_FEED_CONFIG.unit` — fără nicio modificare la `get_activity_feed` sau la pagina de activitate.

Evenimentul `cleaning_status_changed` include și `unit_name` (numele camerei) în `new_data` — câmp **unilateral** (doar `new_data`, ca `unit` la `audit_booking`), nu un diff propriu-zis: `EventDiff` îl arată ca valoare simplă pentru că `old_data` nu are cheia `unit_name`. Fără asta, Activity Feed arăta generic „Cameră: curățenie schimbată" fără să spună **care** cameră — problemă reală doar la nivel de feed global, nu în dialogul de istoric per-cameră (unde camera e deja evidentă din context), dar înregistrarea e aceeași pentru ambele, deci afișează redundant (inofensiv) și în dialogul per-cameră.

**Teste**: `db_tests.sql` TEST 102–106 (scriere individuală pe `unit.manage` pozitiv/negativ pentru housekeeping/manager/reception, `cleaning_status_at` automat, `get_housekeeping_board` gated pe `unit.manage` — nu doar membership — + izolare tenant, `bulk_set_unit_cleaning_status` RLS, Auto Dirty la checkout + auditul lui, `cleaning_status_by` capturat corect pe schimbare manuală și automată, `unit_name` în evenimentul de audit, `cleaning_status_by_name` rezolvat prin JOIN).

## Scalabilitate & contract de ștergere

Housekeeping e **aditiv și autonom** — nimic altceva nu citește `cleaning_status`/`cleaning_status_at`:
- Engine-ul de disponibilitate/preț/rezervări nu e atins — curățenia nu blochează vânzarea camerei (decizie intenționată: o cameră `dirty` poate fi rezervată, housekeeping-ul e operațional, nu comercial; dacă se dorește vreodată blocarea vânzării camerelor murdare, e un strat separat peste `room_blocks`, nu o schimbare aici).
- Singura legătură spre exterior: trigger-ul de pe `bookings` (checkout → dirty) și extensia la `app.audit_unit()`/`UNIT_FIELDS` (ambele aditive, nu modifică comportament existent).
- De șters la eliminare completă: folderul `features/housekeeping/`, ruta `routes/_app/property/$propertyId/housekeeping.tsx`, intrarea din `propertyNav` (`app-shell.tsx`), cheile `housekeeping.*`/`unit.cleaning.*`/`unit.cleaning_status_label`/`unit.event.cleaning_status_changed` din `i18n/ro.ts`, intrările `cleaning_status`/`unit_name` din `UNIT_FIELDS` (`unit-fields.ts`), coloanele + funcțiile + trigger-ele din migrațiile `20260622100000`/`20260622130000`/`20260622140000` (migrație nouă de `drop`, nu se editează cele vechi), TEST 102–106.
