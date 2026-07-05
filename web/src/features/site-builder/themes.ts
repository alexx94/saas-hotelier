// Registry local de teme — azi o singură temă, UI pregătit pentru mai multe
// (fiecare temă viitoare = o intrare aici, fără schimbare de schemă: `theme`
// e text liber în DB, fără CHECK, vezi docs/backend/rpc/sites.md).
import type { TranslationKey } from "@/lib/i18n"

export type SiteTheme = {
  key: string
  nameKey: TranslationKey
  descriptionKey: TranslationKey
  swatch: string[]
}

export const SITE_THEMES: SiteTheme[] = [
  {
    key: "serene",
    nameKey: "site_builder.theme.serene.name",
    descriptionKey: "site_builder.theme.serene.description",
    swatch: ["#f5f3ee", "#2f6f5e", "#c9a24b"],
  },
]
