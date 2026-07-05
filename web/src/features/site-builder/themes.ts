// Metadata de prezentare pentru selectorul de temă din PMS. Cheile/parserul
// (SITE_TEMPLATES, resolveSiteTheme, composeSiteTheme) au sursă unică în
// `features/site/themes.ts` — NU se duplică aici, doar se adaugă ce ține de
// UI (nume/descriere/swatch-uri). O temă nouă = o intrare acolo (parser) +
// o intrare aici (prezentare) + un bloc CSS (`index.css`).
import { SITE_TEMPLATES, type SiteTemplateKey } from "@/features/site/themes"
import type { TranslationKey } from "@/lib/i18n"

export type TemplateMeta = {
  key: SiteTemplateKey
  nameKey: TranslationKey
  descriptionKey: TranslationKey
}

export type PaletteMeta = {
  key: string
  nameKey: TranslationKey
  swatch: string[]
}

export const SITE_TEMPLATE_META: Record<SiteTemplateKey, TemplateMeta> = {
  serene: {
    key: "serene",
    nameKey: "site_builder.theme.serene.name",
    descriptionKey: "site_builder.theme.serene.description",
  },
  boutique: {
    key: "boutique",
    nameKey: "site_builder.theme.boutique.name",
    descriptionKey: "site_builder.theme.boutique.description",
  },
}

// Nestat per template (nu hartă globală): cheile de paletă sunt un namespace
// al template-ului (așa sunt scope-uite și în CSS, și în SITE_TEMPLATES) —
// două template-uri pot avea liniștit aceeași cheie naturală (ex. `warm`),
// cu swatch-uri proprii.
export const SITE_PALETTE_META: Record<SiteTemplateKey, Record<string, PaletteMeta>> = {
  serene: {
    warm: { key: "warm", nameKey: "site_builder.palette.warm.name", swatch: ["#f5f3ee", "#c9743f", "#2f6f5e"] },
    sage: { key: "sage", nameKey: "site_builder.palette.sage.name", swatch: ["#f5f3ee", "#3f6f56", "#8a8377"] },
    sea: { key: "sea", nameKey: "site_builder.palette.sea.name", swatch: ["#f5f3ee", "#4d7a91", "#8a8377"] },
  },
  boutique: {
    marble: { key: "marble", nameKey: "site_builder.palette.marble.name", swatch: ["#f6f2eb", "#dad4c8", "#7a95a0"] },
    olive: { key: "olive", nameKey: "site_builder.palette.olive.name", swatch: ["#f6f2eb", "#dad4c8", "#767b52"] },
    terra: { key: "terra", nameKey: "site_builder.palette.terra.name", swatch: ["#f6f2eb", "#dad4c8", "#a8623f"] },
  },
}

// Ordinea (fixă) în care se randează template-urile/paletele în UI.
export const SITE_TEMPLATE_ORDER = Object.keys(SITE_TEMPLATES) as SiteTemplateKey[]

export function palettesForTemplate(template: SiteTemplateKey): PaletteMeta[] {
  return SITE_TEMPLATES[template].palettes.map((key) => SITE_PALETTE_META[template][key])
}
