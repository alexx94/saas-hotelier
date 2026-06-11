import { useEffect, useMemo, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { ChevronLeft, ChevronRight, Plus, Users, X } from "lucide-react"
import {
  PropertySelect, usePropertySelection,
} from "@/features/properties/property-select"
import {
  useBookingsInRange, useUnits,
} from "@/features/bookings/hooks"
import type { Booking, BookingStatus } from "@/features/bookings/api"
import { BookingFormDialog } from "@/features/bookings/booking-form-dialog"
import { statusColors, StatusBadge, statusLabel } from "@/features/bookings/status-badge"
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

// ─── tooltip rezervare ────────────────────────────────────────────────────────

type TooltipState = { booking: Booking; x: number; y: number }

function BookingTooltip({
  tooltip,
  onClose,
  currency,
}: {
  tooltip: TooltipState
  onClose: () => void
  currency: string
}) {
  const { booking: b } = tooltip
  const nights = Math.round(
    (new Date(b.check_out).getTime() - new Date(b.check_in).getTime()) / 86400000
  )

  const TOOLTIP_W = 288
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024
  const vh = typeof window !== "undefined" ? window.innerHeight : 768

  const left = Math.max(8, Math.min(tooltip.x, vw - TOOLTIP_W - 8))
  const top = tooltip.y + 260 > vh
    ? Math.max(8, tooltip.y - 270)
    : tooltip.y + 8

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

// ─── pagina calendar ──────────────────────────────────────────────────────────

function CalendarPage() {
  const { properties, property, setPropertyId } = usePropertySelection()
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))
  })
  const [open, setOpen] = useState(false)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

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
          <Button onClick={() => setOpen(true)} disabled={!property} size="sm" className="md:hidden">
            <Plus className="h-4 w-4" />
          </Button>
          <Button onClick={() => setOpen(true)} disabled={!property} className="hidden md:flex">
            <Plus className="h-4 w-4" />
            {t("bookings.add")}
          </Button>
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
              return (
                <div
                  key={i}
                  className={cn(
                    "border-b p-1 text-center text-xs text-muted-foreground",
                    day === today && "bg-accent font-semibold text-foreground"
                  )}
                >
                  {i + 1}
                </div>
              )
            })}

            {/* rând per cameră */}
            {units.map((unit) => {
              const unitBookings = bookingsByUnit.get(unit.id) ?? []
              return (
                <div key={unit.id} className="col-span-full grid grid-cols-subgrid border-b last:border-b-0">
                  <div className="sticky left-0 z-10 border-r bg-card p-2 truncate">
                    <p className="font-medium truncate leading-tight">{unit.name}</p>
                    {unit.unit_types && (
                      <p className="mt-0.5 flex items-center gap-0.5 text-[10px] text-muted-foreground leading-tight truncate">
                        <span className="truncate">{unit.unit_types.name}</span>
                        <span className="mx-0.5 shrink-0">·</span>
                        <Users className="h-2.5 w-2.5 shrink-0" />
                        <span className="shrink-0">{unit.unit_types.capacity}</span>
                      </p>
                    )}
                  </div>
                  <div
                    className="relative col-span-full col-start-2 grid"
                    style={{
                      gridTemplateColumns: `repeat(${daysInMonth}, minmax(2rem, 1fr))`,
                    }}
                  >
                    {Array.from({ length: daysInMonth }, (_, i) => (
                      <div key={i} className="h-12 border-r last:border-r-0" />
                    ))}
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
                            setTooltip({ booking: b as Booking, x: rect.left, y: rect.bottom })
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

      {tooltip && (
        <BookingTooltip
          tooltip={tooltip}
          onClose={() => setTooltip(null)}
          currency={currency}
        />
      )}
    </div>
  )
}
