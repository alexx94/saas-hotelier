import { Link } from "@tanstack/react-router"
import { t } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import type { PublicSite } from "@/features/site/api"

// Banner accent final — CTA de rezervare, doar dacă pagina de booking e activă.
export function CtaSection({ site }: { site: PublicSite }) {
  if (!site.site.content.pages.book) return null

  return (
    <section className="px-6 py-16 sm:py-20" style={{ background: "var(--site-accent)" }}>
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-5 text-center">
        <h2 className="site-font-display text-3xl font-semibold sm:text-4xl" style={{ color: "var(--site-accent-foreground)" }}>
          {t("site.cta.title")}
        </h2>
        <Button asChild size="lg" variant="secondary">
          <Link to="/s/$siteSlug/book" params={{ siteSlug: site.site.slug }}>
            {t("site.hero.cta_book")}
          </Link>
        </Button>
      </div>
    </section>
  )
}
