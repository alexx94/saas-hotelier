import { Link } from "@tanstack/react-router"
import { BedDouble } from "lucide-react"
import { t } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { heroPhoto, sitePhotoUrl, type PublicSite } from "@/features/site/api"

// Hero full-width (~70vh): poza generală cu sort_order cel mai mic ca fundal,
// overlay gradient pentru lizibilitate text; fără poză → fallback-ul temat
// (gradient + icon), niciodată gri de placeholder.
export function HeroSection({ site }: { site: PublicSite }) {
  const photo = heroPhoto(site.photos)
  const title = site.site.content.hero.title ?? site.property.name
  const subtitle =
    site.site.content.hero.subtitle ??
    [site.property.city, site.property.country].filter(Boolean).join(", ")

  const showRooms = site.site.content.pages.rooms
  const showBook = site.site.content.pages.book

  return (
    <section className="relative flex min-h-[70vh] items-center justify-center overflow-hidden">
      {photo ? (
        <img
          src={sitePhotoUrl(photo.storage_path)}
          alt={photo.alt ?? title}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: "var(--site-hero-fallback)" }}
        >
          <BedDouble className="h-24 w-24 text-white/20" strokeWidth={1} />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />

      <div className="relative z-10 mx-auto max-w-3xl px-6 py-24 text-center text-white">
        <h1 className="site-font-display text-4xl leading-tight font-semibold sm:text-5xl md:text-6xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-4 text-lg text-white/90 sm:text-xl">{subtitle}</p>
        )}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {showBook && (
            <Button
              asChild size="lg"
              className="border-0"
              style={{ background: "var(--site-accent)", color: "var(--site-accent-foreground)" }}
            >
              <Link to="/s/$siteSlug/book" params={{ siteSlug: site.site.slug }}>
                {t("site.hero.cta_book")}
              </Link>
            </Button>
          )}
          {showRooms && (
            <Button
              asChild size="lg" variant="outline"
              className="border-white/60 bg-white/10 text-white hover:bg-white/20"
            >
              <Link to="/s/$siteSlug/rooms" params={{ siteSlug: site.site.slug }}>
                {t("site.hero.cta_rooms")}
              </Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
