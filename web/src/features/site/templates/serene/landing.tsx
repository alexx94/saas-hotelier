import type { SiteLandingProps } from "@/features/site/templates/types"
import { HeroSection } from "./sections/hero-section"
import { AboutSection } from "./sections/about-section"
import { RoomsTeaserSection } from "./sections/rooms-teaser-section"
import { ServicesSection } from "./sections/services-section"
import { MapSection } from "./sections/map-section"
import { CtaSection } from "./sections/cta-section"

// Landing serene — extras 1:1 din vechiul routes/s/$siteSlug/index.tsx.
// Fiecare secțiune se auto-exclude (`return null`) dacă `enabled` e fals în
// content — lista de mai jos e ordinea de afișare.
export function SereneLanding({ site }: SiteLandingProps) {
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
