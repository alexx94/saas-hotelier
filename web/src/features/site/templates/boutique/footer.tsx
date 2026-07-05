import { Link } from "@tanstack/react-router"
import { Mail, Phone } from "lucide-react"
import { t } from "@/lib/i18n"
import type { SiteFooterProps } from "@/features/site/templates/types"

// Footer boutique — fundal --site-ink, nume proprietate serif italic mare,
// coloane nav + contact, copyright.
export function BoutiqueFooter({ site }: SiteFooterProps) {
  const { contact, pages } = site.site.content
  const siteSlug = site.site.slug
  const dim = "color-mix(in oklch, var(--site-ink-foreground) 62%, transparent)"
  const faint = "color-mix(in oklch, var(--site-ink-foreground) 45%, transparent)"

  const navLinks = [
    { to: "/s/$siteSlug", label: t("site.nav.home"), show: true },
    { to: "/s/$siteSlug/rooms", label: t("site.nav.rooms"), show: pages.rooms },
    { to: "/s/$siteSlug/book", label: t("site.nav.book"), show: pages.book },
  ].filter((l) => l.show)

  return (
    <footer className="px-6 pt-20 pb-10 sm:px-10" style={{ background: "var(--site-ink)", color: "var(--site-ink-foreground)" }}>
      <div
        className="mx-auto grid max-w-6xl gap-10 border-b pb-16 sm:grid-cols-[1.5fr_1fr_1fr]"
        style={{ borderColor: "color-mix(in oklch, var(--site-ink-foreground) 10%, transparent)" }}
      >
        <p className="site-font-display text-[clamp(40px,6vw,76px)] leading-none italic">{site.property.name}</p>

        <div>
          <h4 className="site-eyebrow" style={{ color: faint }}>{t("site.nav.home")}</h4>
          <div className="mt-5 space-y-2.5">
            {navLinks.map((l) => (
              <Link key={l.to} to={l.to} params={{ siteSlug }} className="block text-[15px]" style={{ color: dim }}>
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        {contact.enabled && (site.site.contact_phone || site.site.contact_email) && (
          <div>
            <h4 className="site-eyebrow" style={{ color: faint }}>{t("site_builder.content.contact.title")}</h4>
            <div className="mt-5 space-y-2.5 text-[15px]" style={{ color: dim }}>
              {site.site.contact_phone && (
                <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> {site.site.contact_phone}</p>
              )}
              {site.site.contact_email && (
                <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> {site.site.contact_email}</p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mx-auto mt-8 max-w-6xl text-xs" style={{ color: faint }}>
        © {new Date().getFullYear()} {site.property.name}
      </div>
    </footer>
  )
}
