import { t } from "@/lib/i18n"
import type { PublicSite } from "@/features/site/api"

// Hartă (iframe Google Maps embed) — doar dacă activă și URL prezent.
// `map_embed_url` e restricționat server-side la prefixul oficial Google Maps
// embed (vezi docs/backend/rpc/sites.md), deci iframe-ul e sigur de randat.
export function MapSection({ site }: { site: PublicSite }) {
  if (!site.site.content.map.enabled) return null
  if (!site.site.map_embed_url) return null

  return (
    <section className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
      <h2 className="site-font-display text-center text-3xl font-semibold sm:text-4xl">
        {t("site.map.title")}
      </h2>
      <div className="mt-10 overflow-hidden rounded-2xl border shadow-sm" style={{ borderColor: "var(--site-border)" }}>
        <iframe
          src={site.site.map_embed_url}
          title={t("site.map.title")}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          sandbox="allow-scripts allow-same-origin allow-popups"
          className="h-[400px] w-full"
        />
      </div>
    </section>
  )
}
