import type { ReactElement } from "react"
import type { PublicSite } from "@/features/site/api"

// Contract per-template — fiecare temă (serene, boutique, ...) implementează
// exact aceste 4 componente și e înregistrată în `templates/index.ts`. Restul
// aplicației (rute, hooks, api) nu știe ce template e activ — doar
// `resolveSiteTheme` (features/site/themes.ts) + acest registry decid ce se
// randează. Adăugarea unui template nou = un folder nou + o intrare aici,
// zero schimbări în rute.
export type SiteNavLink = { to: string; label: string; show: boolean }

export type SiteHeaderProps = {
  site: PublicSite
  siteSlug: string
  navLinks: SiteNavLink[]
  // Pagina curentă are un fundal întunecat sub header la scroll=0 (poza de
  // hero pe landing, banda --site-ink pe pagina de camere) — un template cu
  // header transparent peste conținut (ex. boutique) poate folosi text
  // deschis la culoare doar când e adevărat; altfel (ex. pagina de
  // rezervare, fundal deschis din prima pixel) textul trebuie să rămână în
  // culoarea normală de temă. Calculat în route.tsx, per pagină.
  overDarkTop: boolean
}

export type SiteFooterProps = {
  site: PublicSite
}

export type SiteLandingProps = {
  site: PublicSite
}

export type SiteRoomsPageProps = {
  site: PublicSite
  siteSlug: string
}

export type SiteTemplateComponents = {
  Header: (props: SiteHeaderProps) => ReactElement | null
  Footer: (props: SiteFooterProps) => ReactElement | null
  Landing: (props: SiteLandingProps) => ReactElement | null
  RoomsPage: (props: SiteRoomsPageProps) => ReactElement | null
}
