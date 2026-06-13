# RPC — Camere (units)

## `generate_units(p_unit_type_id uuid, p_count int, p_prefix text, p_start_number int) returns int`

**Scop**: generare bulk de camere pentru un tip ("10 camere cu prefixul «Camera »" → Camera 1..10, un click). Returnează câte camere a inserat efectiv.

| | |
|---|---|
| Migrații | `20260610110000` → fix numerotare `20260611130000` → search_path `20260611170000` → validare start `20260611220000` |
| Security | **INVOKER** (`set search_path = ''`, nume calificate) |
| Grants | `authenticated` ✅ · `anon`/PUBLIC ❌ |
| Autorizare | prin **RLS**: SELECT pe `unit_types` (`can_access_property`) și INSERT pe `units` (doar owner/manager prin `units_cud`) — un staff primește eroare RLS la insert |
| Frontend | `web/src/features/unit-types/api.ts` → `createUnitType()` și `generateUnitsForType()` |

**Flux**: validare `1 ≤ p_count ≤ 500` și `p_start_number ≥ 1` → citește tipul → iterează de la `p_start_number`, inserează `prefix || i` cu `on conflict (property_id, name) do nothing`, **sărind** numerele deja ocupate până atinge `p_count` camere noi (cu o limită de siguranță anti-buclă-infinită).

**Erori**: `INVALID_COUNT`, `INVALID_START`, `UNIT_TYPE_NOT_FOUND` (sau invizibil prin RLS — același efect), eroare RLS la insert pentru roluri fără drepturi.

**De ce INVOKER**: funcția nu face nimic ce userul n-ar putea face manual prin insert-uri pe `units`; RLS rămâne sursa de autorizare, deci nu are nevoie de verificări proprii. Model de urmat pentru RPC-uri "de conveniență".

**Interacțiuni**: ciclul de viață al camerelor (arhivare vs ștergere) e gestionat prin trigger-ul `units_status_guard` ([../triggers.md](../triggers.md)), nu prin acest RPC. Numerotarea ("101-120" sau count + start) se parsează în frontend (`room-numbering.ts`) și ajunge aici ca `p_count` + `p_start_number`.

## `bulk_update_unit_status(p_unit_ids uuid[], p_status text) returns jsonb`

**Scop** (Sprint 3): activare/dezactivare/arhivare **în masă** a camerelor selectate, cu raport per cameră. Returnează `{"updated": int, "blocked": [nume...]}` — camerele blocate de rezervări viitoare sunt sărite, restul trec (comportament parțial, stil Cloudbeds: un batch nu pică integral pentru o cameră ocupată).

| | |
|---|---|
| Migrație | `20260611220000` |
| Security | **INVOKER** (`set search_path = ''`, nume calificate) |
| Grants | `authenticated` ✅ · `anon`/PUBLIC ❌ |
| Autorizare | prin **RLS**: UPDATE pe `units` doar owner/manager (`units_cud`); rândurile fără drept de update nu sunt numărate (`found = false`) |
| Frontend | `web/src/features/unit-types/api.ts` → `bulkSetUnitStatus()`; UI: `bulk-actions-bar.tsx` |

**Flux**: validare status (`active/inactive/out_of_service/archived`) și `≤ 500` id-uri → pentru fiecare cameră vizibilă cu status diferit: UPDATE per rând în sub-tranzacție; excepția `UNIT_HAS_FUTURE_BOOKINGS` ridicată de trigger-ul `units_status_guard` e prinsă și camera e raportată în `blocked` pe nume.

**Erori**: `INVALID_STATUS`, `TOO_MANY_UNITS`; orice altă excepție se propagă.

**De ce INVOKER + skip-and-report**: autorizarea rămâne în RLS (vezi `generate_units`); validarea rezervărilor viitoare rămâne în trigger (sursa unică de adevăr) — RPC-ul doar orchestrează batch-ul și traduce excepțiile per rând în raport.

## `bulk_delete_units(p_unit_ids uuid[]) returns jsonb`

**Scop** (Sprint 3): ștergere în masă cu aceeași logică per cameră ca acțiunea individuală din UI. Returnează `{"deleted": n, "deactivated": n, "blocked": [nume...]}`.

| | |
|---|---|
| Migrație | `20260612110000` |
| Security | **INVOKER** (`set search_path = ''`) · Grants: `authenticated` ✅, `anon`/PUBLIC ❌ |
| Autorizare | prin **RLS** (`units_cud`, doar owner/manager) |
| Frontend | `api.ts` → `bulkDeleteUnits()`; UI: butonul „Șterge" din `bulk-actions-bar.tsx` |

**Flux per cameră** (sub-tranzacție): DELETE → `foreign_key_violation` (rezervări istorice) ⇒ `status = 'inactive'` → `UNIT_HAS_FUTURE_BOOKINGS` (trigger) ⇒ raportată în `blocked`. Limită 500 id-uri (`TOO_MANY_UNITS`).

## Availability Blocks — `block_unit` / `bulk_block_units` / `remove_block`

**Concept** (migrația 17): indisponibilitate pe **interval** fără a schimba statusul permanent al camerei — tabel `room_blocks` (motive: `maintenance/renovation/owner_use/internal_use/other`). Disponibil = `active` ∧ fără booking overlap ∧ fără block overlap. Validarea (suprapuneri cu rezervări, camere non-active, race-uri concurente) trăiește în triggers ([../triggers.md](../triggers.md)) — RPC-urile doar orchestrează.

| RPC | Semnătură | Comportament |
|---|---|---|
| `block_unit` | `(p_unit_id, p_start, p_end, p_reason, p_notes) → uuid` | un blocaj; erori: `INVALID_DATES`, `BLOCK_OVERLAPS` (alt block), `BLOCK_OVERLAPS_BOOKING`, `UNIT_NOT_ACTIVE`, `UNIT_NOT_FOUND` |
| `bulk_block_units` | `(p_unit_ids[], p_start, p_end, p_reason, p_notes) → jsonb` | `{"blocked": n, "skipped": [nume...]}` — sare camerele cu suprapuneri sau non-active; max 500 |
| `remove_block` | `(p_block_id) → void` | șterge blocajul, camera redevine disponibilă; `BLOCK_NOT_FOUND` |
| `bulk_remove_blocks` | `(p_unit_ids[], p_start, p_end) → int` | DELETE set-based: elimină blocajele care ating intervalul pe camerele selectate; returnează câte; max 500 |

Toate: **INVOKER** (`set search_path = ''`), grants `authenticated` ✅ / `anon`+PUBLIC ❌, autorizare prin RLS pe `room_blocks` (`can_access_property`). Frontend: `unit-types/api.ts` → `blockUnit() / bulkBlockUnits() / removeBlock()`; UI `block-dialog.tsx` + calendar (bare hașurate).
