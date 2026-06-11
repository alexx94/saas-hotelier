# Helpers — schema `app`

> Funcții utilitare interne. Schema `app` **nu este expusă prin PostgREST** — nimic de aici nu poate fi apelat cu `supabase.rpc()`. Rolurile API au doar `USAGE` pe schemă (necesar ca politicile RLS să poată evalua helper-ele).

## Helpers de autorizare (folosite în politici RLS și în RPC-uri definer)

Toate sunt `security definer, stable, set search_path = ''` — definer ca să nu intre în recursie cu RLS pe `organization_members`, stable ca Postgres să le cache-uiască per-statement.

### `app.user_org_ids() returns setof uuid`
Org-urile userului curent (`auth.uid()`). Baza pentru politicile "membru al org-ului" și verificarea din `find_or_create_guest`.

### `app.user_role(p_org_id uuid) returns text`
Rolul userului curent în org (`owner`/`manager`/`staff`/NULL). Folosit punctual; preferă `is_org_role` pentru verificări booleene.

### `app.is_org_role(p_org_id uuid, p_roles text[]) returns boolean`
Userul are unul din rolurile date în org. Folosit în politicile de scriere (`owner`/`manager`).

### `app.can_access_property(p_property_id uuid) returns boolean`
Verificarea standard de acces la o proprietate: membru al org-ului proprietății **și** (nu are restricții per-proprietate **sau** are rând în `member_property_access` pentru ea). Folosit de politicile pe `unit_types`/`units`/`bookings`/`booking_events` și ca verificare explicită în RPC-urile definer pe bookings.

## Helpers de date

### `app.normalize_phone(p_phone text) returns text` — `immutable strict`
Extrage doar cifrele (`"+40 722-111.222"` → `"40722111222"`). **Imutabilă** ca să poată fi folosită în indexul unic pe expresie `guests_org_phone_unique` și în matching-ul din `find_or_create_guest_internal` — aceeași normalizare peste tot, altfel constraint-ul și dedupe-ul ar diverge.

## Funcții interne de business (nu helpers, dar tot în `app`)

| Funcție | Documentată în |
|---|---|
| `app.create_booking_internal` | [rpc/bookings.md](rpc/bookings.md#appcreate_booking_internal) |
| `app.find_or_create_guest_internal` | [rpc/guests.md](rpc/guests.md#appfind_or_create_guest_internal) |
| funcțiile de trigger (`audit_booking`, `validate_booking_update`, ...) | [triggers.md](triggers.md) |

## Regulă

Funcție nouă care nu trebuie apelată din frontend → schema `app` + `revoke execute ... from public, anon, authenticated` dacă e definer cu efecte (vezi [security-model.md](security-model.md)).
