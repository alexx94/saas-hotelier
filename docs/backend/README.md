# Backend & Database — Documentație

> Documentația completă a stratului de backend: funcții RPC, helpers, triggers, RLS și modelul de securitate.
> Schema tabelelor: vezi [ARCHITECTURE.md](../ARCHITECTURE.md). Istoricul schimbărilor: [CHANGELOG.md](../CHANGELOG.md).

## Cum e organizat backend-ul

Aplicația nu are un server propriu — backend-ul este **PostgreSQL + PostgREST (Supabase)**:

- **Operații simple (CRUD)** → frontend-ul lovește tabelele direct (`supabase.from(...)`), protejat de **RLS**.
- **Operații compuse/atomice** → funcții **RPC** în schema `public` (`supabase.rpc(...)`). Ele sunt echivalentul "API endpoints".
- **Logică internă** → funcții în schema `app` — **nu sunt expuse prin API** (PostgREST expune doar `public`); sunt apelate de RPC-uri, politici RLS sau triggers.

```
frontend (api.ts per feature)
   │
   ├── supabase.from("tabel")  ──► tabele public.*  ◄─ RLS (politici + grants)
   │                                    ▲
   └── supabase.rpc("functie") ──► RPC public.*     │
                                        │           │
                                        ▼           │
                                   app.* (helpers, engine intern, triggers)
```

## Hartă documente

| Document | Conținut |
|---|---|
| [security-model.md](security-model.md) | Modelul de securitate (definer vs invoker, grants) + **auditul de securitate** |
| [rls-policies.md](rls-policies.md) | Politicile RLS per tabel + grants pe coloane pentru `anon` |
| [helpers.md](helpers.md) | Funcțiile helper din schema `app` (autorizare, normalizare) |
| [triggers.md](triggers.md) | Toate trigger-ele + funcțiile lor (validări, audit, normalizare) |
| [rpc/README.md](rpc/README.md) | **Index-ul tuturor RPC-urilor** + convenții |
| [rpc/organizations.md](rpc/organizations.md) | `create_organization` |
| [rpc/units.md](rpc/units.md) | `generate_units`, `bulk_update_unit_status` |
| [rpc/guests.md](rpc/guests.md) | `find_or_create_guest` (+ varianta internă), `get_guest_stats` |
| [rpc/bookings.md](rpc/bookings.md) | `create_booking`, `update_booking_dates`, `reassign_booking`, `link_booking_guest`, `get_available_units` + engine-ul intern |
| [rpc/public-api.md](rpc/public-api.md) | API-ul anonim: `public_get_availability`, `public_create_booking` |

## Inventarul funcțiilor (cine ce poate apela)

Stare la 2026-06-12, după migrația 18 (`20260612140000`). ✅ = are EXECUTE.

