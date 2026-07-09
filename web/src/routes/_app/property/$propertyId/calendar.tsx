import { useEffect, useMemo, useRef, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Ban, CalendarClock, ChevronLeft, ChevronRight, Plus, Sparkles, User, X } from "lucide-react"
import { useCurrentProperty } from "@/features/properties/context"
import {
  useBlocksInRange, useBookingsInRange, useUnits,
} from "@/features/bookings/hooks"
import type { Booking, BookingStatus, RoomBlock, Unit } from "@/features/bookings/api"
import { BookingFormDialog, type BookingFormInitial } from "@/features/bookings/booking-form-dialog"
import { statusColors, StatusBadge, statusLabel } from "@/features/bookings/status-badge"
import type { UnitStatus } from "@/features/unit-types/api"
import { UNIT_STATUS_BADGE_CLASS, UNIT_STATUS_LABEL } from "@/features/unit-types/unit-status"
import {
  BLOCK_REASON_CALENDAR_CLASS, BLOCK_REASON_LABEL, BLOCK_STRIPES,
  UNAVAILABLE_STRIPES, blockCalendarClass, blockReasonLabel,
} from "@/features/unit-types/block-reason"
import { BLOCK_REASONS } from "@/features/unit-types/api"
import { UnitActionsMenu } from "@/features/unit-types/unit-actions-menu"
import { BlockDialog } from "@/features/unit-types/block-dialog"
import { useRemoveBlock } from "@/features/unit-types/hooks"
import { OverrideDialog } from "@/features/pricing/override-dialog"
import { dayLabel } from "@/features/pricing/weekend-pricing"
import { useRateCalendar } from "@/features/pricing/hooks"
import type { RateCalendarEntry } from "@/features/pricing/api"
import {
  useArrivalRulesInRange, useClosuresInRange, useDeleteClosure,
} from "@/features/reservation-rules/hooks"
import type { Closure } from "@/features/reservation-rules/api"
import {
  NO_ARRIVAL_COLOR, NO_DEPARTURE_COLOR, TURNOVER_STRIPES,
  resolveArrivalRestrictions, restrictionFor,
} from "@/features/reservation-rules/restriction-display"
import { addDays, diffDays, formatDateShort } from "@/features/bookings/date-utils"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { toast } from "sonner"
import { t } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_app/property/$propertyId/calendar")({
  component: CalendarPage,
})

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// plafonul pauzei de pregătire (unit_types.turnover_days CHECK 0..7) — cât de mult
// înapoi în timp poate „intra" turnover-ul unei rezervări în fereastra afișată
const MAX_TURNOVER_DAYS = 7

// calendarul e o fereastră glisantă de 31 de zile (tape-chart), nu o grilă pe lună —
// se poate întinde peste două luni calendaristice
const WINDOW_DAYS = 31

// implicit la mount: azi minus 3 zile, ca să existe context pe trecutul recent
function defaultWindowStart(): string {
  return addDays(toISO(new Date()), -3)
}

// poziția (index 0..WINDOW_DAYS) unui interval [from, toEx) în fereastra curentă,
// clampată la marginile ferestrei — folosită atât pentru ocupare cât și pentru
// poziționarea barelor (rezervări/blocaje/închideri/turnover)
function windowIndexRange(windowStart: string, from: string, toEx: string) {
  const startIdx = Math.max(0, diffDays(windowStart, from))
  const endIdx = Math.min(WINDOW_DAYS, diffDays(windowStart, toEx))
  return { startIdx, endIdx }
}

// ─── selecție de interval pe rând (tap-tap + drag mouse) ────────────────────

// motivul unei celule ocupate — folosit doar pentru validarea selecției (nu și
// pentru pictarea barelor, care rămâne neschimbată). Închiderile (closures) nu
// sunt obstacol pentru selecție — sunt comerciale, validarea reală e în dialog.
type ObstacleReason = "booking" | "block" | "turnover"

const SELECTION_OVERLAP_KEY: Record<ObstacleReason, Parameters<typeof t>[0]> = {
  booking: "calendar.selection.overlap_booking",
  block: "calendar.selection.overlap_block",
  turnover: "calendar.selection.overlap_turnover",
}

// selecție de nopți pe UN rând: [start..end] inclusiv (indici de celulă, ca la
// occupiedDays), ancorată la `anchorIdx` (primul click / pointerdown).
// `complete` = interval finalizat (al doilea tap sau pointerup) → popover vizibil.
type CellSelection = {
  unitId: string
  unitName: string
  unitTypeId: string
  anchorIdx: number
  start: number
  end: number
  complete: boolean
  x: number
  y: number
}

// extinde selecția din `anchorIdx` spre `targetIdx`, oprindu-se la ultima celulă
// liberă înainte de primul obstacol întâlnit (dacă există) — folosit atât la al
// doilea tap (tap-tap), cât și la fiecare pointerenter în timpul unui drag.
function clampToward(
  reasonMap: Map<number, ObstacleReason>,
  anchorIdx: number,
  targetIdx: number
): { start: number; end: number; hit: ObstacleReason | null } {
  const dir = targetIdx >= anchorIdx ? 1 : -1
  let boundary = anchorIdx
  let hit: ObstacleReason | null = null
  for (let i = anchorIdx + dir; dir > 0 ? i <= targetIdx : i >= targetIdx; i += dir) {
    const reason = reasonMap.get(i)
    if (reason) { hit = reason; break }
    boundary = i
  }
  return { start: Math.min(anchorIdx, boundary), end: Math.max(anchorIdx, boundary), hit }
}

// culoarea tarifului din celulă, după sursă (base/season/override)
const RATE_KIND_CLASS: Record<string, string> = {
  base: "text-muted-foreground/70",
  season: "text-sky-600 dark:text-sky-400 font-medium",
  override: "text-amber-600 dark:text-amber-400 font-semibold",
}

// ─── tooltips (rezervare / blocaj) ───────────────────────────────────────────

type TooltipState =
  | { kind: "booking"; booking: Booking; x: number; y: number }
  | { kind: "block"; block: RoomBlock; x: number; y: number }
  | { kind: "closure"; closure: Closure; x: number; y: number }
  | { kind: "turnover"; from: string; toEx: string; unitName: string; x: number; y: number }

