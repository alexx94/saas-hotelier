import { ro, type TranslationKey } from "./ro"

// MVP: doar română. Pentru EN: adaugă en.ts și un selector de locale aici.
const dictionaries = { ro }
const locale: keyof typeof dictionaries = "ro"

export function t(key: TranslationKey): string {
  return dictionaries[locale][key] ?? key
}

export type { TranslationKey }
