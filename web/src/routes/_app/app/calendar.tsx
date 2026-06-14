import { useEffect, useMemo, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { CalendarClock, ChevronLeft, ChevronRight, Plus, User, X } from "lucide-react"
import {
  PropertySelect, usePropertySelection,
} from "@/features/properties/property-select"
import {
  useBlocksInRange, useBookingsInRange, useUnits,
} from "@/features/bookings/hooks"
import type { Booking, BookingStatus, RoomBlock } from "@/features/bookings/api"
import { BookingFormDialog } from "@/features/bookings/booking-form-dialog"
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
import { ConfirmDialog } from "@/components/confirm-dialog"
import { toast } from "sonner"
import { t } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_app/app/calendar")({
  component: CalendarPage,
})

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
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
  const { properties, property, setPropertyId } = usePropertySelection()
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))
  })
  const [open, setOpen] = useState(false)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [blockTarget, setBlockTarget] = useState<
    { kind: "single"; unitId: string; unitName: string } | null
  >(null)

  const monthStart = useMemo(() => toISO(month), [month])
  const monthEnd = useMemo(
    () => toISO(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1))),
    [month]
  )
  const daysInMonth = new Date(
    month.getUTCFullYear(), month.getUTCMonth() + 1, 0
  ).getDate()

  const { data: units, isLoading: loadingUnits } = useUnits(property?.id)
  const { data: bookings } = useBookingsInRange(property?.id, monthStart, monthEnd)
  const { data: blocks } = useBlocksInRange(property?.id, monthStart, monthEnd)
  const { data: rates } = useRateCalendar(property?.id, monthStart, monthEnd)

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

  const monthLabel = month.toLocaleDateString("ro-RO", {
    month: "long", year: "numeric", timeZone: "UTC",
  })

  function shiftMonth(delta: number) {
    setMonth((m) => new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + delta, 1)))
    setTooltip(null)
  }

  useEffect(() => {
    if (!tooltip) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setTooltip(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [tooltip])

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
            <Button onClick={() => setOpen(true)} disabled={!property} size="sm" className="md:hidden">
              <Plus className="h-4 w-4" />
            </Button>
            <Button onClick={() => setOpen(true)} disabled={!property} className="hidden md:flex">
              <Plus className="h-4 w-4" />
              {t("bookings.add")}
            </Button>
          </div>
        </div>
        {/* Rând 2: selector proprietate + navigare lună */}
        <div className="flex items-center gap-2">
          <PropertySelect
            properties={properties}
            value={property?.id}
            onChange={setPropertyId}
            triggerClassName="flex-1 w-full sm:w-56 sm:flex-none"
          />
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftMonth(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-24 text-center text-xs font-medium capitalize sm:min-w-32 sm:text-sm">
              {monthLabel}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftMonth(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {property && (
        <BookingFormDialog
          propertyId={property.id}
          open={open}
          onOpenChange={setOpen}
          currency={currency}
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
              gridTemplateColumns: `10rem repeat(${daysInMonth}, minmax(2rem, 1fr))`,
            }}
          >
            {/* header zile */}
            <div className="sticky left-0 z-10 border-b border-r bg-card p-2 font-medium" />
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = `${monthStart.slice(0, 8)}${String(i + 1).padStart(2, "0")}`
              const dow = new Date(`${day}T00:00:00Z`).getUTCDay()
              const isWeekend = dow === 0 || dow === 6
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
                  <div className="text-xs leading-tight">{i + 1}</div>
                </div>
              )
            })}

            {/* rând per cameră */}
            {units.map((unit) => {
              const unitBookings = bookingsByUnit.get(unit.id) ?? []
              const unitBlocks = blocksByUnit.get(unit.id) ?? []
              const unitStatus = (unit.status ?? "active") as UnitStatus
              const isOperational = unitStatus === "active"

              // zilele „ocupate" (rezervare sau blocaj) — acolo nu pictăm tarif.
              // Nopțile ocupate = [check_in, check_out) / [start, end).
              const occupiedDays = new Set<number>()
              const markRange = (from: string, toEx: string) => {
                const s = from < monthStart ? 1 : Number(from.slice(8, 10))
                const e = toEx >= monthEnd ? daysInMonth : Number(toEx.slice(8, 10)) - 1
                for (let d = s; d <= e; d++) occupiedDays.add(d)
              }
              for (const b of unitBookings) markRange(b.check_in, b.check_out)
              for (const rb of unitBlocks) markRange(rb.start_date, rb.end_date)
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
                      gridTemplateColumns: `repeat(${daysInMonth}, minmax(2rem, 1fr))`,
                      ...(!isOperational ? { backgroundImage: UNAVAILABLE_STRIPES } : undefined),
                    }}
                  >
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      const dayNum = i + 1
                      const dayIso = `${monthStart.slice(0, 8)}${String(dayNum).padStart(2, "0")}`
                      const rate = unit.unit_type_id
                        ? rateByTypeDay.get(`${unit.unit_type_id}|${dayIso}`)
                        : undefined
                      const showRate = isOperational && !occupiedDays.has(dayNum) && rate
                      return (
                        <div key={i} className="relative min-h-12 border-r last:border-r-0">
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
                    {/* hover = strat propriu sub barele de rezervări/blocaje (z-4/5):
                        umbrește subtil rândul fără să afecteze hașura sau culorile */}
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 z-[3] bg-foreground/5 opacity-0 transition-opacity group-hover:opacity-100"
                    />
                    {/* blocaje de disponibilitate — evenimente cu interval, desenate efectiv */}
                    {unitBlocks.map((rb) => {
                      const startDay =
                        rb.start_date < monthStart ? 1 : Number(rb.start_date.slice(8, 10))
                      const endDay =
                        rb.end_date >= monthEnd ? daysInMonth + 1 : Number(rb.end_date.slice(8, 10))
                      return (
                        <div
                          key={rb.id}
                          title={blockReasonLabel(rb.reason)}
                          className={cn(
                            "absolute inset-y-1.5 z-[4] flex cursor-pointer items-center overflow-hidden rounded-md border border-dashed px-2 text-xs font-medium transition-opacity hover:opacity-80",
                            blockCalendarClass(rb.reason)
                          )}
                          style={{
                            left: `calc(${((startDay - 1) / daysInMonth) * 100}% + 2px)`,
                            width: `calc(${((endDay - startDay) / daysInMonth) * 100}% - 4px)`,
                            backgroundImage: BLOCK_STRIPES,
                          }}
                          onClick={(e) => {
                            e.stopPropagation()
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                            setTooltip({ kind: "block", block: rb, x: rect.left, y: rect.bottom })
                          }}
                        >
                          <span className="truncate">{blockReasonLabel(rb.reason)}</span>
                        </div>
                      )
                    })}
                    {unitBookings.map((b) => {
                      const startDay =
                        b.check_in < monthStart
                          ? 1
                          : Number(b.check_in.slice(8, 10))
                      const endDay =
                        b.check_out >= monthEnd
                          ? daysInMonth + 1
                          : Number(b.check_out.slice(8, 10))
                      return (
                        <div
                          key={b.id}
                          title={statusLabel(b.status as BookingStatus)}
                          className={cn(
                            "absolute inset-y-1.5 z-[5] flex cursor-pointer items-center overflow-hidden rounded-md border px-2 text-xs font-medium transition-opacity hover:opacity-80",
                            statusColors[b.status as BookingStatus]
                          )}
                          style={{
                            left: `calc(${((startDay - 1) / daysInMonth) * 100}% + 2px)`,
                            width: `calc(${((endDay - startDay) / daysInMonth) * 100}% - 4px)`,
                          }}
                          onClick={(e) => {
                            e.stopPropagation()
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                            setTooltip({ kind: "booking", booking: b as Booking, x: rect.left, y: rect.bottom })
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
