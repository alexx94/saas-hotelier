import type { PublicSite } from "@/features/site/api"

// Bandă marquee (--site-ink) cu titlurile serviciilor + numele proprietății,
// separate de puncte accent — conținutul e dublat (randat de 2 ori) pentru
// loop continuu fără salt vizibil. Doar dacă `services.enabled` și există
// items (aceeași gardă ca ServicesSection, ca banda să nu apară goală).
export function BoutiqueTickerSection({ site }: { site: PublicSite }) {
  const { services } = site.site.content
  if (!services.enabled || services.items.length === 0) return null

  const words = [site.property.name, ...services.items.map((s) => s.title).filter(Boolean)]
  const track = [...words, ...words]

  return (
    <div className="overflow-hidden" style={{ background: "var(--site-ink)" }} aria-hidden="true">
      <div className="site-ticker-track py-3">
        {track.map((word, i) => (
          <span key={i}>
            {word}
            <span className="site-ticker-sep"> · </span>
          </span>
        ))}
      </div>
    </div>
  )
}
