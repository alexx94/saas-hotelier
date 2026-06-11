# Modelul de securitate

> Cum se decide cine poate citi/scrie ce, și auditul de securitate al RPC-urilor (2026-06-11).

## Straturile de apărare

1. **Grants (privilegii SQL)** — prima poartă: rolul API (`anon` / `authenticated`) trebuie să aibă `SELECT/INSERT/...` pe tabel sau `EXECUTE` pe funcție. `anon` are SELECT **doar pe coloanele safe** din `properties` și `unit_types` — nimic altceva.
2. **RLS (Row Level Security)** — pe fiecare tabel; filtrează *care rânduri* sunt vizibile/modificabile. Detalii: [rls-policies.md](rls-policies.md).
3. **Validări în RPC + triggers** — reguli de business (tranziții status, anti-double-booking, unicitate guests) care nu pot fi exprimate prin RLS.

## SECURITY DEFINER vs INVOKER

| | INVOKER (implicit) | DEFINER |
|---|---|---|
| Rulează ca | userul apelant | proprietarul funcției (`postgres`) |
| RLS | se aplică normal | **ocolit complet** |
| Când îl folosim | funcția doar compune operații pe care userul le-ar putea face oricum (ex. `generate_units`) | operația atinge rânduri pe care userul NU le poate vedea (ex. disponibilitate publică citește `bookings`) sau trebuie să fie atomică peste mai multe tabele |
| Obligatoriu la DEFINER | — | `set search_path = ''` + nume calificate + **verificare explicită de autorizare în prima parte a funcției** |

Regula de aur: **o funcție DEFINER este un endpoint public** — tot ce nu verifică ea explicit, nu verifică nimeni.

Autorizarea explicită folosită în RPC-urile definer:
- `app.can_access_property(property_id)` — membru al org-ului + restricții per-proprietate ([helpers.md](helpers.md))
- `p_org_id in (select app.user_org_ids())` — apartenență la organizație
- pentru API-ul anonim: funcția operează **doar** pe proprietăți `is_published` și forțează valorile sensibile (`status='pending'`, `source='public'`)

## Capcana: grant-ul implicit PUBLIC

Postgres acordă implicit `EXECUTE` rolului **PUBLIC** (= oricine, inclusiv `anon`) pe orice funcție nou creată. `revoke ... from anon` **nu e suficient** — grant-ul PUBLIC rămâne și anon execută prin el. Corect:

```sql
revoke execute on function public.f(...) from public, anon;
grant  execute on function public.f(...) to authenticated;
```

