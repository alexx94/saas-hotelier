import { createFileRoute } from "@tanstack/react-router"
import { usePublicSite } from "@/features/site/hooks"
import { RoomCard } from "@/features/site/sections/room-card"
import { t } from "@/lib/i18n"

export const Route = createFileRoute("/s/$siteSlug/rooms")({
  component: SiteRoomsPage,
})

function SiteRoomsPage() {
  const { siteSlug } = Route.useParams()
  const { data: site } = usePublicSite(siteSlug)

  if (!site) return null

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
