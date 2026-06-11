# RPC — Rezervări

> Piesa centrală. Sursa de adevăr pentru disponibilitate este constraint-ul `no_double_booking` (EXCLUDE pe `daterange`) — orice verificare din UI/RPC e doar UX; conflictul real e decis atomic de Postgres la INSERT/UPDATE.

## Cine pe cine apelează

```
booking-form-dialog ──► create_booking ─────────┐
pagina publică /p/slug ─► public_create_booking ─┼─► app.create_booking_internal ─► INSERT bookings
                                                 │         (auto-asignare + retry)      │
edit-dates-dialog ──► update_booking_dates ──► UPDATE bookings ◄── reassign_booking ◄── reassign-dialog
                                                  │
                              triggers: bookings_update_guard, bookings_audit, set_updated_at
```

---

## `app.create_booking_internal(...) returns uuid` — engine intern

**Scop**: singurul loc care inserează în `bookings`. Primește `unit_id` explicit sau NULL (auto-asignare).

| | |
|---|---|
| Migrații | `20260610110000` → `20260611120000` (units.status) |
| Security | DEFINER, **revocată de la toate rolurile API** — apelabilă doar din `create_booking` / `public_create_booking` |
| Autorizare | **niciuna** (responsabilitatea apelanților — de aceea e inaccesibilă direct) |

**Flux**: validează tipul există, datele, capacitatea → iterează camerele active ale tipului care par libere → INSERT; la `exclusion_violation` (race — alt client a luat camera între SELECT și INSERT) **continuă cu următoarea cameră**; dacă nu mai sunt → `UNIT_NOT_AVAILABLE`. Moneda se ia din proprietate, nu de la apelant.

**Snapshot oaspete** (migrația 8): scrie `booked_full_name/email/phone` — parametrii `p_snap_*` (datele tastate la rezervarea publică) sau, dacă sunt NULL (fluxul admin), o copie a profilului din acel moment. Rezervările trecute nu se schimbă când profilul e actualizat.

**Erori**: `UNIT_TYPE_NOT_FOUND`, `INVALID_DATES`, `CAPACITY_EXCEEDED`, `UNIT_NOT_AVAILABLE`.

---

## `create_booking(p_unit_type_id, p_check_in, p_check_out, p_guest_id, p_unit_id, p_guests_count, p_status, p_total, p_notes) returns uuid`

**Scop**: creare rezervare din admin (cu oaspete) sau blocare cameră (`status='blocked'`, fără oaspete).

| | |
|---|---|
| Migrații | `20260610110000` → guard guest cross-org `20260611170000` |
| Security | DEFINER |
| Grants | `authenticated` ✅ · `anon`/PUBLIC ❌ |
| Autorizare | `app.can_access_property(...)` → `FORBIDDEN`; `p_guest_id` trebuie să existe **în org-ul proprietății** → `GUEST_NOT_FOUND` |
| Frontend | `features/bookings/api.ts` → `createBooking()`, folosit de `booking-form-dialog.tsx` |

**Validări**: status inițial doar `pending`/`confirmed`/`blocked` (`INVALID_STATUS`); oaspete obligatoriu dacă nu e blocked (`GUEST_REQUIRED`). `p_total` NULL → calculat `nopți × base_price`. `source` e **forțat** (`admin`/`blocked`) — clientul nu îl controlează.

---

## `update_booking_dates(p_booking_id, p_check_in, p_check_out) returns void`

**Scop**: modificarea perioadei unei rezervări existente, cu disponibilitatea re-verificată atomic de constraint.

| | |
|---|---|
| Migrații | `20260611140000` → fix coloana GENERATED `stay` în `20260611150000` |
| Security | DEFINER |
| Grants | `authenticated` ✅ · `anon`/PUBLIC ❌ |
| Autorizare | `app.can_access_property(...)` → `FORBIDDEN` |
| Frontend | `features/bookings/api.ts` → `updateBookingDates()`, folosit de `edit-dates-dialog.tsx` |

