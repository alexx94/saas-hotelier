import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { Menu, X } from "lucide-react"
import type { SiteHeaderProps } from "@/features/site/templates/types"

// Header sticky serene — extras 1:1 din vechiul routes/s/$siteSlug/route.tsx
// (Sprint 10), zero schimbare vizuală. Stare mobile-menu internă (nu mai
// urcă în layout-ul rutei, care azi doar alege ce Header randează).
export function SereneHeader({ site, siteSlug, navLinks }: SiteHeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const visibleLinks = navLinks.filter((l) => l.show)

  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur-sm"
      style={{ background: "color-mix(in oklch, var(--site-bg) 92%, transparent)", borderColor: "var(--site-border)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/s/$siteSlug" params={{ siteSlug }} className="site-font-display text-xl font-semibold">
          {site.property.name}
        </Link>

        <nav className="hidden items-center gap-6 sm:flex">
          {visibleLinks.map((l) => (
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
          {visibleLinks.map((l) => (
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
  )
}
