import { Link } from "@tanstack/react-router"
import { t } from "@/lib/i18n"
import { heroPhoto, sitePhotoUrl, type PublicSite } from "@/features/site/api"

// Hero full-viewport (mereu randat) — poza hero cu Ken Burns lent (fallback
// gradient temat dacă nu există), overlay jos pentru lizibilitate, eyebrow
// (oraș/țară) + titlu display serif mare + subtitlu + CTA-uri „Camere"/„Rezervă".
export function BoutiqueHeroSection({ site }: { site: PublicSite }) {
  const photo = heroPhoto(site.photos)
  const title = site.site.content.hero.title ?? site.property.name
  const subtitle =
    site.site.content.hero.subtitle ??
    [site.property.city, site.property.country].filter(Boolean).join(", ")
  const eyebrow = [site.property.city, site.property.country].filter(Boolean).join(" · ")
  const showBook = site.site.content.pages.book
  const showRooms = site.site.content.pages.rooms

  return (
    <section className="relative flex min-h-svh items-end overflow-hidden">
      {photo ? (
        <img
          src={sitePhotoUrl(photo.storage_path)}
          alt={photo.alt ?? title}
          className="site-kenburns absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0" style={{ background: "var(--site-hero-fallback)" }} />
      )}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(20,19,16,0.42) 0%, rgba(20,19,16,0.05) 30%, rgba(20,19,16,0.12) 62%, rgba(20,19,16,0.72) 100%)",
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-16 text-white sm:px-10 sm:pb-24">
        {eyebrow && (
          <p className="site-eyebrow" style={{ color: "rgba(255,255,255,0.82)" }}>
            {eyebrow}
          </p>
        )}
        <h1 className="site-font-display mt-5 max-w-[16ch] text-[clamp(46px,9vw,132px)] leading-[0.98] text-white">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-6 max-w-[46ch] text-base font-light text-white/86 sm:text-lg">{subtitle}</p>
        )}
        <div className="mt-9 flex flex-wrap gap-4">
          {showBook && (
            <Link
              to="/s/$siteSlug/book" params={{ siteSlug: site.site.slug }}
              className="inline-flex items-center gap-3 rounded-[2px] px-8 py-4 text-[13px] tracking-[0.16em] uppercase transition-colors hover:opacity-90"
              style={{ background: "var(--site-accent)", color: "var(--site-accent-foreground)" }}
            >
              {t("site.hero.cta_book")}
            </Link>
          )}
          {showRooms && (
            <Link
              to="/s/$siteSlug/rooms" params={{ siteSlug: site.site.slug }}
              className="inline-flex items-center gap-3 rounded-[2px] border px-8 py-4 text-[13px] tracking-[0.16em] text-white uppercase backdrop-blur-[2px] transition-colors hover:bg-white hover:text-[var(--site-ink)]"
              style={{ borderColor: "rgba(255,255,255,0.55)" }}
            >
              {t("site.hero.cta_rooms")}
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}
