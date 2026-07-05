import { t } from "@/lib/i18n"
import { generalPhotos, sitePhotoUrl, type PublicSite } from "@/features/site/api"
import { useReveal } from "@/features/site/use-reveal"

// Galerie mozaic — grid CSS 12 coloane cu span-uri variate (stil gallery
// teaser din handoff), doar dacă rămân ≥3 poze generale după cea folosită de
// hero (prima, sort_order minim).
const SPANS = [
  "col-span-12 row-span-5 sm:col-span-7",
  "col-span-6 row-span-3 sm:col-span-5",
  "col-span-6 row-span-2 sm:col-span-3 sm:col-start-8",
  "col-span-6 row-span-2 sm:col-span-2",
]

export function BoutiqueGallerySection({ site }: { site: PublicSite }) {
  const revealRef = useReveal<HTMLDivElement>()
  // index 0 = hero, index 1 = poza laterală din secțiunea „Despre" — galeria
  // pornește după ele, ca nicio poză să nu apară de două ori pe landing.
  const photos = generalPhotos(site.photos).slice(2, 8)
  if (photos.length < 3) return null

  return (
    <section className="mx-auto max-w-[1640px] px-6 py-24 sm:px-10 sm:py-32">
      <h2 className="site-font-display max-w-[18ch] text-[clamp(32px,4.6vw,68px)] leading-[1.04]">
        {t("site.gallery.title")}
      </h2>
      <div
        ref={revealRef}
        className="site-reveal-scale mt-10 grid grid-cols-12 gap-3 sm:gap-5"
        style={{ gridAutoRows: "minmax(90px, auto)" }}
      >
        {photos.map((photo, i) => (
          <div key={photo.id} className={SPANS[i % SPANS.length]}>
            <div className="h-full overflow-hidden rounded-[2px]" style={{ background: "var(--site-card-fallback)" }}>
              <img
                src={sitePhotoUrl(photo.storage_path)}
                alt={photo.alt ?? site.property.name}
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
