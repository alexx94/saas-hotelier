# RPC — Stay Restrictions (Sprint 4.7)

> Strat de restricții de **sosire / plecare** (CTA/CTD) + **gap de curățenie** (turnover) + **Manager Override**, separat de durata sejurului (`stay_rules`, Sprint 4.6), de stop-sell (`closures`, Sprint 4.6) și de blocajele fizice (`room_blocks`, Sprint 3). Sursa unică de adevăr rămâne `app.create_booking_internal` (admin + public trec prin el); enforcement-ul pe schimbarea datelor stă în `update_booking_dates`.

## De ce un strat nou

| Concept | Tabel / coloană | Ce face |
|---|---|---|
| Sosire/plecare interzisă | `arrival_rules` | CTA (nu începi sejur) / CTD (nu termini sejur) pe zile ale săptămânii SAU date fixe |
| Gap de curățenie | `unit_types.turnover_days` | nopți rezervate fizic între două sejururi pe aceeași cameră (turnover) |
| Override de recepție | `p_override` pe RPC-uri | manager/owner forțează stratul *soft* (excepții / extinderi de sejur) |

Aceasta e separarea standard din PMS-urile mari (Cloudbeds/Booking.com): „closed to arrival/departure" și „min gap / turnover time" sunt restricții distincte de min/max stay și de stop-sell.

## Model de date

```
unit_types.turnover_days   int 0..7 (gap de curățenie, default 0); auditat în app.audit_unit_type

arrival_rules (restricții de sosire/plecare, cu SCOPE)
  unit_type_id   NULL = toată proprietatea; setat = un singur tip
  start_date / end_date  fereastra (inclusiv) în care se aplică regula
  weekdays       int[] DOW (0=Du..6=Sâ); NULL/gol = orice zi (CTA/CTD pe dată fixă)
  no_arrival     bool  Closed To Arrival  (sosirea cade pe regulă → interzisă)
  no_departure   bool  Closed To Departure (plecarea cade pe regulă → interzisă)
  updated_at     timestamptz (clock_timestamp) — pentru consistență cu stay_rules/rate_rules
  CHECK: end_date >= start_date; (no_arrival OR no_departure); weekdays ⊆ {0..6}
```

**Model unificat (decizie de design):** un singur tabel acoperă atât „fără sosiri Vi/Sâ" (DOW, `weekdays=[5,6]`) cât și „CTA pe 20 dec" (dată fixă, `weekdays=NULL`, `start=end`). Așa modelează și channel manager-ele — restricția e per-dată cu flag-uri CTA/CTD; pattern-ul săptămânal e doar o comoditate de setare în bulk.

**Ierarhia** Property > Room Type aplică **uniunea** restricțiilor (cea mai restrictivă câștigă). „Rate Plan" încă nu există în aplicație → se adaugă ulterior ca scope mai specific. Override-ul explicit din schiță e implementat la nivel de **booking** (Manager Override), nu ca relax per-regulă — e workflow-ul concret de recepție.

**Business date:** `check_in`/`check_out` sunt date LOCALE ale proprietății (nu timestamp UTC), deci DOW-ul (`extract(dow from ...)`) e neambiguu — restricția se evaluează direct pe ele. **„Se ignoră la modificările care nu vizează datele"**: restricțiile trăiesc doar în creare + `update_booking_dates` (și acolo doar când datele chiar se schimbă); update de guest/status/note nu le atinge.

**Grup = per cameră:** modelul creează o rezervare per unitate fizică → validarea e deja per sub-rezervare, nu pe „data master".

RLS pe `arrival_rules`: select = `can_access_property`; CUD = owner/manager (`is_org_role`). **Fără grant anon** — restricțiile ajung la public doar prin RPC DEFINER.

---

## `app.check_arrival_departure(p_property_id, p_unit_type_id, p_check_in, p_check_out) returns text[]` (intern)

Întoarce **toate** motivele aplicabile (uniunea regulilor property+type): `NO_ARRIVAL` (sosirea pe `check_in` cade pe o regulă `no_arrival`) și/sau `NO_DEPARTURE` (plecarea pe `check_out` cade pe o regulă `no_departure`). Array gol = fără restricții. Întoarcerea unui array (nu boolean) permite UI-ului să afișeze simultan toate motivele.

| | |
|---|---|
| Migrație | `20260615120000` |
| Security | DEFINER, `stable` (`set search_path = ''`) |
| Grants | revocat de la `public/anon/authenticated` — apelat doar de funcții DEFINER |

## Gap de curățenie (turnover)

Constrângere **fizică** (ca double-booking) → **nu** se poate override. La verificarea conflictului de cameră, intervalul cerut se extinde cu `turnover_days` pe **ambele** capete:
`b.stay && daterange(check_in - gap, check_out + gap, '[)')`. Extinderea bilaterală e simetrică și corectă (gap necesar = `gap` nopți între sejururi, indiferent de ordine). Aplicat în: alocarea din `create_booking_internal`, `get_available_units` (alocare manuală) și `public_get_availability` (numărul de camere libere).

## `app.create_booking_internal(...)` — actualizat (override + gap + arrival)

Semnătura din Sprint 4.6 + `p_override boolean default false` (drop + recreate). Ordinea verificărilor:
1. occupancy (`OCCUPANCY_EXCEEDED`) — **fizic, mereu**.
2. dacă **nu** `p_override`: `DATES_CLOSED`, `STAY_TOO_SHORT/LONG`, `NO_ARRIVAL`, `NO_DEPARTURE`.
3. alocare cu gap de curățenie aplicat pe conflictul cu alte rezervări (mereu); blocaje fizice (`room_blocks`) — mereu.

## `create_booking` (admin) — `p_override` (owner/manager)

