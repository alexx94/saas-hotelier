# Triggers

> Toate validările care trebuie să țină **indiferent pe unde vine scrierea** (UPDATE direct cu RLS, RPC definer, alt trigger) stau în triggers — nu doar în RPC-uri sau în frontend.

## Inventar

| Trigger | Tabel | Moment | Funcție | Rol |
|---|---|---|---|---|
| `bookings_set_updated_at` | bookings | BEFORE UPDATE | `app.set_updated_at` | `updated_at = now()` automat |
| `bookings_update_guard` | bookings | BEFORE UPDATE | `app.validate_booking_update` | validare tranziții status + date + cameră |
| `bookings_audit` | bookings | AFTER INSERT/UPDATE | `app.audit_booking` | scrie istoricul în `booking_events` |
| `units_status_guard` | units | BEFORE UPDATE/DELETE | `app.check_unit_status_change` | blochează dezactivarea/ștergerea cu rezervări viitoare |
| `units_audit` | units | AFTER INSERT/UPDATE | `app.audit_unit` | scrie istoricul în `unit_events` |
| `unit_types_audit` | unit_types | AFTER INSERT/UPDATE | `app.audit_unit_type` | scrie istoricul în `unit_type_events` |
| `room_blocks_validate` | room_blocks | BEFORE INSERT/UPDATE | `app.validate_room_block` | block doar pe camere active, fără suprapunere cu rezervări |
| `bookings_block_guard` | bookings | BEFORE INSERT/UPDATE | `app.check_booking_block_overlap` | rezervările nu calcă peste block-uri |
| `room_blocks_audit` | room_blocks | AFTER INS/UPD/DEL | `app.audit_room_block` | block created/updated/removed → `unit_events` |
| `room_blocks_set_updated_at` | room_blocks | BEFORE UPDATE | `app.set_updated_at` | `updated_at = now()` automat |
| `guests_normalize` | guests | BEFORE INSERT/UPDATE | `app.normalize_guest_row` | normalizare email/telefon/nume |
| `properties_audit` / `guests_audit` / `payments_audit` / `rate_rules_audit` / `promotions_audit` / `stay_rules_audit` / `arrival_rules_audit` / `closures_audit` | properties / guests / payments / rate_rules / promotions / stay_rules / arrival_rules / closures | AFTER INS/UPD/DEL (payments/arrival_rules/closures: doar INS/DEL) | `app.audit_entity` (generic, parametrizat) | scrie istoricul în `entity_events` — vezi [rpc/audit.md](rpc/audit.md) |

## Detalii

### `app.validate_booking_update` (migrațiile 4 → 5 → 6)
Sursa de adevăr pentru ciclul de viață al rezervării:
- **Tranziții status permise** (forward + revert/undo) — harta completă e oglindită în `web/src/features/bookings/status-rules.ts`; **modifică-le simultan**.
- Datele nu se schimbă pe statusuri terminale (`cancelled`/`checked_out`/`no_show`) → `BOOKING_NOT_EDITABLE`; `check_out > check_in` → altfel `INVALID_DATE_RANGE`.
- Schimbarea camerei: noua cameră trebuie `active` și pe aceeași proprietate → altfel `UNIT_NOT_VALID`.
- La revert dintr-un status inactiv (`cancelled`/`no_show` → activ) rândul reintră în constraint-ul `EXCLUDE` — dacă între timp camera s-a ocupat, UPDATE-ul pică natural cu `exclusion_violation`.

### `app.audit_booking` (migrațiile 3 → 6)
SECURITY DEFINER (poate scrie în `booking_events` peste lipsa de INSERT direct). Determină `event_type` (`created`/`status_changed`/`reassigned`/`dates_changed`/`updated`) și scrie doar câmpurile relevante în `old_data`/`new_data` — cu **numele camerei**, nu UUID, pentru afișare directă. `actor_id = auth.uid()` (NULL pentru rezervările publice). Frontend-ul afișează generic prin registrul `FIELDS` din `event-diff.tsx`.

