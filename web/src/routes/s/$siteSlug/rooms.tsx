import { createFileRoute } from "@tanstack/react-router"
import { usePublicSite } from "@/features/site/hooks"
import { resolveSiteTheme } from "@/features/site/themes"
import { SITE_TEMPLATE_COMPONENTS } from "@/features/site/templates"

export const Route = createFileRoute("/s/$siteSlug/rooms")({
  component: SiteRoomsPage,
})

function SiteRoomsPage() {
  const { siteSlug } = Route.useParams()
  const { data: site } = usePublicSite(siteSlug)

  if (!site) return null

  const { template } = resolveSiteTheme(site.site.theme)
  const T = SITE_TEMPLATE_COMPONENTS[template]

  return <T.RoomsPage site={site} siteSlug={siteSlug} />
}
