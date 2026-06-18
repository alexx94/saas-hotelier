# TanStack Query — Convenții & Inventar chei de cache

> Document de referință pentru toate cheile de cache TanStack Query v5 din aplicație. Orice cheie nouă se adaugă aici; orice default comportamental important e notat explicit — ca să nu existe „știut de toată lumea" care n-a fost niciodată scris.

---

## Defaults globale (neschimbate față de TanStack v5)

Nicio configurare globală custom în `QueryClient` — se folosesc default-urile bibliotecii:

| Setting | Valoare default | Ce înseamnă în practică |
|---|---|---|
| `staleTime` | `0` | Orice query e imediat „stale" după fetch. |
| `refetchOnWindowFocus` | `true` | La fiecare revenire pe tab/fereastră, toate query-urile active se refetch automat dacă sunt stale (adică mereu, cu `staleTime=0`). **Comportament intenționat pe panou** — staff-ul de la recepție vede date proaspete fără refresh manual. |
| `refetchOnMount` | `true` | La fiecare montare a unui component care consumă query-ul, dacă e stale. |
| `gcTime` | `5 min` | Cache-ul unui query neutilizat e păstrat 5 minute, apoi colectat. |
| `retry` | `3` | 3 reîncercări automate la eroare de rețea. |

**Când să adaugi `staleTime`**: dacă un query e scump și datele sunt acceptabil de „în urmă" cu câteva minute (ex. statistici istorice, rapoarte), adaugă `staleTime: 60_000` direct în hook. Nu modifica globalul — afectează tot.

**`refetchOnWindowFocus: false`** se pune pe query-uri unde un refetch surpriză poate deranja UX-ul (ex. un form parțial completat, un calendar în editare). Se pune per-query, nu global.

---

## Convenții de structură a cheilor

```
[rootToken, scopeId?, "segment"?, params?]

rootToken  = șirul de bază al feature-ului ("bookings", "guests", etc.)
scopeId    = id-ul de scop (propertyId / orgId / bookingId)
"segment"  = "list" | "range" | "detail" etc. — când același root are mai multe tipuri
params     = obiect cu filtre/pagină — mereu obiect, nu valori separate, ca să fie extensibil
```

**Invalidarea pe prefix**: `invalidateQueries({ queryKey: ["bookings"] })` invalidează **toate** cheile care încep cu `"bookings"` — liste, detalii, range-uri. De aceea fiecare `*Keys` are un `.all` (flat array cu rootToken) care servește drept prefix de invalidare bulk.

---

## Inventar complet al cheilor

### `bookingKeys` — `features/bookings/hooks.ts`

| Cheie | Array | Folosit de |
|---|---|---|
| `all` | `["bookings"]` | invalidare bulk la orice mutație pe rezervări |
| `list(propertyId, params)` | `["bookings", propertyId, "list", params]` | `useBookings` — lista paginată |
| `range(propertyId, from, to)` | `["bookings", propertyId, "range", {from,to}]` | `useBookingsInRange` — calendar |
| `detail(bookingId)` | `["booking", bookingId]` | `useBooking` — pagina rezervării |
| `detailAll` | `["booking"]` | prefix invalidare bulk pentru detalii |
| `events(bookingId)` | `["booking-events", bookingId]` | `useBookingEvents` — audit trail (infinite) |
| `eventsAll` | `["booking-events"]` | prefix invalidare bulk audit |

### `unitKeys` — `features/bookings/hooks.ts`

| Cheie | Array | Folosit de |
|---|---|---|
| `list(propertyId)` | `["units", propertyId]` | `useUnits` |
| `available(unitTypeId, checkIn, checkOut, excludeId?)` | `["units-available", ...]` | `useAvailableUnits` — form rezervare |

### `blockKeys` — `features/bookings/hooks.ts`

| Cheie | Array | Folosit de |
|---|---|---|
| `range(propertyId, from, to)` | `["unit-blocks", propertyId, "range", {from,to}]` | `useBlocksInRange` — calendar |

### `unitTypeKeys` — `features/unit-types/hooks.ts`

| Cheie | Array | Folosit de |
|---|---|---|
| `list(propertyId)` | `["unit-types", propertyId]` | `useUnitTypes` |
| `units(unitTypeId)` | `["units-for-type", unitTypeId]` | `useUnitsForType` |
| `events(unitId)` | `["unit-events", unitId]` | `useUnitEvents` — audit cameră (infinite) |
| `typeEvents(unitTypeId)` | `["unit-type-events", unitTypeId]` | `useUnitTypeEvents` — audit tip (infinite) |
| `blocks(unitId)` | `["unit-blocks", unitId]` | `useUnitBlocks` — lista blocaje cameră |

### `guestKeys` — `features/guests/hooks.ts`

| Cheie | Array | Folosit de |
|---|---|---|
| `all(orgId)` | `["guests", orgId]` | prefix invalidare bulk |
| `list(orgId, params)` | `["guests", orgId, "list", params]` | `useGuests` — lista paginată |
| `detail(guestId)` | `["guest", guestId]` | `useGuest` — profil oaspete |
| `bookings(guestId, page)` | `["guest-bookings", guestId, {page}]` | `useGuestBookings` — istoric (infinite) |
| `bookingsAll` | `["guest-bookings"]` | prefix invalidare bulk istoric |
| `stats(guestId)` | `["guest-stats", guestId]` | `useGuestStats` — totaluri server-side |
| `statsAll` | `["guest-stats"]` | prefix invalidare bulk stats |

