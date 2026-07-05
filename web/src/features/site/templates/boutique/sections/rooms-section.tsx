import { Link } from "@tanstack/react-router"
import { Users } from "lucide-react"
import { t } from "@/lib/i18n"
import {
  photosForUnitType, sitePhotoUrl, type PublicSite, type PublicSiteUnitType,
} from "@/features/site/api"
import { useReveal } from "@/features/site/use-reveal"

// Teaser camere pe landing: split-uri alternate 50/50 (stil camere.html),
// primele `rooms_teaser.count` tipuri; link „Vezi toate camerele" dacă
// pagina Camere e activă. Gated `rooms_teaser.enabled`.
export function BoutiqueRoomsSection({ site }: { site: PublicSite }) {
  if (!site.site.content.rooms_teaser.enabled) return null
  if (site.unit_types.length === 0) return null

  const count = site.site.content.rooms_teaser.count
  const items = site.unit_types.slice(0, count)
  const showRoomsPage = site.site.content.pages.rooms

  return (
    <section>
      {items.map((unitType, i) => (
        <RoomSplit key={unitType.id} site={site} unitType={unitType} index={i} flip={i % 2 === 1} />
      ))}

      {showRoomsPage && (
        <div className="flex justify-center py-16">
          <Link
            to="/s/$siteSlug/rooms" params={{ siteSlug: site.site.slug }}
            className="border-b pb-1.5 text-[13px] tracking-[0.16em] uppercase transition-colors hover:opacity-70"
            style={{ borderColor: "var(--site-border)" }}
          >
            {t("site.rooms_teaser.see_all")}
          </Link>
        </div>
      )}
    </section>
  )
}

function RoomSplit({
  site, unitType, index, flip,
}: { site: PublicSite; unitType: PublicSiteUnitType; index: number; flip: boolean }) {
  const photo = photosForUnitType(site.photos, unitType.id)[0] ?? null
  const revealRef = useReveal<HTMLDivElement>()

  return (
    <div ref={revealRef} className="site-reveal grid min-h-[78vh] sm:grid-cols-2">
      <div
        className="relative min-h-[64vw] overflow-hidden sm:min-h-[520px]"
        style={{ order: flip ? 1 : 0, background: "var(--site-card-fallback)" }}
      >
        {photo && (
          <img
            src={sitePhotoUrl(photo.storage_path)}
            alt={photo.alt ?? unitType.name}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </div>
      <div
        className="flex flex-col justify-center px-6 py-12 sm:px-16 sm:py-20"
        style={{ order: flip ? 0 : 1, background: flip ? "var(--site-bg-alt)" : "var(--site-bg)" }}
      >
        <div className="site-ghost text-[clamp(72px,10vw,140px)]">{String(index + 1).padStart(2, "0")}</div>
        <h3 className="site-font-display mt-3 text-[clamp(30px,3.4vw,52px)]">{unitType.name}</h3>
        <div
          className="mt-3 flex flex-wrap gap-5 text-[11.5px] tracking-[0.18em] uppercase"
          style={{ color: "var(--site-muted)" }}
        >
          <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {unitType.max_adults} {t("occupancy.adults").toLowerCase()}
            {unitType.max_children > 0 && ` · ${unitType.max_children} ${t("occupancy.children").toLowerCase()}`}
          </span>
        </div>
        <p className="mt-3 text-sm">
          {t("site.rooms_teaser.from")}{" "}
          <strong className="site-font-display text-lg" style={{ color: "var(--site-accent)" }}>
            {Number(unitType.base_price).toFixed(0)} {site.property.currency}
          </strong>
          <span style={{ color: "var(--site-muted)" }}> {t("public.per_night")}</span>
        </p>
        {unitType.description && (
          <p className="mt-5 max-w-[44ch] text-sm leading-relaxed" style={{ color: "var(--site-muted)" }}>
            {unitType.description[site.property.default_locale] ?? unitType.description.ro ?? ""}
          </p>
        )}
        <div className="mt-7 h-px" style={{ background: "var(--site-border)" }} />
        <Link
          to="/s/$siteSlug/book" params={{ siteSlug: site.site.slug }}
          search={{ unitTypeId: unitType.id }}
          className="mt-7 inline-flex w-fit items-center gap-3 rounded-[2px] px-8 py-4 text-[13px] tracking-[0.16em] uppercase transition-colors hover:opacity-90"
          style={{ background: "var(--site-accent)", color: "var(--site-accent-foreground)" }}
        >
          {t("site.rooms.book_this")}
        </Link>
      </div>
    </div>
  )
}