Drop + recreate cu `p_override boolean default false`. Override-ul e permis doar dacă `app.is_org_role(org, ['owner','manager'])`, altfel `OVERRIDE_FORBIDDEN`. `public_create_booking` rămâne neschimbat ca semnătură și pasează **întotdeauna** `false` (restricțiile sunt HARD pe flux public).

## `update_booking_dates(p_booking_id, p_check_in, p_check_out, p_override)` — actualizat

Drop + recreate cu `p_override boolean default false`. Stratul *soft* (closed/stay/arrival/departure) se evaluează **doar dacă datele chiar se schimbă** și `not p_override`. Gap-ul de curățenie (fizic) se verifică mereu față de celelalte rezervări de pe aceeași unitate (EXCLUDE prinde doar suprapunerea exactă, nu gap-ul). Override doar owner/manager → altfel `OVERRIDE_FORBIDDEN`.

## `get_booking_restrictions(p_unit_type_id, p_check_in, p_check_out) returns jsonb {reasons:[...]}`

**Scop**: formularul de recepție afișează simultan toate motivele *soft* și propune Manager Override. Agregă `DATES_CLOSED`, `STAY_TOO_SHORT/LONG`, `NO_ARRIVAL`, `NO_DEPARTURE`.

| | |
|---|---|
| Security | DEFINER, `stable` |
| Grants | `authenticated` ✅ · `anon`/PUBLIC ❌ |
| Autorizare | `can_access_property(unit_type.property_id)` → `FORBIDDEN` |
| Erori | `UNIT_TYPE_NOT_FOUND`, `FORBIDDEN` |
| Frontend | `reservation-rules/api.ts` → `getBookingRestrictions()`, hook `useBookingRestrictions`, folosit în `booking-form-dialog.tsx` + `edit-dates-dialog.tsx` |

## `public_get_availability(...)` + `get_available_units(...)` — actualizate

Corp neschimbat ca semnătură; aplică gap-ul de curățenie pe conflict, iar `public_get_availability` **exclude** tipurile cu sosirea/plecarea închisă pe datele cerute (`app.check_arrival_departure(...) = '{}'`).

---

## Vizualizare în calendar (frontend)

- **Pauză de pregătire (turnover)**: cele `turnover_days` nopți de după fiecare plecare se desenează ca **bară hașurată subtilă** (`🧹`) pe camera respectivă și sunt marcate „ocupate" (nu se mai pictează tarif). **Click → fereastră** cu detalii (cameră, „De la"/„Disponibilă din", explicație) — ca la blocaje/închideri. Registru centralizat de tokens vizuale în `features/reservation-rules/restriction-display.ts` (`TURNOVER_STRIPES`, urmează tema light/dark).
- **Spillover între luni**: o plecare de la finalul lunii precedente poate avea turnover care intră în luna afișată (ex. check-out 30 iun + pauză 2 → 1 iul indisponibil). Fetch-ul de rezervări pornește cu `MAX_TURNOVER_DAYS` (7, plafonul `turnover_days`) înainte de prima zi a lunii — **un singur query**, nu cereri suplimentare. Rezervările aduse astfel se folosesc **doar** pentru turnover; barele/ocuparea filtrează la rezervările care ating efectiv luna (`check_out > monthStart && check_in < monthEnd`), ca să nu deseneze bare greșite.
- **Restricții de sosire/plecare**: marcaje **în colțul celulei** (nu bare pline) — triunghi ambră stânga-sus = `no_arrival` (CTA), violet dreapta-sus = `no_departure` (CTD), cu tooltip. Ambele + turnover apar în **legendă**.
- Restricțiile se rezolvă o singură dată pe lună (`resolveArrivalRestrictions`, O(reguli × zile), lookup pe `Map` cheiat pe zi / `tip|zi`), nu per celulă — scalabil. Fetch mărginit de interval: `useArrivalRulesInRange` (ca `useClosuresInRange`).
- DOW client = `Date.getUTCDay()` (0=Du..6=Sâ) — identic cu `extract(dow)` din backend.
- **Pagina publică** nu necesită UI nou: `public_get_availability` filtrează deja server-side tipurile cu sosirea/plecarea închisă și aplică gap-ul, deci opțiunile indisponibile pur și simplu nu apar.

## Note de implementare (lecții)

- **Audit `unit_types`**: noua versiune `app.audit_unit_type` trebuie să **păstreze** câmpurile weekend adăugate în migrația 29 (altfel TEST 54 cade) — se adaugă doar `turnover_days`, nu se rescrie de la zero. Câmpul nou auditat are și o intrare în registrul UI `TYPE_FIELDS` din `unit-type-history-dialog.tsx` (eticheta `unit_types.turnover_days_hist`).
- **Segfault JIT pe calea anon-revocat**: în build-ul local Postgres, un apel către un RPC DEFINER revocat, executat sub rolul `anon` cu JIT activ, poate provoca un segfault (signal 11). Calea e **inaccesibilă în producție** (anon n-are EXECUTE). Testul de privilegiu pentru anon folosește de aceea `has_function_privilege(...)` (aserție), **nu** apelează funcția. Calea reală (authenticated cross-org) întoarce curat `FORBIDDEN`.

**Teste** (`db_tests.sql`, TEST 55–61): restricții de sosire/plecare DOW (`NO_ARRIVAL`/`NO_DEPARTURE`), CTA/CTD pe dată fixă, Manager Override (owner forțează; staff → `OVERRIDE_FORBIDDEN`), `get_booking_restrictions` (toate motivele + privilegiu anon + izolare cross-tenant), flux public HARD + filtru availability, gap de curățenie (blochează adiacența sub-gap, reflectat în `get_available_units`).
