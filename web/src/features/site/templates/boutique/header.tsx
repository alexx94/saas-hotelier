import { useEffect, useState } from "react"
import { Link } from "@tanstack/react-router"
import { Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SiteHeaderProps } from "@/features/site/templates/types"

// Header boutique — fix, transparent peste hero → solid (frosted) după
// scroll; brand uppercase letter-spaced, nav uppercase mic cu underline
// animat pe activ/hover; mobil = drawer full-screen cu link-uri serif mari.
// Listener de scroll = efect DOM legitim (sync cu API browser, vezi
// HANDOFF §4), nu stare derivată.
export function BoutiqueHeader({ site, siteSlug, navLinks, overDarkTop }: SiteHeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const visibleLinks = navLinks.filter((l) => l.show)
  const lightText = overDarkTop && !scrolled && !mobileOpen

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-40 flex items-center justify-between px-6 py-5 transition-[background,box-shadow] duration-500 sm:px-10",
          scrolled && "shadow-[0_1px_0_var(--site-border)] backdrop-blur-md"
        )}
        style={{ background: scrolled ? "color-mix(in oklch, var(--site-bg) 86%, transparent)" : "transparent" }}
      >
        <Link
          to="/s/$siteSlug" params={{ siteSlug }}
          className="site-font-display text-sm font-medium tracking-[0.28em] uppercase"
          style={{ color: lightText ? "#fff" : "var(--site-fg)" }}
        >
          {site.property.name}
        </Link>

        <nav className="hidden items-center gap-8 sm:flex">
          {visibleLinks.map((l) => (
            <Link
              key={l.to} to={l.to} params={{ siteSlug }}
              className="relative pb-1.5 text-[12.5px] tracking-[0.12em] uppercase transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-px after:origin-left after:scale-x-0 after:bg-current after:transition-transform after:duration-300 hover:after:scale-x-100"
              style={{ color: lightText ? "rgba(255,255,255,0.86)" : "var(--site-fg)" }}
              activeOptions={{ exact: l.to === "/s/$siteSlug" }}
              activeProps={{ className: "after:scale-x-100" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <button
          type="button"
          className="relative z-10 flex h-9 w-9 items-center justify-center sm:hidden"
          style={{ color: lightText ? "#fff" : "var(--site-fg)" }}
          aria-label="menu"
          onClick={() => setMobileOpen((o) => !o)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 flex flex-col justify-center gap-2 px-8"
          style={{ background: "var(--site-bg)" }}
        >
          {visibleLinks.map((l) => (
            <Link
              key={l.to} to={l.to} params={{ siteSlug }}
              className="site-font-display py-2 text-4xl"
              onClick={() => setMobileOpen(false)}
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
