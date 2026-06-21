# RPC — Member Management, Custom Roles & Profiles (Sprint 6.3)

> Partea vizibilă a RBAC: identitate (`profiles`), management de membri (adăugare cont existent, roluri multiple, acces per-proprietate, transfer ownership) și editor de roluri custom. Model de date + context: [rbac.md](../rbac.md). Migrația: `20260618150000_member_management.sql`.

## Separarea actorilor (de ce nu se suprapun staff și guest)

`add_member` operează **exclusiv pe lane-ul staff** (`organization_members`). Caută identitatea (contul `auth.users`) după email și creează o apartenență. **Nu citește/scrie niciodată `guests`.** O persoană poate fi guest la altă organizație (rând `guests` în org-ul ăluia, invizibil prin RLS) și staff aici, fără coliziune — același login, lane-uri ortogonale. Vezi [rbac.md §1](../rbac.md).

## profiles

`profiles(user_id pk → auth.users, full_name, avatar_url, created_at, updated_at)` — identitate partajată. Trigger `on_auth_user_created` (AFTER INSERT pe `auth.users`) creează profilul la signup (`full_name` din `raw_user_meta_data`). RLS: SELECT pe profilul propriu **sau** al unui coleg de org (`app.shares_org`); UPDATE doar pe al propriu.

## RPC-uri (toate DEFINER, `set search_path=''`, `revoke from anon, public`)

| RPC | Permisiune | Scop |
|---|---|---|
| `add_member(org, email, role_ids[], property_ids[] default null)` | `user.manage` | atașează un cont existent (după email) + roluri + **acces proprietăți cerut din start** |
| `set_member_roles(member_id, role_ids[])` | `user.manage` | înlocuiește complet rolurile membrului (union de permisiuni) |
| `set_member_property_access(member_id, property_ids[])` | `user.manage` | înlocuiește accesul (gol = toate proprietățile) |
| `remove_member(member_id)` | `user.manage` | elimină membru (cascade roluri/acces) |
| `transfer_ownership(org, new_user_id)` | **owner structural** | mută `owner_user_id` + acordă Administrator noului owner |
| `create_role(org, name, permission_keys[])` | `role.manage` | rol custom + permisiuni |
| `update_role(role_id, name, permission_keys[])` | `role.manage` | redenumire + înlocuire permisiuni |
| `delete_role(role_id)` | `role.manage` | șterge rol custom (cascade `member_roles`) |
| `get_org_members(org)` | membru al org-ului | listă membri (email/nume/roluri/acces/`is_owner`) pentru UI |

**Frontend**: `features/members/` (`useMembers`/`useAddMember`/`useSetMemberRoles`/`useSetMemberAccess`/`useRemoveMember`/`useTransferOwnership`) + `features/roles/` (`useRoles`/`usePermissionCatalog`/`useCreateRole`/`useUpdateRole`/`useDeleteRole`), randate în `settings-dialog` (`#settings/members`, `#settings/roles`, gate pe `user.manage`/`role.manage`). Profil: `features/auth/profile.ts`.

## Gărzi anti-escaladare (Sprint 6.3.1 — `20260618160000`)

Două găuri reparate, cu helper `app.user_covers_roles(org, role_ids[])` (true dacă deții TOATE permisiunile rolurilor date; owner-ul le deține pe toate prin bypass):

1. **Regula subset** — poți acorda doar roluri ale căror permisiuni le deții și tu. Un `manager` (fără `role.manage`/`organization.billing`) NU mai poate acorda **Administrator** → `INSUFFICIENT_GRANT`. Aplicată în `add_member` + `set_member_roles`. UI: dialogul de adăugare arată doar rolurile acordabile (`useGrantableRole`).
2. **Fără self-modificare** — nu îți poți schimba propriile roluri (`CANNOT_EDIT_SELF` în `set_member_roles`) și nu te poți auto-elimina (`CANNOT_REMOVE_SELF` în `remove_member`). UI: pentru tine însuți, rolurile sunt read-only și butoanele remove/transfer ascunse.

## Acces la proprietăți la invitare (`20260620130000`)