// stop-sell pe celule: hașură roșiatică (distinctă de blocaje), text „Închis"
const CLOSURE_CLASS = "border-destructive/50 bg-destructive/10 text-destructive"
function closureReasonLabel(reason: string) {
  return t(`closures.reason.${reason}` as Parameters<typeof t>[0])
}

// poziționare comună: lângă click, fără să iasă din viewport
function tooltipPos(x: number, y: number, width: number, estimatedH: number) {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024
  const vh = typeof window !== "undefined" ? window.innerHeight : 768
  return {
    left: Math.max(8, Math.min(x, vw - width - 8)),
    top: y + estimatedH > vh ? Math.max(8, y - estimatedH - 10) : y + 8,
  }
}

function BookingTooltip({
  tooltip,
  onClose,
  currency,
}: {
  tooltip: Extract<TooltipState, { kind: "booking" }>
  onClose: () => void
  currency: string
}) {
  const { booking: b } = tooltip
  const nights = Math.round(
    (new Date(b.check_out).getTime() - new Date(b.check_in).getTime()) / 86400000
  )

  const TOOLTIP_W = 288
  const { left, top } = tooltipPos(tooltip.x, tooltip.y, TOOLTIP_W, 260)

  return (
    <>
      <div className="fixed inset-0 z-[55]" onClick={onClose} />
      <div
        style={{ position: "fixed", top, left, width: TOOLTIP_W, zIndex: 56 }}
        className="rounded-lg border bg-popover shadow-xl text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b p-3 pb-2">
          <div className="min-w-0">
            <p className="font-semibold truncate">
              {b.guests?.full_name ?? t("status.blocked")}
            </p>
            {b.guests?.email && (
              <p className="text-xs text-muted-foreground truncate">{b.guests.email}</p>
            )}
            {b.guests?.phone && (
              <p className="text-xs text-muted-foreground">{b.guests.phone}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <StatusBadge status={b.status as BookingStatus} />
            <button
              onClick={onClose}
              className="ml-1 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="space-y-1.5 p-3 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Check-in</span>
            <span className="font-medium">{b.check_in}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Check-out</span>
            <span className="font-medium">{b.check_out}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("bookings.nights")}</span>
            <span className="font-medium">{nights}</span>
          </div>
          {b.units?.name && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("bookings.unit")}</span>
              <span>{b.units.name}</span>
            </div>
          )}
          {b.unit_types?.name && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("calendar.room_type")}</span>
              <span>{b.unit_types.name}</span>
            </div>
          )}
          {b.guests_count != null && b.guests_count > 1 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("bookings.guests_count")}</span>
              <span>{b.guests_count}</span>
            </div>
          )}
          {b.total_amount != null && Number(b.total_amount) > 0 && (
            <div className="flex justify-between border-t pt-1.5 mt-1">
              <span className="text-muted-foreground">{t("bookings.total")}</span>
              <span className="font-semibold text-foreground">
                {Number(b.total_amount).toFixed(2)} {currency}
              </span>
            </div>
          )}
          {b.notes && (
            <p className="border-t pt-1.5 mt-1 text-muted-foreground italic leading-snug">
              {b.notes}
            </p>
          )}
        </div>
      </div>
    </>
  )
}

// fereastră mică la click pe un blocaj: interval, motiv, note + eliminare
function BlockTooltip({
  tooltip,
  unitName,
  onClose,
}: {
  tooltip: Extract<TooltipState, { kind: "block" }>
  unitName: string | undefined
  onClose: () => void
}) {
  const { block: rb } = tooltip
  const removeBlock = useRemoveBlock()
  const [confirmRemove, setConfirmRemove] = useState(false)

  const TOOLTIP_W = 272
  const { left, top } = tooltipPos(tooltip.x, tooltip.y, TOOLTIP_W, 200)

  async function onRemove() {
    try {
      await removeBlock.mutateAsync(rb.id)
      toast.success(t("blocks.removed"))
      onClose()
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <>
      {/* z sub dialogul de confirmare (z-50): la deschiderea modalului, overlay-ul
          lui acoperă și estompează tooltip-ul, fără să-l mai închidem */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        style={{ position: "fixed", top, left, width: TOOLTIP_W, zIndex: 41 }}
        className="rounded-lg border bg-popover shadow-xl text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b p-3 pb-2">
          <p className="font-semibold">{blockReasonLabel(rb.reason)}</p>
          <button
            onClick={onClose}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="space-y-1.5 p-3 text-xs">
          {unitName && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("bookings.unit")}</span>
              <span className="font-medium">{unitName}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("blocks.start")}</span>
            <span className="font-medium">{rb.start_date}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("blocks.end")}</span>
            <span className="font-medium">{rb.end_date}</span>
          </div>
          {rb.notes && (
            <p className="border-t pt-1.5 mt-1 text-muted-foreground italic leading-snug">
              {rb.notes}
            </p>
          )}
          <Button
            variant="outline" size="sm"
            className="mt-1.5 w-full text-destructive"
            disabled={removeBlock.isPending}
            onClick={() => setConfirmRemove(true)}
          >
            {t("blocks.remove")}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={t("common.confirm_action")}
        description={t("blocks.confirm_remove")}
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={onRemove}
      />
    </>
  )
}

// fereastră la click pe o închidere (stop-sell): scope, interval, motiv, note + eliminare
function ClosureTooltip({
  tooltip,
  scopeLabel,
  onClose,
}: {
  tooltip: Extract<TooltipState, { kind: "closure" }>
  scopeLabel: string
  onClose: () => void
}) {
  const { closure: c } = tooltip
  const deleteClosure = useDeleteClosure()
  const [confirmRemove, setConfirmRemove] = useState(false)

  const TOOLTIP_W = 272
  const { left, top } = tooltipPos(tooltip.x, tooltip.y, TOOLTIP_W, 200)

  async function onRemove() {
    try {
      await deleteClosure.mutateAsync(c.id)
      toast.success(t("closures.deleted"))
      onClose()
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        style={{ position: "fixed", top, left, width: TOOLTIP_W, zIndex: 41 }}
        className="rounded-lg border bg-popover shadow-xl text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b p-3 pb-2">
          <p className="flex items-center gap-1.5 font-semibold">
            <Ban className="h-3.5 w-3.5 text-destructive" />
            {t("closures.title")}
          </p>
          <button onClick={onClose} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="space-y-1.5 p-3 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("closures.scope")}</span>
            <span className="font-medium">{scopeLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("closures.reason")}</span>
            <span className="font-medium">{closureReasonLabel(c.reason)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("blocks.start")}</span>
            <span className="font-medium">{c.start_date}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("blocks.end")}</span>
            <span className="font-medium">{c.end_date}</span>
          </div>
          {c.notes && (
            <p className="border-t pt-1.5 mt-1 text-muted-foreground italic leading-snug">
              {c.notes}
            </p>
          )}
          <Button
            variant="outline" size="sm"
            className="mt-1.5 w-full text-destructive"
            disabled={deleteClosure.isPending}
            onClick={() => setConfirmRemove(true)}
          >
            {t("closures.remove")}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={t("common.confirm_action")}
        description={t("closures.delete_confirm")}
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={onRemove}
      />
    </>
  )
}

