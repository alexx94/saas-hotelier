import { Building2 } from "lucide-react"
import { t } from "@/lib/i18n"
import { generalPhotos, sitePhotoUrl, type PublicSite } from "@/features/site/api"

// Secțiune „Despre" — text din content.about, fallback pe descrierea
// proprietății (locale implicit sau `ro`). Layout aerisit, poză generală
// laterală dacă există (a doua poză generală, prima fiind rezervată hero-ului).
export function AboutSection({ site }: { site: PublicSite }) {
  if (!site.site.content.about.enabled) return null

  const text =
    site.site.content.about.text ??
    site.property.description?.[site.property.default_locale] ??
    site.property.description?.ro ??
    null

  if (!text) return null

  const photos = generalPhotos(site.photos)
  const sidePhoto = photos[1] ?? photos[0] ?? null

  return (
    <section className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
      <div className="grid items-center gap-10 md:grid-cols-2">
        <div className={sidePhoto ? "" : "md:col-span-2 md:mx-auto md:max-w-2xl md:text-center"}>
          <h2 className="site-font-display text-3xl font-semibold sm:text-4xl">
            {t("site.about.title")}
          </h2>
          <p className="mt-5 leading-relaxed whitespace-pre-line" style={{ color: "var(--site-muted)" }}>
            {text}
          </p>
        </div>
        {sidePhoto && (
          <div className="aspect-4/3 overflow-hidden rounded-2xl shadow-sm">
            <img
              src={sitePhotoUrl(sidePhoto.storage_path)}
              alt={sidePhoto.alt ?? t("site.about.title")}
              className="h-full w-full object-cover"
            />
          </div>
        )}
        {!sidePhoto && (
          <div className="hidden md:block" aria-hidden>
            <div
              className="flex aspect-4/3 items-center justify-center rounded-2xl"
              style={{ background: "var(--site-card-fallback)" }}
            >
              <Building2 className="h-16 w-16" style={{ color: "var(--site-accent)" }} strokeWidth={1.25} />
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
