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
| `booking` | `booking.view`, `booking.create`, `booking.edit`, `booking.cancel`, `booking.move`, `booking.override` (Manager Override, Sprint 6.2) |
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
| **administrator** | toate **mai puțin** `organization.billing` (owner-only) — vezi §10 |
| **manager** | operațional + management base, **fără** creare/ștergere proprietăți, role.manage, setări org — vezi §10 |
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
| **6.2 — Enforcement** | RLS de scriere + gărzi RPC pe domenii operaționale migrate `is_org_role` → `has_permission`; permisiunea `booking.override`; RPC `get_my_permissions`; frontend `usePermissions()` + `<Can>` + nav filtrat. | ✅ **done** | [frontend/permissions.md](../frontend/permissions.md) + §9 |
| **6.3 — Member management + profiles** | `profiles` (+ trigger signup), `add_member` (cont existent după email), roluri multiple, acces per-proprietate, editor roluri custom, `transfer_ownership`; UI `#settings/members` + `#settings/roles`. | ✅ **done** | [rpc/members.md](rpc/members.md) |
| **6.4 — Invitations (link/token, email-ready)** | `organization_invites` (token, email, `role_ids[]`, property_scope, expirare); RPC `create_invite`/`accept_invite`; **seam `app.dispatch_invite`** (acum link; viitor email edge function — fără schimbare de schemă); UI invite + inbox. | ⏳ planificat | `rpc/invites.md` |
| **6.5 — Audit** | `audit_logs` generic pentru acțiuni admin cross-entitate (rol/acces/ownership/invitații); tabelele bogate per-entitate (`booking_events` etc.) rămân pt. operațional. | ⏳ planificat | `rpc/audit.md` |
| **6.6 — Plans & limits** | `plans`, `organizations.plan_id`, garde `can_create_property`/`can_invite_user`. | ⏳ planificat | `rpc/plans.md` |
| **(Epic viitor) Guest self-service** | `guests.user_id`, lane-ul de ownership pe suprafața publică, UI `/account`. În afara Sprint 6; nepermis să intre în conflict cu RBAC (vezi §1). | ⏳ idee | — |

---

## 8. Ce NU s-a atins în 6.1 (garanția zero-regresie)

Politicile RLS existente, helperii `is_org_role`/`can_access_property` și toate RPC-urile rămân **neschimbate** (excepție: `create_organization` setează acum `owner_user_id`, pur aditiv). Noii helperi există dar nu sunt apelați de nimeni. Aplicația se comportă identic — capătă doar fundația de date + primitivele de autorizare.

---

## 9. Enforcement (Sprint 6.2)

Migrația `20260618140000_rbac_enforcement.sql` mută autorizarea de **scriere** pe `has_permission`, pe domeniile **operaționale**. SELECT rămâne la nivel de izolare de tenant (permisiunile `*.view` se aplică în UI). Domeniile **admin** (`organizations`, `organization_members`, `member_property_access`) rămân pe `is_org_role` — vin în 6.3.

### Maparea RLS de scriere

| Tabel | Operație | Permisiune |
|---|---|---|
| `properties` | insert / update / delete | `property.create` (org) / `property.edit` / `property.delete` |
| `unit_types` | cud | `unit_type.manage` |
| `units`, `room_blocks` | cud | `unit.manage` |
| `guests` | insert / update / delete | `guest.create` / `guest.edit` / `guest.delete` (select = membru) |
| `bookings` | update / delete | `booking.edit` / `booking.cancel` |
| `payments` | delete | `payment.refund` |
| `rate_rules` | cud | `pricing.edit` |
| `stay_rules`, `closures`, `arrival_rules` | cud | `rules.manage` |
| `promotions`, `promotion_rules` | cud | `promotion.manage` |

### Gărzi în RPC-uri (DEFINER)

`create_booking`→`booking.create`, `update_booking_dates`/`link_booking_guest`→`booking.edit`, `reassign_booking`→`booking.move`, `record_payment`→`payment.record` (+`payment.refund` pentru `kind='refund'`). Manager Override (`p_override`) cere `booking.override` (în `create_booking`/`update_booking_dates`/`validate_booking`). Toate folosesc `has_permission`, care include și verificarea de acces pe proprietate.

### Frontend
`public.get_my_permissions(org)` → `usePermissions()` + `<Can>` (vezi [frontend/permissions.md](../frontend/permissions.md)). Gate-uri pe acțiuni + nav filtrat. UI-ul nu e autoritatea — DB respinge oricum (`FORBIDDEN`/`42501`).

### Teste
`db_tests.sql` TEST 80 (RLS scriere ±), 81 (gărzi RPC FORBIDDEN), 82 (permisiune × acces proprietate), 83 (Manager Override), 84 (`get_my_permissions` union). **213 PASS**. Cele 192 anterioare rulează ca administrator → neschimbate.

### Ce rămâne pe enum (bridge) până la 6.3
`organizations`/`organization_members`/`member_property_access` (admin), plus crearea de membri (doar prin enum, fără UI). `is_org_role` + triggerul de sync rămân active acolo.

