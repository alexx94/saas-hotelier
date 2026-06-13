import { statusLabel } from "./status-badge"
import { formatDateShort } from "./date-utils"
import type { BookingStatus } from "./api"
import { t, type TranslationKey } from "@/lib/i18n"

// Registru de câmpuri afișabile din old_data/new_data (audit).
// Un câmp nou în trigger-ul de audit = o singură intrare aici.
// Câmpurile neînregistrate (ex. uuid-uri tehnice) nu se afișează.
export type EventFieldRegistry = Record<
  string,
  { label: TranslationKey; format?: (v: unknown) => string }
>

const BOOKING_FIELDS: EventFieldRegistry = {
  unit: { label: "bookings.unit" },
  guest: { label: "bookings.guest" },
  status: { label: "bookings.status", format: (v) => statusLabel(v as BookingStatus) },
  check_in: { label: "bookings.check_in", format: (v) => formatDateShort(String(v)) },
  check_out: { label: "bookings.check_out", format: (v) => formatDateShort(String(v)) },
  guests_count: { label: "bookings.guests_count" },
  total_amount: { label: "bookings.total" },
  notes: { label: "bookings.notes" },
}

function fmt(fields: EventFieldRegistry, key: string, value: unknown): string {
  const format = fields[key]?.format
  return format ? format(value) : String(value)
}

// Afișează generic diferențele dintre old_data și new_data:
//   "Check-in: 12 iun. → 14 iun."
// Pentru evenimente fără old_data (created), afișează doar valorile noi.
// `fields` permite reutilizarea pentru alte entități auditate (ex. unit_events).
export function EventDiff({
  oldData, newData, fields = BOOKING_FIELDS,
}: {
  oldData: unknown
  newData: unknown
  fields?: EventFieldRegistry
}) {
  const o = (oldData ?? {}) as Record<string, unknown>
  const n = (newData ?? {}) as Record<string, unknown>

  const keys = Object.keys(fields).filter(
    (k) => (k in o || k in n) && o[k] !== n[k] && (o[k] != null || n[k] != null)
  )
  if (keys.length === 0) return null

  return (
    <div className="mt-0.5 space-y-0.5">
      {keys.map((k) => (
        <p key={k} className="text-xs text-muted-foreground">
          {t(fields[k].label)}:{" "}
          {o[k] != null && (
            <span className={n[k] != null ? "line-through opacity-70" : ""}>
              {fmt(fields, k, o[k])}
            </span>
          )}
          {o[k] != null && n[k] != null && " → "}
          {n[k] != null && <span className="text-foreground">{fmt(fields, k, n[k])}</span>}
        </p>
      ))}
    </div>
  )
}
