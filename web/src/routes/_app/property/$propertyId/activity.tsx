import { createFileRoute } from "@tanstack/react-router"
import { ActivityFeed } from "@/features/audit/activity-feed"
import { Can } from "@/features/auth/can"
import { t } from "@/lib/i18n"
import { Card, CardContent } from "@/components/ui/card"

export const Route = createFileRoute("/_app/property/$propertyId/activity")({
  component: ActivityPage,
})

function ActivityPage() {
  const { propertyId } = Route.useParams()
  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl font-semibold md:text-2xl">{t("activity.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("activity.subtitle")}</p>
      </div>
      <Can
        permission="audit.view"
        fallback={
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {t("activity.no_access")}
            </CardContent>
          </Card>
        }
      >
        <ActivityFeed propertyId={propertyId} />
      </Can>
    </div>
  )
}
