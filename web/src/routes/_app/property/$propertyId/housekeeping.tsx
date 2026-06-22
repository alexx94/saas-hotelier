import { createFileRoute } from "@tanstack/react-router"
import { useCurrentProperty } from "@/features/properties/context"
import { HousekeepingBoard } from "@/features/housekeeping/housekeeping-board"
import { Can } from "@/features/auth/can"
import { t } from "@/lib/i18n"

export const Route = createFileRoute("/_app/property/$propertyId/housekeeping")({
  component: HousekeepingPage,
})

function HousekeepingPage() {
  const { currentProperty: property } = useCurrentProperty()

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold md:text-2xl">{t("nav.housekeeping")}</h1>
        <p className="text-sm text-muted-foreground">{property.name}</p>
      </div>

      <Can
        permission="unit.manage"
        fallback={(
          <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t("housekeeping.forbidden")}
          </p>
        )}
      >
        <HousekeepingBoard propertyId={property.id} />
      </Can>
    </div>
  )
}
