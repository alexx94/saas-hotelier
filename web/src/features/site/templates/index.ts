import type { SiteTemplateKey } from "@/features/site/themes"
import type { SiteTemplateComponents } from "./types"
import { SereneHeader } from "./serene/header"
import { SereneFooter } from "./serene/footer"
import { SereneLanding } from "./serene/landing"
import { SereneRoomsPage } from "./serene/rooms-page"
import { BoutiqueHeader } from "./boutique/header"
import { BoutiqueFooter } from "./boutique/footer"
import { BoutiqueLanding } from "./boutique/landing"
import { BoutiqueRoomsPage } from "./boutique/rooms-page"

// Registry unic: `SiteTemplateKey` (features/site/themes.ts) → componentele
// care randează acel template. Rutele `s/$siteSlug/*` doar aleg intrarea
// corectă din acest obiect — niciun `if`/`switch` pe template împrăștiat
// prin rute.
export const SITE_TEMPLATE_COMPONENTS: Record<SiteTemplateKey, SiteTemplateComponents> = {
  serene: {
    Header: SereneHeader,
    Footer: SereneFooter,
    Landing: SereneLanding,
    RoomsPage: SereneRoomsPage,
  },
  boutique: {
    Header: BoutiqueHeader,
    Footer: BoutiqueFooter,
    Landing: BoutiqueLanding,
    RoomsPage: BoutiqueRoomsPage,
  },
}
