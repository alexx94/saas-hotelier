import { t } from "@/lib/i18n"
import { resolveServiceIcon } from "@/features/site/service-icons"
import type { PublicSite } from "@/features/site/api"

// Grid de servicii/facilități — icon lucide (registry local service-icons.ts)
// + titlu + descriere. Listă liberă din content.services.items (frontend-ul
// nu impune schemă rigidă, doar randează ce există).
export function ServicesSection({ site }: { site: PublicSite }) {
  const { services } = site.site.content
  if (!services.enabled || services.items.length === 0) return null

  return (
    <section className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
      <h2 className="site-font-display text-center text-3xl font-semibold sm:text-4xl">
        {t("site.services.title")}
      </h2>
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {services.items.map((item, i) => {
          const Icon = resolveServiceIcon(item.icon)
          return (
            <div
              key={`${item.icon}-${i}`}
              className="flex items-start gap-4 rounded-2xl border p-5"
              style={{ background: "var(--site-card)", borderColor: "var(--site-border)" }}
            >
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                style={{ background: "var(--site-accent-soft)" }}
              >
                <Icon className="h-5 w-5" style={{ color: "var(--site-accent)" }} />
              </div>
              <div>
                <p className="font-medium">{item.title}</p>
                {item.description && (
                  <p className="mt-1 text-sm" style={{ color: "var(--site-muted)" }}>
                    {item.description}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
