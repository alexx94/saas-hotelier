import { toast } from "sonner"
import { ExternalLink } from "lucide-react"
import { Link } from "@tanstack/react-router"
import type { Property } from "@/features/properties/api"
import { useUpdatePropertySite } from "./hooks"
import type { PropertySite } from "./api"
import { t } from "@/lib/i18n"
import { errorMessage } from "@/lib/errors"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"

export function SiteHeader({
  site,
  property,
}: {
  site: PropertySite
  property: Property
}) {
  const updateSite = useUpdatePropertySite(property.id)

  async function toggleEnabled() {
    try {
      await updateSite.mutateAsync({ id: site.id, patch: { is_enabled: !site.is_enabled } })
      toast.success(t("site_builder.header.status_updated"))
    } catch (e) {
      toast.error(errorMessage(e) || t("common.error"))
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Switch
              checked={site.is_enabled}
              disabled={updateSite.isPending}
              onCheckedChange={toggleEnabled}
              id="site-enabled"
            />
            <Label htmlFor="site-enabled" className="cursor-pointer">
              {site.is_enabled ? t("site_builder.header.enabled") : t("site_builder.header.disabled")}
            </Label>
          </div>
          <Button variant="outline" size="sm" disabled={!site.is_enabled} asChild={site.is_enabled}>
            {site.is_enabled ? (
              <a href={`/s/${site.slug}`} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                {t("site_builder.header.view_site")}
              </a>
            ) : (
              <span>
                <ExternalLink className="h-4 w-4" />
                {t("site_builder.header.view_site")}
              </span>
            )}
          </Button>
        </div>

        {!property.is_published && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <span>{t("site_builder.header.unpublished_warning")}</span>
            <Button variant="outline" size="sm" asChild>
              <Link to="/property/$propertyId/settings" params={{ propertyId: property.id }}>
                {t("site_builder.header.go_to_settings")}
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
