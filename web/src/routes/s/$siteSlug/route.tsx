import { useEffect } from "react"
import { createFileRoute, Link, notFound, Outlet, useLocation } from "@tanstack/react-router"
import { CalendarCheck } from "lucide-react"
import { siteKeys, usePublicSite } from "@/features/site/hooks"
import { fetchPublicSite } from "@/features/site/api"
import { resolveSiteTheme } from "@/features/site/themes"
import { SITE_TEMPLATE_COMPONENTS } from "@/features/site/templates"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

// Layout-ul site-ului public: precarcă site-ul (404 elegant dacă nu există/nu
// e vizibil), rezolvă template+paletă și randează Header/Footer din registry-ul
// de componente per template — restul (beforeLoad/notFound/document.title/CTA
// plutitor) e partajat, indiferent de template.
export const Route = createFileRoute("/s/$siteSlug")({
  beforeLoad: async ({ context, params }) => {
    const site = await context.queryClient.ensureQueryData({
      queryKey: siteKeys.bySlug(params.siteSlug),
      queryFn: () => fetchPublicSite(params.siteSlug),
    })
    if (!site) throw notFound()
  },
  component: SiteLayout,
  notFoundComponent: SiteNotFound,
})

function SiteNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[oklch(0.98_0.012_85)] px-6 text-center">
      <h1 className="site-font-display text-3xl font-semibold text-[oklch(0.24_0.02_50)]">
        {t("site.not_found.title")}
      </h1>
      <p className="text-[oklch(0.5_0.03_55)]">{t("site.not_found.subtitle")}</p>
    </div>
  )
}

function SiteLayout() {
  const { siteSlug } = Route.useParams()
  const { data: site } = usePublicSite(siteSlug)
  const { pathname } = useLocation()
  const isBookPage = pathname.endsWith("/book")
  const isRoomsPage = pathname.endsWith("/rooms")
  // Doar landing (poza de hero) și pagina de camere (banda --site-ink) au un
  // fundal întunecat sub headerul fix la scroll=0; pagina de rezervare
  // pornește direct pe fundalul deschis al temei, deci headerul nu trebuie
  // să treacă pe text deschis la culoare acolo (altfel devine ilizibil).
  const overDarkTop = !isBookPage

  // document.title per pagină — efect DOM nativ (sync cu sistem non-React),
  // nu stare derivată; vezi HANDOFF §4. Hook-ul trebuie apelat necondiționat
  // (înainte de early return-ul de mai jos).
  useEffect(() => {
    if (!site) return
    const suffix = isBookPage
      ? ` · ${t("site.nav.book")}`
      : isRoomsPage
        ? ` · ${t("site.nav.rooms")}`
        : ""
    document.title = `${site.property.name}${suffix}`
  }, [site, isBookPage, isRoomsPage])

  // beforeLoad garantează site != null la montare (precărcat sau redirect la notFound)
  if (!site) return null

  const { template, palette } = resolveSiteTheme(site.site.theme)
  const T = SITE_TEMPLATE_COMPONENTS[template]
  const { pages } = site.site.content

  const navLinks = [
    { to: "/s/$siteSlug", label: t("site.nav.home"), show: true },
    { to: "/s/$siteSlug/rooms", label: t("site.nav.rooms"), show: pages.rooms },
    { to: "/s/$siteSlug/book", label: t("site.nav.book"), show: pages.book },
  ]

  return (
    <div data-site-template={template} data-site-palette={palette} className="min-h-screen">
      <T.Header site={site} siteSlug={siteSlug} navLinks={navLinks} overDarkTop={overDarkTop} />

      <main>
        <Outlet />
      </main>

      <T.Footer site={site} />

      {pages.book && !isBookPage && (
        <Button
          asChild size="lg"
          className={cn("fixed right-5 bottom-5 z-50 rounded-full border-0 shadow-lg")}
          style={{ background: "var(--site-accent)", color: "var(--site-accent-foreground)" }}
        >
          <Link to="/s/$siteSlug/book" params={{ siteSlug }}>
            <CalendarCheck className="h-4 w-4" />
            {t("site.nav.book")}
          </Link>
        </Button>
      )}
    </div>
  )
}
