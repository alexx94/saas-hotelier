// Registry de teme pentru site-ul public. `property_sites.theme` e text liber
// (fără CHECK, vezi docs/backend/rpc/sites.md) — contractul cu backend-ul e
// „orice string", frontend-ul decide ce face cu el. O temă nouă = un bloc CSS
// nou în index.css (scope `[data-site-theme="<key>"]`) + o intrare aici, fără
// nicio schimbare în componentele de secțiune (care folosesc doar variabilele
// `--site-*` prin clase Tailwind arbitrare).
export const SITE_THEMES = {
  serene: {
    key: "serene",
  },
} as const

export type SiteThemeKey = keyof typeof SITE_THEMES

const DEFAULT_THEME: SiteThemeKey = "serene"

/** Rezolvă temă necunoscută/lipsă la default, ca site-ul să nu rămână nestilat. */
export function resolveSiteTheme(theme: string | null | undefined): SiteThemeKey {
  return theme && theme in SITE_THEMES ? (theme as SiteThemeKey) : DEFAULT_THEME
}
