# RPC — Promotions & Commercial Rules (Sprint 4.8)

> Strat **comercial** de promoții, separat de motorul de preț (`rate_rules` / `app.compute_price`) și de restricții. O promoție = o reducere (procent sau sumă) cu **condiții** (`promotion_rules`, AND), **ferestre de valabilitate** (sejur + rezervare), **scope** (tip de cameră / toate) și **limită de utilizări**. Sursa unică de rezolvare e `app.resolve_promotion` — admin și public aplică identic.

## Model de date

```
promotions
  unit_type_id   NULL = toate tipurile; setat = un singur tip (scope, ca la closures)
  code           NULL = promoție AUTOMATĂ; setat = cod introdus de oaspete (unic/proprietate,
                 case-insensitive prin index pe upper(code))
  discount_type  'percent' | 'amount'      discount_value > 0 (percent ≤ 100)
  stay_start/stay_end  fereastra pe data de CHECK-IN (NULL = oricând)
  book_start/book_end  fereastra pe data REZERVĂRII (NULL = oricând)
  max_uses       limită utilizări (NULL = nelimitat)    uses_count  consum curent
  is_active      promoția poate fi oprită fără ștergere

promotion_rules (condiții AND, per promoție)
  rule_type  'min_nights'        → stay discount / long stay (ex. 7+, 30+ nopți)
             'min_advance_days'  → early booking (sosire la ≥ N zile de la rezervare)
             'max_advance_hours' → last minute (sosire în ≤ N ore)
  value      numeric — tabel generic: un tip nou de condiție = o ramură în resolver,
             fără schimbare de schemă

bookings.promotion_id + bookings.discount_amount   snapshot imuabil (ca prețul)
```

