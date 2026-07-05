import type { SiteLandingProps } from "@/features/site/templates/types"
import { BoutiqueHeroSection } from "./sections/hero-section"
import { BoutiqueTickerSection } from "./sections/ticker-section"
import { BoutiqueAboutSection } from "./sections/about-section"
import { BoutiqueRoomsSection } from "./sections/rooms-section"
import { BoutiqueServicesSection } from "./sections/services-section"
import { BoutiqueGallerySection } from "./sections/gallery-section"
import { BoutiqueMapSection } from "./sections/map-section"
import { BoutiqueCtaSection } from "./sections/cta-section"

// Landing boutique — ordinea din handoff-ul „Sea Vibes": hero, ticker,
// intro/about, camere, servicii, galerie mozaic, hartă, cta finală. Fiecare
// secțiune se auto-exclude (`return null`) dacă `enabled` e fals în content.
export function BoutiqueLanding({ site }: SiteLandingProps) {
  return (
    <>
      <BoutiqueHeroSection site={site} />
      <BoutiqueTickerSection site={site} />
      <BoutiqueAboutSection site={site} />
      <BoutiqueRoomsSection site={site} />
      <BoutiqueServicesSection site={site} />
      <BoutiqueGallerySection site={site} />
      <BoutiqueMapSection site={site} />
      <BoutiqueCtaSection site={site} />
    </>
  )
}
