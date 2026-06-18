# Changelog — SaaS Hotelier PMS

Documentul înregistrează ce a existat la start, ce s-a adăugat în fiecare sprint și cum s-a procedat.
Fiecare sesiune/sprint adaugă o secțiune nouă în ordine cronologică inversă.

---

## Sprint 6.2 — RBAC Enforcement (18 iun 2026)

### Obiectiv

Activarea fundației din 6.1: autorizarea de scriere pe domeniile operaționale trece de la enum (`is_org_role` owner/manager) la **permisiuni granulare** (`app.has_permission`). O recepție nu mai editează tarife, housekeeping nu mai creează rezervări, finance rambursează dar nu schimbă prețuri etc. Frontend-ul capătă gate-uri declarative.

### Decizii (arhitectură)

- **Domeniu operațional, nu admin**: gate-uite tabelele bookings/guests/pricing/properties/units/payments/promotions/reguli. `organizations`/`organization_members`/`member_property_access` rămân pe enum (UI de management membri + logica anti-escaladare = 6.3). Enum-ul rămâne bridge → `is_org_role` funcționează unde nu-l atingem.
- **SELECT = izolare de tenant**; permisiunile `*.view` se aplică în UI (nav/acțiuni ascunse). Gating-ul pe SELECT ar rupe citiri compuse — se poate adăuga țintit ulterior.
- **Non-lockout**: owner structural + rol Administrator → toți userii actuali trec orice `has_permission`. Cele 192 teste anterioare (rulează ca administrator) rămân verzi.
- Permisiune nouă `booking.override` (Manager Override) acordată administrator+manager, înlocuind `is_org_role` din gărzile de override.

### Soluția (migrația `20260618140000_rbac_enforcement.sql`)

- RLS de scriere remapat pe `has_permission(org, property, key)` (drop+recreate, fără atingerea migrațiilor vechi); `guests` split din `for all` în select/insert/update/delete.
- Gărzi în RPC-uri DEFINER: `create_booking`/`update_booking_dates`/`reassign_booking`/`record_payment`/`link_booking_guest`/`validate_booking`. `record_payment` cere `payment.refund` suplimentar pentru `kind='refund'`.
- RPC nou `get_my_permissions(org)` (wrapper peste `app.user_permissions`) pentru hidratarea UI-ului.
- Teste `db_tests.sql` TEST 80–84: RLS scriere ±, gărzi RPC FORBIDDEN, permisiune×acces proprietate, Manager Override, `get_my_permissions` union/cross-org. **213 PASS**.

### Frontend (`features/auth/`)

- `permissions.ts` (`usePermissions` + `useHasPermission` + `permissionKeys`) → `get_my_permissions`; `can.tsx` (`<Can permission>`). Gate-uri pe „Adaugă rezervare" (`booking.create`), încasare/rambursare (`payment.record`/`payment.refund`), „Adaugă proprietate" (`property.create`) și **nav filtrat** după `*.view` (`SidebarNav`). Harta completă acțiune→permisiune: [`docs/frontend/permissions.md`](frontend/permissions.md). UI-ul nu e autoritatea — DB respinge oricum.

---

## Sprint 6.1 — RBAC Foundation (18 iun 2026)

### Obiectiv

Primul pas spre un PMS multi-user real: înlocuirea autorizării rudimentare (enum fix `owner/manager/staff` + `is_org_role` hardcodat în RLS) cu o **fundație RBAC scalabilă** — roluri configurabile, permisiuni granulare pe acțiuni, multiple roluri per membru. Spec-ul complet (RBAC + invitații + audit + planuri + workspace switcher) ≈ 5 sub-sprinturi; **acum doar fundația 6.1**, restul documentat ca roadmap. Doc master: [`docs/backend/rbac.md`](backend/rbac.md).

### Decizii (arhitectură)

- **Două lane-uri de principali** (scalabilitate viitoare impusă de la început): **staff** (membru org → RBAC) vs **guest** (viitor: `guests.user_id` → ownership). Catalogul de permisiuni e exclusiv pentru staff; conturile de oaspeți vor fi un lane ortogonal, fără suprapunere pe backend sau UI. Previne coliziuni când se adaugă self-booking gen Booking.com.
- **Multiple roluri per membru** (`member_roles`), permisiunile se cumulează (union) — ca la Mews. Roluri de **sistem** (globale, `org_id NULL`) + spațiu pentru roluri **custom** per org. Permisiuni `domeniu.acțiune` (31 în catalog).
- **Owner structural** separat de roluri (`organizations.owner_user_id`, 1/org, transferabil) → bypass de permisiuni; baza pt. billing și garda „un owner" (6.3).
- **Enforcement rule**: `has_permission` = permisiune deținută **ȘI** acces pe proprietate (`can_access_property`), cu owner-bypass.
- **Zero regresie**: enum-ul rămâne sursa, un **trigger** (`app.sync_member_role`) oglindește automat `member_roles` din enum → tot codul existent populează noul model fără modificări. Helperii `has_permission`/`user_permissions` sunt aditivi, **încă neapelați** (enforcement în 6.2).

### Soluția (migrația `20260618130000_rbac_foundation.sql`)

- Tabele `permissions` (seed catalog), `roles` (6 roluri de sistem + RLS), `role_permissions`, `member_roles`; `organizations.owner_user_id` (nullable în 6.1, NOT NULL în 6.3) cu backfill.
- Triggere: `sync_member_role` (bridge enum→member_roles), `check_member_role_org` (guard cross-tenant → `ROLE_ORG_MISMATCH`). `create_organization` setează `owner_user_id`.
- Helperi `app.user_permissions(org)` + `app.has_permission(org, property, key)`.
- Teste `db_tests.sql` TEST 79 (a–e): backfill prin trigger, has_permission (permisiune/union/scoping), izolare cross-org, owner-bypass. **192 PASS**.
- Documentație: `rbac.md` (master cu roadmap 6.1–6.6 + status), `helpers.md`, `rpc/README.md`, `rls-policies.md`, `ARCHITECTURE.md`.

### Ce NU s-a atins

Politicile RLS, `is_org_role`/`can_access_property`, toate RPC-urile — neschimbate (excepție aditivă: `create_organization`). Aplicația se comportă identic.

---

## Sprint 5 — Analytics & Dashboard (18 iun 2026)

### Obiectiv

Panoul (`/app`) afișa doar cardurile de venit; restul era placeholder. Sprint 5 îl transformă într-un dashboard operațional în stil Mews: sosiri/plecări de azi, oaspeți în casă, grad de ocupare, camere ocupate/disponibile și volum de rezervări (lună/an + anulări).

### Decizii (arhitectură)

- **Un singur RPC** `get_dashboard_stats(p_property_id)` întoarce toate metricile operaționale într-un rând — agregare **server-side** (convenția proiectului: nu se numără pe client), în **timezone-ul proprietății**, o trecere peste `bookings` cu `FILTER` + un `count` pe `units`. Venitul rămâne separat (`get_revenue_summary`), reutilizat de cardul „Venit".
- **`occupied_units` ⊆ `total_units`** (join pe `units.status='active'`) → invariantul `ocupate + disponibile = total` ține fără `greatest` artificial. `total_units` = camere `status='active'`, aceeași definiție de „vandabil" ca engine-ul de disponibilitate.
- **Definiții explicite**: `bookings_month/year` = rezervări *create* în perioada curentă (volum comercial, exclude `status='blocked'`); `cancellations_month` = anulate luna curentă după `updated_at` (proxy — nu există `cancelled_at` dedicat); `in_house_guests` = suma `guests_count` din sejururile care acoperă azi.

### Soluția (migrația `20260618120000_dashboard_stats.sql`)

- `get_dashboard_stats` DEFINER, `stable`, `set search_path = ''`, autorizare `PROPERTY_NOT_FOUND` → `FORBIDDEN`, grants revocate de la `anon/public`.
- Test `db_tests.sql` TEST 78 (a–d): invariant numitor, delta sosire/ocupare/in-house la o rezervare de azi, excludere la anulare, izolare cross-org (`FORBIDDEN`). 187 PASS.

### Frontend (`features/dashboard/`)

- `api.ts` (`DashboardStats` + `fetchDashboardStats`) → `hooks.ts` (`dashboardKeys` + `useDashboardStats`) → `dashboard-cards.tsx` (`StatCard` reutilizabil + secțiunile `DashboardTodayCards` / `DashboardOccupancyCards` / `DashboardBookingCards`, toate pe **același** query → un singur fetch, dedupe TanStack).
- `routes/_app/app/index.tsx`: panou pe secțiuni (`Astăzi` / `Venit` / `Ocupare` / `Rezervări`), reutilizează `RevenueCards`.
- **Invalidare**: `dashboardKeys.all` adăugat în `invalidateBookingData` (orice mutație pe rezervări) și în mutațiile pe camere care schimbă numărul de camere active (`unit-types/hooks`: generate/status/bulk/delete). Venitul are propriul ciclu (`revenueAll`).
- UI simplu intenționat (redesign viitor): doar `StatCard` se schimbă vizual, restul rămâne neatins. Doc: [`docs/backend/rpc/dashboard.md`](backend/rpc/dashboard.md).

---

## Sprint 4.9 — Availability & Allocation Engine: strat de validatori (17 iun 2026)

### Obiectiv

Toate verificările de rezervare existau, dar erau **inline** (`if...if...if...`) în `app.create_booking_internal` și **duplicate** în `public_get_availability` (scara de `reason`), `get_available_units`, `update_booking_dates`. Sprint 4.9 le unifică într-un **strat de validatori compozabili**, cu o singură sursă de adevăr, refolosit de **create + update + availability** + un RPC nou de preview.

### Decizii (arhitectură)

