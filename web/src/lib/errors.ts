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
