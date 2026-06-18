# RPC — Availability & Allocation: strat de validatori (Sprint 4.9)

> Toate verificările de rezervare existau, dar erau **inline** (`if...if...if...`) în `app.create_booking_internal` și **duplicate** în `public_get_availability` (scara de `reason`), `get_available_units` și `update_booking_dates`. Sprint 4.9 le extrage într-un **strat de validatori compozabili**, cu o singură sursă de adevăr, refolosit de **create + update + availability** + un RPC nou `validate_booking` (preview în formular).

## Contract uniform

Fiecare validator întoarce `jsonb { valid, errors[], warnings[] }`, cu **coduri** (vocabularul de excepții al motorului). Nicio etichetă UI în DB — frontend-ul mapează codurile pe chei i18n (`VALIDATION_LABEL` în `features/reservation-rules/api.ts`).

| Validator (`app.*`) | Domeniu | Severitate | Coduri |
|---|---|---|---|
| `validate_occupancy(unit_type, adults, children)` | capacitate | **FIZIC** | `OCCUPANCY_EXCEEDED` |
| `validate_stay(unit_type, in, out)` | stop-sell + durată | SOFT | `DATES_CLOSED`, `STAY_TOO_SHORT`, `STAY_TOO_LONG` |
| `validate_restrictions(unit_type, in, out)` | sosire/plecare | SOFT | `NO_ARRIVAL`, `NO_DEPARTURE` |
| `validate_availability(unit_type, unit, in, out, exclude?)` | cameră fizică liberă | **FIZIC** | `UNIT_NOT_AVAILABLE` (+ warning `LAST_UNIT`) |
| `validate_promotion(unit_type, in, out, subtotal, code, now)` | cod promo | COMERCIAL | `PROMO_INVALID` (+ warning `PROMO_APPLIED`) |

**FIZIC** = constrângere fizică, mereu eroare (nu se poate forța). **SOFT** = politică comercială, coborâtă în `warnings` de Manager Override. **COMERCIAL** = cod invalid, mereu eroare.

## Sursa unică a predicatului „cameră liberă"

`app.unit_is_free(unit_id, in, out, gap, exclude_booking?) → boolean` — booking cu gap de curățenie + `room_block`. Înlocuiește cele 4 copii ale aceluiași `not exists ... and not exists ...` (loop de alocare, `update_booking_dates`, `get_available_units`, `public_get_availability`). DEFINER, revocat de la toate rolurile (apelat doar din funcții DEFINER — un apel din context invoker sub `authenticated`/`anon` declanșează un **segfault JIT** în acest build Postgres; toți consumatorii sunt DEFINER).

## Scara canonică de motive

`app.booking_block_codes(unit_type, unit, in, out, adults, children, exclude?) → text[]` rulează validatorii FIZICI + SOFT (fără promo, fără override) și întoarce **toate** codurile blocante în ordinea de prioritate a motorului (`app.order_codes`):

```
OCCUPANCY_EXCEEDED → DATES_CLOSED → STAY_TOO_SHORT → STAY_TOO_LONG →
NO_ARRIVAL → NO_DEPARTURE → PROMO_INVALID → UNIT_NOT_AVAILABLE
```

Aceeași ordine pe care o aveau inline create-ul și availability. `public_get_availability` ia `[1]` (primul cod) și-l mapează la vocabularul public (`OCCUPANCY_EXCEEDED→OCCUPANCY`, `DATES_CLOSED→CLOSED`, `UNIT_NOT_AVAILABLE→UNAVAILABLE`).

## `app.validate_booking(...)` (orchestrator, intern)

```
app.validate_booking(unit_type, unit, in, out, adults, children,
                     promo_code?, override?, now?, exclude_booking?) → jsonb {valid, errors[], warnings[]}
```

1. Precondiții: tip există + date valide (altfel `UNIT_TYPE_NOT_FOUND` / `INVALID_DATES`, retur imediat).
2. `booking_block_codes` → clasifică pe severitate: FIZIC mereu în `errors`; SOFT în `errors`, dar sub `override=true` în `warnings`.
3. Promoția: `PROMO_INVALID` mereu eroare; `PROMO_APPLIED`/`LAST_UNIT` = warnings.
4. `errors` reordonate canonic; `valid = (errors gol)`.

| | |
|---|---|
| Migrație | `20260617120000` |
| Security | DEFINER, `stable` (`set search_path = ''`) |
| Grants | revocat de la `public/anon/authenticated` — apelat doar din DEFINER |

## `validate_booking(p_unit_type_id, p_check_in, p_check_out, p_adults, p_children, p_unit_id, p_promo_code, p_override) → jsonb`

**Scop**: preview live în formularul de recepție — afișează simultan toate motivele (errors) + soft-ul forțat prin override (warnings). Înlocuiește `get_booking_restrictions` (care întorcea doar motive soft).

| | |
|---|---|
| Security | DEFINER, `stable` |
| Grants | `authenticated` ✅ · `anon`/PUBLIC ❌ |
| Autorizare | `can_access_property(unit_type.property_id)` → `FORBIDDEN`; override previzualizat doar pentru owner/manager (altfel forțat pe `false`, fără eroare) |
| Erori | `UNIT_TYPE_NOT_FOUND`, `FORBIDDEN` (validările sunt în payload, nu ridicate) |
| Frontend | `features/reservation-rules/api.ts` → `validateBooking()`, hook `useValidateBooking`, folosit în `booking-form-dialog.tsx` + `edit-dates-dialog.tsx` |

## Refolosire pe căile existente

- **`app.create_booking_internal`** — blocul inline de verificări înlocuit cu un singur `app.validate_booking` (ridică `errors[0]`); promoția se rezolvă tot aici pentru snapshot + consum atomic; bucla de alocare folosește `app.unit_is_free`. Semnătura RPC neschimbată → se aplică la `create_booking` (admin) + `public_create_booking` (public).
- **`update_booking_dates`** — la schimbarea efectivă a datelor rulează `app.validate_booking` (exclude propria rezervare, `p_unit_id` = camera curentă, `p_override`).
- **`public_get_availability`** — `reason` = `booking_block_codes[1]` mapat la vocabularul public; predicatul de cameră liberă = `app.unit_is_free`.
- **`get_available_units`** — devine **DEFINER** (predicatul `unit_is_free` e definer-only) cu izolare explicită `can_access_property`.

`get_booking_restrictions` a fost **eliminat** (înlocuit complet de `validate_booking`).

**Teste** (`db_tests.sql`): TEST 59 (validate_booking soft `NO_ARRIVAL` + anon fără execute), TEST 74 (orchestrator: valid pe interval liber, ocupare = eroare fizică neoverridabilă, soft fără/ cu override = eroare/warning). Regresiile pe create/availability/promoții (TEST 1–73) trec neschimbate.
