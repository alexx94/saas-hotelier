// Supabase/PostgREST aruncă uneori obiecte simple, nu instanțe de Error —
// `e instanceof Error` ratează mesajul și UI-ul cade pe eroarea generică.
// Extragem mesajul defensiv pentru maparea codurilor-mașină (UNIT_NOT_AVAILABLE,
// BLOCK_OVERLAPS, ...) pe chei i18n.
export function errorMessage(e: unknown): string {
  if (typeof e === "object" && e !== null && "message" in e) {
    return String((e as { message: unknown }).message ?? "")
  }
  return ""
}

import { t, type TranslationKey } from "@/lib/i18n"

// Coduri-mașină ridicate de RPC-urile RBAC → chei i18n `error.<COD>`.
const RBAC_CODES = [
  "USER_NOT_FOUND", "ALREADY_MEMBER", "CANNOT_REMOVE_OWNER", "NOT_A_MEMBER",
  "ROLE_IS_SYSTEM", "ROLE_EXISTS", "ROLE_ORG_MISMATCH", "PROPERTY_ORG_MISMATCH",
  "NAME_REQUIRED", "INSUFFICIENT_GRANT", "CANNOT_EDIT_SELF", "CANNOT_REMOVE_SELF",
  // ordinea contează: codurile mai specifice înaintea lui FORBIDDEN
  "NOT_AUTHORIZED_OVER_MEMBER", "ROLE_EXCEEDS_YOURS", "ELEVATED_NOT_ALLOWED",
  "PROPERTY_FORBIDDEN", "FORBIDDEN",
] as const

/** mesaj lizibil pentru o eroare de RPC RBAC (cod-mașină → i18n), fallback generic */
export function rbacErrorMessage(e: unknown): string {
  const msg = errorMessage(e)
  const code = RBAC_CODES.find((c) => msg.includes(c))
  return code ? t(`error.${code}` as TranslationKey) : t("common.error")
}
