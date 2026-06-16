import { supabase } from "@/lib/supabase"
import { pageRange, toPage, type Page } from "@/lib/pagination"
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/database.types"

// O promoție comercială: reducere (procent/sumă) cu cod sau automată, ferestre de
// valabilitate, scope (tip de cameră / toate) și limită de utilizări.
export type Promotion = Tables<"promotions">
export type PromotionRule = Tables<"promotion_rules">
export type PromotionWithRules = Promotion & { promotion_rules: PromotionRule[] }

export type DiscountType = "percent" | "amount"

// Tipurile de condiție (promotion_rules.rule_type) — registru extensibil; un tip nou
// = o intrare aici + o ramură în app.resolve_promotion. Nu necesită schimbare de schemă.
export type RuleType = "min_nights" | "min_advance_days" | "max_advance_hours"
export const RULE_TYPES: RuleType[] = ["min_nights", "min_advance_days", "max_advance_hours"]

// Listele de promoții cresc în timp → paginate „Afișează mai mult" (ca restul listelor).
export const PROMOTIONS_PAGE_SIZE = 15

export async function fetchPromotions(
  propertyId: string,
  page: number
): Promise<Page<PromotionWithRules>> {
  const [from, to] = pageRange(page, PROMOTIONS_PAGE_SIZE)
  const { data, error } = await supabase
    .from("promotions")
    .select("*, promotion_rules(*)")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to)
  if (error) throw error
  return toPage((data ?? []) as PromotionWithRules[], PROMOTIONS_PAGE_SIZE)
}

// Creează promoția + condițiile ei (insert promoție, apoi rândurile de reguli).
export async function createPromotion(
  promotion: TablesInsert<"promotions">,
  rules: { rule_type: RuleType; value: number }[]
): Promise<void> {
  const { data, error } = await supabase
    .from("promotions")
    .insert(promotion)
    .select("id")
    .single()
  if (error) throw error
  if (rules.length > 0) {
    const { error: rulesError } = await supabase
      .from("promotion_rules")
      .insert(rules.map((r) => ({ promotion_id: data.id, ...r })))
    if (rulesError) throw rulesError
  }
}

export async function updatePromotion(
  id: string,
  patch: TablesUpdate<"promotions">
): Promise<void> {
  const { error } = await supabase.from("promotions").update(patch).eq("id", id)
  if (error) throw error
}

// Editarea unei promoții e SIGURĂ: rezervările existente au snapshot imuabil
// (discount_amount + price_breakdown), deci nu se modifică retroactiv. Condițiile se
// înlocuiesc integral (șterge + reinserează).
export async function updatePromotionWithRules(
  id: string,
  patch: TablesUpdate<"promotions">,
  rules: { rule_type: RuleType; value: number }[]
): Promise<void> {
  const { error } = await supabase.from("promotions").update(patch).eq("id", id)
  if (error) throw error
  const { error: delError } = await supabase.from("promotion_rules").delete().eq("promotion_id", id)
  if (delError) throw delError
  if (rules.length > 0) {
    const { error: insError } = await supabase
      .from("promotion_rules")
      .insert(rules.map((r) => ({ promotion_id: id, ...r })))
    if (insError) throw insError
  }
}

// `true` dacă ștergerea a fost blocată fiindcă promoția e referită de rezervări
// (FK NO ACTION pe bookings.promotion_id) — istoricul e protejat la nivel de DB.
export function isPromotionInUseError(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === "23503"
}

// `true` dacă backend-ul a blocat modificarea identității financiare (cod / tip /
// valoare) după ce promoția a fost folosită (trigger app.guard_promotion_update).
export function isPromotionLockedError(e: unknown): boolean {
  return /PROMOTION_LOCKED/.test((e as { message?: string } | null)?.message ?? "")
}

// `true` dacă un cod duplică altul existent pe proprietate (index unic pe upper(code)).
export function isDuplicateCodeError(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === "23505"
}

export async function deletePromotion(id: string): Promise<void> {
  // promotion_rules au ON DELETE CASCADE; bookings.promotion_id e NO ACTION (blochează)
  const { error } = await supabase.from("promotions").delete().eq("id", id)
  if (error) throw error
}
