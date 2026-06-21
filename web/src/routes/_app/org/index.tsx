import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Building2, Plus } from "lucide-react"
import { useMyOrganizations } from "@/features/organizations/hooks"
import { t } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

// Panou „organizațiile tale". Accesibil oricui e logat (inclusiv viitorii guests,
// care pur și simplu nu vor avea organizații aici). NU forțează onboarding și NU
// auto-intră — e punctul din care alegi o organizație sau, dacă n-ai niciuna,
// creezi una. Pe viitor: invitații primite.
export const Route = createFileRoute("/_app/org/")({
  component: OrgSelectPage,
})

function OrgSelectPage() {
  const navigate = useNavigate()
  const { data: orgs, isLoading } = useMyOrganizations()

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold md:text-2xl">{t("org.select_title")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("org.select_subtitle")}</p>
        </div>
        {/* creare disponibilă mereu discret; empty-state o scoate în față */}
        {(orgs?.length ?? 0) > 0 && (
          <Button variant="outline" size="sm" onClick={() => navigate({ to: "/onboarding" })}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t("org.create")}</span>
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : !orgs || orgs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Building2 className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("org.empty")}</p>
            <Button onClick={() => navigate({ to: "/onboarding" })}>
              <Plus className="h-4 w-4" />
              {t("org.create")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {orgs.map((o) => (
            <button
              key={o.id}
              onClick={() => navigate({ to: "/org/$orgId", params: { orgId: o.id } })}
              className="text-left"
            >
              <Card className="h-full transition-colors hover:bg-accent/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{o.name}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  {o.role === "owner" ? t("org.role.owner") : t("org.role.member")}
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
