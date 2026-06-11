# Politici RLS

> RLS este activat pe **toate** tabelele. Politicile folosesc helper-ele din schema `app` ([helpers.md](helpers.md)) — toate SECURITY DEFINER ca să nu intre în recursie cu RLS.
> Definițiile: `20260610110000_rls_and_rpc.sql`; întărite în `20260611140000` (WITH CHECK pe bookings) și `20260611170000` (organization_members).

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

## Grants pe coloane pentru `anon` (vitrina publică)

`revoke all ... from anon` global, apoi grant **doar** pe coloanele safe:

- `properties`: `id, name, slug, type, description, address, city, country, timezone, currency, default_locale, is_published` — fără `org_id`, `settings`, `created_at`.
- `unit_types`: `id, property_id, name, description, capacity, base_price, is_active, sort_order` — fără `org_id`.

Orice coloană nouă pe aceste tabele este **invizibilă pentru anon** până la un grant explicit — comportament sigur implicit.

## Reguli respectate de politici

1. **Izolare cross-tenant** — totul trece prin `app.user_org_ids()` (org-urile userului) sau `app.can_access_property()` (org + restricții per-proprietate prin `member_property_access`). Testat: `db_tests.sql` testele 7–9.
2. **UPDATE are întotdeauna și WITH CHECK** — altfel un user ar putea muta rândul într-o stare pe care nu o mai controlează (ex. alt `org_id`). Fixat pe `bookings` în migrația 4.
3. **Fără escaladare de rol** — politicile pe `organization_members` compară rolul *rândului scris*, nu doar rolul apelantului (migrația 7, testul 17).
4. **Tabelele de audit nu se scriu din API** — `booking_events` doar prin trigger.

## Capcană de reținut

`for all` într-o politică include și SELECT; politicile sunt permisive (OR între ele). Dacă adaugi o politică `for all` largă, ea poate lărgi accidental SELECT-ul — preferă politici pe operații explicite la tabelele sensibile.
