# Politici RLS

> RLS este activat pe **toate** tabelele. Politicile folosesc helper-ele din schema `app` ([helpers.md](helpers.md)) — toate SECURITY DEFINER ca să nu intre în recursie cu RLS.
> Definițiile: `20260610110000_rls_and_rpc.sql`; întărite în `20260611140000` (WITH CHECK pe bookings) și `20260611170000` (organization_members); tabele noi: `20260611220000` (unit_events), `20260612100000` (unit_type_events), `20260612130000` (room_blocks).

## Matricea de acces

| Tabel | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `organizations` | membru | ❌ (doar RPC `create_organization`) | owner | owner |
| `organization_members` | membru | owner/manager, **dar rolul `owner` doar de owner** | owner/manager, **fără a atinge owner-i dacă ești manager** | owner/manager, **manager nu șterge owner-i** |
| `member_property_access` | membru al org-ului membrului | owner/manager | owner/manager | owner/manager |
| `properties` | membru · **anon: doar `is_published`** | owner/manager | owner/manager | owner |
| `unit_types` | `can_access_property` · **anon: doar active + proprietate publicată** | owner/manager | owner/manager | owner/manager |
| `units` | `can_access_property` | owner/manager | owner/manager | owner/manager |
| `guests` | membru org | membru org (orice rol) | membru org | membru org |
| `bookings` | `can_access_property` — **niciodată anon** | `can_access_property` | `can_access_property` (USING + WITH CHECK) | owner |
| `booking_events` | `can_access_property` (prin booking) | ❌ (exclusiv trigger `bookings_audit`) | ❌ | ❌ |
| `unit_events` | `can_access_property` (prin unit) | ❌ (exclusiv trigger `units_audit` / `room_blocks_audit`) | ❌ | ❌ |
| `unit_type_events` | `can_access_property` (prin tip) | ❌ (exclusiv trigger `unit_types_audit`) | ❌ | ❌ |
| `room_blocks` | `can_access_property` | `can_access_property` (validare în trigger) | `can_access_property` | `can_access_property` |
| `permissions` (RBAC) | orice autentificat (catalog) | ❌ seed-only | ❌ | ❌ |
| `roles` (RBAC) | roluri sistem (toți) + roluri org propriu | ❌ în 6.1 (custom → 6.3) | ❌ | ❌ |
| `role_permissions` (RBAC) | dacă rolul e vizibil | ❌ în 6.1 | ❌ | ❌ |
| `member_roles` (RBAC) | membrii org-ului | trigger sync (6.1); direct → 6.3 | trigger | trigger |

> Tabelele RBAC (`permissions/roles/role_permissions/member_roles`) sunt fundație Sprint 6.1 — vezi [rbac.md](rbac.md). `anon` nu are acces la niciunul. Enforcement-ul pe restul tabelelor migrează la `app.has_permission` în 6.2.

## Grants pe coloane pentru `anon` (vitrina publică)

`revoke all ... from anon` global, apoi grant **doar** pe coloanele safe:

- `properties`: `id, name, slug, type, description, address, city, country, timezone, currency, default_locale, is_published` — fără `org_id`, `settings`, `created_at`.
- `unit_types`: `id, property_id, name, description, base_capacity, max_adults, max_children, base_price, is_active, sort_order` — fără `org_id` și fără config weekend / `rate_rules` (prețurile publice vin prin RPC `public_get_availability`).

Orice coloană nouă pe aceste tabele este **invizibilă pentru anon** până la un grant explicit — comportament sigur implicit.

## Reguli respectate de politici

1. **Izolare cross-tenant** — totul trece prin `app.user_org_ids()` (org-urile userului) sau `app.can_access_property()` (org + restricții per-proprietate prin `member_property_access`). Testat: `db_tests.sql` testele 7–9.
2. **UPDATE are întotdeauna și WITH CHECK** — altfel un user ar putea muta rândul într-o stare pe care nu o mai controlează (ex. alt `org_id`). Fixat pe `bookings` în migrația 4.
3. **Fără escaladare de rol** — politicile pe `organization_members` compară rolul *rândului scris*, nu doar rolul apelantului (migrația 7, testul 17).
4. **Tabelele de audit nu se scriu din API** — `booking_events`, `unit_events`, `unit_type_events` doar prin triggers (DEFINER); RLS-ul lor are exclusiv SELECT.
5. **`room_blocks` derivă `org_id`/`property_id` din cameră în trigger** — clientul nu le poate falsifica; politica autorizează, trigger-ul normalizează și validează (suprapuneri, cameră activă).

## Capcană de reținut

`for all` într-o politică include și SELECT; politicile sunt permisive (OR între ele). Dacă adaugi o politică `for all` largă, ea poate lărgi accidental SELECT-ul — preferă politici pe operații explicite la tabelele sensibile.
