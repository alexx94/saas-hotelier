import {
  LogIn, LogOut, Users, Gauge, BedDouble, DoorOpen,
  CalendarPlus, CalendarRange, CalendarX,
} from "lucide-react"
import { t } from "@/lib/i18n"
import { useDashboardStats } from "./hooks"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

// Card de metrică reutilizabil — vizual aliniat cu RevenueCard (payments/).
// La redesign se schimbă doar aici, restul rămâne neatins.
export function StatCard({
  icon, label, value, sub,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{value}</p>
        {sub != null && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
}

function CardsSkeleton({ count }: { count: number }) {
  return (
    <CardGrid>
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} className="h-28 w-full" />)}
    </CardGrid>
  )
}

const icon = "h-4 w-4"

// „Astăzi": sosiri, plecări, oaspeți în casă, grad de ocupare.
export function DashboardTodayCards({ propertyId }: { propertyId: string }) {
  const { data, isLoading } = useDashboardStats(propertyId)
  if (isLoading || !data) return <CardsSkeleton count={4} />

  return (
    <CardGrid>
      <StatCard
        icon={<LogIn className={icon} />}
        label={t("dashboard.arrivals_today")}
        value={data.arrivals_today}
      />
      <StatCard
        icon={<LogOut className={icon} />}
        label={t("dashboard.departures_today")}
        value={data.departures_today}
      />
      <StatCard
        icon={<Users className={icon} />}
        label={t("dashboard.in_house_guests")}
        value={data.in_house_guests}
      />
      <StatCard
        icon={<Gauge className={icon} />}
        label={t("dashboard.occupancy_rate")}
        value={`${data.occupancy_pct}%`}
        sub={`${data.occupied_units}/${data.total_units} ${t("dashboard.rooms")}`}
      />
    </CardGrid>
  )
}

// „Ocupare": camere ocupate / disponibile (din total).
export function DashboardOccupancyCards({ propertyId }: { propertyId: string }) {
  const { data, isLoading } = useDashboardStats(propertyId)
  if (isLoading || !data) return <CardsSkeleton count={2} />

  const total = `${data.total_units} ${t("dashboard.rooms")}`
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <StatCard
        icon={<BedDouble className={icon} />}
        label={t("dashboard.occupied_units")}
        value={data.occupied_units}
        sub={total}
      />
      <StatCard
        icon={<DoorOpen className={icon} />}
        label={t("dashboard.available_units")}
        value={data.available_units}
        sub={total}
      />
    </div>
  )
}

// „Rezervări": volum lună / an + anulări lună.
export function DashboardBookingCards({ propertyId }: { propertyId: string }) {
  const { data, isLoading } = useDashboardStats(propertyId)
  if (isLoading || !data) return <CardsSkeleton count={3} />

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard
        icon={<CalendarPlus className={icon} />}
        label={t("dashboard.bookings_month")}
        value={data.bookings_month}
      />
      <StatCard
        icon={<CalendarRange className={icon} />}
        label={t("dashboard.bookings_year")}
        value={data.bookings_year}
      />
      <StatCard
        icon={<CalendarX className={icon} />}
        label={t("dashboard.cancellations_month")}
        value={data.cancellations_month}
      />
    </div>
  )
}