// fereastră la click pe pauza de pregătire (turnover) — informativă (nu se șterge:
// derivă din rezervare + setarea turnover_days a tipului)
function TurnoverTooltip({
  tooltip,
  onClose,
}: {
  tooltip: Extract<TooltipState, { kind: "turnover" }>
  onClose: () => void
}) {
  const TOOLTIP_W = 264
  const { left, top } = tooltipPos(tooltip.x, tooltip.y, TOOLTIP_W, 180)
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        style={{ position: "fixed", top, left, width: TOOLTIP_W, zIndex: 41 }}
        className="rounded-lg border bg-popover shadow-xl text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b p-3 pb-2">
          <p className="flex items-center gap-1.5 font-semibold">
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
            {t("calendar.turnover_label")}
          </p>
          <button onClick={onClose} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="space-y-1.5 p-3 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("bookings.unit")}</span>
            <span className="font-medium">{tooltip.unitName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("blocks.start")}</span>
            <span className="font-medium">{tooltip.from}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("calendar.turnover_available_from")}</span>
            <span className="font-medium">{tooltip.toEx}</span>
          </div>
          <p className="border-t pt-1.5 mt-1 text-muted-foreground italic leading-snug">
            {t("calendar.turnover_desc")}
          </p>
        </div>
      </div>
    </>
  )
}

// popover de acțiune după finalizarea selecției de nopți pe un rând: cameră +
// interval + două acțiuni rapide (rezervare / blocaj). Backdrop transparent,
// exact ca la tooltip-urile de mai sus — click în afară = anulează selecția.
function SelectionPopover({
  selection,
  windowStart,
  onClose,
  onBook,
  onBlock,
}: {
  selection: CellSelection
  windowStart: string
  onClose: () => void
  onBook: () => void
  onBlock: () => void
}) {
  const checkIn = addDays(windowStart, selection.start)
  const checkOut = addDays(windowStart, selection.end + 1)
  const nights = selection.end - selection.start + 1

  const POPOVER_W = 240
  const { left, top } = tooltipPos(selection.x, selection.y, POPOVER_W, 150)

  return (
    <>
      <div className="fixed inset-0 z-[55]" onClick={onClose} />
      <div
        style={{ position: "fixed", top, left, width: POPOVER_W, zIndex: 56 }}
        className="rounded-lg border bg-popover shadow-xl text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b p-3 pb-2">
          <div className="min-w-0">
            <p className="font-semibold truncate">{selection.unitName}</p>
            <p className="text-xs text-muted-foreground">
              {formatDateShort(checkIn)} – {formatDateShort(checkOut)} · {nights} {t("bookings.nights")}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex gap-2 p-3">
          <Button size="sm" className="flex-1" onClick={onBook}>{t("calendar.selection.book")}</Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={onBlock}>{t("calendar.selection.block")}</Button>
        </div>
      </div>
    </>
  )
}

// ─── legendă culori (minimalistă) ─────────────────────────────────────────────

const LEGEND_BOOKING_STATUSES: BookingStatus[] = [
  "pending", "confirmed", "checked_in", "checked_out",
]

function CalendarLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
      {LEGEND_BOOKING_STATUSES.map((s) => (
        <span key={s} className="flex items-center gap-1">
          <span className={cn("h-2.5 w-2.5 rounded-sm border", statusColors[s])} />
          {statusLabel(s)}
        </span>
      ))}
      {BLOCK_REASONS.map((r) => (
        <span key={r} className="flex items-center gap-1">
          <span
            className={cn("h-2.5 w-2.5 rounded-sm border", BLOCK_REASON_CALENDAR_CLASS[r])}
            style={{ backgroundImage: BLOCK_STRIPES }}
          />
          {t(BLOCK_REASON_LABEL[r])}
        </span>
      ))}
      <span className="flex items-center gap-1">
        <span
          className="h-2.5 w-2.5 rounded-sm border bg-muted"
          style={{ backgroundImage: UNAVAILABLE_STRIPES }}
        />
        {t("calendar.legend.unavailable")}
      </span>
      <span className="flex items-center gap-1">
        <span
          className={cn("h-2.5 w-2.5 rounded-sm border", CLOSURE_CLASS)}
          style={{ backgroundImage: UNAVAILABLE_STRIPES }}
        />
        {t("closures.closed_label")}
      </span>
      {/* pauză de pregătire (turnover) — hașură subtilă */}
      <span className="flex items-center gap-1">
        <span
          className="h-2.5 w-2.5 rounded-sm border border-muted-foreground/40"
          style={{ backgroundImage: TURNOVER_STRIPES }}
        />
        {t("calendar.legend.turnover")}
      </span>
      {/* restricții de sosire/plecare — marcaje de colț (triunghiuri) */}
      <span className="flex items-center gap-1">
        <span
          className="h-0 w-0 border-t-[10px] border-r-[10px] border-r-transparent"
          style={{ borderTopColor: NO_ARRIVAL_COLOR }}
        />
        {t("calendar.legend.no_arrival")}
      </span>
      <span className="flex items-center gap-1">
        <span
          className="h-0 w-0 border-t-[10px] border-l-[10px] border-l-transparent"
          style={{ borderTopColor: NO_DEPARTURE_COLOR }}
        />
        {t("calendar.legend.no_departure")}
      </span>
      {/* tarife pe celule: sezon (albastru) · preferențial/override (chihlimbar) */}
      <span className="flex items-center gap-1.5">
        {t("pricing.rates_legend")}:
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-sky-500/70" />
          {t("pricing.kind.season")}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-500/80" />
          {t("pricing.kind.override")}
        </span>
      </span>
    </div>
  )
}