`add_member` acceptă acum `p_property_ids` — accesul cerut **din start**, nu dedus implicit. Semantică (oglindită în UI, dialogul „Adaugă membru"):

| `p_property_ids` | Efect |
|---|---|
| `NULL` (3 argumente, legacy) | invitator restrâns → noul membru **moștenește** scope-ul lui; invitator nerestrâns → acces complet (fără rânduri `mpa`) |
| `[]` (listă goală) | „toate" = acces complet — permis **doar** dacă invitatorul nu e restrâns, altfel `PROPERTY_FORBIDDEN` |
| `[propA, …]` | exact acel subset; fiecare proprietate trebuie să fie a org-ului (`PROPERTY_ORG_MISMATCH`) **și accesibilă invitatorului** (`PROPERTY_FORBIDDEN`) |

Aceleași gărzi ca `set_member_property_access` → **nu poți „hardcoda" (apel direct RPC) acces la o proprietate la care nici tu nu ai acces**, indiferent de UI. `app.can_access_property(pid)` e sursa unică (owner/admin = toate; restrâns = doar `mpa`-ul lui).

> **De ce `fetchMyOrganizations` filtra pe `user_id`**: politica RLS `members_select` pe `organization_members` e `org_id in (app.user_org_ids())` — adică vezi **toți** membrii organizațiilor tale (necesar pentru ecranul de echipă/`get_org_members`). E corect și intenționat. Dar un `select` nefiltrat din acel tabel întoarce **un rând per membru** → organizații duplicate în selector. Frontend-ul filtrează pe propriul `user_id` (RLS rămâne sursa de adevăr; nu e o gaură de securitate, doar o interogare de client care trebuie să ceară strict propriile apartenențe).

## Tabel de erori (coduri-mașină → i18n `error.<COD>`)

| Cod | Când | RPC |
|---|---|---|
| `FORBIDDEN` | fără permisiunea cerută / non-owner la transfer | toate |
| `USER_NOT_FOUND` | niciun cont cu acel email | `add_member` |
| `ALREADY_MEMBER` | userul e deja membru al org-ului | `add_member` |
| `INSUFFICIENT_GRANT` | acorzi un rol cu permisiuni pe care nu le ai | `add_member`/`set_member_roles` |
| `CANNOT_EDIT_SELF` | îți editezi propriile roluri | `set_member_roles` |
| `CANNOT_REMOVE_SELF` | te auto-elimini | `remove_member` |
| `ROLE_ORG_MISMATCH` | rol custom din altă org în listă (guard `check_member_role_org`) | `add_member`/`set_member_roles` |
| `PROPERTY_ORG_MISMATCH` | proprietate din altă org în listă | `add_member`/`set_member_property_access` |
| `PROPERTY_FORBIDDEN` | acorzi acces la o proprietate pe care n-o ai, sau „toate" fiind tu restrâns | `add_member`/`set_member_property_access` |
| `MEMBER_NOT_FOUND` | member_id inexistent | `set_*`/`remove_member` |
| `CANNOT_REMOVE_OWNER` | încercare de a elimina owner-ul structural | `remove_member` |
| `NOT_A_MEMBER` | ținta transferului nu e membru | `transfer_ownership` |
| `ALREADY_OWNER` | transfer către sine | `transfer_ownership` |
| `ROLE_IS_SYSTEM` | editare/ștergere rol de sistem | `update_role`/`delete_role` |
| `ROLE_EXISTS` | slug duplicat în org | `create_role` |
| `NAME_REQUIRED` | nume gol | `create_role`/`update_role` |
| (FK) `foreign_key_violation` | cheie de permisiune inexistentă | `create_role`/`update_role` |

## Note de securitate
- Scrierile pe `member_roles`/`roles`/`role_permissions`/`member_property_access` trec **exclusiv** prin aceste RPC-uri DEFINER (tabelele au RLS doar pe SELECT). Clientul nu poate insera direct (`42501`).
- `owner_user_id` rămâne nullable în 6.3 (NOT NULL ar rupe fixturile; `create_organization` îl setează la onboarding). `remove_member` + `transfer_ownership` mențin invariantul „exact un owner".
- Triggerul seeder enum→`member_roles` rămâne (seed la insert); UI-ul gestionează `member_roles` direct și nu atinge enum-ul → fără conflict.

## Teste
`db_tests.sql` TEST 85–91: profiles (trigger + RLS), add_member (toate erorile + normalizare email + lane `guests` neatins), set_member_roles/access (înlocuire + scoping + cross-org), remove_member (owner protejat + cascade), transfer_ownership (doar owner, non-membru, bypass nou owner), roluri custom (system protejat, FK permisiuni, slug duplicat, role.manage), get_org_members. TEST 92: anti-escaladare (manager→Administrator `INSUFFICIENT_GRANT`, manager→Reception subset OK, self `CANNOT_EDIT_SELF`/`CANNOT_REMOVE_SELF`). TEST 95–96: acces proprietăți la invitare/editare (moștenire scope, „toate" blocat pt. restrâns, apel RPC direct blocat). **TEST 97**: `add_member` cu selecție explicită — subset valid (`97a`/`97d`), „toate" de la actor nerestrâns = complet (`97b`), proprietate din altă org `PROPERTY_ORG_MISMATCH` (`97c`), hardcode proprietate inaccesibilă + „toate" de la actor restrâns `PROPERTY_FORBIDDEN` (`97e`/`97f`).
