import { Link } from "@tanstack/react-router"
import { t } from "@/lib/i18n"
import type { PublicSite } from "@/features/site/api"

// Bandă finală (--site-ink) — tipografie display supradimensionată + buton
// light spre pagina de rezervare. Gated `pages.book`.
export function BoutiqueCtaSection({ site }: { site: PublicSite }) {
  if (!site.site.content.pages.book) return null

  return (
    <section
      className="px-6 py-24 text-center sm:px-10 sm:py-32"
      style={{ background: "var(--site-ink)", color: "var(--site-ink-foreground)" }}
    >
      <p className="site-eyebrow" style={{ color: "color-mix(in oklch, var(--site-ink-foreground) 44%, transparent)" }}>
        {t("site.cta.title")}
      </p>
      <h2 className="site-font-display mt-6 text-[clamp(40px,7vw,108px)] leading-[1]">
        {site.property.name}
      </h2>
      <Link
        to="/s/$siteSlug/book" params={{ siteSlug: site.site.slug }}
        className="mt-11 inline-flex items-center gap-3 rounded-[2px] px-9 py-4 text-[13px] tracking-[0.16em] uppercase transition-colors hover:opacity-90"
        style={{ background: "var(--site-bg)", color: "var(--site-ink)" }}
      >
        {t("site.hero.cta_book")}
      </Link>
    </section>
  )
}
