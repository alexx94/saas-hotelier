import { createFileRoute } from "@tanstack/react-router"
import {
  PropertySelect, usePropertySelection,
} from "@/features/properties/property-select"
import { RevenueCards } from "@/features/payments/revenue-cards"
import { t } from "@/lib/i18n"
import { Card, CardContent } from "@/components/ui/card"

export const Route = createFileRoute("/_app/app/")({
  component: DashboardPage,
})

function DashboardPage() {
  const { properties, property, setPropertyId } = usePropertySelection()

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <h1 className="text-xl font-semibold md:text-2xl">{t("nav.dashboard")}</h1>
        <PropertySelect
          properties={properties}
          value={property?.id}
          onChange={setPropertyId}
          triggerClassName="w-full sm:w-56"
        />
      </div>

      {property ? (
        <>
          <h2 className="text-sm font-medium text-muted-foreground">{t("revenue.title")}</h2>
          <RevenueCards propertyId={property.id} />
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("properties.empty")}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
