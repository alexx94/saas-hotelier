# RBAC & Multi-tenant — doc master Sprint 6

> Sursa unică de adevăr pentru sistemul de roluri, permisiuni, acces și actori. Modelul de date: `20260618130000_rbac_foundation.sql`. Acest document acoperă **tot Sprint 6**; roadmap-ul cu status e la final.

---

## 1. Modelul de actori — două „lane"-uri de principali

Fundamentul de scalabilitate care permite, long-term, conturi de oaspeți self-service (gen Mews/Booking.com) **fără suprapunere** cu RBAC-ul de staff. Un `auth.users` poate fi:

| Lane | Cine e | Cum e autorizat | Suprafață UI |
|---|---|---|---|
| **Staff** | membru al unei organizații (`organization_members`) | **RBAC**: roluri → permisiuni granulare (`app.has_permission`), scoping pe proprietăți (`member_property_access`) | app intern `/app` |
| **Guest** *(viitor)* | user legat de un rând `guests` (`guests.user_id`, încă neimplementat) | **Ownership**: vede/modifică DOAR resursele proprii (`guests.user_id = auth.uid()`) | suprafața publică `/p/...` + viitor `/account` |

### Reguli de aur (respectate de la 6.1)

1. Catalogul `permissions` și `has_permission` sunt **exclusiv pentru staff** (org-scoped). Capabilitățile de guest **nu** sunt permisiuni — sunt implicite din ownership.
2. Un guest nu are rând în `organization_members` → nu poate primi niciodată o permisiune de staff.
3. Cele două lane-uri au **gate-uri UI separate** (membership vs ownership), niciodată un gate comun.
4. Un singur om poate fi ambele (angajat care se și cazează) fără conflict — lane-urile sunt ortogonale.
5. `profiles` (identitate partajată: nume/avatar — tabel ce vine în 6.3) e singura entitate comună ambelor lane-uri.

**De ce contează:** dacă am modela self-booking-ul de guest ca pe o „permisiune" în catalogul de staff, am avea coliziuni (un guest n-ar trebui să apară în lista de membri, un `booking.create` de staff ≠ un guest care-și face propria rezervare). Separând lane-urile de la fundație, feature-ul de conturi de oaspeți se adaugă fără să atingă RBAC-ul.

---

## 2. Modelul RBAC

```
auth.users ──< organization_members >── organizations
                     │   (enum role: bridge de tranziție)        owner_user_id ──> auth.users
                     │                                            (owner structural: 1/org, transferabil)
                     └──< member_roles >── roles ──< role_permissions >── permissions
                          (multi-rol)      │                                (catalog static)
                                           └─ org_id NULL = rol de sistem
                                              org_id setat = rol custom al organizației
```

- **Multiple roluri per membru** (`member_roles`): permisiunile se **cumulează** (union). Ca la Mews.
- **Roluri de sistem** (`is_system`, `org_id NULL`): predefinite, globale, partajate de toate organizațiile. **Roluri custom** (`org_id` setat): definite per organizație (UI în 6.3).
- **Owner structural** (`organizations.owner_user_id`): separat de roluri. Unul per org, transferabil; baza pentru billing și garda „cel puțin un owner" (6.3). Owner-ul **bypass-ează** verificarea de permisiuni.
- **Scoping pe proprietăți**: `member_property_access` (gol = toate proprietățile org-ului). Permisiunea e validă **doar dacă** userul are și acces la proprietate.

### Bridge de tranziție (enum ↔ member_roles)

Cât timp `organization_members.role` (enum `owner/manager/staff`) încă există, el rămâne **sursa**: triggerul `app.sync_member_role` reflectă automat orice insert/update de rol în `member_roles` (`owner→administrator`, `manager→manager`, `staff→reception`). Asta înseamnă că **tot codul existent populează noul model fără modificări** (zero regresie în 6.1). Enum-ul și triggerul se retrag în 6.2/6.3, când managementul de roluri devine direct din UI.

---

## 3. Catalogul de permisiuni

Cheie `domeniu.acțiune`. Static, seed-only. Grupat pe domenii de business (ca la Mews: front office / management / housekeeping / finance / administration).

| Domeniu | Permisiuni |
|---|---|
| `booking` | `booking.view`, `booking.create`, `booking.edit`, `booking.cancel`, `booking.move` |
| `calendar` | `calendar.view` |
| `guest` | `guest.view`, `guest.create`, `guest.edit`, `guest.delete` |
| `pricing` | `pricing.view`, `pricing.edit` |
| `property` | `property.view`, `property.create`, `property.edit`, `property.delete`, `unit.manage`, `unit_type.manage` |
| `finance` | `payment.view`, `payment.record`, `payment.refund`, `revenue.view` |
| `dashboard` | `dashboard.view` |
| `commercial` | `promotion.manage`, `rules.manage` |
| `admin` | `user.invite`, `user.manage`, `role.manage`, `organization.edit`, `organization.billing`, `audit.view` |

> Orice permisiune nouă = un rând în tabelul `permissions` (migrație) **și** un rând aici. Convenția cheilor: domeniu scurt + acțiune (`view/create/edit/delete/manage/...`).

---

## 4. Rolurile de sistem (matrice)

