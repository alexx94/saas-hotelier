import { Mail, Phone } from "lucide-react"
import type { SiteFooterProps } from "@/features/site/templates/types"

// Footer serene — extras 1:1 din vechiul routes/s/$siteSlug/route.tsx.
export function SereneFooter({ site }: SiteFooterProps) {
  const { contact } = site.site.content

  return (
    <footer className="border-t px-6 py-12" style={{ borderColor: "var(--site-border)", background: "var(--site-bg-alt)" }}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 text-sm sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="site-font-display text-lg font-semibold">{site.property.name}</p>
          {(site.property.address || site.property.city) && (
            <p className="mt-1" style={{ color: "var(--site-muted)" }}>
              {[site.property.address, site.property.city].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
        {contact.enabled && (site.site.contact_phone || site.site.contact_email) && (
          <div className="space-y-1.5">
            {site.site.contact_phone && (
              <p className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> {site.site.contact_phone}
              </p>
            )}
            {site.site.contact_email && (
              <p className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> {site.site.contact_email}
              </p>
            )}
          </div>
        )}
      </div>
      <p className="mx-auto mt-8 max-w-6xl text-xs" style={{ color: "var(--site-muted)" }}>
        © {new Date().getFullYear()} {site.property.name}
      </p>
    </footer>
  )
}
