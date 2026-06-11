# RPC — Oaspeți

> Unicitatea oaspeților este garantată la nivel DB (migrația 7): indexuri unice parțiale pe `(org_id, email)` și `(org_id, telefon normalizat)`, cu normalizare automată prin trigger ([../triggers.md](../triggers.md)). Aceste RPC-uri sunt calea recomandată de creare — fac dedupe în loc să pice pe constraint.

## `find_or_create_guest(p_org_id uuid, p_full_name text, p_email text, p_phone text) returns jsonb`

**Scop**: anti-duplicare la crearea inline a oaspeților (combobox-ul din formularul de rezervare): caută după email (prioritar) apoi telefon; creează doar dacă nu există. Returnează `{guest_id, matched_by: 'email'|'phone'|null}` — frontend-ul afișează "oaspete existent găsit după ...".

| | |
|---|---|
| Migrații | `20260611120000` → **rescrisă din motive de securitate** în `20260611170000` |
| Security | DEFINER (`set search_path = ''`) — wrapper subțire |
| Grants | `authenticated` ✅ · `anon`/PUBLIC ❌ |
| Autorizare | `p_org_id in (select app.user_org_ids())` → altfel `FORBIDDEN` |
| Frontend | `web/src/features/guests/api.ts` → `findOrCreateGuest()`, hook `useFindOrCreateGuest`, folosit în `guest-combobox.tsx` |

**Erori**: `FORBIDDEN`, `GUEST_NAME_REQUIRED`, `GUEST_CONFLICT` (teoretic, doar la race repetat).

> ⚠️ **Istoric de securitate**: până la migrația 7 funcția nu verifica apartenența la organizație și era executabilă inclusiv de anon — permitea inserare și probing de emailuri cross-tenant. Detalii: [../security-model.md](../security-model.md#a1-find_or_create_guest-scriere--probing-cross-tenant-accesibilă-și-pentru-anon). Testele 15–16 din `db_tests.sql` păzesc regresia.

## `app.find_or_create_guest_internal(..., p_trusted boolean)` — internă

Aceeași logică, **fără verificarea de org** — de aceea e în schema `app` și revocată de la toate rolurile API. Există pentru fluxul anonim: `public_create_booking` rulează ca `anon` (care nu e membru al niciunui org) dar trebuie să facă dedupe în org-ul proprietății publicate.

**Model profil vs snapshot (migrația 8)**: `guests` = profilul *viu* al persoanei (se actualizează); fiecare rezervare păstrează pe `bookings.booked_full_name/email/phone` un **snapshot** cu datele din momentul rezervării — modificarea profilului nu atinge rezervările trecute.

**Matching pe niveluri de încredere** (`p_trusted`):

| | `trusted=true` (staff) | `trusted=false` (pagina publică, anon) |
|---|---|---|
| Match | email, apoi telefon normalizat | **doar email exact** (telefonul poate fi fictiv — nu atașăm la profilul altcuiva) |
| Profil la match | **se actualizează** cu datele noi (nume/telefon; emailul se completează doar dacă lipsea) | **nu se modifică niciodată** — datele tastate rămân doar în snapshot |
| Telefon care există la alt profil | update-ul de profil se sare (unique_violation prinsă) | insertul reîncearcă fără telefon |

La `unique_violation` pe insert (race cu o cerere concurentă) → reia căutarea o dată; altfel `GUEST_CONFLICT`.

**Apelanți**: `public.find_or_create_guest` (wrapper cu autorizare, `trusted=true`), `public.public_create_booking` (`trusted=false`).

## `get_guest_stats(p_guest_id uuid) returns table(total, upcoming, cancelled bigint)`

**Scop**: totalurile afișate pe profilul oaspetelui, agregate în DB (nu pe client, ca să nu depindă de lista paginată). `upcoming` = `check_in >= current_date` și status diferit de `cancelled`/`no_show`; `cancelled` = status `cancelled`.

| | |
|---|---|
| Migrații | `20260611200000` |
| Security | **INVOKER** — RLS pe `bookings` limitează rândurile la org-urile userului; un `guest_id` străin întoarce 0/0/0 |
| Grants | `authenticated` ✅ · `anon`/PUBLIC ❌ |
| Frontend | `web/src/features/guests/api.ts` → `fetchGuestStats()`, hook `useGuestStats`, folosit în `routes/_app/app/guests/$guestId.tsx` |

## Inserarea directă (fără RPC)

`createGuest()` din `features/guests/api.ts` (pagina Oaspeți) inserează direct în tabel, sub RLS. Constraint-ul unic respinge duplicatele cu `23505`; UI-ul mapează pe `t("guests.duplicate")`. E intenționat ca pagina de oaspeți să **nu** facă dedupe silențios — operatorul trebuie să afle că oaspetele există deja.

## Căutarea oaspeților (fără RPC)

`fetchGuests()` caută server-side (`or` + `ilike`) pe nume, email, telefon **și** `guests.phone_search` — coloană **generată** (migrația 11, `20260611210000`) cu doar cifrele telefonului (`app.normalize_phone`), ca să găsească numărul indiferent de formatul în care a fost salvat sau tastat. Lista e paginată offset (`range`), 20/pagină.
