import { useEffect, useState } from "react"
import { createFileRoute, Link, notFound, Outlet, useLocation } from "@tanstack/react-router"
import { CalendarCheck, Mail, Menu, Phone, X } from "lucide-react"
import { siteKeys, usePublicSite } from "@/features/site/hooks"
import { fetchPublicSite } from "@/features/site/api"
import { resolveSiteTheme } from "@/features/site/themes"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

// Layout-ul site-ului public: precarcă site-ul (404 elegant dacă nu există/nu
// e vizibil), aplică tema pe wrapper, randează header sticky + footer +
// buton plutitor de rezervare pe toate paginile copil.
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
  const [mobileOpen, setMobileOpen] = useState(false)
  const { pathname } = useLocation()
  const isBookPage = pathname.endsWith("/book")
  const isRoomsPage = pathname.endsWith("/rooms")

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

  const theme = resolveSiteTheme(site.site.theme)
  const { pages, contact } = site.site.content

  const navLinks = [
    { to: "/s/$siteSlug", label: t("site.nav.home"), show: true },
    { to: "/s/$siteSlug/rooms", label: t("site.nav.rooms"), show: pages.rooms },
    { to: "/s/$siteSlug/book", label: t("site.nav.book"), show: pages.book },
  ] as const

  return (
    <div data-site-theme={theme} className="min-h-screen">
      <header
        className="sticky top-0 z-40 border-b backdrop-blur-sm"
        style={{ background: "color-mix(in oklch, var(--site-bg) 92%, transparent)", borderColor: "var(--site-border)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link
            to="/s/$siteSlug" params={{ siteSlug }}
            className="site-font-display text-xl font-semibold"
          >
            {site.property.name}
          </Link>

          <nav className="hidden items-center gap-6 sm:flex">
            {navLinks.filter((l) => l.show).map((l) => (
              <Link
                key={l.to} to={l.to} params={{ siteSlug }}
                className="text-sm font-medium transition-colors hover:opacity-70"
                activeOptions={{ exact: l.to === "/s/$siteSlug" }}
                activeProps={{ style: { color: "var(--site-accent)" } }}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-md sm:hidden"
            aria-label="menu"
            onClick={() => setMobileOpen((o) => !o)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileOpen && (
          <nav className="flex flex-col gap-1 border-t px-6 py-3 sm:hidden" style={{ borderColor: "var(--site-border)" }}>
            {navLinks.filter((l) => l.show).map((l) => (
              <Link
                key={l.to} to={l.to} params={{ siteSlug }}
                className="rounded-md px-2 py-2 text-sm font-medium"
                onClick={() => setMobileOpen(false)}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="border-t px-6 py-12" style={{ borderColor: "var(--site-border)", background: "var(--site-bg-alt)" }}>
        <div className="mx-auto flex max-w-6xl flex-col gap-4 text-sm sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="site-font-display text-lg font-semibold">{site.property.name}</p>
            {(site.property.address || site.property.city) && (
              <p className="mt-1" style={{ color: "var(--site-muted)" }}>
                {[site.property.address, site.property.city].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
          {contact.enabled && (site.site.contact_phone || site.site.contact_email) && (
            <div className="space-y-1.5">
              {site.site.contact_phone && (
                <p className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" /> {site.site.contact_phone}
                </p>
              )}
              {site.site.contact_email && (
                <p className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" /> {site.site.contact_email}
                </p>
              )}
            </div>
          )}
        </div>
        <p className="mx-auto mt-8 max-w-6xl text-xs" style={{ color: "var(--site-muted)" }}>
          © {new Date().getFullYear()} {site.property.name}
        </p>
      </footer>

      {pages.book && !isBookPage && (
        <Button
          asChild size="lg"
          className={cn(
            "fixed right-5 bottom-5 z-50 rounded-full border-0 shadow-lg"
          )}
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
