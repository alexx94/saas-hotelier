# Triggers

> Toate validările care trebuie să țină **indiferent pe unde vine scrierea** (UPDATE direct cu RLS, RPC definer, alt trigger) stau în triggers — nu doar în RPC-uri sau în frontend.

## Inventar

| Trigger | Tabel | Moment | Funcție | Rol |
|---|---|---|---|---|
| `bookings_set_updated_at` | bookings | BEFORE UPDATE | `app.set_updated_at` | `updated_at = now()` automat |
| `bookings_update_guard` | bookings | BEFORE UPDATE | `app.validate_booking_update` | validare tranziții status + date + cameră |
| `bookings_audit` | bookings | AFTER INSERT/UPDATE | `app.audit_booking` | scrie istoricul în `booking_events` |
| `units_status_guard` | units | BEFORE UPDATE/DELETE | `app.check_unit_status_change` | blochează dezactivarea/ștergerea cu rezervări viitoare |
| `guests_normalize` | guests | BEFORE INSERT/UPDATE | `app.normalize_guest_row` | normalizare email/telefon/nume |

## Detalii

### `app.validate_booking_update` (migrațiile 4 → 5 → 6)
Sursa de adevăr pentru ciclul de viață al rezervării:
- **Tranziții status permise** (forward + revert/undo) — harta completă e oglindită în `web/src/features/bookings/status-rules.ts`; **modifică-le simultan**.
- Datele nu se schimbă pe statusuri terminale (`cancelled`/`checked_out`/`no_show`) → `BOOKING_NOT_EDITABLE`; `check_out > check_in` → altfel `INVALID_DATE_RANGE`.
- Schimbarea camerei: noua cameră trebuie `active` și pe aceeași proprietate → altfel `UNIT_NOT_VALID`.
- La revert dintr-un status inactiv (`cancelled`/`no_show` → activ) rândul reintră în constraint-ul `EXCLUDE` — dacă între timp camera s-a ocupat, UPDATE-ul pică natural cu `exclusion_violation`.

### `app.audit_booking` (migrațiile 3 → 6)
SECURITY DEFINER (poate scrie în `booking_events` peste lipsa de INSERT direct). Determină `event_type` (`created`/`status_changed`/`reassigned`/`dates_changed`/`updated`) și scrie doar câmpurile relevante în `old_data`/`new_data` — cu **numele camerei**, nu UUID, pentru afișare directă. `actor_id = auth.uid()` (NULL pentru rezervările publice). Frontend-ul afișează generic prin registrul `FIELDS` din `event-diff.tsx`.

### `app.check_unit_status_change` (migrațiile 3 → 7)
La tranziția `active → orice altceva` sau DELETE: dacă există rezervări viitoare active pe cameră → `UNIT_HAS_FUTURE_BOOKINGS`. UI-ul oferă arhivare în loc de ștergere.

### `app.normalize_guest_row` (migrația 7)
`full_name` → trim; `email` → `lower(trim())`, gol → NULL; `phone` → trim, gol → NULL. Garantează că indexul unic pe `(org_id, email)` funcționează fără expresii — orice insert, pe orice cale, e normalizat înainte de constraint.

## ⚠️ Lecția `search_path` (de respectat la orice trigger nou)

Trigger-ele **moștenesc `search_path`-ul contextului care a declanșat scrierea**. Un UPDATE venit dintr-un RPC `security definer set search_path = ''` execută trigger-ul tot cu search_path gol — orice referință necalificată (`from units`) pică cu "relation does not exist".

**Regulă**: orice funcție de trigger care citește tabele primește `set search_path = ''` + nume calificate (`public.units`). Bug-ul a fost întâlnit de două ori (migrațiile 6 și 7) — nu-l reintroduce.
