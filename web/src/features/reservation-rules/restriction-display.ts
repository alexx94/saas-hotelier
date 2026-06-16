import type { ArrivalRule } from "./api"

// ─── Registru centralizat de afișare în calendar (Sprint 4.7) ────────────────────
// Tokens vizuale pentru restricțiile de sosire/plecare și pauza de pregătire,
// reutilizabile între celule și legendă (ca BLOCK_REASON_* / UNAVAILABLE_STRIPES).

// Pauza de pregătire (turnover): hașură subtilă pe tokens de temă (urmează light/dark).
export const TURNOVER_STRIPES =
  "repeating-linear-gradient(45deg, color-mix(in oklab, var(--muted-foreground) 30%, transparent), color-mix(in oklab, var(--muted-foreground) 30%, transparent) 4px, transparent 4px, transparent 8px)"

// Marcaje în colțul celulei pentru restricții (subtile, NU bare pline ca la cazări):
//   sosire interzisă = colț stânga-sus (ambră); plecare interzisă = colț dreapta-sus (violet).
export const NO_ARRIVAL_COLOR = "#f59e0b"   // amber-500
export const NO_DEPARTURE_COLOR = "#8b5cf6" // violet-500

// Restricția rezolvată pe o zi (uniunea regulilor aplicabile = cea mai restrictivă).
export type DayRestriction = { noArrival: boolean; noDeparture: boolean }

type ArrivalMaps = {
  // restricții property-scope (se aplică tuturor tipurilor), cheiate pe ziua ISO
  byDay: Map<string, DayRestriction>
  // restricții type-scope, cheiate pe `unitTypeId|ziuaISO`
  byTypeDay: Map<string, DayRestriction>
}

function mark(map: Map<string, DayRestriction>, key: string, r: ArrivalRule) {
  const cur = map.get(key) ?? { noArrival: false, noDeparture: false }
  cur.noArrival = cur.noArrival || r.no_arrival
  cur.noDeparture = cur.noDeparture || r.no_departure
  map.set(key, cur)
}

// Pre-calculează restricțiile pe zi din regulile care ating luna [fromIso, toIso).
// Complexitate O(reguli × zile_în_lună) — luna e mărginită, deci ieftin și scalabil.
export function resolveArrivalRestrictions(
  rules: ArrivalRule[],
  fromIso: string, // prima zi a lunii (inclusiv)
  toIso: string,   // prima zi a lunii următoare (exclusiv)
): ArrivalMaps {
  const byDay = new Map<string, DayRestriction>()
  const byTypeDay = new Map<string, DayRestriction>()

  for (const rule of rules) {
    // intersectează fereastra regulii cu luna afișată
    const start = rule.start_date > fromIso ? rule.start_date : fromIso
    const endIncl = rule.end_date < toIso ? rule.end_date : prevDay(toIso)
    if (start > endIncl) continue
    const weekdays = rule.weekdays && rule.weekdays.length > 0 ? rule.weekdays : null

    for (let d = new Date(`${start}T00:00:00Z`); toISO(d) <= endIncl; d.setUTCDate(d.getUTCDate() + 1)) {
      if (weekdays && !weekdays.includes(d.getUTCDay())) continue
      const dayIso = toISO(d)
      if (rule.unit_type_id) mark(byTypeDay, `${rule.unit_type_id}|${dayIso}`, rule)
      else mark(byDay, dayIso, rule)
    }
  }
  return { byDay, byTypeDay }
}

// Restricția efectivă pentru un tip de cameră într-o zi = property-scope ∪ type-scope.
export function restrictionFor(
  maps: ArrivalMaps,
  unitTypeId: string | null,
  dayIso: string,
): DayRestriction {
  const p = maps.byDay.get(dayIso)
  const t = unitTypeId ? maps.byTypeDay.get(`${unitTypeId}|${dayIso}`) : undefined
  return {
    noArrival: !!(p?.noArrival || t?.noArrival),
    noDeparture: !!(p?.noDeparture || t?.noDeparture),
  }
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function prevDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return toISO(d)
}
