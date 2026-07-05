import { createFileRoute } from "@tanstack/react-router"
import { useCurrentProperty } from "@/features/properties/context"
import { usePropertySite, useUpdatePropertySite } from "@/features/site-builder/hooks"
import { CreateSiteCard } from "@/features/site-builder/create-site-card"
import { SiteHeader } from "@/features/site-builder/site-header"
import { ThemeSelector } from "@/features/site-builder/theme-selector"
import { SiteContentForm } from "@/features/site-builder/site-content-form"
import { PhotosManager } from "@/features/site-builder/photos-manager"
import { Can } from "@/features/auth/can"
import { t } from "@/lib/i18n"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export const Route = createFileRoute("/_app/property/$propertyId/website")({
  component: WebsitePage,
})

function WebsitePage() {
  const { currentProperty: property } = useCurrentProperty()

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold md:text-2xl">{t("nav.website")}</h1>
        <p className="text-sm text-muted-foreground">{property.name}</p>
      </div>

      <Can
        permission="property.edit"
        fallback={(
          <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t("site_builder.forbidden")}
          </p>
        )}
      >
        <WebsiteBuilder propertyId={property.id} />
      </Can>
    </div>
  )
}

function WebsiteBuilder({ propertyId }: { propertyId: string }) {
  const { currentProperty: property } = useCurrentProperty()
  const { data: site, isLoading } = usePropertySite(propertyId)
  const updateSite = useUpdatePropertySite(propertyId)

  if (isLoading) return <Skeleton className="h-64 w-full" />

  if (!site) return <CreateSiteCard property={property} />

  return (
    <div className="space-y-4">
      <SiteHeader site={site} property={property} />

      <Card>
        <CardHeader>
          <CardTitle>{t("site_builder.theme.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ThemeSelector
            value={site.theme}
            onChange={(theme) => updateSite.mutate({ id: site.id, patch: { theme } })}
          />
        </CardContent>
      </Card>

      <SiteContentForm site={site} propertyName={property.name} />

      <PhotosManager propertyId={propertyId} orgId={property.org_id} />
    </div>
  )
}