Verificare: în inventarul din [README.md](README.md#inventarul-funcțiilor-cine-ce-poate-apela), `=X` în ACL = PUBLIC are execute. Trebuie să apară **doar** pe `public_get_availability` și `public_create_booking`.

---

# Audit de securitate — 2026-06-11

Audit complet al tuturor RPC-urilor și politicilor RLS. Toate problemele găsite au fost **remediate în migrația 7** (`20260611170000_guest_uniqueness_and_security_hardening.sql`) și acoperite cu teste în `supabase/tests/db_tests.sql` (testele 14–18).

## 🔴 Critic — remediat

### A1. `find_or_create_guest`: scriere + probing cross-tenant, accesibilă și pentru anon

- **Problema**: funcția era SECURITY DEFINER (bypass RLS), primea `p_org_id` ca parametru și **nu verifica** dacă apelantul e membru al acelei organizații. În plus, grant-ul implicit PUBLIC nu fusese revocat, deci **și anon** o putea executa.
- **Impact**: orice vizitator (fără cont!) putea: (1) insera oaspeți în **orice** organizație; (2) afla dacă un email/telefon există în baza de date a oricărui hotel (răspunsul `matched_by` confirma existența) — enumerare de date personale.
- **Fix**: split în două:
  - `app.find_or_create_guest_internal` — logica, fără autorizare, **revocată de la toate rolurile API**; apelabilă doar din alte funcții definer (`public_create_booking` o folosește pentru fluxul anonim).
  - `public.find_or_create_guest` — wrapper expus, verifică `p_org_id in (select app.user_org_ids())` → altfel `FORBIDDEN`; `revoke from public, anon`.
- **Teste**: 15 (cross-org → FORBIDDEN), 16 (anon → insufficient_privilege).

## 🟠 Mediu — remediat

### A2. `create_booking` accepta `guest_id` din altă organizație
- **Problema**: nu valida că `p_guest_id` aparține org-ului proprietății → un user putea lega rezervările lui de oaspeții altei organizații (poluare de date cross-tenant; nu expunea date, RLS pe `guests` ascundea numele).
- **Fix**: guard `GUEST_NOT_FOUND` dacă guest-ul nu există în org-ul tipului de cameră. **Test**: 18.

### A3. Escaladare de privilegii: `manager` → `owner`
- **Problema**: politicile RLS pe `organization_members` cereau doar ca apelantul să fie `owner` sau `manager`, fără să se uite la **rolul rândului scris** → un manager putea insera/promova un `owner` (inclusiv pe sine) sau șterge owner-ul.
- **Fix**: politici rescrise — doar un owner poate acorda rolul `owner`; managerii nu pot modifica/șterge rândurile owner-ilor. **Teste**: 17a/b/c.
- **Notă**: UI-ul de invitare membri nu există încă; politicile sunt pregătite pentru el.

### A4. Grant rezidual PUBLIC pe `get_available_units`
- **Problema**: revocată doar de la `anon`, nu și de la PUBLIC (vezi capcana de mai sus). Fiind SECURITY INVOKER, anon primea 0 rânduri prin RLS — **fără scurgere de date**, dar contrar intenției "anon nu atinge bookings".
- **Fix**: `revoke ... from public`.

## 🟡 Minor — remediat

### A5. `search_path` lipsă în `app.check_unit_status_change` și `generate_units`
- Aceeași clasă de bug corectată în migrația 6 pentru `validate_booking_update`: funcții care citesc tabele cu nume necalificate eșuează când sunt declanșate dintr-un context definer cu `search_path=''`. Ambele au primit `set search_path = ''` + nume calificate.

## Limitări cunoscute (acceptate deocamdată, de urmărit)

| Risc | Stare |
|---|---|
| `public_create_booking` nu are rate limiting — un bot poate crea rezervări `pending` în masă și, prin dedupe, poate proba emailuri **în interiorul aceleiași proprietăți publicate** | Acceptat în MVP. Mitigări viitoare: captcha pe pagina publică, rate limit pe edge function, sau mutarea creării publice într-un edge function cu verificare. |
| Nu există protecție "ultimul owner" — un owner se poate șterge singur lăsând org-ul fără owner | De adăugat când apare UI-ul multi-user (trigger sau check în RPC de management membri). |
| `create_organization` permite oricărui user autentificat să creeze oricâte organizații | By design (onboarding self-service). |
| Emailul oaspetelui nu e validat ca format la nivel DB | Validare doar în frontend (Zod). Acceptabil — DB garantează doar unicitate/normalizare. |

## Ce a fost verificat și e în regulă

- Toate RPC-urile definer de admin (`create_booking`, `update_booking_dates`, `reassign_booking`) verifică `app.can_access_property` înainte de orice scriere; `reassign_booking` verifică suplimentar că noua cameră e pe aceeași proprietate.
- `app.create_booking_internal` (fără verificări proprii) este revocată de la toate rolurile API — inaccesibilă direct.
- API-ul anonim operează exclusiv pe proprietăți `is_published`, forțează `status='pending'`/`source='public'` și nu returnează date despre alți oaspeți.
- Izolarea cross-tenant pe toate tabelele (RLS) — testele 7–9.
- `booking_events` se scrie exclusiv prin trigger; SELECT doar pentru membrii cu acces pe proprietate.
- Anti-double-booking: constraint `EXCLUDE` la nivel DB, re-verificat și la revert de status / schimbare date — testele 1–4.
