import { CalendarDays, CalendarRange, TrendingUp } from "lucide-react"
import { t } from "@/lib/i18n"
import { formatMoney } from "@/lib/money"
import { useRevenueSummary } from "./hooks"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function RevenueCards({ propertyId }: { propertyId: string }) {
  const { data, isLoading } = useRevenueSummary(propertyId)

  if (isLoading || !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <RevenueCard
        icon={<CalendarDays className="h-4 w-4" />}
        label={t("revenue.today")}
        value={formatMoney(data.revenue_today, data.currency)}
      />
      <RevenueCard
        icon={<CalendarRange className="h-4 w-4" />}
        label={t("revenue.month")}
        value={formatMoney(data.revenue_month, data.currency)}
      />
      <RevenueCard
        icon={<TrendingUp className="h-4 w-4" />}
        label={t("revenue.year")}
        value={formatMoney(data.revenue_year, data.currency)}
      />
    </div>
  )
}

function RevenueCard({
  icon, label, value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  )
}