**Reguli de business** (ca în Cloudbeds/Mews):
- **o singură promoție per rezervare, NON-stacking** — reducerile nu se cumulează (standardul OTA/PMS; cumularea ar fi un flag „combinable" viitor);
- **best-of** (migrația `20260616140000`): dintre codul introdus ȘI promoțiile automate eligibile se aplică **cea mai mare reducere** — un cod nu poate da niciodată un rezultat mai prost decât oferta automată. `resolve_promotion` întoarce și `code_matched` (codul a corespuns unei promoții eligibile, chiar dacă a fost depășit) → UI-ul afișează „cod invalid" corect;
- **snapshot imuabil**: schimbarea/ștergerea ulterioară a promoției nu afectează rezervările existente;
- **limita** verificată **atomic** la creare (UPDATE condiționat `uses_count < max_uses`), anti-oversell sub concurență;
- discountul nu poate fi negativ și e plafonat la subtotal (total ≥ 0).

**Notă roluri** (feature viitor): CUD pe `promotions`/`promotion_rules` = owner/manager (`is_org_role`), citire = `can_access_property`. Compatibil cu un sistem viitor de roluri — nu introduce cuplaje noi.

---

## `app.resolve_promotion(unit_type, check_in, check_out, subtotal, code, now) returns jsonb` (intern)

Întoarce cea mai bună promoție aplicabilă sau `{applied:false}`. **Nu** ridică excepții (folosit și pentru preview) și **nu** incrementează usage (se face la creare). Filtre: scope, ferestre stay/book, `uses_count < max_uses`, toate `promotion_rules` (AND). **Best-of**: candidate = promoțiile automate (`code IS NULL`) **+** codul introdus (dacă există); câștigă reducerea cea mai mare (non-stacking). Rezultatul include `code_matched` (codul a corespuns unei promoții eligibile).

| | |
|---|---|
| Migrație | `20260616120000` |
| Security | DEFINER, `stable` (`set search_path = ''`) |
| Grants | revocat de la `public/anon/authenticated` — apelat doar de funcții DEFINER |

## `quote_price(unit_type, check_in, check_out, p_promo_code default null)` — extins

`+ subtotal / discount / total (după reducere) / promotion` în jsonb. Reflectă codul aplicat sau cea mai bună promoție automată. DEFINER, `authenticated`.

## `public_preview_promo(slug, unit_type, check_in, check_out, code default null) returns jsonb`

Preview pentru pagina publică: `{currency, subtotal, discount, total, promotion}`. DEFINER, grant `anon` + `authenticated`. `PROPERTY_NOT_FOUND` / `UNIT_TYPE_NOT_FOUND` / `INVALID_DATES`.

## `app.create_booking_internal(...)` — actualizat (promoție în snapshot)

Semnătura din 4.7 + `p_promo_code text default null` (drop + recreate). După verificările soft: rezolvă promoția best-of (cod + automate), calculează `total = subtotal − discount`, scrie `promotion_id` + `discount_amount` + `price_breakdown.promotion`. La inserția reușită consumă o utilizare atomic. `PROMO_INVALID` doar dacă s-a introdus un cod și **nu se aplică nimic** (nici cod, nici automată) — dacă o automată acoperă, rezervarea reușește cu reducerea automată. `PROMO_LIMIT_REACHED` dacă limita s-a epuizat în cursă. Promoțiile **nu** se aplică pe rezervările-blocaj (`status='blocked'`).

## `create_booking` / `public_create_booking` — `+ p_promo_code`

Pasează codul la motor (drop + recreate, param nou). Public = aceleași reguli (auto + cod). Erori noi: `PROMO_INVALID`, `PROMO_LIMIT_REACHED`.

---

## Ferestre de valabilitate + istoric/editare (clarificări)

- **`stay_start`/`stay_end`** = promoția se aplică doar dacă **data de check-in** cade în interval. **NULL = orice check-in.**
- **`book_start`/`book_end`** = doar dacă **rezervarea e creată** în interval. **NULL = oricând.** Ambele goale ⇒ se aplică indiferent de dată.
- **Editare cu lock de identitate financiară** (model Mews „Locked Dependencies + Snapshot Ledger", migrația `20260616150000`): promoțiile sunt editabile, DAR odată ce o promoție a fost **folosită** (`uses_count > 0`), **codul + tipul + valoarea reducerii devin imutabile** — ranforțat pe BACKEND prin triggerul `app.guard_promotion_update` (`PROMOTION_LOCKED`), nu doar în UI. Rămân editabile operațional: perioadele, limita, scope-ul, condițiile, `is_active`. Motiv: rezervările referă promoția (`promotion_id`) și păstrează snapshot imuabil — rescrierea ofertei ar face referința să „mintă" față de ce a primit rezervarea. Înainte de prima folosire, totul e editabil.
- **Istoric / ștergere**: FK-ul `bookings.promotion_id` e **NO ACTION** → o promoție **folosită nu poate fi ștearsă** (DB blochează, cod `23503` → mesaj UI dedicat); se **dezactivează** în loc. Asta + **snapshot-ul** pe rezervare + `uses_count` + lock-ul financiar **sunt** istoricul „basic": promoția persistă ca înregistrare istorică, fiecare rezervare reține exact ce reducere a primit. Un activity-log complet (cine/când a modificat) e **TODO** opțional (același tipar amânat ca la `closures`/`stay_rules`).
- **Coliziune cod**: index unic `upper(code)`/proprietate → cod duplicat respins (`23505` → mesaj UI). E versiunea noastră a „Collision Blocker"-ului Mews.

## TODO — paritate Mews avansată (viitor)

- **Audit per noapte (blackout)**: Mews recalculează prețul zilnic la night audit — dacă o noapte din sejur cade pe o dată închisă, acea noapte se taxează la preț întreg. La noi promoția se aplică pe **tot sejurul** (cheiat pe check-in, ca restul motorului). Per-noapte ar fi o extindere a `compute_price`/`resolve_promotion`.
- **Channel Manager isolation**: tarifele private de promoție nu trebuie sincronizate către OTA (Booking/Expedia). Relevant **doar** când se adaugă un channel manager — momentan nu există.
- **Pagina dedicată**: UI-ul e azi un dialog (simplu); pe viitor se va scala la o pagină dedicată (workflow asemănător Mews: rate + voucher), păstrând aceleași contracte backend.

## Frontend

- `features/promotions/` — `api.ts`/`hooks.ts` (`Promotion`, `PromotionWithRules`, `RULE_TYPES`, CRUD + `updatePromotionWithRules` + `isPromotionInUseError`), `promotions-dialog.tsx` (creare/**editare** cu cod/automată + tip reducere + scope + ferestre + limită + listă de **condiții** dinamice; listă cu toggle activ/inactiv + editare + ștergere protejată). Valoarea reducerii, limita de utilizări și valorile condițiilor acceptă **doar numere naturale** (fără zecimale). Buton „Promoții" în header-ul proprietății. **Pagina rezervării** (`$bookingId`) afișează reducerea în breakdown (subtotal → reducere → total) din snapshot.
- **Estimarea de preț** (`PriceBreakdown`) afișează subtotal + reducere (cu codul/numele) + total final; `quote_price` primește codul. Formularul de rezervare (admin) și pagina publică au câmp **cod promoțional** cu „Aplică" + preview reducere (auto se reflectă fără cod).
- **Lista publică de disponibilitate** (`public_get_availability`, migrația `20260616130000`) întoarce reducerea **automată** per tip (`discount` + `promo_label`) → preț tăiat + preț nou direct în listă, fără request-uri suplimentare. Codurile rămân în dialog (`public_preview_promo`). Vezi [public-api.md](public-api.md).
- Erori mapate pe i18n: `bookings.promo_invalid`, `bookings.promo_limit`.

## Note de implementare (lecții)

- **Param nou cu default = overload** → DROP funcția veche întâi (create_booking_internal / create_booking / public_create_booking / quote_price), apoi recreează (altfel apel ambiguu).
- **anon nu citește `bookings`** — testele care verifică snapshot-ul după o rezervare publică folosesc un temp table populat sub `anon`, apoi citit după `reset role`.
- **Last minute (`max_advance_hours`)** folosește `now()`/`check_in::timestamp` (UTC) — aproximare de fus orar acceptabilă pentru MVP; se poate rafina la tz-ul proprietății ulterior.

**Teste** (`db_tests.sql`, TEST 62–73): cod percent + snapshot + usage, promoție automată (early booking), best-of (automata mai bună depășește codul — TEST 72), cod invalid/scope greșit (`PROMO_INVALID`), limită de utilizări, last minute, sumă fixă + clamp, flux public (preview + booking cu cod), `quote_price` cu cod, RLS (anon + izolare cross-tenant), **lock identitate financiară după folosire** (TEST 73: `PROMOTION_LOCKED` pe cod/valoare, operațional editabil, ștergere folosită blocată de FK).
