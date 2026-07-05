import { createFileRoute } from "@tanstack/react-router"
import { usePublicSite } from "@/features/site/hooks"
import { HeroSection } from "@/features/site/sections/hero-section"
import { AboutSection } from "@/features/site/sections/about-section"
import { RoomsTeaserSection } from "@/features/site/sections/rooms-teaser-section"
import { ServicesSection } from "@/features/site/sections/services-section"
import { MapSection } from "@/features/site/sections/map-section"
import { CtaSection } from "@/features/site/sections/cta-section"

export const Route = createFileRoute("/s/$siteSlug/")({
  component: SiteLandingPage,
})

// Landing: fiecare secțiune se auto-exclude (`return null`) dacă `enabled`
// e fals în content — lista de mai jos e ordinea de afișare, scalabilă la
// secțiuni noi fără a atinge logica existentă.
function SiteLandingPage() {
  const { siteSlug } = Route.useParams()
  const { data: site } = usePublicSite(siteSlug)

  if (!site) return null

  return (
    <>
      <HeroSection site={site} />
      <AboutSection site={site} />
      <RoomsTeaserSection site={site} />
      <ServicesSection site={site} />
      <MapSection site={site} />
      <CtaSection site={site} />
    </>
  )
}
