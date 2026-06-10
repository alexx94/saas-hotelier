import { createFileRoute } from "@tanstack/react-router"
import { t } from "@/lib/i18n"

export const Route = createFileRoute("/_app/app/")({
  component: DashboardPage,
})

function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">{t("nav.dashboard")}</h1>
      <p className="mt-2 text-muted-foreground">
        Bine ai venit! Alege o secțiune din meniu.
      </p>
    </div>
  )
}
