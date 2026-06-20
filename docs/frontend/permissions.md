# Permisiuni în frontend — `usePermissions` + `<Can>` (Sprint 6.2)

> Gate-urile de UI ascund/dezactivează acțiuni pe care userul nu le poate face. **Backend-ul rămâne autoritatea** (RLS + gărzi RPC, vezi [../backend/rbac.md](../backend/rbac.md)) — gate-urile sunt strict pentru UX. Un user care ocolește UI-ul tot primește `FORBIDDEN`/`42501` de la DB.

## API

`features/auth/permissions.ts`:
- `fetchMyPermissions(orgId)` → RPC `get_my_permissions` (setul efectiv de permisiuni în org).
- `usePermissions()` → `{ has(key), permissions: Set<string>, isLoading }`. Citește organizația din `useCurrentOrg()`, deci se folosește doar sub `OrgProvider` (toate rutele `/app`). `staleTime` 5 min (permisiunile se schimbă rar; se vor invalida la mutații de membru/rol în 6.3 prin `permissionKeys`).
- `useHasPermission(key | key[])` → `{ allowed, isLoading }` (any-of).

`features/auth/can.tsx`:
- `<Can permission="booking.create">…</Can>` — randează copiii dacă userul are **cel puțin una** dintre permisiuni; altfel `fallback` (default: nimic). Cât timp se încarcă, nu randează (evită flash).

```tsx
<Can permission="payment.refund">
  <Button onClick={refund}>Rambursează</Button>
</Can>
```

## Harta acțiune → permisiune

Sursa de adevăr pentru ce gate pune fiecare acțiune. Aplicat deja (✅) sau de aplicat la nevoie (gate-urile sunt aditive, backend-ul deja le impune).

| Zonă / acțiune | Permisiune | Stare |
|---|---|---|
| Sidebar nav (dashboard/properties/calendar/bookings/guests) | `dashboard.view` / `property.view` / `calendar.view` / `booking.view` / `guest.view` | ✅ filtrat în `_app.tsx` (`SidebarNav`) |
| Bookings — „Adaugă rezervare" | `booking.create` | ✅ `bookings/index.tsx` |
| Booking — editare date | `booking.edit` | de aplicat (`edit-dates-dialog` trigger) |
| Booking — mutare cameră | `booking.move` | de aplicat (reassign trigger) |
| Booking — schimbare status / anulare | `booking.edit` / `booking.cancel` | de aplicat (status menu) |
| Plăți — „Încasează" | `payment.record` | ✅ `payments/payments-card.tsx` |
| Plăți — „Rambursează" | `payment.refund` | ✅ `payments/payments-card.tsx` |
| Carduri venit (dashboard) | `revenue.view` | de aplicat (`revenue-cards`) |
| Proprietăți — „Adaugă" | `property.create` | ✅ `properties/index.tsx` |
| Proprietate — editare | `property.edit` | de aplicat |
| Tipuri/camere — management, generare, status, blocaje | `unit_type.manage` / `unit.manage` | de aplicat (`$propertyId.tsx`) |
| Tarife / sezoane | `pricing.edit` | de aplicat (`RateRulesDialog` trigger) |
| Promoții | `promotion.manage` | de aplicat (`PromotionsDialog` trigger) |
| Reguli sejur / închideri / sosire-plecare | `rules.manage` | de aplicat (dialogs) |
| Oaspeți — creare/editare/ștergere | `guest.create` / `guest.edit` / `guest.delete` | de aplicat (`guests/`) |
| Manager Override (toggle în formular rezervare) | `booking.override` | de aplicat |

> Pattern: importă `Can` din `@/features/auth/can`, înfășoară butonul/trigger-ul. Pentru elemente care trebuie să rămână vizibile dar dezactivate, folosește `useHasPermission` + `disabled`.

## Management membri & roluri (Sprint 6.3)

- `#settings/members` (gate `user.manage`) — `features/members/`: listă membri (`get_org_members`), adăugare cont existent după email, atribuire roluri multiple, acces per-proprietate (segmentat **Toate** vs **Anumite**), transfer ownership, eliminare. Rolurile afișate pentru acordare sunt filtrate la cele **acordabile** (`useGrantableRole`: permisiunile rolului ⊆ ale tale) — oglindește regula subset din backend.
- `#settings/roles` (gate `role.manage`) — `features/roles/`: roluri de sistem (read-only) + custom (creare/editare/ștergere), editor de permisiuni grupate pe domeniu; fiecare rol se poate **extinde** ca să-i vezi permisiunile (catalogul se încarcă lazy, doar la prima extindere).
- **Self-protection** (UI, oglindește backend-ul): pentru propriul cont rolurile sunt read-only, iar remove/transfer sunt ascunse (`CANNOT_EDIT_SELF`/`CANNOT_REMOVE_SELF`).
- **Confirmare cu tastat** (`components/typed-confirm-dialog.tsx`, stil GitHub): eliminarea unui membru și transferul de ownership cer tastarea emailului — pregătit pentru fluxuri ireversibile (ex. email API la transfer).

## De ce gate-urile NU înlocuiesc backend-ul

Permisiunile vin dintr-un RPC; un client modificat le poate ignora. De aceea fiecare acțiune e dublată de enforcement în DB (RLS / `has_permission` în RPC). Gate-ul UI = mai puțin „forbidden" surpriză pentru user; securitatea reală e în DB. Vezi matricea de teste din [../backend/rbac.md](../backend/rbac.md) (TEST 80–84).