**Erori**: `BOOKING_NOT_FOUND`, `FORBIDDEN`, `BOOKING_NOT_EDITABLE` (status terminal), `INVALID_DATE_RANGE`, `UNIT_NOT_AVAILABLE` (suprapunere pe noul interval). Regulile de status sunt dublate de trigger-ul `bookings_update_guard` — RPC-ul doar dă erori mai prietenoase mai devreme.

**Capcană**: `stay` e coloană GENERATED — nu se setează manual (lecția migrației 5).

---

## `reassign_booking(p_booking_id, p_unit_id) returns void`

**Scop**: mutarea rezervării pe altă cameră (din calendar/listă).

| | |
|---|---|
| Migrație | `20260611120000` |
| Security | DEFINER |
| Grants | `authenticated` ✅ · `anon`/PUBLIC ❌ |
| Autorizare | `app.can_access_property(...)` → `FORBIDDEN`; camera țintă trebuie `active` și **pe aceeași proprietate** |
| Frontend | `features/bookings/api.ts` → `reassignBooking()`, folosit de `reassign-dialog.tsx` |

**Erori**: `BOOKING_NOT_FOUND`, `FORBIDDEN`, `BOOKING_NOT_REASSIGNABLE` (status terminal), `UNIT_NOT_FOUND`, `UNIT_NOT_ACTIVE`, `UNIT_WRONG_PROPERTY`, `UNIT_NOT_AVAILABLE`. Actualizează și `unit_type_id` (camera poate fi de alt tip). Audit: eveniment `reassigned` cu numele camerelor.

---

## `get_available_units(p_unit_type_id, p_check_in, p_check_out, p_exclude_booking_id) returns table(unit_id, name, status, is_free)`

**Scop**: listă de camere ale unui tip cu flag `is_free` pe interval — populează dropdown-urile de alocare manuală și de mutare. `p_exclude_booking_id` exclude rezervarea curentă la mutare/editare (altfel propria rezervare ar bloca camera).

| | |
|---|---|
| Migrații | `20260611120000` → revoke PUBLIC `20260611170000` |
| Security | **INVOKER** — RLS pe `units`/`bookings` decide ce vede userul |
| Grants | `authenticated` ✅ · `anon`/PUBLIC ❌ |
| Frontend | `features/bookings/api.ts` → `fetchAvailableUnits()`, folosit de `booking-form-dialog.tsx` și `reassign-dialog.tsx` |

**Notă**: e doar UX (feedback rapid) — sursa de adevăr rămâne constraint-ul EXCLUDE la scriere.

---

## `link_booking_guest(p_booking_id, p_guest_id) returns void`

**Scop**: re-asocierea unei rezervări cu alt profil de oaspete (procesarea manuală a rezervărilor venite din pagina publică). Schimbă **doar referința** `guest_id` — snapshot-ul `booked_*` (datele tastate la rezervare) rămâne neatins.

| | |
|---|---|
| Migrație | `20260611190000` |
| Security | DEFINER (`set search_path = ''`) |
| Grants | `authenticated` ✅ · `anon`/PUBLIC ❌ |
| Autorizare | `app.can_access_property(...)` → `FORBIDDEN`; profilul țintă trebuie să fie **din aceeași organizație** |
| Frontend | `features/bookings/api.ts` → `linkBookingGuest()`, hook `useLinkBookingGuest`, folosit în pagina rezervării (`$bookingId.tsx`) |

**Erori**: `BOOKING_NOT_FOUND`, `FORBIDDEN`, `BOOKING_NOT_LINKABLE` (status `blocked`), `GUEST_NOT_FOUND` (inexistent sau cross-org). Audit: eveniment `guest_changed` cu numele vechi/nou. Teste: 21a–d.

---

## Schimbarea statusului — fără RPC, intenționat

Statusul se schimbă prin `UPDATE` direct pe `bookings` (`features/bookings/api.ts` → `updateBookingStatus()`), sub RLS. Validarea tranzițiilor (forward + revert) e în trigger-ul `bookings_update_guard` ([../triggers.md](../triggers.md)) și oglindită în `web/src/features/bookings/status-rules.ts` — **modifică-le simultan**.
