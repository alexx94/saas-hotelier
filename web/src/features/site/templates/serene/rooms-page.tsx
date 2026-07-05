import { t } from "@/lib/i18n"
import type { SiteRoomsPageProps } from "@/features/site/templates/types"
import { RoomCard } from "./sections/room-card"

// Pagina „Camere" serene — extrasă 1:1 din vechiul routes/s/$siteSlug/rooms.tsx.
export function SereneRoomsPage({ site }: SiteRoomsPageProps) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
      <h1 className="site-font-display text-center text-4xl font-semibold sm:text-5xl">
        {t("site.rooms.title")}
      </h1>
      <div className="mx-auto mt-12 max-w-4xl space-y-6">
        {site.unit_types.map((unitType) => (
          <RoomCard key={unitType.id} site={site} unitType={unitType} />
        ))}
      </div>
    </div>
  )
}
