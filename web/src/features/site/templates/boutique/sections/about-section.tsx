import { t } from "@/lib/i18n"
import { generalPhotos, sitePhotoUrl, type PublicSite } from "@/features/site/api"
import { useReveal } from "@/features/site/use-reveal"
import { cn } from "@/lib/utils"

// About editorial — titlul (eyebrow + heading) ocupă întâi toată lățimea
// secțiunii, respirând singur. Dedesubt, textul (2/5) și poza generală
// secundară (3/5, prima e rezervată hero-ului) curg alături — fără
// `items-start`: rândul flex se întinde implicit (`align-items: stretch`),
// deci poza se întinde exact la înălțimea textului (indiferent cât de lung
// e), în loc să rămână mult mai înaltă și să lase un gol sub paragraf.
// `min-h`/`max-h` sunt doar limite (text foarte scurt/foarte lung), nu
// înălțimea reală — aceea vine mereu din stretch. Gated `about.enabled`,
// același fallback de text ca AboutSection din serene.
export function BoutiqueAboutSection({ site }: { site: PublicSite }) {
  const revealRef = useReveal<HTMLDivElement>()
  if (!site.site.content.about.enabled) return null

  const text =
    site.site.content.about.text ??
    site.property.description?.[site.property.default_locale] ??
    site.property.description?.ro ??
    null
  if (!text) return null

  const sidePhoto = generalPhotos(site.photos)[1] ?? null

  return (
    <section className="mx-auto max-w-6xl px-6 py-24 sm:px-10 sm:py-32">
      <div ref={revealRef} className="site-reveal">
        <p className="site-eyebrow">{t("site.about.title")}</p>
        <h2 className="site-font-display mt-6 max-w-[22ch] text-[clamp(34px,5.2vw,76px)] leading-[1.02]">
          {site.property.name}
        </h2>

        <div className={cn("mt-12 flex flex-col gap-8", sidePhoto && "sm:flex-row sm:gap-14")}>
          <div className={cn("flex flex-col sm:justify-center", sidePhoto ? "sm:w-2/5" : "max-w-2xl")}>
            <p className="site-lede whitespace-pre-line">{text}</p>
          </div>
          {sidePhoto && (
            <div className="aspect-4/3 min-h-65 overflow-hidden rounded-[2px] sm:aspect-auto sm:max-h-130 sm:w-3/5 sm:shrink-0">
              <img
                src={sitePhotoUrl(sidePhoto.storage_path)}
                alt={sidePhoto.alt ?? t("site.about.title")}
                className="h-full w-full object-cover"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