### `propertyKeys` — `features/properties/hooks.ts`

| Cheie | Array | Folosit de |
|---|---|---|
| `all` | `["properties"]` | prefix invalidare bulk |
| `list(orgId)` | `["properties", orgId]` | `useProperties` |
| `detail(id)` | `["properties", "detail", id]` | `useProperty` |

### `orgKeys` — `features/organizations/hooks.ts`

| Cheie | Array | Folosit de |
|---|---|---|
| `all` | `["orgs"]` | `useMyOrganizations` |

### `paymentKeys` — `features/payments/hooks.ts`

| Cheie | Array | Folosit de |
|---|---|---|
| `all` | `["payments"]` | prefix invalidare bulk |
| `list(bookingId)` | `["payments", bookingId]` | `usePayments` — ledger (infinite) |
| `revenue(propertyId)` | `["revenue", propertyId]` | `useRevenueSummary` — carduri venit |
| `revenueAll` | `["revenue"]` | prefix invalidare bulk venit |

### `pricingKeys` — `features/pricing/hooks.ts`

| Cheie | Array | Folosit de |
|---|---|---|
| `seasons(unitTypeId)` | `["rate-seasons", unitTypeId]` | `useSeasons` — dialog tarife (infinite) |
| `overrides(propertyId)` | `["rate-overrides", propertyId]` | `useOverrides` |
| `calendar(propertyId, from, to)` | `["rate-calendar", propertyId, from, to]` | `useRateCalendar` — calendar |
| `quote(unitTypeId, checkIn, checkOut, promoCode?)` | `["price-quote", ...]` | `usePriceQuote` — estimare preț form |

### `reservationKeys` — `features/reservation-rules/hooks.ts`

| Cheie | Array | Folosit de |
|---|---|---|
| `stayRules(unitTypeId)` | `["stay-rules", unitTypeId]` | `useStayRules` |
| `closures(propertyId)` | `["closures", propertyId]` | `useClosures` |
| `closuresRange(propertyId, from, to)` | `["closures-range", ...]` | `useClosuresInRange` — calendar |
| `arrivalRules(propertyId)` | `["arrival-rules", propertyId]` | `useArrivalRules` |
| `arrivalRulesRange(propertyId, from, to)` | `["arrival-rules-range", ...]` | `useArrivalRulesInRange` — calendar |
| `stayConstraints(unitTypeId, checkIn)` | `["stay-constraints", ...]` | `useStayConstraints` — limitare check-out |
| `validateBooking(input)` | `["validate-booking", ...]` | `useValidateBooking` — preview validare form |

### `promotionKeys` — `features/promotions/hooks.ts`

| Cheie | Array | Folosit de |
|---|---|---|
| `list(propertyId)` | `["promotions", propertyId]` | `usePromotions` (infinite) |

### `dashboardKeys` — `features/dashboard/hooks.ts`

| Cheie | Array | Folosit de |
|---|---|---|
| `all` | `["dashboard"]` | prefix invalidare bulk |
| `stats(propertyId)` | `["dashboard", propertyId]` | `useDashboardStats` — toate cardurile panoului |

> `dashboardKeys.all` e invalidat de `invalidateBookingData` (mutații rezervări) și de mutațiile pe camere active (generate/status/bulk/delete) din `unit-types/hooks`. Cele 3 componente de carduri (`DashboardTodayCards`, `DashboardOccupancyCards`, `DashboardBookingCards`) folosesc **aceeași** cheie → un singur fetch, dedupe TanStack.

---

## Cascade de invalidare la mutații

Documentat explicit — la fiecare mutație importantă se invalidează mai mult decât un singur prefix, pentru că datele sunt interconectate:

### Orice mutație pe rezervări (`invalidateBookingData`)
```
bookingKeys.all          → liste + range-uri
bookingKeys.detailAll    → detalii rezervări individuale
bookingKeys.eventsAll    → audit trail
guestKeys.bookingsAll    → istoricul oaspetelui
guestKeys.statsAll       → statisticile oaspetelui (total/viitoare/anulate)
dashboardKeys.all        → metricile panoului
```

### Orice mutație de plată (`invalidatePaymentData`)
```
paymentKeys.all          → ledger plăți
paymentKeys.revenueAll   → cardurile de venit
["bookings"]             → payment_status / amount_paid pe rezervare
["booking"]              → detaliul rezervării
["booking-events"]       → audit (payment_status apare în istoric)
```

### Mutații pe camere (status/generare/ștergere)
```
unitTypeKeys.list(propertyId)
["units-for-type"]
["units"]
dashboardKeys.all        → total_units / occupied_units se schimbă
["unit-events"]
```

---

## Chei liter ale (string directe fără obiect `*Keys`)

Câteva locuri din cod invalidează cu string literal în loc de obiect `*Keys`. Sunt documentate ca excepții conștiente:

| String literal | Context | Motivul |
|---|---|---|
| `["unit-blocks"]` | `invalidateBlockData` în `unit-types/hooks` | Prefix comun partajat între `unitTypeKeys.blocks` și `blockKeys.range` — nu există un obiect comun care să le unifice |
| `["bookings"]` | `invalidatePaymentData` în `payments/hooks` | Importul circular `bookings ↔ payments` s-ar crea; `paymentKeys` nu poate importa `bookingKeys`. Acceptabil — efectul e identic cu `bookingKeys.all`. |
| `["booking"]` | idem | idem |
| `["booking-events"]` | idem | idem |

Dacă apar altele, documentează-le aici cu motivul — nu lăsa string-uri magice fără explicație.