### `app.audit_unit` (migrația 13 — Sprint 3)
SECURITY DEFINER + `set search_path = ''` (scrie în `unit_events` fără INSERT direct din app). Evenimente: `created` (nume + status inițial), `status_changed` (old/new status, plus numele dacă s-a schimbat simultan), `renamed` (old/new nume); update-urile fără schimbări relevante nu produc evenimente. Pe lângă `actor_id = auth.uid()` salvează și `actor_email` (snapshot din `auth.jwt()`) — afișarea "cine a modificat" nu cere join spre `auth.users`. Frontend: `unit-history-dialog.tsx` prin registrul `UNIT_FIELDS` (același mecanism `EventDiff` ca la bookings).

### `app.audit_unit_type` (migrația 14 — Sprint 3)
Același model ca `audit_unit`, pe `unit_type_events`. Evenimente: `created` (nume/capacitate/preț), `updated` (diff doar pe câmpurile schimbate dintre `name`/`base_capacity`/`max_adults`/`max_children`/`base_price` — Sprint 4.5), `archived`/`restored` (tranziții `is_active`); update-urile fără schimbări relevante nu produc evenimente (inclusiv config-ul weekend, neauditat). Un câmp nou auditat = un `if` în trigger + o intrare în registrul `TYPE_FIELDS` din `unit-type-history-dialog.tsx`.

### `app.check_unit_status_change` (migrațiile 3 → 7 → 17)
Doar scoaterea **definitivă** din exploatare (tranziția spre `archived` sau DELETE) cere zero rezervări viitoare → `UNIT_HAS_FUTURE_BOOKINGS`. `inactive`/`out_of_service` sunt permise oricând: rezervările existente rămân, doar rezervările noi sunt oprite (engine-ul filtrează `status = 'active'`).

### `app.validate_room_block` + `app.check_booking_block_overlap` (migrația 17)
Integritatea **cross-tabel** block↔booking: EXCLUDE nu funcționează între două tabele, deci validarea trăiește în triggers pe ambele direcții — block nou peste rezervări active → `BLOCK_OVERLAPS_BOOKING`; rezervare nouă/mutată/reactivată peste block → `UNIT_BLOCKED`. Ambele iau `pg_advisory_xact_lock` per cameră înainte de verificare: două tranzacții concurente (block + booking pe aceeași cameră) se serializează, nu se pot strecura una pe lângă cealaltă. `validate_room_block` cere și camera `active` (`UNIT_NOT_ACTIVE`) și derivă `org_id`/`property_id` din cameră (clientul nu le poate falsifica). Suprapunerea block↔block e declarativă: EXCLUDE `no_overlapping_blocks` pe `room_blocks`.

### `app.audit_room_block` (migrația 17)
SECURITY DEFINER; scrie `block_created`/`block_updated`/`block_removed` în `unit_events` (istoricul camerei include și blocajele — cine/ce interval/ce motiv/când).

### `app.normalize_guest_row` (migrația 7)
`full_name` → trim; `email` → `lower(trim())`, gol → NULL; `phone` → trim, gol → NULL. Garantează că indexul unic pe `(org_id, email)` funcționează fără expresii — orice insert, pe orice cale, e normalizat înainte de constraint.

### `app.audit_entity` (migrația `20260621120000` — Sprint 7)
Generic, atașat pe 8 tabele diferite via `tg_argv` (`entity_type`, coloana de „activ" opțională, coloanele excluse din diff). Diff-ul nu mai e un `if` per câmp ca la `audit_unit_type`: `to_jsonb(NEW/OLD) - coloane_excluse`, deci un câmp nou pe tabelul sursă apare automat în `old_data`/`new_data` fără modificare de trigger. Update fără schimbare relevantă (diff stripat identic) → nu produce eveniment. `property_id` e auto-referențial pentru `entity_type='property'`, `NULL` pentru entități org-wide (`guest`). SECURITY DEFINER + `set search_path = ''`, ca toate trigger-ele de audit. Detalii complete + RLS + RPC-ul de feed unificat: [rpc/audit.md](rpc/audit.md).

## ⚠️ Lecția `search_path` (de respectat la orice trigger nou)

Trigger-ele **moștenesc `search_path`-ul contextului care a declanșat scrierea**. Un UPDATE venit dintr-un RPC `security definer set search_path = ''` execută trigger-ul tot cu search_path gol — orice referință necalificată (`from units`) pică cu "relation does not exist".

**Regulă**: orice funcție de trigger care citește tabele primește `set search_path = ''` + nume calificate (`public.units`). Bug-ul a fost întâlnit de două ori (migrațiile 6 și 7) — nu-l reintroduce.