- **Validatori separați** `app.validate_*` (occupancy / stay / restrictions / availability / promotion), fiecare `{ valid, errors[], warnings[] }` cu **coduri** (vocabularul de excepții). Frontend-ul mapează codurile pe i18n (`VALIDATION_LABEL`) — nicio etichetă UI în DB.
- **Severitate**: FIZIC (`OCCUPANCY_EXCEEDED`, `UNIT_NOT_AVAILABLE`) = mereu eroare; SOFT (`DATES_CLOSED`, `STAY_*`, `NO_ARRIVAL/DEPARTURE`) = eroare, dar **Manager Override** le coboară în `warnings`; COMERCIAL (`PROMO_INVALID`) = mereu eroare.
- **Predicat unic** `app.unit_is_free` (booking cu gap + room_block) — elimină 4 copii ale aceluiași `not exists`. **Scara canonică** `app.booking_block_codes` (ordine = prioritatea motorului), folosită și de availability (`reason = [1]`, mapat la vocabularul public).
- **Orchestrator** `app.validate_booking` → clasifică + ordonează + adaugă promoția. RPC nou `public.validate_booking` (preview formular). `get_booking_restrictions` **eliminat** (înlocuit).

### Soluția (migrația `20260617120000_validators.sql`)

- Helpers `app.jsonb_text_array`, `app.order_codes`, `app.unit_is_free`; validatorii + `app.booking_block_codes` + `app.validate_booking` (toate DEFINER, `set search_path = ''`, revocate de la roluri).
- `create_booking_internal` + `update_booking_dates` rescrise: o singură chemare `validate_booking` (ridică `errors[0]`), apoi alocare cu `unit_is_free`. `public_get_availability` + `get_available_units` folosesc predicatul unic; `get_available_units` devine **DEFINER** + `can_access_property` (predicatul e definer-only — un apel din context invoker sub `authenticated`/`anon` declanșează **segfault JIT** în acest build Postgres).
- RPC `validate_booking(unit_type, in, out, adults, children, unit_id, promo_code, override)` → `{valid, errors[], warnings[]}`; `authenticated`, override previzualizat doar owner/manager.

### Frontend

- `features/reservation-rules/`: `validateBooking()` + `useValidateBooking` (înlocuiesc `getBookingRestrictions`/`useBookingRestrictions`); `ValidationCode`, `SOFT_CODES`, `VALIDATION_LABEL`.
- `booking-form-dialog.tsx` + `edit-dates-dialog.tsx`: panoul de restricții afișează `errors[]` (blocante) + `warnings[]` soft (tăiate, „forțate prin override"); `blockedByRules = errors.length>0` (severitate decisă server-side). `noFreeUnits` eliminat (acoperit de `UNIT_NOT_AVAILABLE`).

### Curățare Docker (drift de schemă)

DB-ul local Docker fusese populat dintr-o versiune anterioară cu un strat de validatori **șters ulterior din cod** (funcții orfane `app.validate_rules`, `validation_result/errors/warnings`, semnături cu `p_status`/`p_require_availability` — neproduse de niciun fișier de migrare, deși `migration list` arăta istoricul sincronizat). Tabelele coincideau 1:1 (fără tabele orfane). Soluție: `supabase db reset` → bază curată, rejoacă cele 31 migrări + cea nouă (stare reproductibilă).

### Teste

`db_tests.sql`: TEST 59 migrat la `validate_booking`, TEST 74 nou (orchestrator: valid pe interval liber, ocupare = eroare fizică neoverridabilă, soft fără/cu override = eroare/warning). **181 aserții PASS**, regresiile 1–73 neschimbate.

---

## Sprint 4.8 — Promotions & Commercial Rules (16 iun 2026)

> **Integritate „à la Mews"** (migrația `20260616150000`): odată ce o promoție a fost **folosită** (`uses_count > 0`), **codul + tipul + valoarea reducerii devin imutabile** — ranforțat pe backend (trigger `app.guard_promotion_update` → `PROMOTION_LOCKED`), nu doar în UI. Rămân editabile perioadele/limita/scope/condiții/activ. Ștergerea unei promoții folosite e blocată de FK (dezactivare în loc); cod duplicat respins (`23505`). Modelul = „Locked Dependencies + Snapshot Ledger Invoicing" (snapshot-ul pe rezervare protejează factura, referința rămâne relevantă pentru raportare). UI: câmpurile financiare se blochează la editarea unei promoții folosite, cu explicație + mesaje de eroare dedicate. Hint best-of în formularul de rezervare (admin + public): „se aplică cea mai mare reducere disponibilă". TEST 73. Paritate Mews avansată (audit per-noapte blackout, channel manager isolation, pagină dedicată) notată ca TODO.

> **Best-of, non-stacking** (migrația `20260616140000`): reducerile rămân necumulabile (o singură promoție/rezervare, standard OTA/PMS), dar rezolvarea trece de la „codul are prioritate" la **best-of** — dintre codul introdus și promoțiile automate eligibile se aplică cea mai mare reducere, deci un cod nu dă niciodată un rezultat mai prost decât automata. `resolve_promotion` întoarce `code_matched` (UI: „cod invalid" corect chiar dacă o automată acoperă). Prețul final e **mereu calculat server-side** (clientul trimite doar codul). TEST 72 nou + 62/65/66 ajustate la date neutre.

> **Rafinare pagină publică** (migrația `20260616130000`): lista de disponibilitate funcționează acum **ca pe Booking.com** — `public_get_availability` **nu mai filtrează** tipurile neeligibile, ci le întoarce pe **toate** (active) cu un `reason` (NULL = rezervabil). Frontend-ul afișează toate camerele, dezactivează „Rezervă" pe cele nerezervabile și arată **motivul** (în ordinea verificărilor din backend: `OCCUPANCY → CLOSED → STAY_TOO_SHORT → STAY_TOO_LONG → NO_ARRIVAL → NO_DEPARTURE → UNAVAILABLE`). În plus, pentru tipurile rezervabile întoarce reducerea **automată** (`discount` + `promo_label`) → în listă apare **prețul tăiat + prețul nou** (verde), înainte de „Rezervă", **fără request-uri suplimentare** (resolver per tip în aceeași interogare). Teste DB actualizate (40/49/60) + TEST 71 (reason + reducere în listă).

### Obiectiv

Strat **comercial** de promoții: reduceri cu cod (ex. SUMMER10) sau **automate** (early booking, last minute, sejur lung, stay discount), cu condiții, ferestre de valabilitate și limită de utilizări — apropiind aplicația de PMS-urile mari (Cloudbeds/Mews).

### Decizii (adaptate după PMS-urile gigant)

- **`promotions` + `promotion_rules`** (condiții AND, generice): `min_nights` (stay/long stay), `min_advance_days` (early booking), `max_advance_hours` (last minute). Tip nou de condiție = o ramură în resolver, fără schimbare de schemă.
- **Cod (null = automată)** + `discount_type` percent/amount, scope `unit_type_id` (null = toate), ferestre **sejur** (check-in) și **rezervare**, `max_uses`/`uses_count`, `is_active`.
- **O singură promoție/rezervare** (cea mai mare reducere); **codul are prioritate** peste automate. **Snapshot imuabil** pe `bookings` (`promotion_id` + `discount_amount`). **Limită atomică** la creare (anti-oversell). Discount plafonat la subtotal (total ≥ 0).
- Sursă unică `app.resolve_promotion` → admin + public identic. Roluri viitoare: CUD owner/manager, citire `can_access_property` (fără cuplaje noi).

### Soluția (migrația `20260616120000_promotions.sql`)

- Tabele `promotions` (index unic `upper(code)`/proprietate, RLS owner/manager) + `promotion_rules` (RLS prin promoția-părinte). `bookings.promotion_id` + `discount_amount`.
- `app.resolve_promotion` (DEFINER, fără excepții/usage — folosit și la preview).
- `create_booking_internal` + `create_booking` + `public_create_booking` recreate cu `p_promo_code`; usage consumat atomic la inserție; erori `PROMO_INVALID` / `PROMO_LIMIT_REACHED`.
- `quote_price` extins (+`p_promo_code`, întoarce subtotal/discount/total/promotion) + RPC nou `public_preview_promo` (anon).

### Frontend

- `features/promotions/`: `promotions-dialog.tsx` (creare cod/automată + reducere + scope + ferestre + limită + **condiții** dinamice; listă cu toggle activ + ștergere); buton „Promoții" în header-ul proprietății.
- `PriceBreakdown` arată subtotal + reducere (cu cod/nume) + total final. Formular rezervare (admin) și pagina publică: câmp **cod promoțional** cu „Aplică" + preview reducere (auto reflectat fără cod). Erori i18n `bookings.promo_invalid`/`promo_limit`.

### Note

- Param nou cu default = overload → drop funcția veche întâi, apoi recreate.
- Teste DB **TEST 62–70** (toate PASS, total **157**): cod percent + snapshot + usage, early booking automat, cea mai bună reducere câștigă, cod invalid/scope greșit, limită utilizări, last minute, sumă fixă + clamp, flux public (preview + booking), `quote_price` cu cod, RLS + izolare cross-tenant. Doc: [`docs/backend/rpc/promotions.md`](backend/rpc/promotions.md).

---

## Sprint 4.7 — Stay Restrictions (15 iun 2026)