| Funcție | Schema | Security | `anon` | `authenticated` | Documentată în |
|---|---|---|---|---|---|
| `create_organization` | public | DEFINER | ❌ | ✅ | [rpc/organizations.md](rpc/organizations.md) |
| `generate_units` | public | INVOKER | ❌ | ✅ (RLS decide) | [rpc/units.md](rpc/units.md) |
| `bulk_update_unit_status` | public | INVOKER | ❌ | ✅ (RLS decide) | [rpc/units.md](rpc/units.md) |
| `bulk_delete_units` | public | INVOKER | ❌ | ✅ (RLS decide) | [rpc/units.md](rpc/units.md) |
| `block_unit` / `bulk_block_units` / `remove_block` / `bulk_remove_blocks` | public | INVOKER | ❌ | ✅ (RLS decide) | [rpc/units.md](rpc/units.md) |
| `find_or_create_guest` | public | DEFINER | ❌ | ✅ (doar org proprie) | [rpc/guests.md](rpc/guests.md) |
| `create_booking` | public | DEFINER | ❌ | ✅ (doar prop. accesibile) | [rpc/bookings.md](rpc/bookings.md) |
| `update_booking_dates` | public | DEFINER | ❌ | ✅ (doar prop. accesibile) | [rpc/bookings.md](rpc/bookings.md) |
| `reassign_booking` | public | DEFINER | ❌ | ✅ (doar prop. accesibile) | [rpc/bookings.md](rpc/bookings.md) |
| `link_booking_guest` | public | DEFINER | ❌ | ✅ (doar prop. accesibile) | [rpc/bookings.md](rpc/bookings.md) |
| `get_guest_stats` | public | INVOKER | ❌ | ✅ (RLS decide) | [rpc/guests.md](rpc/guests.md) |
| `get_available_units` | public | INVOKER | ❌ | ✅ (RLS decide) | [rpc/bookings.md](rpc/bookings.md) |
| `public_get_availability` | public | DEFINER | ✅ | ✅ | [rpc/public-api.md](rpc/public-api.md) |
| `public_create_booking` | public | DEFINER | ✅ | ✅ | [rpc/public-api.md](rpc/public-api.md) |
| `app.create_booking_internal` | app | DEFINER | ❌ | ❌ (doar din RPC-uri) | [rpc/bookings.md](rpc/bookings.md) |
| `app.find_or_create_guest_internal` | app | DEFINER | ❌ | ❌ (doar din RPC-uri) | [rpc/guests.md](rpc/guests.md) |
| `app.user_org_ids` / `user_role` / `can_access_property` / `is_org_role` | app | DEFINER | helpers RLS | helpers RLS | [helpers.md](helpers.md) |
| `app.normalize_phone` | app | INVOKER | helper pur | helper pur | [helpers.md](helpers.md) |
| `app.set_updated_at` / `audit_booking` / `audit_unit` / `audit_unit_type` / `audit_room_block` / `validate_booking_update` / `check_unit_status_change` / `validate_room_block` / `check_booking_block_overlap` / `normalize_guest_row` | app | trigger | n/a | n/a | [triggers.md](triggers.md) |

### Cum regenerezi inventarul (mentenanță)

Rulează în SQL Editor (Studio) sau prin psql — listează **doar funcțiile scrise de noi** (exclude built-ins și extensiile precum `btree_gist`):

```sql
select n.nspname as schema, p.proname as functie,
       case when p.prosecdef then 'DEFINER' else 'INVOKER' end as security,
       pg_get_function_identity_arguments(p.oid) as argumente,
       coalesce(array_to_string(p.proacl::text[], ' | '), '(implicit: PUBLIC=X)') as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','app')
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
order by n.nspname, p.proname;
```

Citirea coloanei `acl`: `anon=X` / `authenticated=X` = rolul are EXECUTE; `=X` = **PUBLIC** are EXECUTE (adică toată lumea, inclusiv anon — atenție, e grant-ul implicit Postgres pe funcții noi; vezi [security-model.md](security-model.md#capcana-grant-ul-implicit-public)).

## Convenții (obligatorii la orice funcție nouă)

1. **RPC nou** = fișier de migrație nou + intrare în documentul de feature din `rpc/` + rând în tabelul de mai sus.
2. **SECURITY DEFINER** doar dacă e necesar (bypass RLS) și atunci **obligatoriu**: `set search_path = ''`, nume calificate (`public.tabel`), verificare explicită de autorizare (`app.can_access_property` / `app.user_org_ids`) ca prim pas.
3. **Grants explicite** după fiecare `create function`: `revoke ... from public, anon;` apoi `grant ... to authenticated;` (sau `anon` doar pentru API-ul public). Niciodată nu lăsa grant-ul implicit PUBLIC.
4. Funcțiile interne (neapelabile din API) stau în schema `app` cu `revoke ... from public, anon, authenticated`.
5. Erorile se ridică cu `raise exception 'COD_MASINA'` (ex. `UNIT_NOT_AVAILABLE`) — frontend-ul le mapează pe mesaje i18n.
6. Orice schimbare de semnătură RPC din `public` → regenerezi tipurile: `supabase gen types typescript --local > web/src/lib/database.types.ts`.
7. Teste: orice regulă de securitate/integritate nouă primește un test în `supabase/tests/db_tests.sql`.
