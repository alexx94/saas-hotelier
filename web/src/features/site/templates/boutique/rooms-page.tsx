import { Link } from "@tanstack/react-router"
import { Users } from "lucide-react"
import { t } from "@/lib/i18n"
import { PhotoCarousel } from "@/features/site/photo-carousel"
import { photosForUnitType, type PublicSite, type PublicSiteUnitType } from "@/features/site/api"
import { useReveal } from "@/features/site/use-reveal"
import type { SiteRoomsPageProps } from "@/features/site/templates/types"

// Pagina „Camere" boutique — toate tipurile, split-uri alternate 50/50 (stil
// camere.html), cu galerie swipe (photo-carousel.tsx) când tipul are mai
// multe poze tag-uite.
export function BoutiqueRoomsPage({ site }: SiteRoomsPageProps) {
  return (
    <div>
      <header className="px-6 pt-32 pb-16 text-center sm:px-10 sm:pt-44" style={{ background: "var(--site-ink)", color: "var(--site-ink-foreground)" }}>
        <p className="site-eyebrow" style={{ color: "color-mix(in oklch, var(--site-ink-foreground) 46%, transparent)" }}>
          {site.property.name}
        </p>
        <h1 className="site-font-display mt-5 text-[clamp(38px,6.2vw,92px)] leading-[1.04]">
          {t("site.rooms.title")}
        </h1>
      </header>

      {site.unit_types.map((unitType, i) => (
        <RoomSplit key={unitType.id} site={site} unitType={unitType} index={i} flip={i % 2 === 1} />
      ))}
    </div>
  )
}

function RoomSplit({
  site, unitType, index, flip,
}: { site: PublicSite; unitType: PublicSiteUnitType; index: number; flip: boolean }) {
  const photos = photosForUnitType(site.photos, unitType.id)
  const description =
    unitType.description?.[site.property.default_locale] ?? unitType.description?.ro ?? null
  const revealRef = useReveal<HTMLDivElement>()

  return (
    <div ref={revealRef} className="site-reveal grid min-h-[78vh] sm:grid-cols-2">
      <div
        className="flex min-h-[64vw] items-center justify-center p-6 sm:min-h-[520px] sm:p-10"
        style={{ order: flip ? 1 : 0, background: "var(--site-bg-alt)" }}
      >
        <PhotoCarousel photos={photos} alt={unitType.name} className="w-full max-w-xl" />
      </div>
      <div
        className="flex flex-col justify-center px-6 py-12 sm:px-16 sm:py-20"
        style={{ order: flip ? 0 : 1, background: flip ? "var(--site-bg-alt)" : "var(--site-bg)" }}
      >
        <div className="site-ghost text-[clamp(72px,10vw,140px)]">{String(index + 1).padStart(2, "0")}</div>
        <h2 className="site-font-display mt-3 text-[clamp(30px,3.4vw,52px)]">{unitType.name}</h2>
        <div
          className="mt-3 flex flex-wrap gap-5 text-[11.5px] tracking-[0.18em] uppercase"
          style={{ color: "var(--site-muted)" }}
        >
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> {unitType.max_adults} {t("occupancy.adults").toLowerCase()}
            {unitType.max_children > 0 && ` · ${unitType.max_children} ${t("occupancy.children").toLowerCase()}`}
          </span>
          {unitType.min_stay > 1 && <span>{t("public.min_nights")} {unitType.min_stay} {t("bookings.nights")}</span>}
        </div>
        {description && (
          <p className="mt-6 max-w-[44ch] text-sm leading-relaxed" style={{ color: "var(--site-muted)" }}>
            {description}
          </p>
        )}
        <div className="mt-7 h-px" style={{ background: "var(--site-border)" }} />
        <p className="mt-7 text-sm">
          {t("site.rooms_teaser.from")}{" "}
          <strong className="site-font-display text-lg" style={{ color: "var(--site-accent)" }}>
            {Number(unitType.base_price).toFixed(0)} {site.property.currency}
          </strong>
          <span style={{ color: "var(--site-muted)" }}> {t("public.per_night")}</span>
        </p>
        <Link
          to="/s/$siteSlug/book" params={{ siteSlug: site.site.slug }}
          search={{ unitTypeId: unitType.id }}
          className="mt-6 inline-flex w-fit items-center gap-3 rounded-[2px] px-8 py-4 text-[13px] tracking-[0.16em] uppercase transition-colors hover:opacity-90"
          style={{ background: "var(--site-accent)", color: "var(--site-accent-foreground)" }}
        >
          {t("site.rooms.book_this")}
        </Link>
      </div>
    </div>
  )
}