> **Rafinări UX calendar** (după feedback): pauza de pregătire a fost redenumită din „Gap de curățenie" în **„Pauză de pregătire între rezervări (nopți)"** cu descriere explicită (în formularul de tip cameră) și e auditată în istoricul tipului (`turnover_days_hist`). În **calendar**: nopțile de turnover apar ca **bară hașurată subtilă cu iconiță 🧹** după fiecare plecare (nu se mai pictează tarif pe ele, ca să se vadă „de ce nu merge"); restricțiile de sosire/plecare apar ca **marcaje de colț** (triunghi ambră stânga-sus = fără sosiri / violet dreapta-sus = fără plecări, cu tooltip), nu bare pline — plus intrări noi în **legendă**. Tokens vizuale centralizate în `features/reservation-rules/restriction-display.ts`; restricțiile se rezolvă o singură dată pe lună (`resolveArrivalRestrictions`, O(reguli × zile), lookup pe `Map`). Fereastra „Restricții sosire/plecare" se deschide acum cu **ambele opțiuni (CTA/CTD) debifate**.

### Obiectiv

Strat de restricții de **sosire / plecare** (CTA/CTD), **gap de curățenie** (turnover) și **Manager Override** de recepție — apropiind comportamentul de PMS-urile mari (Cloudbeds/Mews/Booking.com). Separat de durata sejurului și de stop-sell (Sprint 4.6) și de blocajele fizice (Sprint 3).

### Decizii (ajustări față de schița inițială)

- **Un singur tabel `arrival_rules`** unifică restricțiile pe **zi a săptămânii** (`weekdays=[5,6]` → „fără sosiri Vi/Sâ") și **pe dată fixă** (`weekdays=NULL`, `start=end` → „CTA pe 20 dec"), cu flag-urile `no_arrival` (CTA) / `no_departure` (CTD). Exact cum modelează channel manager-ele — mai puternic și mai puțin cod decât două tabele separate. Scope `unit_type_id` NULL = toată proprietatea (ca `closures`).
- **Ierarhia** Property > Room Type = **uniunea** restricțiilor (cea mai restrictivă). „Rate Plan" încă nu există → scope mai specific viitor. „Override-ul explicit" din schiță e implementat ca **Manager Override la nivel de booking** (workflow real de recepție), nu ca relax per-regulă.
- **Min Gap = `unit_types.turnover_days`** (0..7): constrângere **fizică** (extinde intervalul de conflict cu `gap` nopți pe ambele capete, simetric) → scade automat disponibilitatea peste tot (admin + public). **Nu** se poate override.
- **Manager Override** (`p_override`, doar owner/manager): bypass-ează stratul *soft* (sosire/plecare, CTA/CTD, closures, min/max stay); fizicul rămâne mereu validat (double-booking, blocaje, ocupare, gap). **Public = mereu HARD**.
- **Business date**: `check_in`/`check_out` sunt date locale ale proprietății → DOW neambiguu, evaluat direct. **„Se ignoră la modificările care nu vizează datele"**: enforcement doar la creare + la schimbarea datelor în `update_booking_dates`. **Grup = per cameră**: modelul creează o rezervare per unitate → validare per sub-rezervare.
- **Toate motivele simultan**: `get_booking_restrictions` întoarce un array de coduri (`NO_ARRIVAL` + `STAY_TOO_SHORT` etc.), afișate împreună în UI.

### Soluția (migrația `20260615120000_stay_restrictions.sql`)

- `unit_types.turnover_days` (0..7) + auditat în `app.audit_unit_type` (păstrând câmpurile weekend din migrația 29).
- Tabel `arrival_rules` (scope, `weekdays int[]`, `no_arrival`/`no_departure`, RLS select `can_access_property` / CUD owner/manager, **fără anon**).
- `app.check_arrival_departure(...)` DEFINER → `text[]` cu toate motivele.
- `create_booking_internal` + `create_booking` + `update_booking_dates` recreate cu `p_override`; gap aplicat în alocare, `get_available_units` și `public_get_availability` (care **exclude** și tipurile cu sosirea/plecarea închisă).
- RPC nou `get_booking_restrictions` (preview UI, toate motivele *soft*).

### Frontend

- `features/reservation-rules/`: `arrival-rules-dialog.tsx` (selector scope, interval, zile DOW, CTA/CTD), `api.ts`/`hooks.ts` (`ArrivalRule`, CRUD, `getBookingRestrictions`/`useBookingRestrictions`).
- Formular tip cameră: stepper **gap de curățenie** (turnover); header proprietate: buton „Restricții sosire/plecare".
- `booking-form-dialog.tsx` + `edit-dates-dialog.tsx`: panou cu **toate** motivele de restricție + comutator **Manager Override** (doar owner/manager, via `currentOrg.role`); mesaje i18n noi (`bookings.no_arrival`/`no_departure`/`override*`).

### Note

- **Segfault JIT (anon-revocat)**: în build-ul local Postgres, apelul unui RPC DEFINER revocat sub rolul `anon` cu JIT poate da signal 11; calea e inaccesibilă în producție. Testul de privilegiu anon folosește `has_function_privilege` (aserție), nu apelează funcția. Documentat în `docs/backend/rpc/stay-restrictions.md`.
- Teste DB **TEST 55–61** (toate PASS): sosire/plecare DOW, CTA/CTD pe dată, Manager Override (owner vs staff `OVERRIDE_FORBIDDEN`), `get_booking_restrictions` + privilegii + izolare cross-tenant, flux public HARD + filtru availability, gap de curățenie. Doc: [`docs/backend/rpc/stay-restrictions.md`](backend/rpc/stay-restrictions.md).

---

## Sprint 4.6 — Reservation Rules Engine (14 iun 2026)

> **Rafinări UX** (după feedback): închiderile (stop-sell) se văd acum în **calendar** ca bare hașurate roșiatice cu „Închis" (click → fereastră cu scope/motiv/note + eliminare; legendă actualizată) și în **formularul de rezervare** ca avertisment + buton dezactivat înainte de salvare (nu doar eroare la submit); pe **public** nota „min. N nopți" apare și la selectarea camerei. Câmpurile min/max stay în formularul de tip sunt **steppere +/-**. Lista de închideri are notele sub **acordeon** subtil (chevron, doar dacă există notă) și e paginată „Afișează mai mult" (offset, ca restul listelor). Hint-ul „Sejur minim" e evidențiat colorat. Steppele +/- și în dialogul de reguli de durată (cu stare „Moștenit" = null). **Audit tip cameră completat** (migrația `20260614130000`): durata sejurului (min/max stay) și **config-ul de weekend** (type/value/days) intră acum în istoricul tipului, pentru consistență cu `base_price` — `weekend_days` se randează ca listă de zile (Lu, Ma…). Teste DB până la **TEST 54** (122 PASS), inclusiv recența `stay_rules` și auditul weekend/durată. În istoric, config-ul weekend e afișat sugestiv (etichete dedicate: „Ajustare preț weekend" → Fără/Procent/Sumă fixă, „Valoare ajustare weekend", „Zile de weekend" randate ca Vi, Sâ…). Pagina proprietății: iconițele de capacitate (adult/copil) aliniate la aceeași linie de bază (ca în calendar) și **header mobile-responsive** (titlu/badge sus, acțiunile — pagină publică / stop-sell / publicare — se stivuiesc și fac wrap pe ecrane mici, nu mai forțează un singur rând). Auditul pentru `closures`/`stay_rules`/`rate_rules` rămâne neimplementat intenționat — notat ca **TODO** în `docs/backend/rpc/reservation-rules.md` și `pricing.md`.

### Obiectiv

Strat **modular de restricții de rezervare**, separat de preț și de blocajele fizice: durata sejurului (min/max stay, global + pe perioade), occupancy (deja existent) și oprirea vânzărilor (stop-sell / closed dates). Aplicat consecvent în motorul de creare (sursa de adevăr), în formularul admin și pe pagina publică.

### Decizii

- **`closures` ≠ `room_blocks`**: blocajul scoate o cameră fizică din uz; **stop-sell** oprește vânzarea unui produs (un tip sau toată proprietatea) pe o perioadă, fără a atinge camerele. Un singur tabel `closures` cu **scope** (`unit_type_id` NULL = toată proprietatea) acoperă atât „closed dates" per tip cât și „stop sell" global — exact cum fac PMS-urile mari. Fără EXCLUDE (suprapunerea închiderilor e benignă).
- **min/max stay**: globale pe `unit_types` (1..30, `CHECK max_stay >= min_stay` — durată fixă permisă, ex. min=max=3) + tabel dedicat `stay_rules` pentru suprascrieri pe perioade. Durata e cheiată pe **data de check-in** (standard hotelier), nu per noapte — deci tabel separat de `rate_rules` (care rezolvă per noapte). Recență la suprapunere (`updated_at` clock_timestamp), ca `rate_rules`.
- **Occupancy** (`max_adults`/`max_children`) era deja implementat (`OCCUPANCY_EXCEEDED`) — neschimbat.

### Soluția (migrația `20260614120000_reservation_rules.sql`)

- `unit_types.min_stay`/`max_stay` (grant SELECT anon) + auditate în `app.audit_unit_type`.
- Tabele `stay_rules` (per tip, min/max nullable = moștenește global) și `closures` (scope + `period` daterange), ambele cu RLS (select `can_access_property`, CUD owner/manager, **fără anon**).
- Funcții de rezolvare DEFINER: `app.resolve_stay(type, check_in)` (regula pe perioadă peste global) și `app.is_closed(property, type, in, out)`.
- **Enforcement în `app.create_booking_internal`** (deci admin + public): `DATES_CLOSED`, `STAY_TOO_SHORT`, `STAY_TOO_LONG`. Semnătura RPC neschimbată.
- RPC nou `get_stay_constraints` (UI: limitează check-out-ul). `public_get_availability` rescris: `+ min_stay/max_stay` în rezultat, **filtrează** tipurile închise și pe cele ce nu satisfac durata.

### Frontend

- Feature nou `features/reservation-rules/`: `api.ts`/`hooks.ts`, `stay-rules-dialog.tsx` (reguli durată per tip), `closures-dialog.tsx` (stop-sell la nivel de proprietate, selector scope proprietate/tip).
- `properties/$propertyId.tsx`: câmpuri min/max stay în formularul tip (`UnitTypeFields` + refine max≥min), buton „Reguli durată" pe rândul tipului, buton „Stop sell / Închideri" în header.
- `booking-form-dialog.tsx`: `useStayConstraints` → limitează check-out-ul (min/max) + filtrează shortcut-urile de nopți + hint „Sejur minim: N nopți"; mapare erori `STAY_TOO_SHORT/LONG`, `DATES_CLOSED`.
- `p.$slug.tsx` + `public-booking/api.ts`: `min_stay`/`max_stay` în availability + badge „min. N nopți"; mapare erori noi. Audit registry tipuri extins cu min/max stay.
- i18n: chei `stay_rules.*`, `closures.*`, `unit_types.min_stay/max_stay/stay_limits/stay_order`, `bookings.min_stay_hint/stay_too_*/dates_closed`, `public.min_nights`.

### Verificare

Teste DB **TEST 45–52** (toate PASS, suită completă 117 PASS): min/max stay global (admin + public), `stay_rules` pe perioadă (rezolvare pe check-in + fallback global), `get_stay_constraints` (global vs regulă, cross-org `FORBIDDEN`, anon fără execute), closures property-scope (`DATES_CLOSED` + 0 în availability) și type-scope (doar un tip închis), RLS pe `stay_rules`/`closures`, regresie occupancy. `tsc --noEmit` curat.

---

## Sprint 4.5 — Pricing Engine & Occupancy Model (13 iun 2026)

> **Rafinări ulterioare** (migrațiile `…150000`, `…160000`, `…170000`): **weekend = prioritate minimă** — suprataxa se aplică doar pe prețul de bază, nu peste sezon/override (standard industrie: un tarif explicit e prețul dorit ca atare); iconițe adult/copil (aceeași iconiță, adult mai mare); zilele lunii din calendar afișează și ziua săptămânii (Lu/Ma/…), weekendul subliniat; scos prioritatea numerică (recență, vezi mai jos); **eliminat `base_capacity`** (ocuparea = doar adulți/copii — mai simplu, fără rol funcțional); ocuparea în formulare = steppere +/- (plafon 25, inclusiv în dialogurile de rezervare); dialog prețuri per tip = **doar sezoane** („Adaugă tarif sezon"), override-urile se adaugă din **calendar** și apar ca tarif pictat pe celulele goale (sezon albastru / preferențial chihlimbar), iconițe adult/copil (`User`/`Baby`) în calendar + lista de tipuri; liste de tarife paginate „Afișează mai mult" (15/pagină); validare „fără date trecute" la tarife/override (doar UI: `min=azi` + guard `end ≥ azi`, fără trigger/constraint — eficient și inofensiv server-side). Teste DB până la TEST 44, toate PASS.


### Obiectiv

Preț **dinamic** per noapte (sezoane, override-uri pe interval, suprataxă weekend) cu **snapshot imuabil la creare**, și model de capacitate pe **adulți/copii** expus ca steppere în toate ferestrele de rezervare/căutare. Cerință de scalabilitate: structura DB trebuie să fie corectă de la început.

### Decizii

- **Occupancy pricing EXCLUS** (cerut explicit): prețul nu depinde de nr. persoane. `base_capacity/max_adults/max_children` sunt doar constrângeri; schema rămâne pregătită pentru ocupare în viitor.
- **Un singur tabel `rate_rules`** (`kind` season/override) — override bate season; la suprapunere în același kind câștigă **cea mai recent modificată** regulă (`updated_at` cu `clock_timestamp()`, fără prioritate numerică). Sezoanele se gestionează per tip (UI); override-urile („tarif preferențial") se adaugă din **calendar** și se aplică automat tuturor camerelor tipului. Migrația `20260613150000` + RPC `get_rate_calendar` (tarif/celulă în calendar).
- **Weekend configurabil per unit_type** (`weekend_days int2[]`, default Vi+Sâ; tip none/percent/amount + valoare).

### Soluția (migrația `20260613140000_pricing_engine_and_occupancy.sql`)

- **Model capacitate**: `unit_types.capacity` → `base_capacity` + `max_adults` + `max_children` (backfill din `capacity` cu audit oprit). `bookings.adults`/`children`; `guests_count` devine **GENERATED** (`adults + children`) — compatibil cu audit + UI.
- **`rate_rules`** — sezoane + override-uri pe interval inclusiv `[start,end]`, cu RLS (select `can_access_property`, CUD owner/manager, **fără anon**) + index `(unit_type_id, start_date, end_date)`.
- **Config weekend** pe `unit_types` (`weekend_adjustment_type/value`, `weekend_days`).
- **Motorul `app.compute_price`** (DEFINER, stable) — sursă unică de adevăr: per noapte rezolvă `override > season > base_price` (priority desc, created_at desc), apoi aplică weekend **pe rata rezolvată**; întoarce `{currency, nights[], subtotal, total, avg_nightly, night_count}`. Folosit identic de `quote_price`, `create_booking`, `public_create_booking`, `public_get_availability`.
- **Snapshot imuabil**: la creare se scriu `total_amount`, `unit_price` (media/noapte) și `price_breakdown` jsonb; modificarea ulterioară a `base_price`/regulilor **nu** schimbă rezervarea.
- **RPC**: nou `quote_price` (estimare UI, autorizat); `create_booking` cu `p_adults/p_children` (drop `p_guests_count`/`p_total` — preț server-side); `public_create_booking` + `p_adults/p_children`; `public_get_availability` + `p_adults/p_children` (filtru ocupare) și preț din engine; validare `OCCUPANCY_EXCEEDED` (înlocuiește `CAPACITY_EXCEEDED`). `audit_unit_type` auditază noile câmpuri de capacitate.

### Frontend

- Feature nou `features/pricing/`: `api.ts`/`hooks.ts`, `rate-rules-dialog.tsx` (sezoane per tip), `override-dialog.tsx` (tarife preferențiale din calendar), `occupancy-stepper.tsx` (+/- adulți min 1 / copii min 0), `price-breakdown.tsx` (detaliu per noapte, reutilizat), `weekend-days-toggle.tsx` + `weekend-pricing.ts`.
- Form tip cameră (`properties/$propertyId.tsx`): 3 câmpuri capacitate + secțiune „Preț weekend" + buton „Prețuri" (RateRulesDialog). Câmpuri partajate create/editare în `UnitTypeFields`.
- Dialog rezervare admin: steppere adulți/copii (max = tipul ales, altfel 10) + estimare din `quote_price` cu `PriceBreakdown` (înlocuiește `nopți × base_price`).
- Pagina publică `p.$slug.tsx`: steppere în căutare (trimise în availability) + în dialogul de rezervare (max = tipul ales). Pagina rezervării afișează ocuparea + snapshot-ul de preț.
- Calendar: buton „Tarif preferențial" (OverrideDialog) + **tarif pictat pe celulele goale** (sezon albastru / override chihlimbar / base muted) via `get_rate_calendar`. Audit registry + `bookings/api.ts` (join `base_capacity`) actualizate. i18n: chei `unit_types.base_capacity/max_*`, `unit_types.weekend_*`, `pricing.*`, `occupancy.*`, `dow.*`.

### Verificare

- `supabase migration up` (fără `db reset`) → aplicat curat. `gen types` regenerat.
- **Teste DB (până la TEST 44)** (vechi actualizate la noile semnături + noi 33–44: occupancy, fallback base, seasonal, override > season, recență la suprapunere, weekend percent/amount/peste sezon, snapshot imuabil, filtru ocupare public, RLS `rate_rules`, autorizare `quote_price`, `get_rate_calendar`) — toate PASS.
- `npx tsc --noEmit` → 0 erori. Doc: [`docs/backend/rpc/pricing.md`](backend/rpc/pricing.md).

---

## Sprint 4.1 — Plăți: rafinări UX (13 iun 2026)

- **Supraîncasare vizibilă** (migrația de model neschimbată): cardul de plăți derivă `diff = total − amount_paid` **fără trunchiere la 0**. `diff < 0` → rând „Încasat în plus" + avertisment amber; rambursarea excedentului readuce restul la 0. Înainte „Rest de plată" arăta 0 și ascundea supraîncasarea.
- **Lista de rezervări — coloana Total** afișează acum `total` + „Încasat: X" dedesubt (folosește denormalizarea `amount_paid`, deci zero query-uri în plus).
- **Cine a consemnat plata** (migrația `20260613130000_payment_recorded_by_email.sql`): coloană `payments.recorded_by_email`, snapshot din `auth.jwt()` în `record_payment` (pattern `unit_events.actor_email`); afișată pe fiecare tranzacție.
- **Paginare „Afișează mai mult"** pe lista de plăți (`usePayments` → `useInfiniteQuery`, 15/pagină, `dedupeById`), conform convenției de istoricuri. Rezumatul (total/încasat/stare) NU depinde de listă — vine din rândul `bookings` (agregat de trigger), deci O(1).
- Teste DB 32/32a (supraîncasare + `recorded_by_email`). Chei i18n `payments.overpaid*`, `payments.recorded_by`.

---

## Sprint 4 — Pricing & Revenue (13 iun 2026)

### Obiectiv

Apropiere de un PMS comercial: preț pe rezervare cu snapshot, stare de plată și dashboard de venit. Cerință explicită de scalabilitate spre **plăți reale** (Stripe sau alt procesator) și, ulterior, **e-factură** — soluția nu trebuie re-arhitecturată atunci.

### Soluția (migrația `20260613120000_pricing_and_payments.sql`)

- **Price snapshot** — `bookings.unit_price` = prețul/noapte folosit la momentul rezervării (`base_price` se poate schimba; rezervarea își amintește). `total_amount` exista deja. `create_booking_internal` primește `p_unit_price` (NULL → `base_price` curent); ambele wrappere (`create_booking`, `public_create_booking`) îl pasează. Backfill din `total / nopți` cu trigger-ele de audit oprite (nu e acțiune de operator).
- **Payments ledger — tabel `payments`**: registru imuabil de tranzacții (`kind` payment/refund, `amount` mereu pozitiv, `method`, `status` pending/completed/failed, `provider` `'manual'` azi / `'stripe'` mâine, `provider_ref` = id extern sau serie factură, `paid_at`, `recorded_by`). **De ce ledger și nu un câmp:** suportă plăți parțiale, rambursări, reconciliere cu procesator și raportare de venit; când vine Stripe, fiecare webhook = un rând, restul logicii neschimbat. Doar tranzacțiile `completed` intră în agregate (plățile `pending` async nu contează la venit până se confirmă — corect by design).
- **Stare plată = agregat cached** — `bookings.payment_status` (unpaid/partial/paid/refunded) + `amount_paid`, întreținute de trigger-ul `payments_sync_booking` → `app.sync_booking_payment` (recalcul din ledger, fără update no-op). Niciodată numărat pe client (convenția „agregări server-side"). Schimbarea de stare e auditată (`booking_events.event_type='payment_status'`), vizibilă în istoric.
- **RPC `record_payment(...)`** — DEFINER, autorizat prin `can_access_property`; moneda din rezervare, `provider/status/recorded_by` forțate; erori `BOOKING_NOT_PAYABLE`/`INVALID_KIND`/`INVALID_AMOUNT`/`INVALID_METHOD`. Ștergerea unei înregistrări greșite = `DELETE` sub RLS (`payments_delete`, owner/manager), trigger-ul resincronizează.
- **RPC `get_revenue_summary(p_property_id)`** — venit azi/lună/an, server-side, în **timezone-ul proprietății**, sumă tranzacții `completed` cu refund pe minus.
- **Audit trigger `app.audit_booking`** rescris: ramură nouă `payment_status` + guard care nu mai loghează update-uri fără câmp auditabil (ex. doar `amount_paid` recalculat).

### Frontend (feature nou `payments`, modular api/hooks/componente)

- **`api.ts`/`hooks.ts`** — `recordPayment`/`deletePayment`/`fetchPayments`/`fetchRevenueSummary`; `paymentKeys` cu invalidare cross-feature (plățile schimbă starea rezervării și venitul → invalidează `bookings`/`booking`/`booking-events`/`revenue`).
- **`payment-status.ts` + `payment-status-badge.tsx`** — registru de culori/labels pe stare plată (pattern `status-badge.tsx`), reutilizabil.
- **`record-payment-dialog.tsx`** — încasare/rambursare (sumă prefill = rest de plată, metodă, dată, notă), RHF+Zod.
- **`payments-card.tsx`** — pe pagina rezervării: sumar total/încasat/rest, badge stare, listă tranzacții cu ștergere, butoane plată/rambursare.
- **`revenue-cards.tsx`** — dashboard: 3 carduri venit azi/lună/an, cu selecție proprietate.
- **Integrări**: dashboard (`_app/app/index.tsx`) afișează venitul; lista de rezervări are coloană stare plată; pagina rezervării arată preț/noapte (snapshot) + cardul de plăți; `event-diff.tsx`/`booking-history.tsx` afișează evenimentul `payment_status`. Helper nou `lib/money.ts` (`formatMoney`).
- Chei i18n noi (`payments.*`, `revenue.*`, `bookings.unit_price`, `bookings.event.payment_status`).

### Verificat

- Trigger sync (DB, tranzacție cu rollback): `unpaid → partial → paid → refunded` corect, cu 3 evenimente `payment_status` în istoric.
- Agregare venit (DB): azi/lună/an corecte cu bucketing pe timezone și refund pe minus.
- `tsc --noEmit` curat; toate modulele noi compilează în Vite, fără erori în consolă.

---

## Sprint 3 — Room Operations (12 iun 2026)

### Obiectiv

Gestionare profesională a camerelor, stil Cloudbeds/Pynbooking. Statusurile (4 stări) și blocarea arhivării cu rezervări viitoare existau deja (migrația 3); sprintul a adăugat ce lipsea: numerotare flexibilă la generarea bulk, operațiuni bulk pe stări și audit trail per cameră.

### Soluția (migrația `20260611220000_unit_events_and_bulk_ops.sql`)

- **Audit trail camere — `unit_events`**: același model ca `booking_events`, scris exclusiv de trigger-ul `units_audit` (`app.audit_unit`, DEFINER + `search_path = ''`). Evenimente: `created`, `status_changed`, `renamed`, doar cu câmpurile relevante în `old_data`/`new_data`. În plus față de bookings: `actor_email` (snapshot din `auth.jwt()`) — "cine a modificat" se afișează fără join spre `auth.users`. RLS select prin `can_access_property`.
- **RPC `bulk_update_unit_status(p_unit_ids uuid[], p_status text) → jsonb`** — SECURITY INVOKER (RLS `units_cud` autorizează, doar owner/manager). Comportament parțial: fiecare cameră se actualizează în sub-tranzacție; excepția `UNIT_HAS_FUTURE_BOOKINGS` din trigger-ul existent e prinsă per rând → `{"updated": n, "blocked": ["Camera 101", ...]}`. Validarea rămâne în trigger (sursă unică), RPC-ul doar orchestrează. Limită 500 id-uri.
- **`generate_units`**: guard nou `INVALID_START` (`p_start_number ≥ 1`) — frontend-ul trimite acum start explicit.

### Frontend (feature `unit-types`, refactor modular)

- **`room-numbering.ts`** — parser pur pentru numerotare: `"101-120"` (interval inclusiv) sau `"20"` + start opțional → `{ count, start }`, max 500. Folosit și în dialogul de creare tip, și la "adaugă camere în plus".
- **`unit-rows.tsx`** (extras din ruta `$propertyId.tsx`): rând per cameră cu checkbox de selecție, dropdown de stare, buton istoric; selectare-toate per tip.
- **`bulk-actions-bar.tsx`** — Activează / Dezactivează / Arhivează pe selecție (arhivarea cere confirmare); toast cu `n camere actualizate` + listarea pe nume a celor blocate.
- **`add-units-row.tsx`** — generare suplimentară cu numerotare nouă (câmpul de start se ascunde când se tastează interval).
- **`unit-history-dialog.tsx`** — istoricul camerei (cine/ce/când, cu email-ul actorului). `EventDiff` din bookings a devenit reutilizabil: registrul de câmpuri e acum parametru (`fields`), cu registrul de bookings ca default — zero schimbări la apelanții existenți.
- **`unit-status.ts`** — constantele de stare (labels/badge/dot) mutate din rută în feature, reutilizabile.
- Chei i18n noi (`units.numbering*`, `units.bulk_*`, `unit.event.*`).

### Verificat la zi (features existente, conform direcției proiectului)

- Cele 4 stări + blocarea arhivării cu mesaj explicativ existau și respectă pattern-ul (trigger DB = sursa de adevăr, frontend doar mapează `UNIT_HAS_FUTURE_BOOKINGS` pe i18n) — neatinse.
- Camerele non-active nu pot primi rezervări pe nicio cale (`create_booking_internal`, `reassign_booking`, API public filtrează `status = 'active'`), deci guard-ul de tranziție doar din `active` e suficient.

### Completare (migrația `20260612100000_unit_type_events.sql`)

- **Audit trail pe tipurile de camere — `unit_type_events`**: același model ca `unit_events`; trigger `unit_types_audit` cu evenimente `created`, `updated` (diff doar pe câmpurile schimbate: nume/capacitate/preț pe noapte), `archived`/`restored` (tranziții `is_active`). UI: buton istoric pe rândul tipului → `unit-type-history-dialog.tsx`.
- **Refactor reutilizabil**: `event-history-dialog.tsx` — dialog generic de istoric (listă evenimente + actor + diff + timestamp); `UnitHistoryDialog` și `UnitTypeHistoryDialog` sunt wrappere subțiri cu propriile registre `EVENT_LABEL`/`FIELDS`. O entitate auditată nouă = trigger + wrapper, fără UI duplicat.
- **Fix UX**: ștergerea unui tip cu rezervări viitoare ridica `UNIT_HAS_FUTURE_BOOKINGS` din trigger (nu FK 23503) — eroarea ajungea doar în consolă. Acum `deleteOrArchiveUnitType` returnează `has_future_bookings`, UI afișează toast explicativ; orice altă eroare → toast generic (handler cu try/catch).

### Completare 2 (migrația `20260612110000` + feedback UI)

- **RPC `bulk_delete_units(p_unit_ids uuid[]) → jsonb`** — ștergere în masă, aceeași logică per cameră ca individual: șterge / dezactivează (rezervări istorice, FK) / raportează blocate (rezervări viitoare, trigger). Buton „Șterge" în bara de acțiuni bulk.
- **Reactivare tip arhivat**: buton `ArchiveRestore` pe rândul tipurilor cu `is_active = false` → `is_active = true` (+ eveniment `restored` în audit).
- **Sortare naturală a camerelor** (`lib/natural-sort.ts`, `Intl.Collator` cu `numeric: true`): „Camera 9" < „Camera 10" < „Camera 101" — aplicată pe lista camerelor per tip, pe grila calendarului și pe dropdown-ul de camere libere. Fără zero-padding în date; doar ordinea de afișare.
- Eticheta câmpului de numerotare: „Număr camere".
- **Confirmări prin modal, nu `window.confirm`**: reutilizat `components/confirm-dialog.tsx` (cel de la rezervări/oaspeți), extins cu prop `destructive` (buton roșu). Aplicat pe: ștergere tip, ștergere cameră individuală, bulk arhivare, bulk ștergere.

### Completare 3 — Availability Blocks + semantica statusurilor (migrațiile `20260612120000` + `20260612130000`)

**Decizie de arhitectură** (după feedback): statusul camerei = stare **permanentă**; indisponibilitatea pe **interval** = tabel dedicat `room_blocks`. Prima iterație (block = pseudo-rezervare `status='blocked'`) a fost abandonată — migrația 17 face curățenie (drop RPC-uri vechi + coloana `block_reason`), migrează pseudo-rezervările existente în `room_blocks` și le șterge.

- **`room_blocks`**: unit_id, start_date/end_date (+ `period` daterange generat), reason (`maintenance/renovation/owner_use/internal_use/other`), notes, created_by. EXCLUDE gist anti-suprapunere block↔block (aceeași garanție declarativă ca `no_double_booking`).
- **Integritate cross-tabel în triggers** (sursa de adevăr pe orice cale de scriere): `room_blocks_validate` (block nou nu calcă peste rezervări active → `BLOCK_OVERLAPS_BOOKING`; doar camere active → `UNIT_NOT_ACTIVE`; org/property derivate server-side din cameră) și `bookings_block_guard` (rezervare nouă/mutată/reactivată nu calcă peste block-uri → `UNIT_BLOCKED`). Ambele serializate per cameră cu `pg_advisory_xact_lock` — elimină cursa "Admin A vede liber / Admin B salvează primul".
- **Semantica statusurilor** (`check_unit_status_change` rescris): `inactive`/`out_of_service` permise cu rezervări viitoare (rezervările rămân, doar cele noi sunt oprite); `archived` + DELETE rămân stricte (`UNIT_HAS_FUTURE_BOOKINGS`).
- **Availability engine complet** (disponibil = activ ∧ fără booking overlap ∧ fără block overlap): `app.create_booking_internal` (semnătura cu snapshot din migrația 8; alocarea auto sare camerele blocate, inclusiv la race — prinde `UNIT_BLOCKED` și încearcă următoarea), `get_available_units`, `public_get_availability`.
- **RPC-uri** (INVOKER, validarea în triggers): `block_unit`, `bulk_block_units` (sare camerele cu suprapuneri/non-active, raport `{blocked, skipped[]}`), `remove_block`.
- **Audit**: `block_created`/`block_updated`/`block_removed` în `unit_events` (istoricul camerei).
- **Frontend**: `block-dialog.tsx` (creare blocaj cu motiv structurat + listă/ștergere per cameră; mod bulk pe selecție), buton blocare per cameră + în bara bulk; **calendar**: camerele non-arhivate apar toate cu badge de status + celule gri (fără pseudo-evenimente), block-urile desenate ca bare distincte (hașurate, cu motivul); opțiunea „Blocată" eliminată din formularul de rezervare.

### Completare 4 — UX calendar + erori sugestive (migrația `20260612140000`)

- **RPC `bulk_remove_blocks(p_unit_ids[], p_start, p_end) → int`** — eliminare în masă a blocajelor care ating un interval (un singur DELETE set-based; audit `block_removed` per rând din trigger). UI: buton secundar în dialogul de blocare bulk.
- **Erori interpretate corect în UI**: helper `lib/errors.ts` (`errorMessage`) — Supabase aruncă uneori obiecte simple, nu instanțe de `Error`, deci `e instanceof Error` rata mesajul și totul cădea pe „A apărut o eroare". Acum `UNIT_NOT_AVAILABLE` → „Nu există camere libere...", `UNIT_BLOCKED` → mesaj dedicat, `BLOCK_OVERLAPS*` → mesaje dedicate. La alocare manuală fără camere libere, butonul Salvează e dezactivat + mesaj inline.
- **Calendar**:
  - blocajele au tooltip la click (interval, motiv, note, cameră) cu buton „Elimină blocajul" (ConfirmDialog) — simetric cu tooltip-ul de rezervare; poziționarea e helper comun (`tooltipPos`);
  - culori distincte per motiv de blocaj (`BLOCK_REASON_CALENDAR_CLASS`: mentenanță=amber, renovare=violet, uz proprietar=sky, uz intern=teal, altul=zinc) + hașură comună (`BLOCK_STRIPES`);
  - legendă minimalistă deasupra grilei (statusuri rezervări + motive blocaje + indisponibil);
  - camerele non-active au badge + **celulele goale hașurate gri** pe tot rândul (fără pseudo-evenimente);
  - click pe numele camerei → meniu de gestionare (`unit-actions-menu.tsx`, reutilizabil): schimbare status permanent + „Blocaje" (deschide același `block-dialog.tsx` de pe pagina proprietății, cu listă + ștergere).

### Completare 5 — polish frontend (calendar + istoricuri)

- **Fix randare calendar**: hașura și hover-ul stau acum pe containerul rândului (nu per celulă cu `h-12` fix) — când badge-ul de status mărește rândul, hașura și bordurile dintre zile acoperă toată înălțimea (celulele au `min-h-12` și se întind natural prin grid stretch).
- **Hover pe rând**: `group` pe rândul camerei → tentă subtilă pe numele camerei + pe zona de zile; barele de rezervări/blocaje stau deasupra (z-index + fundal propriu), deci nu sunt afectate.
- **Istoricuri cu „Afișează mai mult"** (cameră, tip de cameră, rezervare): `useInfiniteQuery` + aceeași paginație offset din `lib/pagination.ts` (pagini de 15, cele mai recente primele, ordine stabilă `created_at desc, id desc`, fără `count(*)`). Butonul cere pagina următoare; la epuizare (după cel puțin o paginare) apare „Ai ajuns la finalul istoricului." Istoricul rezervării a trecut de la fetch integral ascendent la paginat descendent. Gardă `dedupeById` (`lib/pagination.ts`) la randare: offsetul poate aluneca dacă alt user inserează un eveniment între două pagini — mutațiile proprii invalidează query-ul, scrierile concurente sunt acoperite de dedupe.
- **Hover corect pe rândurile calendarului** (iterația 2): tenta `accent` înlocuia background-ul (accent ≈ alb în temă) și „ștergea" hașura. Acum hover = **overlay separat** `bg-foreground/5` (token de temă, merge și pe dark) cu `pointer-events-none`, sub barele de rezervări/blocaje (z-index) — nu modifică nimic din ce e randat. Hașura indisponibilelor a trecut pe tokens: `UNAVAILABLE_STRIPES` derivă din `--muted-foreground` prin `color-mix` (mai vizibilă + urmează tema), separată de `BLOCK_STRIPES` (dungi albe peste barele colorate).

### Teste: 23a–e, 24a–e, 25 (room ops) + 26a–c (semantica statusurilor) + 27a–h (room_blocks: EXCLUDE, cross-tabel ambele direcții, availability, remove + audit, bulk skip, non-activ) + 28a–b (bulk_remove_blocks: interval fără blocaje = 0, eliminare în masă + audit) — toată suita PASS (63).

---

## Sprint 2.1 — Statistici oaspete server-side + cursor pagination pe liste (11 iun 2026)

### Probleme raportate

1. Statisticile din profilul oaspetelui (total/viitoare/anterioare) se calculau pe client din lista de rezervări — incorecte (anulările numărate ca "viitoare") și nescalabile.
2. Listele aduceau totul cu limită arbitrară: rezervări `limit 300`, oaspeți `limit 200`, istoricul oaspetelui fără limită.

### Soluția (migrația `20260611200000_guest_stats_and_pagination_indexes.sql`)

- **RPC `get_guest_stats(p_guest_id)`** — agregare în DB: `total`, `upcoming` (check-in ≥ azi și neanulată), `cancelled`. SECURITY INVOKER: RLS pe `bookings` izolează org-urile. UI: cardul de statistici afișează Total / Viitoare / Anulate.
- **Offset pagination** pe rezervări (20/pag), oaspeți (20/pag) și istoricul oaspetelui (15/pag): ordine stabilă `(check_in|created_at) desc, id desc`, `.range(page*size, page*size + size)` — rândul în plus detectează pagina următoare fără `count(*)`. Filtrele (search etc.) se aplică în query înaintea offsetului. Indexuri compuse noi pe `(property_id|guest_id|org_id, cheie sort desc, id desc)`.
- **Frontend**: `lib/pagination.ts` (tip `Page` + `pageRange`/`toPage`), `components/pagination.tsx` (`usePagination` — pagină 0-based înainte/înapoi + `PaginationControls`). Hooks cu `placeholderData: keepPreviousData`; cheile TanStack au forma `[entity, scopeId, "list", params]` cu params-obiect (search/page azi, filtre mâine), invalidare pe prefix neschimbată. Mutațiile pe rezervări invalidează acum centralizat și detaliul, auditul, istoricul + statisticile oaspetelui (`invalidateBookingData`).
- **Calendar**: verificat — query-ul pe interval și maparea pe zile sunt corecte; gruparea rezervărilor pe cameră se face acum o singură dată (`Map` în `useMemo`) în loc de `filter` per rând.
- **Căutare oaspeți robustă** (migrația `20260611210000`): coloană generată `guests.phone_search` (doar cifre, din `app.normalize_phone`) — telefonul se găsește indiferent de formatul salvat/tastat. Search debounced (300ms) și pe pagina Oaspeți; schimbarea filtrului resetează la pagina 1 în același handler. Hooks normalizează params (trim, `page ?? 0`) ca apelanți diferiți (listă, combobox) să împartă aceeași cheie de cache.
- **Documentat retroactiv**: RPC `link_booking_guest` (migrația 9) în `rpc/bookings.md` + rândurile lipsă din inventarul `docs/backend/README.md`.

### Teste: 22a (totaluri corecte), 22b (izolare RLS cross-org pe stats) — 22/22 PASS.

---

## Sprint 1.4 — Snapshot oaspete pe rezervare + matching pe încredere (11 iun 2026)

### Problema

La rezervarea publică cu email existent dar nume/telefon diferite, datele tastate se pierdeau (se refolosea profilul vechi). Întrebare de design: cum tratăm profilul vs datele per rezervare, à la Booking/Pynbooking?

### Soluția (migrația `20260611180000_booking_guest_snapshot_and_trusted_match.sql`)

- **Profil vs snapshot**: `guests` = profilul viu; `bookings.booked_full_name/email/phone` = snapshot cu datele din momentul rezervării (backfill din profiluri pentru rezervările existente). Modificarea profilului nu atinge trecutul.
- **Matching pe încredere** (`find_or_create_guest_internal` + `p_trusted`):
  - *trusted* (staff): match email→telefon, profilul se actualizează cu datele noi
  - *untrusted* (pagina publică/anon): match **doar pe email exact**, profilul nu se modifică niciodată (anti-abuz: telefoane fictive nu pot atașa rezervarea la alt profil și nu pot suprascrie date); telefon în coliziune → insert fără telefon (numărul rămâne în snapshot)
- Tipuri regenerate (`database.types.ts`); fără schimbări UI (snapshot-ul va fi afișat când se face UI-ul de procesare manuală a rezervărilor publice).

### Teste: 19a–c (snapshot + profil neatins de anon), 20 (staff actualizează profilul) — 20/20 PASS. TEST 8 făcut robust la date reale din DB-ul local.

---

## Sprint 1.3 — Unicitate oaspeți, audit de securitate RPC & documentație backend (11 iun 2026)

### Probleme raportate

1. Lipsă constrângere de unicitate pe oaspeți — același email/telefon se putea insera de mai multe ori
2. RPC-urile security definer nedocumentate și greu de urmărit — cerută documentație modulară de backend
3. Scepticism privind securitatea RPC-urilor definer (apeluri de la utilizatori fără acces, inserări cross-org)

### Audit de securitate (detalii: `docs/backend/security-model.md`)

S-a făcut inventarul live al funcțiilor (pg_proc + ACL-uri) și audit pe fiecare RPC. Găsite și remediate:

- **🔴 Critic** — `find_or_create_guest`: security definer **fără verificare de apartenență la org** + executabilă de PUBLIC (grant-ul implicit Postgres nu fusese revocat) → orice vizitator anonim putea insera oaspeți în orice organizație și proba existența emailurilor/telefoanelor (`matched_by`). Fix: split `app.find_or_create_guest_internal` (revocată de la API) + wrapper public cu verificare `user_org_ids` → `FORBIDDEN`.
- **🟠** `create_booking` accepta `guest_id` din altă organizație → guard `GUEST_NOT_FOUND`.
- **🟠** RLS `organization_members`: un manager putea acorda/lua rolul `owner` (escaladare) → politici rescrise.
- **🟠** `get_available_units`: grant rezidual PUBLIC (fără scurgere — invoker + RLS) → revocat.
- **🟡** `check_unit_status_change` + `generate_units`: aceeași clasă de bug search_path din Sprint 1.2 → calificate + `set search_path = ''`.

**Capcană documentată**: Postgres dă implicit EXECUTE rolului PUBLIC pe funcții noi — `revoke from anon` nu ajunge, trebuie `revoke from public, anon`.

### Unicitate oaspeți — migrația `20260611170000_guest_uniqueness_and_security_hardening.sql`

- **Decizie**: unicitate per organizație, separat pe email și pe telefon (aceleași chei ca matching-ul de dedupe — constraint-ul și logica nu pot diverge).
- Trigger `guests_normalize`: email → `lower(trim)`, gol → NULL; telefon/nume → trim.
- `app.normalize_phone()` (immutable, doar cifre) — folosită și în indexul unic pe expresie și în matching.
- Indexuri unice parțiale: `(org_id, email)` și `(org_id, normalize_phone(phone))`.
- Dedupe date existente în migrație (păstrat cel mai vechi, rezervările repunctate, audit-ul oprit temporar).
- `find_or_create_guest_internal`: retry pe `unique_violation` (race între cereri concurente).
- Frontend: pagina Oaspeți mapează `23505` → mesaj nou `guests.duplicate`; combobox-ul folosea deja RPC-ul de dedupe.

### Teste noi (`db_tests.sql` 14–18, toate 18 PASS)

Unicitate email/telefon (+ permis în altă org), `find_or_create_guest` cross-org → FORBIDDEN, anon → insufficient_privilege, manager nu poate acorda/escalada/șterge owner, `create_booking` cu guest străin → GUEST_NOT_FOUND.

### Documentație backend nouă — `docs/backend/`

Structură modulară: `README.md` (hartă + inventar funcții + query de regenerare + convenții), `security-model.md` (definer vs invoker, audit), `rls-policies.md` (matrice per tabel), `helpers.md`, `triggers.md`, `rpc/` (un fișier per feature: organizations, units, guests, bookings, public-api — fiecare RPC cu semnătură, securitate, erori, call-site-uri frontend).

---

## Sprint 1.2 — Fix reassign + istoric detaliat (11 iun 2026)

### Probleme raportate

1. „Mută în altă cameră" dădea „A apărut o eroare"
2. Istoricul nu arăta ce s-a schimbat concret (ex. datele vechi vs. noi)

### Cauza bugului de reassign

Trigger-ul `app.validate_booking_update` (Sprint 1) citea tabela `units` **necalificat** (fără prefix `public.`) și fără `set search_path`. RPC-urile precum `reassign_booking` rulează cu `security definer set search_path = ''` — trigger-ele declanșate din ele moștenesc acest search_path gol, deci `units` nu mai era găsit → eroare. Editarea datelor mergea pentru că ramura ei din trigger nu citește nicio tabelă.

**Regulă de reținut**: orice funcție trigger care citește tabele trebuie să aibă `set search_path = ''` și nume complet calificate (`public.units`), pentru că poate fi declanșată din contexte cu search_path golit.

### Ce s-a implementat

#### 1. Migrație `20260611160000_fix_trigger_search_path_audit_names.sql`
- `validate_booking_update`: `set search_path = ''` + `public.units` calificat
- `audit_booking` îmbunătățit: stochează **numele camerei** (cheia `unit`) în `old_data`/`new_data` în loc de UUID — istoricul devine lizibil direct din JSON

#### 2. `event-diff.tsx` (nou) — afișare modulară a diferențelor din audit

Component generic care citește JSON-ul `old_data`/`new_data` și afișează diferențele, fără logică hardcodată pe `event_type`:
- **Registru de câmpuri** (`FIELDS`): cheie JSON → etichetă i18n + formatter opțional (`status` → `statusLabel`, `check_in/out` → format dată scurtă)
- Câmpurile neînregistrate (UUID-uri tehnice) nu se afișează
- Render: `Check-in: ~~13 iun.~~ → 14 iun.` (vechi tăiat, nou evidențiat); la `created` doar valorile noi
- **Extensibilitate**: un câmp nou în trigger-ul de audit = o singură intrare în registru

#### 3. `booking-history.tsx` — simplificat
Înlocuite cele două blocuri hardcodate (reassigned/status_changed) cu `<EventDiff>` — acum toate tipurile de evenimente afișează detalii consistent.

### Verificare
- Test SQL care simulează exact contextul care eșua (`set_config('search_path', '', true)` + UPDATE unit_id) → trece; audit-ul conține numele camerei
- `npx tsc --noEmit` → 0 erori
- Preview: mutarea camerei funcționează (Camera 1 → Camera 3); istoricul afișează diff-uri complete pentru status, cameră și date

**Notă**: evenimentele de reassign create înainte de acest fix stocau UUID-uri — apar fără detalii în istoric (registrul le filtrează intenționat). Evenimentele noi au numele camerei.

---

## Sprint 1.1 — Reguli de status, undo & fix editare date (11 iun 2026)

### Probleme raportate de utilizator după Sprint 1

1. Se putea pune „Cazat"/„Plecat" înainte de data de check-in/check-out, fără nicio atenționare
2. Nicio cale de revenire (undo) dacă un status a fost setat greșit
3. „Modifică datele" dădea mereu „A apărut o eroare"

### Cauza bugului de la editare date

RPC-ul `update_booking_dates` (Sprint 1) seta explicit coloana `stay`, dar `stay` e o coloană **GENERATED** în Postgres (se calculează automat din `check_in`/`check_out`). Postgres ridică eroarea `cannot insert a non-DEFAULT value into column "stay"` (428C9) la orice încercare de a o seta manual. Fix: eliminată linia `stay = daterange(...)` din UPDATE.

**Lecție**: testele SQL din Sprint 1 verificau doar căile de blocare (statusuri terminale), nu și calea de succes a RPC-ului — de aceea bugul a scăpat. Acum testul TEST5 acoperă și calea de succes.

### Decizie de design: undo prin tranziții de revenire, nu prin re-creare

Întrebarea era: undo cu constrângeri sau forțăm crearea unei rezervări noi? **Răspuns: ambele, natural.** Fiecare status are o tranziție de revenire validată de trigger-ul DB:

```
forward:  pending → confirmed → checked_in → checked_out
revert:   confirmed → pending, checked_in → confirmed,
          checked_out → checked_in, no_show → confirmed,
          cancelled → pending (reactivare)
```

Constrângerile sunt menținute automat: când o rezervare anulată e reactivată, rândul **reintră în constraint-ul EXCLUDE** — dacă între timp camera a fost rezervată pe acel interval, UPDATE-ul eșuează cu `exclusion_violation` și utilizatorul primește „Camera aleasă nu este disponibilă". În acel caz singura opțiune rămasă e o rezervare nouă (exact comportamentul corect — nu se poate „forța" un undo peste o rezervare existentă).

**Pregătire pentru roluri**: tranzițiile revert sunt definite separat de cele forward (`revertStatuses` vs `nextStatuses` în `status-rules.ts`) — un feature viitor va putea restricționa revenirile la manager/owner fără să atingă fluxul normal.

### Ce s-a implementat

#### 1. Migrație `20260611150000_status_reverts_and_dates_fix.sql`
- Fix `update_booking_dates` (eliminat `stay` din UPDATE)
- Trigger `app.validate_booking_update` extins cu cele 5 tranziții de revenire

#### 2. `status-rules.ts` (nou) — modul dedicat regulilor de status
- `nextStatuses` (forward) + `revertStatuses` (undo) — mutate din `bookings.tsx`, oglindesc exact trigger-ul DB
- `getRevertOptions(booking)` — exclude reactivarea blocărilor anulate (nu au oaspete)
- `statusChangeWarning(booking, to)` — întoarce cheia i18n de atenționare sau `null`:
  - „Cazat" înainte de data check-in → confirmare check-in timpuriu
  - „Plecat" înainte de data check-out → confirmare plecare timpurie
  - „Neprezentare" înainte ca data check-in să treacă → confirmare
  - orice revert → confirmare generică; reactivare din anulat → mesaj specific

#### 3. `confirm-dialog.tsx` (nou, generic în `components/`)
Dialog reutilizabil de confirmare (title, description, onConfirm) — folosibil pentru orice acțiune sensibilă viitoare.

#### 4. `bookings.tsx`
- `requestStatusChange()` — interceptează schimbările: dacă `statusChangeWarning` întoarce mesaj, deschide `ConfirmDialog`; altfel aplică direct
- Dropdown-ul de status afișează acum și secțiunea de undo: separator + „Corectează: X" cu iconiță Undo2
- Eroarea `no_double_booking` (reactivare peste cameră ocupată) → toast „Camera nu este disponibilă"
- Înlocuit `Select` cu `DropdownMenu` pentru acțiuni (Select-ul arăta gri/disabled fără valoare selectată)

#### 5. i18n — 8 chei noi (`bookings.confirm_action`, `bookings.warn_*`, `bookings.revert_section`)

### Verificare
- 5 teste SQL noi — toate trec: lanț complet de undo, reactivare blocată de EXCLUDE când camera e ocupată, reactivare reușită când e liberă, tranziții invalide tot blocate, editare date funcțională
- `npx tsc --noEmit` → 0 erori
- Preview: editare date salvează corect; dropdown cu „Corectează: Cazat" pe rezervare „Plecat"; modal de confirmare apare; după Continuă statusul revine corect

---

## Sprint 1 — Booking Core (11 iun 2026)

### Obiectiv
Solidificarea booking engine-ului pentru producție: garanție server-side că nu există suprapuneri, statusuri invalide sau modificări pe rezervări terminate.

### Audit inițial — ce exista deja

Înainte de implementare, sistemul avea deja:

| Componentă | Implementare |
|---|---|
| Anti double-booking | `EXCLUDE USING gist (unit_id WITH =, stay WITH &&)` în `bookings` — constraint atomic Postgres, nu logică aplicație |
| Creare rezervare cu validare | RPC `create_booking` — auto-assign sau manual, prinde `exclusion_violation` |
| Mutare rezervare (reassign) | RPC `reassign_booking` — validează status non-terminal, disponibilitate, și scrie audit event via trigger |
| 7 statusuri + CHECK constraint | `pending / confirmed / checked_in / checked_out / cancelled / no_show / blocked` |
| Audit complet (booking_events) | Trigger `AFTER INSERT OR UPDATE` înregistrează automat `created / status_changed / reassigned / dates_changed / updated` |
| Auto-assign + manual assign | RPC `create_booking` suportă ambele moduri; UI permite selectare cameră cu preview liber/ocupat |
| Tranziții status UI | Dropdown `nextStatuses` în `bookings.tsx` — filtrat la frontend |

**Goluri identificate:**
1. Tranzițiile de status nu erau validate în backend — un apel direct putea face `checked_out → confirmed`
2. Nu exista niciun mecanism de modificare a datelor (check_in/check_out) pe rezervări existente
3. RLS `bookings_update` fără `WITH CHECK` — orice coloană putea fi modificată direct prin client

---

### Ce s-a implementat

#### 1. Trigger BEFORE UPDATE — validare server-side a tranzițiilor

**Fișier:** `supabase/migrations/20260611140000_booking_transitions_and_dates.sql`

**Funcție trigger:** `app.validate_booking_update()`

Trigger `BEFORE UPDATE ON bookings` care:
- **Tranziții status**: validează aceeași hartă ca frontend-ul (`nextStatuses`), dar la nivel DB. Statusuri terminale (`cancelled / checked_out / no_show`) sunt imuabile — orice update pe status ridică `INVALID_STATUS_TRANSITION`.
- **Modificare date pe rezervări terminate**: dacă `check_in` sau `check_out` se modifică și statusul e terminal, ridică `BOOKING_NOT_EDITABLE`.
- **Schimbare directă `unit_id`**: camera nouă trebuie să fie `active` și pe aceeași proprietate — protecție suplimentară față de RPC (acoperă și update-urile directe via client).

Tranzițiile permise (identice cu frontend-ul):
```
pending    → confirmed | cancelled
confirmed  → checked_in | cancelled | no_show
checked_in → checked_out
blocked    → cancelled
```

**Procedura de testare (rulată în sesiune):**
5 teste SQL în `supabase db query`:
- TEST1: `cancelled → confirmed` → blocat ✅
- TEST2: lifecycle `confirmed→checked_in→checked_out`, apoi `checked_out→confirmed` → blocat ✅
- TEST3: `pending→confirmed→cancelled` (tranziții valide) → trec ✅
- TEST4: modificare `check_in` pe rezervare `cancelled` → `BOOKING_NOT_EDITABLE` ✅
- TEST5: modificare `check_in` pe rezervare `checked_out` → `BOOKING_NOT_EDITABLE` ✅

#### 2. RPC `update_booking_dates` — modificare date cu validare disponibilitate

**Fișier:** `supabase/migrations/20260611140000_booking_transitions_and_dates.sql`

Pattern identic cu `reassign_booking` (același fișier de referință: `20260611120000_unit_status_and_audit.sql:244`).

Validări:
- Booking există + utilizatorul are acces la proprietate (`app.can_access_property`)
- Status non-terminal (`cancelled / checked_out / no_show` → `BOOKING_NOT_EDITABLE`)
- `check_out > check_in` (→ `INVALID_DATE_RANGE`)
- Update în bloc `BEGIN/EXCEPTION` — prinde `exclusion_violation` → `UNIT_NOT_AVAILABLE`

Auditul (`dates_changed`) este scris automat de trigger-ul existent `bookings_audit` (nu a fost nevoie de cod suplimentar).

#### 3. Fix RLS `bookings_update`

**Fișier:** `supabase/migrations/20260611140000_booking_transitions_and_dates.sql`

Adăugat `WITH CHECK (app.can_access_property(property_id))` — simetrie cu `USING`. Restul validărilor sunt delegate trigger-ului și EXCLUDE constraint.

#### 4. `date-utils.ts` — extragere helper-e de dată

**Fișier nou:** `web/src/features/bookings/date-utils.ts`

`addDays(isoDate, days)` și `formatDateShort(isoDate)` erau duplicate în `booking-form-dialog.tsx`. Extrase în fișier separat, acum importate în ambele componente.

#### 5. `updateBookingDates` în API + hook

**`web/src/features/bookings/api.ts`:**
- `updateBookingDates(bookingId, checkIn, checkOut)` → `supabase.rpc("update_booking_dates", ...)`
- `updateBookingStatus` — eroarea aruncată e acum `new Error(error.message)` în loc de `throw error` direct, pentru a permite inspecția mesajului în catch

**`web/src/features/bookings/hooks.ts`:**
- `useUpdateBookingDates()` — pattern identic cu `useReassignBooking`: `useMutation` + `invalidateQueries({ queryKey: bookingKeys.all })` la succes

#### 6. `EditDatesDialog` — dialog modificare date

**Fișier nou:** `web/src/features/bookings/edit-dates-dialog.tsx`

Dialog mic (~90 linii), pattern identic cu `reassign-dialog.tsx`:
- Props: `{ booking, open, onOpenChange }`
- `useForm` cu `values:` (se pre-populează cu datele existente când booking-ul se schimbă)
- Zod schema: `check_out > check_in` refine
- Check-out `disabled` până se alege check-in, `min={addDays(checkIn, 1)}`
- Erori mapate: `UNIT_NOT_AVAILABLE`, `BOOKING_NOT_EDITABLE`, `INVALID_DATE_RANGE`, fallback `common.error`

#### 7. UI `bookings.tsx` — buton „Modifică datele"

**`web/src/routes/_app/app/bookings.tsx`:**
- Import `EditDatesDialog` + iconița `CalendarDays` din lucide-react
- Constantă `DATE_EDITABLE = new Set(["pending", "confirmed", "checked_in"])` — identică cu `REASSIGNABLE`
- State `editDatesBooking` + mount `<EditDatesDialog>`
- Buton icon `CalendarDays` în coloana Acțiuni, vizibil doar pe statusuri editabile (înaintea butonului reassign)
- `onStatusChange` prinde acum și `INVALID_STATUS_TRANSITION` → toast specific

#### 8. i18n — chei noi în `ro.ts`

```ts
"bookings.edit_dates"        → "Modifică datele"
"bookings.dates_updated"     → "Datele rezervării au fost actualizate"
"bookings.not_editable"      → "Rezervarea nu mai poate fi modificată (status final)"
"bookings.invalid_transition" → "Această tranziție de status nu este permisă"
"bookings.invalid_date_range" → "Check-out trebuie să fie după check-in"
```

---

### Fișiere modificate / create

| Fișier | Tip | Schimbare |
|---|---|---|
| `supabase/migrations/20260611140000_booking_transitions_and_dates.sql` | NOU | Trigger tranziții, RPC update_booking_dates, fix RLS |
| `web/src/features/bookings/date-utils.ts` | NOU | Helper-e dată: addDays, formatDateShort |
| `web/src/features/bookings/edit-dates-dialog.tsx` | NOU | Dialog modificare date rezervare |
| `web/src/features/bookings/api.ts` | modificat | + updateBookingDates; fix throw în updateBookingStatus |
| `web/src/features/bookings/hooks.ts` | modificat | + useUpdateBookingDates |
| `web/src/features/bookings/booking-form-dialog.tsx` | modificat | Import addDays/formatDateShort din date-utils (deduplicare) |
| `web/src/routes/_app/app/bookings.tsx` | modificat | + EditDatesDialog, buton CalendarDays, catch INVALID_STATUS_TRANSITION |
| `web/src/lib/i18n/ro.ts` | modificat | + 5 chei noi pentru edit dates |

---

### Verificare finală

- `supabase migration up` → aplicat fără erori
- `supabase gen types typescript --local` → `update_booking_dates` prezent în `database.types.ts`
- `npx tsc --noEmit` → 0 erori
- 5 teste SQL backend → toate trec
- Preview UI → buton CalendarDays vizibil în coloana Acțiuni pentru rezervări active

---

## Sesiunea inițială — Setup & Features de bază (10-11 iun 2026)

### Ce s-a construit de la zero

Aplicație PMS multi-tenant completă, pornind de la zero.

**Backend (Supabase local via Docker):**
- Schema DB completă: `organizations`, `organization_members`, `properties`, `unit_types`, `units`, `bookings`, `guests`, `booking_events` — cu RLS pe toate tabelele
- Anti double-booking via `EXCLUDE USING gist (btree_gist)` — garanție atomică la nivel Postgres
- RPC-uri: `create_booking`, `reassign_booking`, `get_available_units`, `generate_units`, `find_or_create_guest`
- Trigger audit `booking_events` — înregistrează automat toate modificările pe bookings
- Trigger `units_status_guard` — blochează dezactivarea/ștergerea camerelor cu rezervări viitoare
- Fix bug `generate_units`: al doilea tip cu același prefix genera 0 camere — rezolvat prin while-loop care sare peste name-uri ocupate

**Frontend (React + TypeScript + TanStack Router/Query + shadcn/ui):**
- Auth complet (login/signup/logout/onboarding)
- CRUD Proprietăți + pagina publică `/p/{slug}`
- Tipuri de camere + generare bulk + adăugare ulterioară camere
- Rezervări: creare (auto/manual assign), estimare cost, schimbare status, mutare cameră, audit trail vizibil
- Calendar: grilă camere × zile cu tip + capacitate per cameră, tooltip detalii la click
- Oaspeți: search full-text, creare inline cu anti-duplicare pe email/telefon
- User menu (popover) + dialog Setări cu hash routing TanStack (`#settings/account`, scalabil)
- Mobile responsive: sidebar hamburger, layout adaptat
- i18n complet în română

**Convenții stabilite (respectate consistent):**
- Feature-based: `api.ts` (funcții pure) / `hooks.ts` (useQuery/useMutation + query keys) / component
- TanStack nativ: `useLocation().hash` pentru hash routing, `useNavigate()` pentru navigare, niciodată `window.location`
- `useEffect` doar pentru subscriptions externe sau DOM listeners native — nu pentru fetch sau state derivat
- Texte UI mereu prin `t("cheie")` din `i18n/ro.ts`

**GitHub:** https://github.com/alexx94/saas-hotelier (branch: main, public)
