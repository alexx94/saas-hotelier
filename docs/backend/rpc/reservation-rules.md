# RPC — Reservation Rules Engine (Sprint 4.6)

> Strat **modular de restricții de rezervare**, separat de preț (`rate_rules`) și de blocajele fizice de cameră (`room_blocks`). Acoperă durata sejurului (min/max stay, global + pe perioade) și oprirea vânzărilor (stop-sell / closed dates, cu scope). Sursa unică de adevăr e `app.create_booking_internal` — admin și public trec prin el, deci o regulă se aplică identic pe ambele căi.

## De ce un strat nou (și nu room_blocks)?

| Concept | Tabel | Ce face |
|---|---|---|
| Blocaj fizic | `room_blocks` | scoate **o cameră anume** din uz (mentenanță, renovare); poate bloca 1 din 5 camere, restul rămân vandabile |
| Stop-sell / closed dates | `closures` | oprește **vânzarea unui produs** (un tip sau toată proprietatea) pe o perioadă, **fără** a atinge camerele fizice |
| Durată sejur | `unit_types.min_stay/max_stay` + `stay_rules` | impune nr. minim/maxim de nopți, global per tip + suprascrieri pe perioade |

Aceasta e separarea standard din PMS-urile mari (Booking.com/Cloudbeds): „block a room" ≠ „stop sell".

## Model de date

```
unit_types.min_stay / max_stay        int 1..30 (global per tip); CHECK max_stay >= min_stay
                                       default min 1 / max 30; grant SELECT la anon (coloane safe)

stay_rules (restricții de durată pe PERIOADĂ, per tip)
  start_date / end_date  interval INCLUSIV — cheiat pe data de CHECK-IN (sosire)
  min_stay / max_stay    int 1..30, NULLABLE (null = moștenește globalul tipului)
  updated_at             timestamptz (clock_timestamp) — la suprapunere câștigă
                         cea mai RECENT modificată regulă (ca rate_rules)
  CHECK: cel puțin una din min/max setată; max >= min când ambele sunt setate

closures (stop-sell / closed dates, cu SCOPE)
  unit_type_id           NULL = toată proprietatea; setat = un singur tip
  start_date / end_date  daterange [) generat în coloana `period`
  reason                 seasonal | event | maintenance | other
  (fără EXCLUDE — suprapunerea închiderilor e benignă/idempotentă)
```

**Rezolvarea duratei** (în `app.resolve_stay`): regula pe perioadă care acoperă data de check-in
(cea mai recentă `updated_at`) suprascrie globalul; `coalesce(rule, unit_type)` per câmp. Min/max stay
e cheiat pe **data de sosire** — întreaga rezervare trebuie să respecte regula valabilă la check-in
(standard hotelier), nu se evaluează per noapte.

RLS pe `stay_rules` + `closures`: select = `can_access_property`; CUD = owner/manager (`is_org_role`).
**Fără grant anon** — publicul nu citește direct; restricțiile ajung la public doar prin RPC DEFINER.

**Frontend**: regulile de durată per tip → dialog „Reguli durată" din pagina proprietății
(`StayRulesDialog`); stop-sell → buton dedicat în header-ul proprietății (`ClosuresDialog`, cu selector
scope proprietate/tip). Câmpurile min/max stay globale stau în formularul de creare/editare tip.
Liste paginate „Afișează mai mult" (15/pagină). Validare date trecute: doar în UI (`min=azi`).

---

## `app.resolve_stay(p_unit_type_id, p_check_in) returns table(min_stay, max_stay)` (intern)

Întoarce min/max stay efective la o dată de sosire (regula pe perioadă peste global).

| | |
|---|---|
| Migrație | `20260614120000` |
| Security | DEFINER, `stable` (`set search_path = ''`) |
| Grants | revocat de la `public/anon/authenticated` — apelat doar de funcții DEFINER |

## `app.is_closed(p_property_id, p_unit_type_id, p_check_in, p_check_out) returns boolean` (intern)

`true` dacă există o închidere (property-scope SAU type-scope) care se suprapune cu intervalul.

| | |
|---|---|
| Security | DEFINER, `stable` |
| Grants | revocat de la `public/anon/authenticated` |

## `get_stay_constraints(p_unit_type_id, p_check_in) returns jsonb {min_stay, max_stay}`

**Scop**: formularul admin limitează check-out-ul (min/max nopți) după tip + dată de check-in.

| | |
|---|---|
| Security | DEFINER, `stable` |
| Grants | `authenticated` ✅ · `anon`/PUBLIC ❌ |
| Autorizare | `can_access_property(unit_type.property_id)` → `FORBIDDEN` |
| Erori | `UNIT_TYPE_NOT_FOUND`, `FORBIDDEN` |
| Frontend | `features/reservation-rules/api.ts` → `getStayConstraints()`, hook `useStayConstraints`, folosit în `booking-form-dialog.tsx` |

## `app.create_booking_internal(...)` — actualizat (enforcement)

Înainte de bucla de alocare, după validarea ocupării:
- `app.is_closed(...)` → `DATES_CLOSED`
- `nights < min_stay` (rezolvat) → `STAY_TOO_SHORT`
- `nights > max_stay` (rezolvat) → `STAY_TOO_LONG`

Semnătura RPC rămâne neschimbată — se aplică automat la `create_booking` (admin) și
`public_create_booking` (public). Ocuparea (`OCCUPANCY_EXCEEDED`) rămâne neschimbată.

## `public_get_availability(p_slug, p_check_in, p_check_out, p_adults, p_children)` — actualizat

`+ min_stay, max_stay` în rezultat (rezolvate la check-in). **Filtrează** tipurile închise
(`not app.is_closed`) și pe cele ce nu satisfac durata (`nights between min_stay and max_stay`).
DEFINER, grant `anon`+`authenticated`.

---

## TODO — istoric (audit) pentru închideri

`closures` (și `stay_rules`) **nu au audit/istoric** momentan (doar create/delete, ca `room_blocks`).
Starea curentă e vizibilă direct (regula există sau nu), iar prețul rezervărilor e snapshot imuabil,
deci nu se pierde adevărul istoric. PMS-urile mari **includ** de regulă un activity-log pentru
stop-sell (acțiune sensibilă pe disponibilitate, accountability multi-user). **TODO** (prioritate
mică): dacă se dorește „cine/când a închis vânzările", se refolosește tiparul de audit existent
(tabel `*_events` + trigger + registru de câmpuri în UI), fără schimbări de schemă pe `closures`.

**Teste** (`db_tests.sql`, TEST 45–52): min stay global (admin + public → `STAY_TOO_SHORT`),
max stay (`STAY_TOO_LONG`), `stay_rules` pe perioadă (rezolvare pe check-in + fallback global),
`get_stay_constraints` (global vs regulă, cross-org `FORBIDDEN`, anon fără execute),
closures property-scope (`DATES_CLOSED` + 0 în availability) și type-scope (doar un tip închis),
RLS pe `stay_rules`/`closures` (anon + izolare cross-tenant), regresie occupancy.
