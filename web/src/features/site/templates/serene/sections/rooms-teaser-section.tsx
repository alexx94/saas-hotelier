import { Link } from "@tanstack/react-router"
import { BedDouble, Users } from "lucide-react"
import { t } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { photosForUnitType, sitePhotoUrl, type PublicSite } from "@/features/site/api"

// Teaser camere pe landing: primele `content.rooms_teaser.count` tipuri
// (ordonate deja sort_order de RPC), card cu poza tag-uită pe tip sau
// fallback temat + icon. Link către pagina completă de camere (dacă activă).
export function RoomsTeaserSection({ site }: { site: PublicSite }) {
  if (!site.site.content.rooms_teaser.enabled) return null
  if (site.unit_types.length === 0) return null

  const count = site.site.content.rooms_teaser.count
  const items = site.unit_types.slice(0, count)
  const showRoomsPage = site.site.content.pages.rooms

  return (
    <section className="py-16 sm:py-24" style={{ background: "var(--site-bg-alt)" }}>
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="site-font-display text-3xl font-semibold sm:text-4xl">
            {t("site.rooms_teaser.title")}
          </h2>
          {showRoomsPage && (
            <Button asChild variant="outline">
              <Link to="/s/$siteSlug/rooms" params={{ siteSlug: site.site.slug }}>
                {t("site.rooms_teaser.see_all")}
              </Link>
            </Button>
          )}
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((unitType) => {
            const photo = photosForUnitType(site.photos, unitType.id)[0] ?? null
            return (
              <div
                key={unitType.id}
                className="group overflow-hidden rounded-2xl border shadow-sm transition-shadow hover:shadow-md"
                style={{ background: "var(--site-card)", borderColor: "var(--site-border)" }}
              >
                <div className="aspect-4/3 overflow-hidden">
                  {photo ? (
                    <img
                      src={sitePhotoUrl(photo.storage_path)}
                      alt={photo.alt ?? unitType.name}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center"
                      style={{ background: "var(--site-card-fallback)" }}
                    >
                      <BedDouble className="h-12 w-12" style={{ color: "var(--site-accent)" }} strokeWidth={1.25} />
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <h3 className="site-font-display text-xl font-semibold">{unitType.name}</h3>
                  <p className="mt-1 flex items-center gap-1.5 text-sm" style={{ color: "var(--site-muted)" }}>
                    <Users className="h-4 w-4" />
                    {unitType.max_adults} {t("occupancy.adults").toLowerCase()}
                    {unitType.max_children > 0 && ` · ${unitType.max_children} ${t("occupancy.children").toLowerCase()}`}
                  </p>
                  <p className="mt-3 text-sm">
                    {t("site.rooms_teaser.from")}{" "}
                    <strong className="site-font-display text-lg" style={{ color: "var(--site-accent)" }}>
                      {Number(unitType.base_price).toFixed(0)} {site.property.currency}
                    </strong>
                    <span style={{ color: "var(--site-muted)" }}> {t("public.per_night")}</span>
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
