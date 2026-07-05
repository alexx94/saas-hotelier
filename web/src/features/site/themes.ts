// Registry de temă pentru site-ul public. `property_sites.theme` e text liber
// (fără CHECK, vezi docs/backend/rpc/sites.md) — contractul cu backend-ul e
// „orice string", frontend-ul decide ce face cu el.
//
// Format compus (Sprint 10.1): `"{templateKey}/{paletteKey}"`, ex. `"boutique/marble"`.
// `templateKey` alege structura/layout-ul (registry de componente, vezi
// `templates/index.ts`), `paletteKey` alege doar setul de variabile CSS
// `--site-*` (scope `[data-site-template="..."][data-site-palette="..."]` în
// index.css). Compatibilitate înapoi: valoarea legacy fără slash (ex.
// `"serene"`) e tratată ca template, fără paletă explicită → paleta implicită
// a acelui template.
export const SITE_TEMPLATES = {
  serene: {
    key: "serene",
    palettes: ["warm", "sage", "sea"],
    defaultPalette: "warm",
  },
  boutique: {
    key: "boutique",
    palettes: ["marble", "olive", "terra"],
    defaultPalette: "marble",
  },
} as const

export type SiteTemplateKey = keyof typeof SITE_TEMPLATES

const DEFAULT_TEMPLATE: SiteTemplateKey = "serene"

export type ResolvedSiteTheme = {
  template: SiteTemplateKey
  palette: string
}

function isTemplateKey(value: string): value is SiteTemplateKey {
  return value in SITE_TEMPLATES
}

/**
 * Rezolvă valoarea brută din DB (`"template/palette"`, legacy `"template"`,
 * sau `null`/necunoscută) la o pereche template+paletă mereu valide — fallback
 * per-parte, ca site-ul să nu rămână nestilat sau cu paletă inexistentă:
 * template necunoscut/lipsă → `serene`; paletă necunoscută/lipsă → paleta
 * implicită a template-ului deja rezolvat.
 */
export function resolveSiteTheme(raw: string | null | undefined): ResolvedSiteTheme {
  const [rawTemplate, rawPalette] = (raw ?? "").split("/")

  const template = rawTemplate && isTemplateKey(rawTemplate) ? rawTemplate : DEFAULT_TEMPLATE
  const config = SITE_TEMPLATES[template]

  const palette =
    rawPalette && (config.palettes as readonly string[]).includes(rawPalette)
      ? rawPalette
      : config.defaultPalette

  return { template, palette }
}

/** Compune stringul compus persistat în `property_sites.theme`. */
export function composeSiteTheme(template: SiteTemplateKey, palette: string): string {
  return `${template}/${palette}`
}