---

## 10. Autoritate prin permisiuni „elevate" + tier-uri (Sprint 6.3.2)

Cine pe cine poate **gestiona** (nu doar ce poate face) — fără ranguri numerice pe roluri (ar strica rolurile custom) și fără „cine are mai multe permisiuni" (ambiguu). Autoritatea vine dintr-un set FIX de **permisiuni elevate**.

### Permisiuni elevate (`permissions.is_elevated`)
`user.invite`, `user.manage`, `role.manage`, `property.create`, `property.delete`, `organization.edit`, `organization.billing`, `audit.view`. Restul = de bază (operațional). Permisiunile elevate **nu pot fi puse în roluri custom**.

### Ierarhia clară de roluri (Sprint 6.3.3 — redesign)
| Rol | Ce poate | Ce NU poate |
|---|---|---|
| **OWNER** (structural) | **tot**, inclusiv `organization.billing`/abonament, transfer/ștergere organizație | — |
| **ADMIN** (`role.manage`) | management users/roluri, **proprietăți (creare/ștergere)**, setări org, audit, tot operațional | billing/abonament/ownership (owner-only) |
| **MANAGER** (`user.manage`, fără `role.manage`) | operațional **doar în proprietățile la care are acces** + gestionează useri de bază acolo, `property.edit` | **creare/ștergere proprietăți**, role management, setări org/billing |
| **BASE** (reception/housekeeping/finance/readonly + custom) | task-uri operaționale specifice | management de orice fel |

`organization.billing` nu mai e acordat niciunui rol — rămâne exclusiv owner (prin bypass), reprezentând abonamentul/facturarea.

### Tier (derivat din permisiuni)
| Tier | Cum |
|---|---|
| **OWNER (3)** | `organizations.owner_user_id` (structural, bypass tot) |
| **ADMIN (2)** | deține `role.manage` |
| **MANAGER (1)** | deține `user.manage` (fără `role.manage`) |
| **BASE (0)** | niciuna elevată — reception/housekeeping/finance/readonly **și orice rol custom** |

### Reguli (toate DEFINER)
1. **Gestionezi doar tier STRICT mai mic** (`app.can_manage_member`): owner intangibil; admin nu atinge alt admin; manager nu atinge alt manager/admin; base nimic. În plus, **un manager (non-admin) poate gestiona doar ținte explicit restrânse la proprietățile lui** (o țintă cu acces complet vede proprietăți pe care managerul nu le are → doar admin/owner o gestionează).
2. **Acorzi doar roluri de tier mai mic** (`app.can_grant_roles`): doar owner acordă Administrator; admin → manager+base; manager → base. (+ regula subset pe permisiuni, păstrată.)
3. **Rolurile custom sunt forțat BASE**: `create_role`/`update_role` resping permisiuni elevate (`ELEVATED_NOT_ALLOWED`). Crearea de roluri = `user.manage` (manager+), dar doar roluri de bază. → nu există ambiguitate „rol X peste Y", pentru că doar rolurile de sistem au permisiuni elevate.
4. **Acces la proprietăți doar cât ai tu**: `set_member_property_access` acordă doar proprietăți accesibile actorului (`PROPERTY_FORBIDDEN`). **„Toate proprietățile" (listă goală) e permis DOAR dacă actorul nu e el însuși restrâns** (`app.actor_property_restricted`) — altfel un admin restrâns la hotel 1 ar putea acorda acces complet (bypass). În plus, `add_member` făcut de un actor restrâns **moștenește** scope-ul actorului pentru noul membru (altfel ar primi acces complet implicit).

### Scoping vizibilitate
`properties_select` (authenticated) = `app.can_access_property_row(org_id, id)` → un membru restrâns **nici nu vede** alte proprietăți (switcher/liste). Owner/admin fără restricții → tot.

> **Important** (capcană rezolvată): politica folosește `can_access_property_row(org_id, id)` care evaluează pe **coloanele rândului**, NU `can_access_property(id)` care re-interoghează tabelul `properties`. La `INSERT...RETURNING` (ce face PostgREST `.insert().select()`), rândul nou nu e vizibil unei funcții `stable` care re-selectează → ar bloca crearea de proprietăți. Varianta pe coloane evaluează corect pe `NEW`.

### Frontend (oglindă, doar UX)
`features/members/authority.ts` (`useAuthority`): `actorTier`, `canGrantRole` (tier + subset), `canManage(member)` (tier). Lista de membri ascunde editarea pe cine nu poți gestiona; editorul de roluri custom nu oferă permisiuni elevate; settings „Membri/Roluri" gate pe `user.manage`. Backend-ul rămâne autoritatea.

### Teste
`db_tests.sql` TEST 93: admin↔admin blocat, admin acordă manager/nu admin, owner intangibil, manager doar base în proprietățile lui, `PROPERTY_FORBIDDEN`, manager nu gestionează membru cu acces complet, vizibilitate proprietăți scoped; TEST 90e `ELEVATED_NOT_ALLOWED`. **251 PASS**.
