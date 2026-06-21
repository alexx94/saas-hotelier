# RPC-uri — index

> RPC-urile sunt "API-ul" aplicației: funcții în schema `public`, apelate din frontend cu `supabase.rpc("nume", {...})`. Fiecare document de feature descrie: scop, semnătură, securitate, validări/erori și locul din frontend care îl apelează.

| RPC | Feature | Security | Cine apelează | Doc |
|---|---|---|---|---|
| `create_organization` | organizații | DEFINER | authenticated (onboarding) | [organizations.md](organizations.md) |
| `generate_units` | camere | INVOKER | owner/manager (prin RLS) | [units.md](units.md) |
| `bulk_update_unit_status` | camere | INVOKER | owner/manager (prin RLS) | [units.md](units.md) |
| `bulk_delete_units` | camere | INVOKER | owner/manager (prin RLS) | [units.md](units.md) |
| `block_unit` | blocaje camere | INVOKER | membri (prin RLS) | [units.md](units.md) |
| `bulk_block_units` | blocaje camere | INVOKER | membri (prin RLS) | [units.md](units.md) |
| `remove_block` | blocaje camere | INVOKER | membri (prin RLS) | [units.md](units.md) |
| `bulk_remove_blocks` | blocaje camere | INVOKER | membri (prin RLS) | [units.md](units.md) |
| `find_or_create_guest` | oaspeți | DEFINER | authenticated, doar org proprie | [guests.md](guests.md) |
| `create_booking` | rezervări | DEFINER | membri cu acces pe proprietate | [bookings.md](bookings.md) |
| `update_booking_dates` | rezervări | DEFINER | membri cu acces pe proprietate | [bookings.md](bookings.md) |
| `reassign_booking` | rezervări | DEFINER | membri cu acces pe proprietate | [bookings.md](bookings.md) |
| `get_available_units` | rezervări | DEFINER | membri cu acces pe proprietate | [bookings.md](bookings.md) |
| `validate_booking` | validatori | DEFINER | membri cu acces pe proprietate | [validators.md](validators.md) |
| `record_payment` | plăți | DEFINER | membri cu acces pe proprietate | [payments.md](payments.md) |
| `get_revenue_summary` | plăți | DEFINER | membri cu acces pe proprietate | [payments.md](payments.md) |
| `quote_price` | pricing | DEFINER | membri cu acces pe proprietate | [pricing.md](pricing.md) |
| `get_rate_calendar` | pricing | DEFINER | membri cu acces pe proprietate | [pricing.md](pricing.md) |
| `get_stay_constraints` | reguli rezervare | DEFINER | membri cu acces pe proprietate | [reservation-rules.md](reservation-rules.md) |
| `get_dashboard_stats` | panou (analytics) | DEFINER | membri cu acces pe proprietate | [dashboard.md](dashboard.md) |
| `get_my_permissions` | RBAC (permisiuni) | DEFINER | authenticated (org proprie) | [rbac.md](../rbac.md) |
| `add_member` / `set_member_roles` / `set_member_property_access` / `remove_member` / `transfer_ownership` | management membri | DEFINER | `user.manage` / owner | [members.md](members.md) |
| `create_role` / `update_role` / `delete_role` | roluri custom | DEFINER | `role.manage` | [members.md](members.md) |
| `get_org_members` | management membri | DEFINER | membru al org-ului | [members.md](members.md) |
| `public_preview_promo` | promoții | DEFINER | **anon** + authenticated | [promotions.md](promotions.md) |
| `public_get_availability` | pagina publică | DEFINER | **anon** + authenticated | [public-api.md](public-api.md) |
| `public_create_booking` | pagina publică | DEFINER | **anon** + authenticated | [public-api.md](public-api.md) |
| `get_activity_feed` | audit & activity feed | DEFINER | `audit.view` (owner/admin) | [audit.md](audit.md) |

Funcții interne (schema `app`, neapelabile din API): `app.create_booking_internal` ([bookings.md](bookings.md)), `app.find_or_create_guest_internal` ([guests.md](guests.md)), `app.sync_booking_payment` (trigger plăți, [payments.md](payments.md)), `app.compute_price` (motorul de preț, [pricing.md](pricing.md)), `app.resolve_stay` + `app.is_closed` (reguli de rezervare, [reservation-rules.md](reservation-rules.md)), `app.check_arrival_departure` (restricții sosire/plecare, [stay-restrictions.md](stay-restrictions.md)), `app.resolve_promotion` (rezolvare promoții, [promotions.md](promotions.md)), `app.validate_booking` + validatorii `app.validate_*`, `app.booking_block_codes`, `app.unit_is_free` (strat de validatori, [validators.md](validators.md)), `app.user_permissions` + `app.has_permission` + triggerele `app.sync_member_role`/`app.check_member_role_org` (RBAC, [rbac.md](../rbac.md)), `app.audit_entity` (trigger generic de audit, [audit.md](audit.md)).

**RBAC (Sprint 6.1–6.2)** — roluri/permisiuni: tabelele `permissions`, `roles`, `role_permissions`, `member_roles` + `organizations.owner_user_id`. Doc complet: [rbac.md](../rbac.md). 6.2 a mutat autorizarea de scriere (operațional) pe `app.has_permission` (RLS + gărzi în `create_booking`/`update_booking_dates`/`reassign_booking`/`record_payment`/`link_booking_guest`/`validate_booking`) și a adăugat `get_my_permissions` pentru UI.

**Audit & Activity Feed (Sprint 7)** — tabel generic `entity_events` + trigger generic `app.audit_entity` (extinde audit-ul existent `unit_events`/`unit_type_events`/`booking_events` la properties/guests/payments/rate_rules/promotions/stay_rules/arrival_rules/closures) + `get_activity_feed` (feed unificat per proprietate, cu filtre entity_type/event_type/interval). Gated pe permisiunea `audit.view`, deja existentă din Sprint 6.1 — **reutilizare**, nu permisiune nouă. Doc complet: [audit.md](audit.md).

## Contractul cu frontend-ul

- Semnătura (numele + parametrii `p_*`) e contract: schimbarea ei cere regenerarea `web/src/lib/database.types.ts`.
- Erorile sunt coduri-mașină (`UNIT_NOT_AVAILABLE`, `FORBIDDEN`, ...) ridicate cu `raise exception`; frontend-ul le prinde în `api.ts`/componente și le mapează pe chei i18n.
- Fluxul standard în frontend: `features/<feature>/api.ts` (apelul brut) → `hooks.ts` (useMutation/useQuery + invalidare cache) → componentă.

## Checklist pentru un RPC nou

1. Migrație nouă cu funcția + **grants explicite** (`revoke from public, anon` / `grant to ...`).
2. DEFINER? → `set search_path = ''`, nume calificate, autorizare explicită în primele linii ([security-model.md](../security-model.md)).
3. Test în `supabase/tests/db_tests.sql` (cel puțin: cazul fericit + cazul neautorizat).
4. `supabase gen types typescript --local > web/src/lib/database.types.ts`.
5. Documentare: secțiune în fișierul de feature + rând în tabelul de mai sus + inventarul din [../README.md](../README.md).
