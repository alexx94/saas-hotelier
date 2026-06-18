import { supabase } from "@/lib/supabase"
import { pageRange, toPage, type Page } from "@/lib/pagination"
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/database.types"
import type { TranslationKey } from "@/lib/i18n"

// Restricții de durată a sejurului pe perioadă (per tip). Globalul stă pe unit_types
// (min_stay/max_stay); o regulă pe perioadă suprascrie globalul, cheiat pe data de check-in.
export type StayRule = Tables<"stay_rules">

// Stop-sell / closed dates cu scope: unit_type_id null = toată proprietatea.
export type Closure = Tables<"closures">
export type ClosureReason = "seasonal" | "event" | "maintenance" | "other"
export const CLOSURE_REASONS: ClosureReason[] = ["seasonal", "event", "maintenance", "other"]

// Restricții de sosire/plecare (CTA/CTD pe zi a săptămânii sau dată fixă), cu scope:
// unit_type_id null = toată proprietatea. weekdays null/gol = orice zi din interval.
export type ArrivalRule = Tables<"arrival_rules">

// Min/max stay efective pentru un tip la o dată de check-in (din get_stay_constraints).
export type StayConstraints = { min_stay: number; max_stay: number }

// ─── strat de validatori (Sprint 4.9) ───────────────────────────────────────────
// Coduri întoarse de RPC validate_booking. errors[] = blocante; warnings[] = soft
// forțate prin Manager Override / informative (ultima cameră, promoție aplicată).
export type ValidationCode =
  | "OCCUPANCY_EXCEEDED" | "DATES_CLOSED" | "STAY_TOO_SHORT" | "STAY_TOO_LONG"
  | "NO_ARRIVAL" | "NO_DEPARTURE" | "UNIT_NOT_AVAILABLE" | "PROMO_INVALID"
  | "LAST_UNIT" | "PROMO_APPLIED"

export type ValidationResult = {
  valid: boolean
  errors: ValidationCode[]
  warnings: ValidationCode[]
}

// Codurile SOFT — singurele forțabile prin Manager Override (restul sunt fizice/comerciale).
export const SOFT_CODES = [
  "DATES_CLOSED", "STAY_TOO_SHORT", "STAY_TOO_LONG", "NO_ARRIVAL", "NO_DEPARTURE",
] as const

export function isSoftCode(c: ValidationCode): boolean {
  return (SOFT_CODES as readonly string[]).includes(c)
}

// Cod blocant → cheie i18n (afișat în panoul de restricții al formularului).
export const VALIDATION_LABEL: Partial<Record<ValidationCode, TranslationKey>> = {
  OCCUPANCY_EXCEEDED: "bookings.occupancy_exceeded",
  DATES_CLOSED: "bookings.dates_closed",
  STAY_TOO_SHORT: "bookings.stay_too_short",
  STAY_TOO_LONG: "bookings.stay_too_long",
  NO_ARRIVAL: "bookings.no_arrival",
  NO_DEPARTURE: "bookings.no_departure",
  UNIT_NOT_AVAILABLE: "bookings.not_available",
  PROMO_INVALID: "bookings.promo_invalid",
}

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

// ─── arrival_rules ───────────────────────────────────────────────────────────────

export async function fetchArrivalRules(propertyId: string, page: number): Promise<Page<ArrivalRule>> {
  const [from, to] = pageRange(page, RULES_PAGE_SIZE)
  const { data, error } = await supabase
    .from("arrival_rules")
    .select("*")
    .eq("property_id", propertyId)
    .order("start_date", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to)
  if (error) throw error
  return toPage(data, RULES_PAGE_SIZE)
}

// Toate restricțiile care ating un interval (pentru calendar — mărginit de interval,
// nepaginat, ca fetchClosuresInRange).
export async function fetchArrivalRulesInRange(
  propertyId: string,
  from: string,
  to: string
): Promise<ArrivalRule[]> {
  const { data, error } = await supabase
    .from("arrival_rules")
    .select("*")
    .eq("property_id", propertyId)
    .lte("start_date", to)
    .gte("end_date", from)
  if (error) throw error
  return data
}

export async function createArrivalRule(input: TablesInsert<"arrival_rules">): Promise<void> {
  const { error } = await supabase.from("arrival_rules").insert(input)
  if (error) throw error
}

export async function deleteArrivalRule(id: string): Promise<void> {
  const { error } = await supabase.from("arrival_rules").delete().eq("id", id)
  if (error) throw error
}

// ─── constrângeri efective (UI booking form) ─────────────────────────────────────

// Validare completă a unei rezervări (occupancy + stay + restricții + availability +
// promoție) printr-o singură sursă de adevăr. errors[] = blocante; warnings[] = soft
// forțate prin override / informative. Severitatea o decide serverul (în funcție de override).
export type ValidateBookingInput = {
  unitTypeId: string
  checkIn: string
  checkOut: string
  adults?: number
  children?: number
  unitId?: string | null
  promoCode?: string | null
  override?: boolean
}

export async function validateBooking(input: ValidateBookingInput): Promise<ValidationResult> {
  const { data, error } = await supabase.rpc("validate_booking", {
    p_unit_type_id: input.unitTypeId,
    p_check_in: input.checkIn,
    p_check_out: input.checkOut,
    p_adults: input.adults,
    p_children: input.children,
    p_unit_id: input.unitId ?? undefined,
    p_promo_code: input.promoCode ?? undefined,
    p_override: input.override,
  })
  if (error) throw error
  const r = (data ?? {}) as { valid?: boolean; errors?: ValidationCode[]; warnings?: ValidationCode[] }
  return { valid: !!r.valid, errors: r.errors ?? [], warnings: r.warnings ?? [] }
}

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
