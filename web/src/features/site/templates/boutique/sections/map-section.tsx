import { t } from "@/lib/i18n"
import type { PublicSite } from "@/features/site/api"

// Hartă — iframe Google Maps embed, încadrat editorial (bordură dreaptă,
// fără colțuri rotunjite). Gated `map.enabled` + `map_embed_url` prezent.
export function BoutiqueMapSection({ site }: { site: PublicSite }) {
  if (!site.site.content.map.enabled) return null
  if (!site.site.map_embed_url) return null

  return (
    <section className="mx-auto max-w-6xl px-6 py-24 sm:px-10 sm:py-32">
      <h2 className="site-font-display max-w-[16ch] text-[clamp(32px,4.6vw,68px)] leading-[1.04]">
        {t("site.map.title")}
      </h2>
      <div className="mt-10 overflow-hidden rounded-[2px] border" style={{ borderColor: "var(--site-border)" }}>
        <iframe
          src={site.site.map_embed_url}
          title={t("site.map.title")}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          sandbox="allow-scripts allow-same-origin allow-popups"
          className="h-[440px] w-full"
        />
      </div>
    </section>
  )
}
