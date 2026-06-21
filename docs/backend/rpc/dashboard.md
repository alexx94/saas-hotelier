# RPC — Analytics & Dashboard (Sprint 5)

> Metrici operaționale pentru panou, calculate **server-side** (convenția proiectului: agregările nu se numără pe client), în **timezone-ul proprietății**. Venitul rămâne separat în [`get_revenue_summary`](payments.md) — cardul „Venit" îl reutilizează, deci o plată nu invalidează metricile de mai jos.

## `get_dashboard_stats(p_property_id) returns table(...)`

**Scop**: toate cifrele panoului într-un singur apel — o trecere peste `bookings` (FILTER) + un `count` pe `units`. Frontend-ul citește un singur rând.

| Coloană | Definiție |
|---|---|
| `arrivals_today` | rezervări cu `check_in = azi`, exclus `cancelled/no_show/blocked` |
| `departures_today` | rezervări cu `check_out = azi`, exclus anulări/no-show/blocaje |
| `in_house_guests` | suma `guests_count` din sejururile care acoperă azi (`check_in <= azi < check_out`) |
| `occupied_units` | camere **active** distincte cu o rezervare reală care acoperă azi |
| `available_units` | `total_units − occupied_units` |
| `total_units` | camere `status='active'` ale proprietății (ca în engine-ul de disponibilitate) |
| `occupancy_pct` | `occupied / total * 100`, o zecimală (0 dacă nu sunt camere) |
| `bookings_month` / `bookings_year` | rezervări **create** luna / anul curent (volum comercial; exclude `status='blocked'`) |
| `cancellations_month` | rezervări anulate luna curentă (după `updated_at` — proxy pentru momentul anulării; nu există `cancelled_at` dedicat) |

`occupied_units` se restrânge la camere active (join pe `units.status='active'`) ca să rămână ⊆ `total_units` — invariantul `ocupate + disponibile = total` ține fără surprize (testat).

| | |
|---|---|
| Migrație | `20260618120000` |
| Security | DEFINER, `stable` (`set search_path = ''`) |
| Grants | `authenticated` ✅ · `anon`/PUBLIC ❌ |
| Autorizare | `app.can_access_property(p_property_id)` → `FORBIDDEN` (după `PROPERTY_NOT_FOUND`) |
| Frontend | `features/dashboard/api.ts` → `fetchDashboardStats()`, hook `useDashboardStats`, folosit în `dashboard-cards.tsx` (panou) |

**Invalidare cache**: cheia `["dashboard", propertyId]` (`dashboardKeys.all`) se invalidează la orice mutație pe rezervări (`invalidateBookingData` din `bookings/hooks`) și la mutațiile pe camere care schimbă numărul de camere active (`unit-types/hooks`). Venitul are propriul ciclu (`revenueAll`, mutații de plăți).

**Teste**: `db_tests.sql` TEST 78 (invariant numitor, delta sosire/ocupare la o rezervare de azi, excludere la anulare, izolare cross-org).

## `get_org_dashboard_stats(p_org_id) returns table(...)`

**Scop**: „vizualizare în ansamblu" pentru home-ul organizației (`/org/$orgId`) — agregă aceleași metrici peste **toate proprietățile accesibile** ale org-ului, refolosind `get_dashboard_stats` per proprietate (sursă unică de adevăr; fiecare în tz-ul ei). Întoarce coloanele de mai sus + `property_count`. Ocuparea se **recalculează** din totaluri (nu se mediază procentele).

| | |
|---|---|
| Migrație | `20260620120000` |
| Security | DEFINER, `stable` (`set search_path = ''`) |
| Grants | `authenticated` ✅ · `anon`/PUBLIC ❌ |
| Autorizare | membru al org (`app.user_org_ids()`) **și nerestrâns** la proprietăți (`app.actor_property_restricted` → `FORBIDDEN`). Rolurile legate de anumite proprietăți (manager/base) nu văd agregatul pe org — vezi [`rbac.md §10`](../rbac.md). |
| Frontend | `features/dashboard/api.ts` → `fetchOrgDashboardStats()`, hook `useOrgDashboardStats(orgId, enabled)`, folosit în `dashboard-org-overview.tsx`. UI gate (owner/admin) în `routes/_app/org/$orgId/index.tsx`; RPC-ul îl dublează server-side. |

## Scalabilitate & contract de ștergere

Dashboard-ul e **aditiv și autonom** — gândit ca un MVP de înlocuit complet la redesign. Ce trebuie știut:

- **`get_dashboard_stats` nu e reutilizat nicăieri** — e apelat exclusiv din `features/dashboard/api.ts`. Niciun alt RPC/engine nu depinde de el (e read-only, nu intră în `create_booking`/availability/pricing). Poți rescrie sau șterge tot stratul fără regresie pe rezervări, calendar, plăți etc.
- Dependențele merg **spre interior**: dashboard-ul *consumă* `get_revenue_summary`, `RevenueCards`, `property-select`, `StatCard` — nu invers. Ștergerea panoului nu atinge aceste resurse.
- **Singura legătură spre exterior** = invalidarea de cache. Dacă ștergi feature-ul `dashboard/`, trebuie eliminate cele 2 importuri + apelurile `dashboardKeys.all` din:
  - `features/bookings/hooks.ts` (`invalidateBookingData`)
  - `features/unit-types/hooks.ts` (mutațiile generate/status/bulk/delete)

  Sunt linii izolate (`qc.invalidateQueries({ queryKey: dashboardKeys.all })`); fără ele rămâne doar un import nefolosit (eroare TS), nu o regresie funcțională.
- **De șters la rescriere completă**: folderul `features/dashboard/`, migrația (sau o nouă migrație `drop function`), cheile `dashboard.*` din `i18n/ro.ts`, secțiunile din `routes/_app/app/index.tsx`, TEST 78. Nimic altceva nu „știe" de panou.
