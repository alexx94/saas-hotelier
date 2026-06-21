import { createFileRoute } from "@tanstack/react-router"
import { useCurrentProperty } from "@/features/properties/context"
import { RevenueCards } from "@/features/payments/revenue-cards"
import {
  DashboardTodayCards, DashboardOccupancyCards, DashboardBookingCards,
} from "@/features/dashboard/dashboard-cards"
import { t } from "@/lib/i18n"

export const Route = createFileRoute("/_app/property/$propertyId/")({
  component: DashboardPage,
})

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      {children}
    </section>
  )
}

function DashboardPage() {
  const { currentProperty: property } = useCurrentProperty()

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold md:text-2xl">{t("nav.dashboard")}</h1>
        <p className="text-sm text-muted-foreground">{property.name}</p>
      </div>

      <div className="space-y-6">
        <Section title={t("dashboard.section.today")}>
          <DashboardTodayCards propertyId={property.id} />
        </Section>
        <Section title={t("revenue.title")}>
          <RevenueCards propertyId={property.id} />
        </Section>
        <Section title={t("dashboard.section.occupancy")}>
          <DashboardOccupancyCards propertyId={property.id} />
        </Section>
        <Section title={t("dashboard.section.bookings")}>
          <DashboardBookingCards propertyId={property.id} />
        </Section>
      </div>
    </div>
  )
}
