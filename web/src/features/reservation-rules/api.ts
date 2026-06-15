import { supabase } from "@/lib/supabase"
import { pageRange, toPage, type Page } from "@/lib/pagination"
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/database.types"

// Restricții de durată a sejurului pe perioadă (per tip). Globalul stă pe unit_types
// (min_stay/max_stay); o regulă pe perioadă suprascrie globalul, cheiat pe data de check-in.
export type StayRule = Tables<"stay_rules">

// Stop-sell / closed dates cu scope: unit_type_id null = toată proprietatea.
export type Closure = Tables<"closures">
export type ClosureReason = "seasonal" | "event" | "maintenance" | "other"
export const CLOSURE_REASONS: ClosureReason[] = ["seasonal", "event", "maintenance", "other"]

// Min/max stay efective pentru un tip la o dată de check-in (din get_stay_constraints).
export type StayConstraints = { min_stay: number; max_stay: number }

// Listele cresc în timp → paginate cu „Afișează mai mult" (ca rate_rules).
export const RULES_PAGE_SIZE = 15

// ─── stay_rules ────────────────────────────────────────────────────────────────

export async function fetchStayRules(unitTypeId: string, page: number): Promise<Page<StayRule>> {
  const [from, to] = pageRange(page, RULES_PAGE_SIZE)
  const { data, error } = await supabase
    .from("stay_rules")
    .select("*")
    .eq("unit_type_id", unitTypeId)
    .order("start_date", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to)
  if (error) throw error
  return toPage(data, RULES_PAGE_SIZE)
}

export async function createStayRule(input: TablesInsert<"stay_rules">): Promise<void> {
  const { error } = await supabase.from("stay_rules").insert(input)
  if (error) throw error
}

export async function updateStayRule(id: string, patch: TablesUpdate<"stay_rules">): Promise<void> {
  const { error } = await supabase.from("stay_rules").update(patch).eq("id", id)
  if (error) throw error
}

export async function deleteStayRule(id: string): Promise<void> {
  const { error } = await supabase.from("stay_rules").delete().eq("id", id)
  if (error) throw error
}

// ─── closures ──────────────────────────────────────────────────────────────────

export async function fetchClosures(propertyId: string, page: number): Promise<Page<Closure>> {
  const [from, to] = pageRange(page, RULES_PAGE_SIZE)
  const { data, error } = await supabase
    .from("closures")
    .select("*")
    .eq("property_id", propertyId)
    .order("start_date", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to)
  if (error) throw error
  return toPage(data, RULES_PAGE_SIZE)
}

// Toate închiderile care ating un interval (pentru calendar — mărginit de interval,
// nu paginat, ca fetchBlocksInRange).
export async function fetchClosuresInRange(
  propertyId: string,
  from: string,
  to: string
): Promise<Closure[]> {
  const { data, error } = await supabase
    .from("closures")
    .select("*")
    .eq("property_id", propertyId)
    .lt("start_date", to)
    .gt("end_date", from)
  if (error) throw error
  return data
}

export async function createClosure(input: TablesInsert<"closures">): Promise<void> {
  const { error } = await supabase.from("closures").insert(input)
  if (error) throw error
}

export async function deleteClosure(id: string): Promise<void> {
  const { error } = await supabase.from("closures").delete().eq("id", id)
  if (error) throw error
}

// ─── constrângeri efective (UI booking form) ─────────────────────────────────────

export async function getStayConstraints(
  unitTypeId: string,
  checkIn: string
): Promise<StayConstraints> {
  const { data, error } = await supabase.rpc("get_stay_constraints", {
    p_unit_type_id: unitTypeId,
    p_check_in: checkIn,
  })
  if (error) throw error
  return data as unknown as StayConstraints
}
