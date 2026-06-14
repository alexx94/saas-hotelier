# RPC — Pricing Engine & Occupancy (Sprint 4.5)

> Preț dinamic per noapte (sezoane, override-uri, suprataxă weekend) cu **snapshot imuabil la creare**. Sursa unică de adevăr e **o singură funcție SQL** (`app.compute_price`) folosită identic de estimare (UI), creare rezervare (admin + public) și disponibilitate publică — frontend-ul nu recalculează niciodată. Occupancy pricing NU e inclus (prețul nu depinde de nr. persoane); `base_capacity/max_adults/max_children` sunt doar constrângeri de capacitate, schema rămâne pregătită pentru ocupare în viitor.

## Model de date

```
unit_types.max_adults / max_children   ← capacitate (înlocuiesc 'capacity'; base_capacity eliminat, mig. 26)
unit_types.weekend_adjustment_type   none | percent | amount
unit_types.weekend_adjustment_value  numeric (≥ 0)
unit_types.weekend_days              int2[] DOW Postgres (0=Du … 6=Sâ), default {5,6} = Vi+Sâ

rate_rules (sezoane + override-uri, un singur tabel)
  kind        season | override        (override are prioritate peste season)
  start_date / end_date  interval INCLUSIV (acoperă nopțile cu data în [start,end])
  price       numeric/noapte
  updated_at  timestamptz (clock_timestamp) — la suprapunere în același kind câștigă
              cea mai RECENT modificată regulă (fără prioritate numerică)

bookings.adults / children           ← ocupare; guests_count e GENERATED (= adults + children)
bookings.total_amount / unit_price   ← snapshot (total + media/noapte) la creare
bookings.price_breakdown jsonb       ← detaliul per-noapte la creare (NU se recalculează)
```

**Rezolvarea prețului per noapte** (în `app.compute_price`): `override > season > base_price`
(`order by (kind='override') desc, updated_at desc`). Ajustarea de weekend are **prioritate minimă**:
se aplică DOAR pe nopțile rămase pe prețul de bază (nu peste sezon/override — acelea sunt prețuri
explicite, dorite ca atare). `percent` → `rate×(1+val/100)`; `amount` → `rate+val`.

`updated_at` folosește `clock_timestamp()` (nu `now()`) ca recența să fie deterministă chiar
și pentru modificări în aceeași tranzacție.

RLS `rate_rules`: select = `can_access_property`; CUD = owner/manager. **Fără grant anon** —
publicul primește prețuri doar prin RPC (DEFINER bypass RLS).

**Frontend**: sezoanele se gestionează per tip (dialog „Tarife sezoniere" din pagina proprietății);
**override-urile** („tarif preferențial") se adaugă din **calendar** (`OverrideDialog`), se aplică
automat tuturor camerelor tipului ales. Calendarul pictează în celulele goale tariful rezolvat
per zi (`get_rate_calendar`), colorat după sursă (base/sezon/override). Ambele liste sunt paginate
(„Afișează mai mult", 15/pagină). **Validare date trecute**: doar în UI (input `min=azi` + guard
`end ≥ azi`) — NU trigger/constraint (eficient, iar o regulă trecută e oricum inofensivă: motorul
o aplică doar pe intervalul rezervării, mereu în viitor). Ocuparea în formulare = steppere +/-,
plafon 25.

---

## `app.compute_price(p_unit_type_id, p_check_in, p_check_out) returns jsonb` (intern)

Motorul. Iterează nopțile (`generate_series`), rezolvă rata + weekend, întoarce
`{ currency, nights[], subtotal, total, avg_nightly, night_count }` unde fiecare element din
`nights` = `{date, kind, base, rate, weekend}`.

| | |
|---|---|
| Migrație | `20260613140000` |
| Security | DEFINER, `stable` (`set search_path = ''`) |
| Grants | revocat de la `public/anon/authenticated` — apelat doar de funcții DEFINER |

## `quote_price(p_unit_type_id, p_check_in, p_check_out) returns jsonb`

**Scop**: estimare pentru UI (dialog rezervare). Wrapper autorizat peste `compute_price`.

| | |
|---|---|
| Security | DEFINER, `stable` |
| Grants | `authenticated` ✅ · `anon`/PUBLIC ❌ |
| Autorizare | `can_access_property(unit_type.property_id)` → `FORBIDDEN` |
| Erori | `UNIT_TYPE_NOT_FOUND`, `FORBIDDEN`, `INVALID_DATES` |
| Frontend | `features/pricing/api.ts` → `quotePrice()`, hook `useQuotePrice`, folosit în `booking-form-dialog.tsx` + `price-breakdown.tsx` |

## `get_rate_calendar(p_property_id, p_from, p_to) returns table(unit_type_id, day, rate, kind)`

**Scop**: tariful rezolvat per **tip × zi** pentru o proprietate, pe un interval (luna din calendar).
Un rând per (tip activ, noapte) cu rata finală (`compute_price` per tip, despachetat cu `jsonb_array_elements`).

| | |
|---|---|
| Migrație | `20260613150000` |
| Security | DEFINER, `stable` |
| Grants | `authenticated` ✅ · `anon`/PUBLIC ❌ |
| Autorizare | `can_access_property(p_property_id)` → `FORBIDDEN` |
| Frontend | `features/pricing/api.ts` → `fetchRateCalendar()`, hook `useRateCalendar`, folosit în `calendar.tsx` (tarif/celulă) |

## `create_booking(...)` — actualizat

Semnătură nouă: `(p_unit_type_id, p_check_in, p_check_out, p_guest_id, p_unit_id, p_adults=1, p_children=0, p_status, p_notes)`.
Drop `p_guests_count` și `p_total` — prețul (total + breakdown + unit_price) e calculat **server-side**
din `compute_price` și snapshot-uit; clientul nu mai trimite total. Validare ocupare în
`app.create_booking_internal`: `adults>0`, `adults≤max_adults`, `children≤max_children` →
`OCCUPANCY_EXCEEDED` (înlocuiește `CAPACITY_EXCEEDED`).

## `public_get_availability(p_slug, p_check_in, p_check_out, p_adults=1, p_children=0)` — actualizat

Filtrează tipurile cu `max_adults≥p_adults and max_children≥p_children`; `price_per_night`/`total_price`
vin din `compute_price` (avg_nightly / total). Returnează `max_adults, max_children`
(drop `capacity`/`base_capacity`). DEFINER, grant `anon`+`authenticated`.

## `public_create_booking(...)` — actualizat

`+ p_adults, p_children`; preț din `compute_price` (snapshot). Aceeași validare ocupare.

---

**Imuabilitate**: după creare, modificarea `base_price`/regulilor NU schimbă rezervarea
(test TEST 39 în `db_tests.sql`). Testele 33–44 acoperă occupancy, fallback base, seasonal,
override > season, recență (cea mai recentă modificare câștigă), weekend (percent/amount, doar pe base — nu peste sezon),
snapshot imuabil, filtru ocupare public, RLS `rate_rules`, autorizare `quote_price`, `get_rate_calendar`.
