# RPC — Organizații

## `create_organization(p_name text, p_slug text) returns uuid`

**Scop**: onboarding — creează organizația **și** rândul de membru `owner` pentru userul curent, atomic. Există ca RPC pentru că tabelul `organizations` nu are politică de INSERT (un user fără org nu ar trece de nicio politică), iar cele două inserturi trebuie să fie o singură tranzacție.

| | |
|---|---|
| Migrație | `20260610110000_rls_and_rpc.sql` |
| Security | DEFINER (`set search_path = ''`) |
| Grants | `authenticated` ✅ · `anon`/PUBLIC ❌ |
| Autorizare | `auth.uid() is not null` → altfel `AUTH_REQUIRED` |
| Frontend | `web/src/features/organizations/api.ts` → `createOrganization()`, folosit în `routes/onboarding.tsx` |

**Flux**: insert `organizations` → insert `organization_members (user, 'owner')` → returnează `org_id`.

**Erori**: `AUTH_REQUIRED`; duplicat de slug → `unique_violation` (23505) din constraint-ul `organizations.slug unique`.

**Note**: orice user autentificat poate crea oricâte organizații (self-service, by design). Slug-ul nu e validat ca format la nivel DB — doar în frontend.
