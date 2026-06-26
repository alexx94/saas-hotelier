# RPC — Manual Price Override (Sprint 9)

> Permite rolurilor privilegiate (administrator/manager + owner bypass) să modifice manual prețul unei rezervări create din panou — la **creare** și la **editare**. Distinct de motorul de preț (sezoane/override-uri tarifare, Sprint 4.5) și de promoții (Sprint 4.8): e o decizie umană pe o rezervare anume. **Override-ul manual înlocuiește promoția** (`promotion_id=null`, `discount_amount=0`).

## Cele 3 moduri

| Mod | `price_override_kind` | `price_override_value` | Semnificație |
|---|---|---|---|
| Total absolut | `total` | totalul final | „Șederea costă X" (ex. sync Booking.com). Distribuit proporțional pe nopți. |
| Ajustare | `adjustment` | delta cu semn (− reducere / + adaos) | `total_calculat + delta`. Distribuit proporțional. |
| Per noapte | `per_night` | NULL | Tarif editat manual pentru fiecare noapte (breakdown-ul cară valorile). |

În toate cazurile **stocarea e identică**: `total_amount` + `price_breakdown` (nopți recalculate, marcate `manual:true`) + metadata (`price_override_*`). Diferă doar inputul.

## Coloane noi pe `bookings`

| Coloană | Definiție |
|---|---|
| `price_override_kind` | `total` / `adjustment` / `per_night` (null = fără override) |
| `price_override_value` | total absolut sau delta cu semn; NULL la `per_night` |
| `price_override_by` | `uuid` (FK `auth.users`) — cine a setat override-ul (`auth.uid()`) |
| `price_override_at` | momentul setării |
| `price_override_note` | notă opțională (ex. „tarif Booking.com") |

## `app.apply_price_override(p_base, p_kind, p_value, p_nights) returns jsonb`

Helper **pur** (`immutable`, fără acces la tabele) — sursă unică de adevăr pentru matematica override-ului, refolosit de `quote_price` (preview), `create_booking` și `override_booking_price`. Primește output-ul `compute_price` și întoarce un quote ajustat (nopți recalculate + total + marcaj `override`), **fără** promoție.

- **total/adjustment**: distribuie targetul proporțional cu tarifele de bază (split egal dacă baza = 0); reziduul de rotunjire merge pe ultima noapte ca suma per-noapte == target exact.
- **per_night**: tariful fiecărei nopți din `p_nights` (potrivit pe `date`); total = suma.
- Erori: `PRICE_OVERRIDE_NEGATIVE` (target < 0), `PRICE_OVERRIDE_NIGHT_MISSING`, `PRICE_OVERRIDE_NO_NIGHTS`, `PRICE_OVERRIDE_VALUE_REQUIRED`.

**Oglindă pe frontend**: `web/src/features/pricing/price-override.ts` → `applyPriceOverridePreview()` reproduce identic algoritmul pentru preview instant (per-noapte fără round-trip). Serverul recalculează autoritar la salvare — orice schimbare de algoritm se face în **ambele** locuri (ca `status-rules.ts` ↔ trigger).

## RPC-uri

### `create_booking(..., p_price_override_kind, p_price_override_value, p_price_override_nights, p_price_override_note)`
Params noi opționali. Dacă e cerut un override (și statusul ≠ `blocked`), gate pe `booking.price_override` → `PRICE_OVERRIDE_FORBIDDEN`. Aplică `apply_price_override` peste `compute_price`, trece totalul/breakdown-ul + metadata la `create_booking_internal`, care **sare peste promoție** când override-ul e activ.

### `override_booking_price(p_booking_id, p_kind, p_value, p_nights, p_note)`
Editare pe rezervare existentă. Gate `booking.price_override`. `p_kind=null` → **curăță** override-ul (revine la prețul motorului, fără promo). Recalculează din `compute_price` pe datele rezervării. Eliberează promoția veche dacă exista (`uses_count − 1`). Blocat pe `cancelled`/`blocked` (`BOOKING_NOT_EDITABLE`).

| | |
|---|---|
| Migrație | `20260626120000` |
| Security | DEFINER, `set search_path = ''`; gate explicit pe `booking.price_override` |
| Grants | `authenticated` ✅ · `anon`/PUBLIC ❌ |
| Frontend | `features/bookings/api.ts` (`createBooking` extins, `overrideBookingPrice`), hook `useOverrideBookingPrice`; UI `features/pricing/price-override-editor.tsx` (creare) + `features/bookings/price-override-dialog.tsx` (editare), gated pe `usePermissions().has('booking.price_override')` |

## RBAC

Permisiune nouă `booking.price_override` (catalog Sprint 6.1), acordată rolurilor de sistem **administrator** + **manager**; owner-ul structural o bypass-ează. Reception/finance/readonly NU o au → nu văd controalele (UI) și RPC-ul respinge (`PRICE_OVERRIDE_FORBIDDEN`/`FORBIDDEN`).

**Teste**: `db_tests.sql` TEST 108–109 (creare cu total override + gate negativ reception, regresie fără override, editare adjustment/per_night, clear → revenire la calculat, gate editare). **315 PASS**.

## Scalabilitate & contract de ștergere

- **Promoțiile rămân neatinse** ca strat — override-ul doar le ignoră/eliberează per rezervare.
- `apply_price_override` e helper pur, refolosibil; un mod nou de override = o ramură în el + un buton în editor, fără schimbare de schemă (stocarea e generică).
- De șters la eliminare completă: coloanele `price_override_*` + funcțiile/params din migrația `20260626120000`, `features/pricing/price-override*.{ts,tsx}`, `features/bookings/price-override-dialog.tsx`, integrările din `booking-form-dialog.tsx` + ruta `bookings/$bookingId.tsx`, cheile i18n `pricing.override.*`/`pricing.manual_override`/`bookings.price_override_*`, permisiunea `booking.price_override`, TEST 108–109.