// ─── pagina calendar ──────────────────────────────────────────────────────────

function CalendarPage() {
  const { currentProperty: property } = useCurrentProperty()
  const [windowStart, setWindowStart] = useState(defaultWindowStart)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [blockTarget, setBlockTarget] = useState<
    { kind: "single"; unitId: string; unitName: string; initialRange?: { start: string; end: string } } | null
  >(null)
  // selecția curentă de nopți pe un rând (tap-tap sau drag) — vezi clampToward
  const [selection, setSelection] = useState<CellSelection | null>(null)
  // dialogul de rezervare (unic): deschis fie din butonul „Adaugă" din header (fără
  // preselectare), fie din popover-ul de selecție (cameră + interval preselectate)
  const [bookingOpen, setBookingOpen] = useState(false)
  const [bookingInitial, setBookingInitial] = useState<BookingFormInitial | null>(null)

  // urmărirea unui drag cu mouse-ul (enhancement desktop) — origine + stare „chiar
  // se trage acum", plus flag-uri care nu declanșează re-render (nu fac parte din UI)
  const pointerOriginRef = useRef<{ unitId: string; idx: number } | null>(null)
  const draggingRef = useRef(false)
  // ignoră click-ul „fantomă" care urmează unui pointerup ce a finalizat un drag
  const suppressClickRef = useRef(false)
  // un singur toast de suprapunere per gest (tap-tap sau drag), nu unul per pointerenter
  const gestureWarnedRef = useRef(false)

  // windowEnd = exclusiv (prima zi de după fereastră)
  const windowEnd = useMemo(() => addDays(windowStart, WINDOW_DAYS), [windowStart])

  // aducem și rezervările care s-au terminat cu până la MAX_TURNOVER_DAYS înainte de
  // fereastră: pauza lor de pregătire (turnover) poate intra în fereastra afișată (ex.
  // check-out cu o zi înainte de start, cu pauză 1 zi → prima zi din fereastră indisponibilă).
  // Barele/ocuparea folosesc totuși doar rezervările care ating efectiv fereastra (vezi
  // filtrul de overlap mai jos).
  const bookingsStart = useMemo(() => addDays(windowStart, -MAX_TURNOVER_DAYS), [windowStart])

  const { data: units, isLoading: loadingUnits } = useUnits(property?.id)
  const { data: bookings } = useBookingsInRange(property?.id, bookingsStart, windowEnd)
  const { data: blocks } = useBlocksInRange(property?.id, windowStart, windowEnd)
  const { data: closures } = useClosuresInRange(property?.id, windowStart, windowEnd)
  const { data: arrivalRules } = useArrivalRulesInRange(property?.id, windowStart, windowEnd)
  const { data: rates } = useRateCalendar(property?.id, windowStart, windowEnd)

  // restricții de sosire/plecare rezolvate pe zi (property-scope ∪ type-scope),
  // pre-calculate o singură dată pe fereastră (O(reguli × zile), nu per celulă)
  const arrivalMaps = useMemo(
    () => resolveArrivalRestrictions(arrivalRules ?? [], windowStart, windowEnd),
    [arrivalRules, windowStart, windowEnd]
  )

  // închiderile property-scope (unit_type_id null) se aplică tuturor camerelor;
  // cele type-scope doar camerelor tipului respectiv.
  const propertyClosures = useMemo(
    () => (closures ?? []).filter((c) => c.unit_type_id === null),
    [closures]
  )
  const closuresByType = useMemo(() => {
    const map = new Map<string, Closure[]>()
    for (const c of closures ?? []) {
      if (!c.unit_type_id) continue
      const list = map.get(c.unit_type_id)
      if (list) list.push(c)
      else map.set(c.unit_type_id, [c])
    }
    return map
  }, [closures])

  // tarif rezolvat per (tip, zi) → pictat în celulele goale. Cheie: `tip|YYYY-MM-DD`.
  const rateByTypeDay = useMemo(() => {
    const map = new Map<string, RateCalendarEntry>()
    for (const r of rates ?? []) map.set(`${r.unit_type_id}|${r.day}`, r)
    return map
  }, [rates])

  // grupare unică pe cameră — evită un filter peste toate rezervările per rând
  const bookingsByUnit = useMemo(() => {
    const map = new Map<string, Booking[]>()
    for (const b of bookings ?? []) {
      if (!b.unit_id) continue
      const list = map.get(b.unit_id)
      if (list) list.push(b)
      else map.set(b.unit_id, [b])
    }
    return map
  }, [bookings])

  const blocksByUnit = useMemo(() => {
    const map = new Map<string, RoomBlock[]>()
    for (const rb of blocks ?? []) {
      const list = map.get(rb.unit_id)
      if (list) list.push(rb)
      else map.set(rb.unit_id, [rb])
    }
    return map
  }, [blocks])

  // label central: luna dacă fereastra stă într-o singură lună calendaristică,
  // altfel intervalul lunilor acoperite (ex. „iul. – aug. 2026")
  const rangeLabel = useMemo(() => {
    const windowEndInclusive = addDays(windowStart, WINDOW_DAYS - 1)
    const start = new Date(`${windowStart}T00:00:00Z`)
    const end = new Date(`${windowEndInclusive}T00:00:00Z`)
    const sameMonth =
      start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth()
    if (sameMonth) {
      return start.toLocaleDateString("ro-RO", { month: "long", year: "numeric", timeZone: "UTC" })
    }
    const sameYear = start.getUTCFullYear() === end.getUTCFullYear()
    const startLabel = start.toLocaleDateString("ro-RO", {
      month: "short", year: sameYear ? undefined : "numeric", timeZone: "UTC",
    })
    const endLabel = end.toLocaleDateString("ro-RO", {
      month: "short", year: "numeric", timeZone: "UTC",
    })
    return `${startLabel} – ${endLabel}`
  }, [windowStart])

  function shiftWindow(deltaDays: number) {
    setWindowStart((s) => addDays(s, deltaDays))
    setTooltip(null)
    setSelection(null)
  }

  function goToToday() {
    setWindowStart(defaultWindowStart())
    setTooltip(null)
    setSelection(null)
  }

  // deschide un tooltip de bară (rezervare/blocaj/închidere/turnover) — anulează
  // orice selecție în curs, ca ele să nu coexiste vizual pe grilă
  function openTooltip(next: TooltipState) {
    setSelection(null)
    setTooltip(next)
  }

  useEffect(() => {
    if (!tooltip && !selection) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setTooltip(null); setSelection(null) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [tooltip, selection])

  // pornește o selecție nouă (ancoră) pe o celulă liberă a unui rând activ;
  // pe celulă ocupată: fără selecție, doar toast cu motivul exact
  function startSelection(unit: Unit, idx: number, reasonMap: Map<number, ObstacleReason>, rect: DOMRect) {
    const reason = reasonMap.get(idx)
    if (reason) {
      toast.error(t(SELECTION_OVERLAP_KEY[reason]))
      setSelection(null)
      return
    }
    gestureWarnedRef.current = false
    setSelection({
      unitId: unit.id, unitName: unit.name, unitTypeId: unit.unit_type_id,
      anchorIdx: idx, start: idx, end: idx, complete: false,
      x: rect.left, y: rect.bottom,
    })
  }

  // tap-tap: primul click liber = ancoră; al doilea click pe ACELAȘI rând = interval
  // complet (popover) — inclusiv al doilea click direct pe ancoră, care finalizează o
  // selecție de 1 noapte; click pe alt rând pornește imediat o ancoră nouă (relativ la
  // selecția anterioară, consistent cu regula „click pe celulă liberă = ancoră").
  // Anularea explicită se face prin Escape sau backdrop-ul popover-ului de selecție.
  function handleCellClick(
    unit: Unit, idx: number, reasonMap: Map<number, ObstacleReason>, e: React.MouseEvent
  ) {
    if (suppressClickRef.current) { suppressClickRef.current = false; return }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()

    if (!selection || selection.unitId !== unit.id || selection.complete) {
      startSelection(unit, idx, reasonMap, rect)
      return
    }
    if (idx === selection.anchorIdx) {
      // al doilea click pe ANCORĂ = finalizează selecția de 1 noapte (nu anulare —
      // altfel selecția de o singură noapte era imposibilă de finalizat prin tap-tap;
      // anularea rămâne posibilă prin Escape / backdrop-ul popover-ului / ancoră nouă)
      setSelection({ ...selection, start: idx, end: idx, complete: true, x: rect.left, y: rect.bottom })
      return
    }
    const clamped = clampToward(reasonMap, selection.anchorIdx, idx)
    if (clamped.hit) toast.error(t(SELECTION_OVERLAP_KEY[clamped.hit]))
    setSelection({ ...selection, start: clamped.start, end: clamped.end, complete: true, x: rect.left, y: rect.bottom })
  }

  // drag cu mouse-ul: pointerdown pe celulă liberă memorează originea; abia la
  // primul pointerenter pe altă celulă pornim efectiv „tragerea" (un simplu click
  // fără mișcare rămâne doar în seama handleCellClick, prin evenimentul click nativ)
  function handleCellPointerDown(
    unit: Unit, idx: number, reasonMap: Map<number, ObstacleReason>, e: React.PointerEvent
  ) {
    if (e.pointerType !== "mouse") return
    if (reasonMap.has(idx)) return
    e.preventDefault() // evită selecția nativă de text la tragere
    pointerOriginRef.current = { unitId: unit.id, idx }
    draggingRef.current = false
  }

  function handleCellPointerEnter(
    unit: Unit, idx: number, reasonMap: Map<number, ObstacleReason>, e: React.PointerEvent
  ) {
    if (e.pointerType !== "mouse") return
    const origin = pointerOriginRef.current
    if (!origin || origin.unitId !== unit.id || !(e.buttons & 1)) return
    if (idx === origin.idx && !draggingRef.current) return

    if (!draggingRef.current) {
      draggingRef.current = true
      gestureWarnedRef.current = false
    }
    const clamped = clampToward(reasonMap, origin.idx, idx)
    if (clamped.hit && !gestureWarnedRef.current) {
      toast.error(t(SELECTION_OVERLAP_KEY[clamped.hit]))
      gestureWarnedRef.current = true
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setSelection({
      unitId: unit.id, unitName: unit.name, unitTypeId: unit.unit_type_id,
      anchorIdx: origin.idx, start: clamped.start, end: clamped.end, complete: false,
      x: rect.left, y: rect.bottom,
    })
  }

  // finalizarea drag-ului se ascultă la nivel de fereastră (nu per celulă), ca
  // eliberarea mouse-ului în afara grilei să nu lase selecția blocată „la mijloc"
  useEffect(() => {
    function onWindowPointerUp(e: PointerEvent) {
      if (e.pointerType !== "mouse" || !draggingRef.current) return
      draggingRef.current = false
      pointerOriginRef.current = null
      suppressClickRef.current = true
      setTimeout(() => { suppressClickRef.current = false }, 0)
      setSelection((sel) => (sel ? { ...sel, complete: true } : sel))
    }
    window.addEventListener("pointerup", onWindowPointerUp)
    return () => window.removeEventListener("pointerup", onWindowPointerUp)
  }, [])

  const today = toISO(new Date())
  const currency = property?.currency ?? ""

  return (
    <div className="space-y-4">
      {/* Header — 2 rânduri pe mobil, 1 rând pe desktop */}
      <div className="space-y-2">
        {/* Rând 1: titlu + buton adaugă */}
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold md:text-2xl">{t("nav.calendar")}</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm" disabled={!property}
              onClick={() => setOverrideOpen(true)}
            >
              <CalendarClock className="h-4 w-4" />
              <span className="hidden sm:inline">{t("pricing.override_action")}</span>
            </Button>
            <Button
              onClick={() => { setBookingInitial(null); setBookingOpen(true) }}
              disabled={!property} size="sm" className="md:hidden"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => { setBookingInitial(null); setBookingOpen(true) }}
              disabled={!property} className="hidden md:flex"
            >
              <Plus className="h-4 w-4" />
              {t("bookings.add")}
            </Button>
          </div>
        </div>
        {/* Rând 2: navigare fereastră (31 zile, pas de o săptămână) */}
        <div className="flex items-center justify-end gap-2">
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="outline" size="sm" className="h-8" onClick={goToToday}>
              {t("calendar.today")}
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftWindow(-7)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-24 text-center text-xs font-medium capitalize sm:min-w-32 sm:text-sm">
              {rangeLabel}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftWindow(7)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {property && (
        <BookingFormDialog
          propertyId={property.id}
          open={bookingOpen}
          onOpenChange={(o) => { setBookingOpen(o); if (!o) setBookingInitial(null) }}
          currency={currency}
          initial={bookingInitial ?? undefined}
        />
      )}

      {/* legendă subtilă pentru culorile din grilă */}
      {units && units.length > 0 && <CalendarLegend />}

      {loadingUnits ? (
        <Skeleton className="h-96 w-full" />
      ) : !units || units.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("unit_types.empty")}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-x-auto py-0">
          <div
            className="grid min-w-[56rem] text-sm"
            style={{
              gridTemplateColumns: `10rem repeat(${WINDOW_DAYS}, minmax(2rem, 1fr))`,
            }}
          >
            {/* header zile */}
            <div className="sticky left-0 z-10 border-b border-r bg-card p-2 font-medium" />
            {Array.from({ length: WINDOW_DAYS }, (_, i) => {
              const day = addDays(windowStart, i)
              const dow = new Date(`${day}T00:00:00Z`).getUTCDay()
              const isWeekend = dow === 0 || dow === 6
              const dayOfMonth = Number(day.slice(8, 10))
              // arătăm abrevierea lunii pe prima celulă a ferestrei și la fiecare
              // schimbare de lună (ziua 1), ca fereastra cross-month să rămână lizibilă
              const monthAbbrev =
                i === 0 || dayOfMonth === 1
                  ? new Date(`${day}T00:00:00Z`).toLocaleDateString("ro-RO", {
                      month: "short", timeZone: "UTC",
                    })
                  : null
              return (
                <div
                  key={i}
                  className={cn(
                    "border-b px-0.5 py-1 text-center text-muted-foreground",
                    isWeekend && "bg-muted/40",
                    day === today && "bg-accent font-semibold text-foreground"
                  )}
                >
                  <div className={cn("text-[9px] uppercase leading-none", isWeekend && "text-foreground/70")}>
                    {dayLabel(dow)}
                  </div>
                  <div className="text-xs leading-tight">
                    {dayOfMonth}
                    {monthAbbrev && (
                      <span className="ml-0.5 lowercase text-muted-foreground/70">{monthAbbrev}</span>
                    )}
                  </div>
                </div>
              )
            })}

            {/* rând per cameră */}
            {units.map((unit) => {
              // setul complet include și rezervări terminate chiar înainte de fereastră
              // (aduse prin padding-ul de fetch) — folosit DOAR pentru turnover.
              const unitBookingsAll = bookingsByUnit.get(unit.id) ?? []
              // bare + ocupare = doar rezervările care ating efectiv fereastra afișată,
              // ca cele dinainte de fereastră să nu deseneze bare/ocupare greșite.
              const unitBookings = unitBookingsAll.filter(
                (b) => b.check_out > windowStart && b.check_in < windowEnd
              )
              const unitBlocks = blocksByUnit.get(unit.id) ?? []
              // închideri aplicabile camerei = property-scope + cele ale tipului ei
              const unitClosures = [
                ...propertyClosures,
                ...(unit.unit_type_id ? closuresByType.get(unit.unit_type_id) ?? [] : []),
              ]
              const unitStatus = (unit.status ?? "active") as UnitStatus
              const isOperational = unitStatus === "active"

              // zilele „ocupate" (rezervare sau blocaj) — acolo nu pictăm tarif.
              // Nopțile ocupate = [check_in, check_out) / [start, end). Indexate 0..WINDOW_DAYS-1
              // (index de celulă, nu zi din lună — fereastra poate traversa două luni).
              const occupiedDays = new Set<number>()
              // motivul exact al ocupării (pentru validarea selecției de nopți pe rând) —
              // închiderile NU intră aici (comerciale, selecția peste ele e permisă),
              // prioritate booking > block > turnover la suprapunere (primul set câștigă)
              const obstacleReason = new Map<number, ObstacleReason>()
              const markRange = (from: string, toEx: string) => {
                const { startIdx, endIdx } = windowIndexRange(windowStart, from, toEx)
                for (let d = startIdx; d < endIdx; d++) occupiedDays.add(d)
              }
              const markReason = (from: string, toEx: string, reason: ObstacleReason) => {
                const { startIdx, endIdx } = windowIndexRange(windowStart, from, toEx)
                for (let d = startIdx; d < endIdx; d++) {
                  occupiedDays.add(d)
                  if (!obstacleReason.has(d)) obstacleReason.set(d, reason)
                }
              }
              for (const b of unitBookings) markReason(b.check_in, b.check_out, "booking")
              for (const rb of unitBlocks) markReason(rb.start_date, rb.end_date, "block")
              for (const c of unitClosures) markRange(c.start_date, c.end_date)

              // pauză de pregătire (turnover): `gap` nopți blocate fizic după fiecare
              // plecare → segmente desenate + nopți marcate ca ocupate (fără tarif pictat)
              const gap = unit.unit_types?.turnover_days ?? 0
              const turnoverSegments =
                gap > 0
                  ? unitBookingsAll
                      .map((b) => ({ id: b.id, from: b.check_out, toEx: addDays(b.check_out, gap) }))
                      // păstrează doar segmentele care chiar intersectează fereastra afișată
                      // (inclusiv spillover dintr-o plecare de dinainte de fereastră)
                      .filter((seg) => seg.from < windowEnd && seg.toEx > windowStart)
                  : []
              for (const seg of turnoverSegments) markReason(seg.from, seg.toEx, "turnover")
              return (
                <div key={unit.id} className="group col-span-full grid grid-cols-subgrid border-b last:border-b-0">
                  {/* click pe cameră = meniu de gestionare (status + blocaje) */}
                  <UnitActionsMenu
                    unitId={unit.id}
                    unitName={unit.name}
                    unitStatus={unitStatus}
                    propertyId={property!.id}
                    onManageBlocks={() =>
                      setBlockTarget({ kind: "single", unitId: unit.id, unitName: unit.name })
                    }
                  >
                    <button className="relative sticky left-0 z-10 border-r bg-card p-2 truncate text-left">
                      {/* hover = strat separat peste conținut, nu înlocuiește fundalul */}
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 bg-foreground/5 opacity-0 transition-opacity group-hover:opacity-100"
                      />
                      <p className="font-medium truncate leading-tight">{unit.name}</p>
                      {unit.unit_types && (
                        <p className="mt-0.5 flex items-center gap-0.5 text-[10px] text-muted-foreground leading-tight truncate">
                          <span className="truncate">{unit.unit_types.name}</span>
                          <span className="mx-0.5 shrink-0">·</span>
                          {/* iconițele bottom-aligned (items-end): adult mai mare, copil mai mic, pe aceeași linie */}
                          <span className="flex shrink-0 items-end gap-0.5">
                            <User className="h-3 w-3 shrink-0" />
                            <span className="shrink-0 leading-none">{unit.unit_types.max_adults}</span>
                            <User className="ml-0.5 h-2.5 w-2.5 shrink-0" />
                            <span className="shrink-0 leading-none">{unit.unit_types.max_children}</span>
                          </span>
                        </p>
                      )}
                      {/* statusul permanent explică celulele hașurate — fără blocuri artificiale */}
                      {!isOperational && (
                        <span className={cn(
                          "mt-1 inline-block rounded border px-1 py-px text-[9px] font-medium leading-tight",
                          UNIT_STATUS_BADGE_CLASS[unitStatus]
                        )}>
                          {t(UNIT_STATUS_LABEL[unitStatus])}
                        </span>
                      )}
                    </button>
                  </UnitActionsMenu>
                  {/* hașura stă pe container (acoperă toată înălțimea rândului,
                      inclusiv când badge-ul îl face mai înalt);
                      celulele au min-h și se întind natural (grid stretch) */}
                  <div
                    className={cn(
                      "relative col-span-full col-start-2 grid",
                      !isOperational && "bg-muted"
                    )}
                    style={{
                      gridTemplateColumns: `repeat(${WINDOW_DAYS}, minmax(2rem, 1fr))`,
                      ...(!isOperational ? { backgroundImage: UNAVAILABLE_STRIPES } : undefined),
                    }}
                  >
                    {Array.from({ length: WINDOW_DAYS }, (_, i) => {
                      const dayIso = addDays(windowStart, i)
                      const rate = unit.unit_type_id
                        ? rateByTypeDay.get(`${unit.unit_type_id}|${dayIso}`)
                        : undefined
                      const showRate = isOperational && !occupiedDays.has(i) && rate
                      // restricții de sosire/plecare: marcaje subtile în colțurile celulei
                      const restr = isOperational
                        ? restrictionFor(arrivalMaps, unit.unit_type_id, dayIso)
                        : { noArrival: false, noDeparture: false }
                      // celulă selectabilă = rând activ + fără obstacol (booking/block/turnover);
                      // închiderile nu blochează selecția, doar server-side/dialogul o semnalează
                      const selectable = isOperational && !obstacleReason.has(i)
                      return (
                        <div
                          key={i}
                          className={cn("relative min-h-12 border-r last:border-r-0", selectable && "cursor-pointer")}
                          onClick={isOperational ? (e) => handleCellClick(unit, i, obstacleReason, e) : undefined}
                          onPointerDown={
                            isOperational ? (e) => handleCellPointerDown(unit, i, obstacleReason, e) : undefined
                          }
                          onPointerEnter={
                            isOperational ? (e) => handleCellPointerEnter(unit, i, obstacleReason, e) : undefined
                          }
                        >
                          {restr.noArrival && (
                            <span
                              title={t("calendar.no_arrival_title")}
                              style={{ borderTopColor: NO_ARRIVAL_COLOR }}
                              className="absolute left-0 top-0 z-[1] h-0 w-0 border-t-[7px] border-r-[7px] border-r-transparent"
                            />
                          )}
                          {restr.noDeparture && (
                            <span
                              title={t("calendar.no_departure_title")}
                              style={{ borderTopColor: NO_DEPARTURE_COLOR }}
                              className="absolute right-0 top-0 z-[1] h-0 w-0 border-t-[7px] border-l-[7px] border-l-transparent"
                            />
                          )}
                          {showRate && (
                            <span
                              className={cn(
                                "pointer-events-none absolute inset-x-0 bottom-0.5 text-center text-[9px] leading-none tabular-nums",
                                RATE_KIND_CLASS[rate.kind] ?? RATE_KIND_CLASS.base
                              )}
                            >
                              {Math.round(rate.rate)}
                            </span>
                          )}
                        </div>
                      )
                    })}
                    {/* selecția de nopți în curs (tap-tap sau drag) — overlay absolut ca
                        barele de dedesubt, dar sub rezervări/blocaje (z-2) și fără să
                        capteze click-uri (pointer-events-none), ca celulele rămân clicabile */}
                    {selection && selection.unitId === unit.id && (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-y-1.5 z-[2] flex items-center justify-center overflow-hidden rounded-md border border-dashed border-primary bg-primary/15 text-[10px] font-medium text-primary"
                        style={{
                          left: `calc(${(selection.start / WINDOW_DAYS) * 100}% + 2px)`,
                          width: `calc(${((selection.end - selection.start + 1) / WINDOW_DAYS) * 100}% - 4px)`,
                        }}
                      >
                        {selection.end - selection.start + 1} {t("bookings.nights")}
                      </div>
                    )}
                    {/* hover = strat propriu sub barele de rezervări/blocaje (z-4/5):
                        umbrește subtil rândul fără să afecteze hașura sau culorile */}
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 z-[3] bg-foreground/5 opacity-0 transition-opacity group-hover:opacity-100"
                    />
                    {/* pauză de pregătire (turnover) — hașură subtilă pe nopțile de curățenie după plecare */}
                    {turnoverSegments.map((seg) => {
                      const { startIdx, endIdx } = windowIndexRange(windowStart, seg.from, seg.toEx)
                      if (endIdx <= startIdx) return null
                      return (
                        <div
                          key={`turnover-${seg.id}`}
                          title={t("calendar.turnover_title")}
                          className="absolute inset-y-1.5 z-[2] flex cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed border-muted-foreground/40 text-muted-foreground/70 transition-opacity hover:opacity-80"
                          style={{
                            left: `calc(${(startIdx / WINDOW_DAYS) * 100}% + 2px)`,
                            width: `calc(${((endIdx - startIdx) / WINDOW_DAYS) * 100}% - 4px)`,
                            backgroundImage: TURNOVER_STRIPES,
                          }}
                          onClick={(e) => {
                            e.stopPropagation()
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                            openTooltip({
                              kind: "turnover", from: seg.from, toEx: seg.toEx,
                              unitName: unit.name, x: rect.left, y: rect.bottom,
                            })
                          }}
                        >
                          <Sparkles className="h-3 w-3 shrink-0" />
                        </div>
                      )
                    })}
                    {/* închideri (stop-sell) — hașură roșiatică cu „Închis", sub blocaje/rezervări */}
                    {unitClosures.map((c) => {
                      const { startIdx, endIdx } = windowIndexRange(windowStart, c.start_date, c.end_date)
                      if (endIdx <= startIdx) return null
                      return (
                        <div
                          key={c.id}
                          title={t("closures.closed_label")}
                          className={cn(
                            "absolute inset-y-1.5 z-[2] flex cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed px-2 text-[10px] font-semibold uppercase tracking-wide transition-opacity hover:opacity-80",
                            CLOSURE_CLASS
                          )}
                          style={{
                            left: `calc(${(startIdx / WINDOW_DAYS) * 100}% + 2px)`,
                            width: `calc(${((endIdx - startIdx) / WINDOW_DAYS) * 100}% - 4px)`,
                            backgroundImage: UNAVAILABLE_STRIPES,
                          }}
                          onClick={(e) => {
                            e.stopPropagation()
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                            openTooltip({ kind: "closure", closure: c, x: rect.left, y: rect.bottom })
                          }}
                        >
                          <span className="truncate">{t("closures.closed_label")}</span>
                        </div>
                      )
                    })}
                    {/* blocaje de disponibilitate — evenimente cu interval, desenate efectiv */}
                    {unitBlocks.map((rb) => {
                      const { startIdx, endIdx } = windowIndexRange(windowStart, rb.start_date, rb.end_date)
                      if (endIdx <= startIdx) return null
                      return (
                        <div
                          key={rb.id}
                          title={blockReasonLabel(rb.reason)}
                          className={cn(
                            "absolute inset-y-1.5 z-[4] flex cursor-pointer items-center overflow-hidden rounded-md border border-dashed px-2 text-xs font-medium transition-opacity hover:opacity-80",
                            blockCalendarClass(rb.reason)
                          )}
                          style={{
                            left: `calc(${(startIdx / WINDOW_DAYS) * 100}% + 2px)`,
                            width: `calc(${((endIdx - startIdx) / WINDOW_DAYS) * 100}% - 4px)`,
                            backgroundImage: BLOCK_STRIPES,
                          }}
                          onClick={(e) => {
                            e.stopPropagation()
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                            openTooltip({ kind: "block", block: rb, x: rect.left, y: rect.bottom })
                          }}
                        >
                          <span className="truncate">{blockReasonLabel(rb.reason)}</span>
                        </div>
                      )
                    })}
                    {unitBookings.map((b) => {
                      const { startIdx, endIdx } = windowIndexRange(windowStart, b.check_in, b.check_out)
                      if (endIdx <= startIdx) return null
                      return (
                        <div
                          key={b.id}
                          title={statusLabel(b.status as BookingStatus)}
                          className={cn(
                            "absolute inset-y-1.5 z-[5] flex cursor-pointer items-center overflow-hidden rounded-md border px-2 text-xs font-medium transition-opacity hover:opacity-80",
                            statusColors[b.status as BookingStatus]
                          )}
                          style={{
                            left: `calc(${(startIdx / WINDOW_DAYS) * 100}% + 2px)`,
                            width: `calc(${((endIdx - startIdx) / WINDOW_DAYS) * 100}% - 4px)`,
                          }}
                          onClick={(e) => {
                            e.stopPropagation()
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                            openTooltip({ kind: "booking", booking: b as Booking, x: rect.left, y: rect.bottom })
                          }}
                        >
                          <span className="truncate">
                            {b.guests?.full_name ?? t("status.blocked")}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {tooltip?.kind === "booking" && (
        <BookingTooltip
          tooltip={tooltip}
          onClose={() => setTooltip(null)}
          currency={currency}
        />
      )}
      {tooltip?.kind === "block" && (
        <BlockTooltip
          tooltip={tooltip}
          unitName={units?.find((u) => u.id === tooltip.block.unit_id)?.name}
          onClose={() => setTooltip(null)}
        />
      )}
      {tooltip?.kind === "turnover" && (
        <TurnoverTooltip tooltip={tooltip} onClose={() => setTooltip(null)} />
      )}
      {tooltip?.kind === "closure" && (
        <ClosureTooltip
          tooltip={tooltip}
          scopeLabel={
            tooltip.closure.unit_type_id
              ? units?.find((u) => u.unit_type_id === tooltip.closure.unit_type_id)?.unit_types?.name
                ?? t("closures.scope_type")
              : t("closures.scope_property")
          }
          onClose={() => setTooltip(null)}
        />
      )}

      {/* popover de acțiune după finalizarea selecției de nopți pe un rând */}
      {selection?.complete && (
        <SelectionPopover
          selection={selection}
          windowStart={windowStart}
          onClose={() => setSelection(null)}
          onBook={() => {
            setBookingInitial({
              unitId: selection.unitId,
              unitTypeId: selection.unitTypeId,
              checkIn: addDays(windowStart, selection.start),
              checkOut: addDays(windowStart, selection.end + 1),
            })
            setBookingOpen(true)
            setSelection(null)
          }}
          onBlock={() => {
            setBlockTarget({
              kind: "single",
              unitId: selection.unitId,
              unitName: selection.unitName,
              initialRange: {
                start: addDays(windowStart, selection.start),
                end: addDays(windowStart, selection.end + 1),
              },
            })
            setSelection(null)
          }}
        />
      )}

      {/* gestionare blocaje pe camera aleasă din meniul de pe rând */}
      {property && (
        <BlockDialog
          propertyId={property.id}
          target={blockTarget}
          onClose={() => setBlockTarget(null)}
        />
      )}

      {/* tarife preferențiale (override) — pe perioadă, toate camerele unui tip */}
      {property && (
        <OverrideDialog
          propertyId={property.id}
          orgId={property.org_id}
          currency={currency}
          open={overrideOpen}
          onClose={() => setOverrideOpen(false)}
        />
      )}
    </div>
  )
}
