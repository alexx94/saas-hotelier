import {
  Building2, LogIn, LogOut, Users, Gauge, CalendarPlus, CalendarX,
} from "lucide-react"
import { t } from "@/lib/i18n"
import { useOrgDashboardStats } from "./hooks"
import { StatCard } from "./dashboard-cards"
import { Skeleton } from "@/components/ui/skeleton"

const icon = "h-4 w-4"

// „Vizualizare în ansamblu" pe organizație (owner/admin) — agregat peste toate
// proprietățile accesibile. Reutilizează StatCard (un singur loc de redesign).
// `enabled` = gate pe rol din apelant; pe roluri restrânse nici nu se montează.
export function DashboardOrgOverview({
  orgId,
  enabled,
}: {
  orgId: string
  enabled: boolean
}) {
  const { data, isLoading, isError } = useOrgDashboardStats(orgId, enabled)

  if (!enabled || isError) return null
  if (isLoading || !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-28 w-full" />)}
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        icon={<Building2 className={icon} />}
        label={t("dashboard.org_properties")}
        value={data.property_count}
      />
      <StatCard
        icon={<Gauge className={icon} />}
        label={t("dashboard.occupancy_rate")}
        value={`${data.occupancy_pct}%`}
        sub={`${data.occupied_units}/${data.total_units} ${t("dashboard.rooms")}`}
      />
      <StatCard
        icon={<Users className={icon} />}
        label={t("dashboard.in_house_guests")}
        value={data.in_house_guests}
      />
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
        icon={<CalendarPlus className={icon} />}
        label={t("dashboard.bookings_month")}
        value={data.bookings_month}
        sub={
          <span className="inline-flex items-center gap-1">
            <CalendarX className="h-3 w-3" />
            {data.cancellations_month} {t("dashboard.cancellations_short")}
          </span>
        }
      />
    </div>
  )
}
