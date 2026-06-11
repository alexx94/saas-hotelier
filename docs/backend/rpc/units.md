# RPC — Camere (units)

## `generate_units(p_unit_type_id uuid, p_count int, p_prefix text, p_start_number int) returns int`

**Scop**: generare bulk de camere pentru un tip ("10 camere cu prefixul «Camera »" → Camera 1..10, un click). Returnează câte camere a inserat efectiv.

| | |
|---|---|
| Migrații | `20260610110000` → fix numerotare `20260611130000` → search_path `20260611170000` |
| Security | **INVOKER** (`set search_path = ''`, nume calificate) |
| Grants | `authenticated` ✅ · `anon`/PUBLIC ❌ |
| Autorizare | prin **RLS**: SELECT pe `unit_types` (`can_access_property`) și INSERT pe `units` (doar owner/manager prin `units_cud`) — un staff primește eroare RLS la insert |
| Frontend | `web/src/features/unit-types/api.ts` → `createUnitTypeWithUnits()` și `addUnitsToType()` |

**Flux**: validare `1 ≤ p_count ≤ 500` → citește tipul → iterează de la `p_start_number`, inserează `prefix || i` cu `on conflict (property_id, name) do nothing`, **sărind** numerele deja ocupate până atinge `p_count` camere noi (cu o limită de siguranță anti-buclă-infinită).

**Erori**: `INVALID_COUNT`, `UNIT_TYPE_NOT_FOUND` (sau invizibil prin RLS — același efect), eroare RLS la insert pentru roluri fără drepturi.

**De ce INVOKER**: funcția nu face nimic ce userul n-ar putea face manual prin insert-uri pe `units`; RLS rămâne sursa de autorizare, deci nu are nevoie de verificări proprii. Model de urmat pentru RPC-uri "de conveniență".

**Interacțiuni**: ciclul de viață al camerelor (arhivare vs ștergere) e gestionat prin trigger-ul `units_status_guard` ([../triggers.md](../triggers.md)), nu prin acest RPC.
