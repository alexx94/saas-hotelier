# RPC — Audit & Activity Feed (Sprint 7)

> Extinde audit trail-ul existent (`unit_events`/`unit_type_events`/`booking_events`, Sprint 3) la restul entităților operaționale, printr-un **singur tabel + un singur trigger generic** — o entitate nouă pe viitor înseamnă o linie `CREATE TRIGGER`, nu un tabel + trigger nou. Unifică totul într-un feed cronologic per proprietate, gated pe permisiunea `audit.view` (deja prevăzută în roadmap-ul RBAC, Sprint 6.1 — vezi [`rbac.md` §7](../rbac.md#7-roadmap-sprint-6) și §10).

## Model de date — `entity_events`

```sql
entity_events (
  id, org_id, property_id,   -- property_id NULL = entitate org-wide (ex. guest)
  entity_type, entity_id,    -- 'property'|'guest'|'payment'|'rate_rule'|'promotion'|
                              -- 'stay_rule'|'arrival_rule'|'closure'
  actor_id, actor_email,     -- snapshot, ca la unit_events — fără join spre auth.users
  event_type,                -- 'created'|'updated'|'archived'|'restored'|'deleted'
  old_data, new_data,        -- jsonb, doar coloanele tehnice excluse (id/org_id/created_at/...)
  created_at
)
```

**De ce un tabel generic și nu un tabel per entitate** (cum erau `unit_events`/`unit_type_events`): erau 8 entități noi de acoperit (properties/guests/payments/rate_rules/promotions/stay_rules/arrival_rules/closures); 8 tabele + 8 triggere ar fi multiplicat boilerplate-ul fără beneficiu — diff-ul, RLS-ul și paginarea sunt identice pe toate. `room_blocks` are deja audit propriu (`unit_events`, trigger `audit_room_block` — vezi [triggers.md](../triggers.md)) și **nu** a fost migrat aici (ar fi dublat evenimentele).

## Trigger generic — `app.audit_entity()`

Un singur trigger function, atașat pe fiecare tabel cu argumente (`tg_argv`):

```sql
create trigger <tabel>_audit
  after insert or update or delete on <tabel>
  for each row execute function app.audit_entity(
    '<entity_type>',           -- tg_argv[0]
    '<coloană activă>',        -- tg_argv[1]: '' dacă entitatea nu are stare arhivare
    '{coloane,excluse,din,diff}' -- tg_argv[2]: literal text[]
  );
```

- **Diff generic**: `to_jsonb(NEW/OLD) - coloane_excluse` — nu mai e nevoie de un `if` per câmp ca la `audit_unit_type`; un câmp nou pe tabelul sursă apare automat în `old_data`/`new_data`. Afișarea rămâne pe principiul existent: o intrare nouă în registrul `*_FIELDS` din frontend.
- **Fără zgomot**: dacă diff-ul stripat e identic (ex. un trigger `before update` a umplut doar `updated_at`), nu se inserează niciun rând (testat — TEST 98j).
- **Arhivare/restaurare**: dacă tg_argv[1] e setat (ex. `is_active` la `promotions`), tranziția boolean-ului devine `archived`/`restored` în loc de `updated`.
- **`property_id`**: extras din coloana `property_id` a rândului; pentru `entity_type='property'` e auto-referențial (`entity_id`-ul propriu); pentru `guest` rămâne `NULL` (entitate org-wide) — RLS-ul tratează explicit acest caz.

Triggere atașate (migrația `20260621120000`): `properties_audit`, `guests_audit`, `payments_audit` (insert/delete — ledger), `rate_rules_audit`, `promotions_audit`, `stay_rules_audit`, `arrival_rules_audit` (insert/delete), `closures_audit` (insert/delete).

## RLS — gated pe `audit.view`

```sql
create policy entity_events_select on entity_events for select to authenticated
  using (app.has_permission(org_id, property_id, 'audit.view'));
```

Refolosește `app.has_permission` (Sprint 6.1) — **nicio permisiune nouă**: `audit.view` exista deja în catalog (`is_elevated`), acordată structural owner-ului și rolului ADMIN, exclusă explicit din MANAGER și din rolurile custom (`role_redesign.sql`). Înainte de Sprint 7 nu era verificată nicăieri (notă în [helpers.md](../helpers.md) — acum actualizată). `INSERT`/`UPDATE`/`DELETE`: fără politici → respinse implicit pentru `authenticated` (scrisul e exclusiv prin trigger, testat — TEST 99c).

## `get_activity_feed(p_property_id, p_limit, p_offset, p_entity_types, p_event_types, p_date_from, p_date_to) returns table(...)`

**Scop**: feed unificat cronologic per proprietate — `UNION ALL` peste `unit_events` + `unit_type_events` + `booking_events` + `entity_events`, normalizate la aceeași formă (`entity_type`, `entity_id`, `actor_email`, ...).

| | |
|---|---|
| Migrații | `20260621120000` (versiune inițială), `20260622120000` (permisiune + filtre), `20260622150000` (actor_name via JOIN profiles) |
| Security | DEFINER (`set search_path = ''`) |
| Grants | `authenticated` ✅ · `anon`/PUBLIC ❌ |
| Autorizare | `app.has_permission(org_id, p_property_id, 'audit.view')` → `FORBIDDEN` |
| Frontend | `features/audit/api.ts` → `fetchActivityFeed()`, hook `useActivityFeed`, pagina `/property/$propertyId/activity` (`features/audit/activity-feed.tsx`) |

**`actor_name` — rezolvat server-side (Sprint 8.2)**: coloana suplimentară `actor_name` se calculează printr-un singur `left join public.profiles p on p.user_id = feed.actor_id` aplicat pe subquery-ul exterior (`feed`, după `UNION ALL`-ul celor 4 ramuri, nu în fiecare ramură) — un singur join, nu patru. Valoarea e `coalesce(p.full_name, feed.actor_email)`: nume afișabil dacă actorul are profil cu `full_name` completat, altfel cade pe `actor_email` (snapshot text la momentul acțiunii, fără FK spre `auth.users`). `profiles.user_id` e PK, deci join-ul e un point-lookup indexat, ieftin chiar la 100-200 rânduri de feed per pagină.

Înainte, numele actorului se rezolva **client-side** în `activity-feed.tsx`: fetch la `useMembers(currentOrg.id)` (toată lista de membri ai organizației) → `Map` email→nume → lookup per rând. Risipitor la scară (2000 hoteluri × 100-200 staff, fetch complet doar pentru a afișa câteva nume pe o pagină). Eliminat complet — frontend-ul citește direct `ev.actor_name`.

**Bonus**: `booking_events` nu are deloc coloana `actor_email` (ramura lui selectează `null::text` pentru ea în `feed`) — înainte de acest JOIN, evenimentele de booking nu arătau niciodată un nume de actor. Acum `actor_name` se rezolvă din `actor_id → profiles` la fel ca pe celelalte ramuri, deci evenimentele de booking au și ele nume afișabil (dacă actorul are profil; altfel `actor_name` rămâne `NULL`, neexistând fallback de email pe această ramură).

**Filtre împinse în interiorul fiecărei ramuri UNION** (nu pe rezultatul agregat) — fiecare ramură își filtrează propriul tabel sursă pe coloana indexată (`property_id` prin join, plus `entity_type`/`event_type`/interval ca predicate simple), ca planner-ul să folosească indexul fiecărui tabel sursă, nu să materializeze tot feed-ul înainte de filtrare:

```sql
where u.property_id = p_property_id
  and (p_entity_types is null or 'unit' = any(p_entity_types))  -- skip ieftin pe ramuri irelevante
  and (p_event_types is null or ue.event_type = any(p_event_types))
  and (p_date_from is null or ue.created_at >= p_date_from)
  and (p_date_to is null or ue.created_at <= p_date_to)
-- ... identic pe celelalte 3 ramuri
```

**Index-uri folosite**: `units_property_idx` / `unit_types_property_idx` / `bookings_property_checkin_idx` (existente) pentru join-urile spre `property_id` pe primele 3 ramuri; pe `entity_events` direct `entity_events_property_idx (property_id, created_at)` (general) și `entity_events_property_type_idx (property_id, entity_type, created_at desc)` (filtrare pe tip).

**Paginare**: `limit/offset` (nu `.range()` — e RPC, nu tabel), aceeași convenție `pageSize + 1` ca restul listelor (`lib/pagination.ts`).

## Frontend

- `features/audit/` — modul partajat: `api.ts` (`fetchEntityEvents`, `fetchActivityFeed` + `ActivityFeedFilters`), `hooks.ts` (`useEntityEvents`, `useActivityFeed`), `entity-history-dialog.tsx` (wrapper generic peste `EventHistoryDialog` existent — vezi `unit-types/event-history-dialog.tsx`), `activity-feed.tsx` (pagina), `activity-feed-config.ts` (sursă unică `entity_type → {label, eventLabels, fields}`, reutilizează registrele deja definite per entitate, fără duplicare).
- **Filtre client**: `MultiSelectFilter` (`components/multi-select-filter.tsx`) — dropdown shadcn (`DropdownMenuCheckboxItem`) reutilizabil, nu specific feed-ului de activitate.
- **Refresh**: `staleTime: 0` + `refetchOnWindowFocus` pe `useActivityFeed` (feed-ul reflectă acțiuni ale altor membri ai echipei, nu doar ale userului curent) + buton manual de reîmprospătare — invalidarea pe mutație nu e practică aici (>10 puncte de mutație disparate across feature-uri).
- **Gate UI**: `<Can permission="audit.view">` pe nav-ul „Activitate" (`app-shell.tsx`) și pe toate butoanele noi de Istoric (proprietate, oaspete, regulă de preț, promoție); pagina are fallback grațios (`activity.no_access`) la acces direct pe URL, ca să nu lovească RPC-ul cu un user neautorizat.

## Teste (`supabase/tests/db_tests.sql`)

- **TEST 98a–98k**: create/update/delete generic pe `properties`/`guests`/`rate_rules`/`promotions` (inclusiv archived/restored, inclusiv guard-ul „fără zgomot" pe update no-op), `get_activity_feed` include evenimentele.
- **TEST 99a–99c**: izolare cross-org (`FORBIDDEN` + 0 rânduri direct pe tabel) și scrisul direct (bypass trigger) respins de RLS.
- **TEST 100a–100e**: `audit.view` — administrator îl are (citește feed-ul), manager NU îl are (`FORBIDDEN` pe RPC + 0 rânduri direct pe tabel, nu doar listă goală).
- **TEST 101a–101d**: filtrele restrâng corect (`entity_types`, `event_types`, interval de dată).
- **TEST 107a–107b**: `actor_name` — 107a verifică rezolvarea din `profiles.full_name` (owner cu profil completat); 107b verifică fallback-ul pe `actor_email` când actorul nu are `full_name` (rând `entity_events` inserat direct, pentru că fixturile de test nu populează `auth.jwt()->>'email'`, deci triggerele de audit din harness ar produce mereu `actor_email = NULL`).
