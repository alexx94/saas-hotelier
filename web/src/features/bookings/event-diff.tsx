import { statusLabel } from "./status-badge"
import { formatDateShort } from "./date-utils"
import type { BookingStatus } from "./api"
import { t, type TranslationKey } from "@/lib/i18n"

// Registru de câmpuri afișabile din old_data/new_data (audit).
// Un câmp nou în trigger-ul de audit = o singură intrare aici.
// Câmpurile neînregistrate (ex. uuid-uri tehnice) nu se afișează.
const FIELDS: Record<string, { label: TranslationKey; format?: (v: unknown) => string }> = {
  unit: { label: "bookings.unit" },
  guest: { label: "bookings.guest" },
  status: { label: "bookings.status", format: (v) => statusLabel(v as BookingStatus) },
  check_in: { label: "bookings.check_in", format: (v) => formatDateShort(String(v)) },
  check_out: { label: "bookings.check_out", format: (v) => formatDateShort(String(v)) },
  guests_count: { label: "bookings.guests_count" },
  total_amount: { label: "bookings.total" },
  notes: { label: "bookings.notes" },
}

function fmt(key: string, value: unknown): string {
  const format = FIELDS[key]?.format
  return format ? format(value) : String(value)
}

// Afișează generic diferențele dintre old_data și new_data:
//   "Check-in: 12 iun. → 14 iun."
// Pentru evenimente fără old_data (created), afișează doar valorile noi.
export function EventDiff({ oldData, newData }: { oldData: unknown; newData: unknown }) {
  const o = (oldData ?? {}) as Record<string, unknown>
  const n = (newData ?? {}) as Record<string, unknown>

  const keys = Object.keys(FIELDS).filter(
    (k) => (k in o || k in n) && o[k] !== n[k] && (o[k] != null || n[k] != null)
  )
  if (keys.length === 0) return null

  return (
    <div className="mt-0.5 space-y-0.5">
      {keys.map((k) => (
        <p key={k} className="text-xs text-muted-foreground">
          {t(FIELDS[k].label)}:{" "}
          {o[k] != null && (
            <span className={n[k] != null ? "line-through opacity-70" : ""}>
              {fmt(k, o[k])}
            </span>
          )}
          {o[k] != null && n[k] != null && " → "}
          {n[k] != null && <span className="text-foreground">{fmt(k, n[k])}</span>}
        </p>
      ))}
    </div>
  )
}
