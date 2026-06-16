# RPC — API public (pagina de rezervare `/p/{slug}`)

> Singurele funcții executabile de **anon**. Modelul hibrid: `properties`/`unit_types` se citesc direct (RLS `is_published` + grants pe coloane safe), dar orice atinge `bookings`/`guests` trece obligatoriu prin aceste RPC-uri DEFINER — `bookings` nu se expune la anon sub nicio formă.

## `public_get_availability(p_slug, p_check_in, p_check_out, p_adults=1, p_children=0) returns table(...)`

**Scop**: disponibilitatea pe tipuri de cameră pentru o proprietate publicată: `{unit_type_id, name, description, max_adults, max_children, min_stay, max_stay, price_per_night, total_price, discount, promo_label, currency, available_units, reason}`. Prețurile vin din motorul `app.compute_price` (vezi [pricing.md](pricing.md)).

**Sprint 4.8 — model „à la Booking.com"**: funcția **NU mai filtrează** tipurile neeligibile — întoarce **toate** tipurile active, fiecare cu un `reason` (NULL = rezervabil). Frontend-ul le afișează pe toate, dar dezactivează „Rezervă" și arată motivul. `reason` are prioritatea = ordinea verificărilor din motorul de creare: `OCCUPANCY → CLOSED → STAY_TOO_SHORT → STAY_TOO_LONG → NO_ARRIVAL → NO_DEPARTURE → UNAVAILABLE`. Pentru tipurile rezervabile întoarce și reducerea **automată** (`discount` + `promo_label`, fără cod) — preț tăiat + preț nou direct în listă. Tot într-o singură interogare (resolver per tip în lateral), fără request-uri suplimentare. Vezi [promotions.md](promotions.md).

| | |
|---|---|
| Migrații | `20260610110000` → … → `20260616130000` (show-all + reason + reducere automată) |
| Security | DEFINER (citește `bookings`, invizibil pentru anon) — `plpgsql stable` |
| Grants | `anon` ✅ · `authenticated` ✅ |
| Autorizare | implicită prin filtre: **doar** proprietăți `is_published`, tipuri/camere active |
| Frontend | `features/public-booking/api.ts` → `fetchAvailability()`, ruta `p.$slug.tsx` |

**Limite anti-abuz**: `check_in ≥ azi`, `check_out > check_in`, max 365 nopți. Returnează doar agregate (număr de camere libere) — niciun detaliu despre rezervările existente sau oaspeți.

## `public_create_booking(p_slug, p_unit_type_id, p_check_in, p_check_out, p_full_name, p_email, p_phone, p_adults=1, p_children=0, p_notes, p_promo_code=null) returns jsonb`

**Scop**: rezervare de pe pagina publică, atomic: dedupe/creare oaspete + creare booking `pending`. Returnează `{booking_id, status:'pending'}`.

| | |
|---|---|
| Migrații | `20260610110000` → dedupe guest `20260611120000` → varianta internă `20260611170000` |
| Security | DEFINER (`set search_path = ''`) |
| Grants | `anon` ✅ · `authenticated` ✅ |
| Autorizare | implicită: proprietatea trebuie `is_published`, tipul activ și al proprietății |
| Frontend | `features/public-booking/api.ts` → `createPublicBooking()`, ruta `p.$slug.tsx` |

**Valori forțate server-side** (clientul nu le controlează): `status='pending'`, `source='public'`, preț (total + breakdown) din `app.compute_price`, moneda proprietății, camera aleasă de auto-asignare.

**Flux**: validări → `app.find_or_create_guest_internal(org, ..., trusted=false)` — match **doar pe email**, profilul existent **nu se modifică** (anti-abuz; vezi [guests.md](guests.md)) → `app.create_booking_internal(...)` cu **snapshot**: datele exact cum le-a tastat vizitatorul se salvează pe `bookings.booked_*`, indiferent ce conține profilul.

**Erori**: `PROPERTY_NOT_FOUND`, `UNIT_TYPE_NOT_FOUND`, `INVALID_DATES`, `GUEST_DETAILS_REQUIRED`, `OCCUPANCY_EXCEEDED`, `DATES_CLOSED`, `STAY_TOO_SHORT/LONG`, `NO_ARRIVAL/NO_DEPARTURE`, `UNIT_NOT_AVAILABLE`, `PROMO_INVALID`, `PROMO_LIMIT_REACHED`. Cod promo opțional (`p_promo_code`) — reducerea (cod sau automată) se rezolvă și se snapshot-uiește server-side (vezi [promotions.md](promotions.md)).

## ⚠️ Limitare cunoscută

Fără rate limiting: un bot poate genera rezervări `pending` în masă (și, prin răspunsul de succes, poate deduce existența unui email doar în cadrul proprietății respective). Mitigare planificată: captcha / edge function cu rate limit. Detalii: [../security-model.md](../security-model.md#limitări-cunoscute-acceptate-deocamdată-de-urmărit).
