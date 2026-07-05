import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { BedDouble, ChevronDown, Users } from "lucide-react"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { PhotoCarousel } from "@/features/site/photo-carousel"
import {
  photosForUnitType, sitePhotoUrl, type PublicSiteUnitType, type PublicSite,
} from "@/features/site/api"

// Card de tip cameră pentru /s/.../rooms — colapsat arată esențialul (poza
// tag-uită, nume, capacitate, preț „de la"); expandat adaugă galerie swipe
// (PhotoCarousel) + descriere completă + min_stay + CTA rezervare.
export function RoomCard({ site, unitType }: { site: PublicSite; unitType: PublicSiteUnitType }) {
  const [expanded, setExpanded] = useState(false)
  const photos = photosForUnitType(site.photos, unitType.id)
  const cover = photos[0] ?? null
  const description =
    unitType.description?.[site.property.default_locale] ??
    unitType.description?.ro ??
    null

  return (
    <div
      className="overflow-hidden rounded-2xl border shadow-sm"
      style={{ background: "var(--site-card)", borderColor: "var(--site-border)" }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="grid w-full grid-cols-1 items-stretch text-left sm:grid-cols-[minmax(0,220px)_1fr]"
      >
        <div className="aspect-4/3 overflow-hidden sm:aspect-auto sm:h-full">
          {cover ? (
            <img
              src={sitePhotoUrl(cover.storage_path)}
              alt={cover.alt ?? unitType.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className="flex h-full min-h-40 w-full items-center justify-center"
              style={{ background: "var(--site-card-fallback)" }}
            >
              <BedDouble className="h-10 w-10" style={{ color: "var(--site-accent)" }} strokeWidth={1.25} />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 p-5">
          <div>
            <h3 className="site-font-display text-xl font-semibold">{unitType.name}</h3>
            <p className="mt-1 flex items-center gap-1.5 text-sm" style={{ color: "var(--site-muted)" }}>
              <Users className="h-4 w-4" />
              {unitType.max_adults} {t("occupancy.adults").toLowerCase()}
              {unitType.max_children > 0 && ` · ${unitType.max_children} ${t("occupancy.children").toLowerCase()}`}
            </p>
            <p className="mt-2 text-sm">
              {t("site.rooms_teaser.from")}{" "}
              <strong className="site-font-display text-lg" style={{ color: "var(--site-accent)" }}>
                {Number(unitType.base_price).toFixed(0)} {site.property.currency}
              </strong>
              <span style={{ color: "var(--site-muted)" }}> {t("public.per_night")}</span>
            </p>
          </div>
          <ChevronDown
            className={cn("h-5 w-5 shrink-0 transition-transform", expanded && "rotate-180")}
            style={{ color: "var(--site-muted)" }}
          />
        </div>
      </button>

      {expanded && (
        <div className="border-t p-5" style={{ borderColor: "var(--site-border)" }}>
          <PhotoCarousel photos={photos} alt={unitType.name} className="max-w-xl" />
          {description && (
            <p className="mt-5 leading-relaxed whitespace-pre-line" style={{ color: "var(--site-muted)" }}>
              {description}
            </p>
          )}
          {unitType.min_stay > 1 && (
            <p className="mt-3 text-sm" style={{ color: "var(--site-muted)" }}>
              {t("public.min_nights")} {unitType.min_stay} {t("bookings.nights")}
            </p>
          )}
          <Button
            asChild className="mt-5 border-0"
            style={{ background: "var(--site-accent)", color: "var(--site-accent-foreground)" }}
          >
            <Link
              to="/s/$siteSlug/book" params={{ siteSlug: site.site.slug }}
              search={{ unitTypeId: unitType.id }}
            >
              {t("site.rooms.book_this")}
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}
