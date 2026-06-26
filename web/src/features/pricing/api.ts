import { supabase } from "@/lib/supabase"
import { pageRange, toPage, type Page } from "@/lib/pagination"
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/database.types"

export type RateRule = Tables<"rate_rules">
export type RateRuleKind = "season" | "override"

// Rezultatul motorului de preț (app.compute_price, expus prin RPC quote_price).
export type PriceNight = {
  date: string
  kind: "base" | "season" | "override"
  base: number
  rate: number
  weekend: boolean
  // marcaj că tariful nopții a fost setat manual (override de preț, Sprint 9)
  manual?: boolean
}
// Promoția rezolvată (din app.resolve_promotion) — atașată quote-ului/preview-ului.
export type AppliedPromotion = {
  applied: boolean
  // codul introdus a corespuns unei promoții eligibile (chiar dacă a fost depășit de
  // o promoție automată mai bună — best-of, non-stacking)
  code_matched?: boolean
  promotion_id?: string
  code?: string | null
  name?: string
  discount_type?: "percent" | "amount"
  discount_value?: number
  discount_amount?: number
  reason?: string | null
}

export type PriceQuote = {
  currency: string
  nights: PriceNight[]
  subtotal: number
  // total = subtotal − discount (după aplicarea promoției, dacă există)
  total: number
  discount?: number
  promotion?: AppliedPromotion
  avg_nightly: number
  night_count: number
  // prezent când prețul a fost setat manual (override) — vezi price-override.ts
  override?: { kind: "total" | "adjustment" | "per_night"; value: number | null }
}

// Tarif rezolvat per tip × zi (din get_rate_calendar) — pictat în celulele calendarului.
export type RateCalendarEntry = {
  unit_type_id: string
  day: string
  rate: number
  kind: "base" | "season" | "override"
}

export async function fetchRateRules(unitTypeId: string): Promise<RateRule[]> {
  const { data, error } = await supabase
    .from("rate_rules")
    .select("*")
    .eq("unit_type_id", unitTypeId)
    .order("start_date", { ascending: true })
  if (error) throw error
  return data
}

// Listele de tarife cresc în timp → paginate cu „Afișează mai mult" (ca celelalte liste).
export const RATE_PAGE_SIZE = 15

// Sezoane ale unui tip (dialogul de prețuri = doar sezon; override-urile vin din calendar)
export async function fetchSeasons(unitTypeId: string, page: number): Promise<Page<RateRule>> {
  const [from, to] = pageRange(page, RATE_PAGE_SIZE)
  const { data, error } = await supabase
    .from("rate_rules")
    .select("*")
    .eq("unit_type_id", unitTypeId)
    .eq("kind", "season")
    .order("start_date", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to)
  if (error) throw error
  return toPage(data, RATE_PAGE_SIZE)
}

// Override-uri ale unei proprietăți (toate tipurile) — gestionate din calendar.
export async function fetchOverrides(propertyId: string, page: number): Promise<Page<RateRule>> {
  const [from, to] = pageRange(page, RATE_PAGE_SIZE)
  const { data, error } = await supabase
    .from("rate_rules")
    .select("*")
    .eq("property_id", propertyId)
    .eq("kind", "override")
    .order("start_date", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to)
  if (error) throw error
  return toPage(data, RATE_PAGE_SIZE)
}

export async function fetchRateCalendar(
  propertyId: string,
  from: string,
  to: string
): Promise<RateCalendarEntry[]> {
  const { data, error } = await supabase.rpc("get_rate_calendar", {
    p_property_id: propertyId,
    p_from: from,
    p_to: to,
  })
  if (error) throw error
  return (data ?? []) as RateCalendarEntry[]
}

export async function createRateRule(input: TablesInsert<"rate_rules">): Promise<void> {
  const { error } = await supabase.from("rate_rules").insert(input)
  if (error) throw error
}

export async function updateRateRule(
  id: string,
  patch: TablesUpdate<"rate_rules">
): Promise<void> {
  const { error } = await supabase.from("rate_rules").update(patch).eq("id", id)
  if (error) throw error
}

export async function deleteRateRule(id: string): Promise<void> {
  const { error } = await supabase.from("rate_rules").delete().eq("id", id)
  if (error) throw error
}

// Estimare preț server-side (sursă unică de adevăr — același motor ca la creare).
export async function quotePrice(
  unitTypeId: string,
  checkIn: string,
  checkOut: string,
  promoCode?: string
): Promise<PriceQuote> {
  const { data, error } = await supabase.rpc("quote_price", {
    p_unit_type_id: unitTypeId,
    p_check_in: checkIn,
    p_check_out: checkOut,
    p_promo_code: promoCode?.trim() || undefined,
  })
  if (error) throw error
  return data as unknown as PriceQuote
}
