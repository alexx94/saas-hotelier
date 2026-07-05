import { createFileRoute, redirect } from "@tanstack/react-router"
import { requireSession } from "@/features/auth/hooks"
import { getSiteSlugFromHostname } from "@/features/site/site-host"

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    // Fundația subdomeniilor viitoare (Sprint 10 §5): dacă hostname-ul curent
    // e un subdomeniu de site public ({slug}.{appHost}), redirect direct la
    // vitrina proprietății — fără VITE_APP_HOSTS, comportamentul e neschimbat.
    const appHosts = (import.meta.env.VITE_APP_HOSTS ?? "")
      .split(",")
      .map((h: string) => h.trim())
      .filter(Boolean)
    const siteSlug = getSiteSlugFromHostname(window.location.hostname, appHosts)
    if (siteSlug) {
      throw redirect({ to: "/s/$siteSlug", params: { siteSlug: siteSlug } })
    }

    const session = await requireSession()
    throw redirect({ to: session ? "/org" : "/login" })
  },
})
