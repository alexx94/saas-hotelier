import { createFileRoute } from "@tanstack/react-router"
import { usePublicSite } from "@/features/site/hooks"
import { resolveSiteTheme } from "@/features/site/themes"
import { SITE_TEMPLATE_COMPONENTS } from "@/features/site/templates"

export const Route = createFileRoute("/s/$siteSlug/")({
  component: SiteLandingPage,
})

// Landing: alege `Landing` din registry-ul templates/ conform temei
// rezolvate — fiecare template decide compoziția + ordinea secțiunilor lui.
function SiteLandingPage() {
  const { siteSlug } = Route.useParams()
  const { data: site } = usePublicSite(siteSlug)

  if (!site) return null

  const { template } = resolveSiteTheme(site.site.theme)
  const T = SITE_TEMPLATE_COMPONENTS[template]

  return <T.Landing site={site} />
}
