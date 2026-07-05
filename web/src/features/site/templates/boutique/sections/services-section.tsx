import { t } from "@/lib/i18n"
import { resolveServiceIcon } from "@/features/site/service-icons"
import { useReveal } from "@/features/site/use-reveal"
import type { PublicSite } from "@/features/site/api"

// Servicii — carduri pătrate, lățime fixă per breakpoint, randate cu
// `flex-wrap` + `justify-center` (NU cu CSS grid): orice rând incomplet
// (5, 6, 9... servicii — orice rest, nu doar rest=1) se centrează ca grup,
// în loc să rămână lipit de margine sau întins artificial pe tot rândul.
// Funcționează identic la orice număr de servicii, fără nicio logică pe
// număr de coloane. Borduri drepte (fără rotunjire), semnătura boutique.
export function BoutiqueServicesSection({ site }: { site: PublicSite }) {
  const revealRef = useReveal<HTMLDivElement>()
  const { services } = site.site.content
  if (!services.enabled || services.items.length === 0) return null

  return (
    <section className="mx-auto max-w-6xl px-6 py-24 sm:px-10 sm:py-32">
      <h2 className="site-font-display max-w-[16ch] text-[clamp(32px,4.6vw,68px)] leading-[1.04]">
        {t("site.services.title")}
      </h2>
      <div ref={revealRef} className="site-reveal mt-12 flex flex-wrap justify-center gap-4">
        {services.items.map((item, i) => {
          const Icon = resolveServiceIcon(item.icon)
          return (
            <div
              key={`${item.icon}-${i}`}
              className="site-service-card flex aspect-square w-[calc(50%-0.5rem)] flex-col justify-between rounded-[2px] border p-6 sm:p-7 lg:w-[calc(25%-0.75rem)]"
              style={{ borderColor: "var(--site-border)", background: "var(--site-bg)" }}
            >
              <Icon className="h-5 w-5" style={{ color: "var(--site-accent)" }} strokeWidth={1.5} />
              <div>
                <p className="site-font-display text-lg sm:text-xl">{item.title}</p>
                {item.description && (
                  <p className="mt-2 text-[13px] sm:text-[13.5px]" style={{ color: "var(--site-muted)" }}>
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