| Rol (slug) | Acoperire |
|---|---|
| **administrator** | **toate** permisiunile (echivalent owner) |
| **manager** | tot, **mai puțin** `organization.billing`, `role.manage`, `property.delete` |
| **reception** | `booking.*`, `calendar.view`, `guest.view/create/edit`, `payment.view/record`, `dashboard.view` |
| **housekeeping** | `calendar.view`, `booking.view`, `unit.manage` |
| **finance** | `payment.*`, `revenue.view`, `booking.view`, `dashboard.view` |
| **readonly** | toate permisiunile `*.view` |

Backfill din enum: `owner→administrator`, `manager→manager`, `staff→reception`.

---

## 5. Helperii de autorizare (schema `app`)

Aditivi în 6.1 — **definiți dar încă neapelați** de nicio politică/RPC. Devin primitiva de enforcement în 6.2. Toți `security definer, stable, set search_path = ''`.

### `app.user_permissions(p_org_id uuid) returns setof text`
Toate permisiunile efective ale userului curent (`auth.uid()`) în organizație: owner structural → **toate**; altfel **union** peste toate rolurile membrului (`member_roles ⋈ role_permissions`). Util pentru a hidrata UI-ul (ce poate userul).

### `app.has_permission(p_org_id uuid, p_property_id uuid, p_key text) returns boolean`
**Regula de enforcement** (spec §5.3): `true` dacă userul e owner structural **SAU** (`p_key` ∈ permisiunile membrului **ȘI** (`p_property_id` e `NULL` **SAU** `app.can_access_property(p_property_id)`)). Trece `p_property_id = NULL` pentru verificări la nivel de organizație (ex. `user.invite`).

> Construiește pe `app.can_access_property` (vezi [helpers.md](helpers.md)) — scoping-ul pe proprietăți era deja implementat prin `member_property_access`.

---

## 6. Securitate (tabelele noi)

| Tabel | SELECT | Scriere |
|---|---|---|
| `permissions` | orice user autentificat (catalog) | ❌ seed-only |
| `roles` | rolurile de sistem (toți) + rolurile org-ului propriu | ❌ în 6.1 (roluri custom din UI → 6.3) |
| `role_permissions` | dacă rolul e vizibil | ❌ în 6.1 |
| `member_roles` | membrii org-ului | trigger `app.sync_member_role` (definer) în 6.1; management direct → 6.3 |

- `anon` nu are acces la niciun tabel RBAC (`revoke all from anon`).
- **Guard cross-tenant** (`app.check_member_role_org`, trigger BEFORE pe `member_roles`): un membru poate primi doar roluri de sistem (`org_id NULL`) sau roluri ale **propriei** organizații → altfel `ROLE_ORG_MISMATCH`.

---

## 7. Roadmap Sprint 6

Fiecare sub-sprint implementat primește **doc propriu** (în `rpc/` sau `frontend/`) + actualizează acest tabel. Nimic nu e „terminat" fără documentație.

| Sub-sprint | Conținut | Status | Doc |
|---|---|---|---|
| **6.1 — RBAC Foundation (DB)** | Tabele `permissions/roles/role_permissions/member_roles`, `owner_user_id`, seed catalog + roluri sistem, backfill din enum, helperi `has_permission`/`user_permissions`. **Fără enforcement.** | ✅ **done** | acest doc |
| **6.2 — Enforcement** | RLS + autorizare RPC migrate `is_org_role` → `has_permission`; frontend `usePermissions()` + `<Can>`; deprecierea enum-ului. | ⏳ planificat | `frontend/permissions.md` |
| **6.3 — Member management + profiles** | `profiles` (+ trigger signup), listă membri, atribuire roluri multiple, UI acces per-proprietate, UI roluri custom; `#settings/members` + `#settings/roles`; `transfer_ownership` + garda „cel puțin un owner"; `owner_user_id` → NOT NULL. | ⏳ planificat | `rpc/members.md` |
| **6.4 — Invitations (link/token, email-ready)** | `organization_invites` (token, email, `role_ids[]`, property_scope, expirare); RPC `create_invite`/`accept_invite`; **seam `app.dispatch_invite`** (acum link; viitor email edge function — fără schimbare de schemă); UI invite + inbox. | ⏳ planificat | `rpc/invites.md` |
| **6.5 — Audit** | `audit_logs` generic pentru acțiuni admin cross-entitate (rol/acces/ownership/invitații); tabelele bogate per-entitate (`booking_events` etc.) rămân pt. operațional. | ⏳ planificat | `rpc/audit.md` |
| **6.6 — Plans & limits** | `plans`, `organizations.plan_id`, garde `can_create_property`/`can_invite_user`. | ⏳ planificat | `rpc/plans.md` |
| **(Epic viitor) Guest self-service** | `guests.user_id`, lane-ul de ownership pe suprafața publică, UI `/account`. În afara Sprint 6; nepermis să intre în conflict cu RBAC (vezi §1). | ⏳ idee | — |

---

## 8. Ce NU s-a atins în 6.1 (garanția zero-regresie)

Politicile RLS existente, helperii `is_org_role`/`can_access_property` și toate RPC-urile rămân **neschimbate** (excepție: `create_organization` setează acum `owner_user_id`, pur aditiv). Noii helperi există dar nu sunt apelați de nimeni. Aplicația se comportă identic — capătă doar fundația de date + primitivele de autorizare.
