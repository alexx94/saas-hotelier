import { supabase } from "@/lib/supabase"
import type { Tables, TablesInsert } from "@/lib/database.types"
import { pageRange, toPage, type Page } from "@/lib/pagination"

export type Guest = Tables<"guests">

export const GUESTS_PAGE_SIZE = 20

// Parametrii listei într-un singur obiect — filtrele viitoare se adaugă aici;
// fiecare filtru restrânge rezultatul în query, înainte de offset
export type GuestListParams = { search?: string; page?: number }

export async function fetchGuests(
  orgId: string,
  params: GuestListParams = {}
): Promise<Page<Guest>> {
  const [from, to] = pageRange(params.page ?? 0, GUESTS_PAGE_SIZE)
  let query = supabase
    .from("guests")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to)
  if (params.search && params.search.trim()) {
    const s = params.search.trim()
    const filters = [`full_name.ilike.%${s}%`, `email.ilike.%${s}%`, `phone.ilike.%${s}%`]
    // telefonul se caută și pe forma normalizată (doar cifre), indiferent de format
    const digits = s.replace(/\D/g, "")
    if (digits) filters.push(`phone_search.ilike.%${digits}%`)
    query = query.or(filters.join(","))
  }
  const { data, error } = await query
  if (error) throw error
  return toPage(data, GUESTS_PAGE_SIZE)
}

export async function createGuest(input: TablesInsert<"guests">): Promise<Guest> {
  const { data, error } = await supabase
    .from("guests")
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function fetchGuest(guestId: string): Promise<Guest | null> {
  const { data, error } = await supabase
    .from("guests")
    .select("*")
    .eq("id", guestId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function updateGuest(
  guestId: string,
  patch: Pick<TablesInsert<"guests">, "full_name" | "email" | "phone" | "notes">
): Promise<Guest> {
  const { data, error } = await supabase
    .from("guests")
    .update(patch)
    .eq("id", guestId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteGuest(guestId: string): Promise<void> {
  const { error } = await supabase.from("guests").delete().eq("id", guestId)
  if (error) throw error
}

// Rezervările unui oaspete, cu context (proprietate/cameră) pentru istoric
export type GuestBooking = Tables<"bookings"> & {
  properties: { name: string } | null
  units: { name: string } | null
  unit_types: { name: string } | null
}

export const GUEST_BOOKINGS_PAGE_SIZE = 15

export async function fetchGuestBookings(
  guestId: string,
  page = 0
): Promise<Page<GuestBooking>> {
  const [from, to] = pageRange(page, GUEST_BOOKINGS_PAGE_SIZE)
  const { data, error } = await supabase
    .from("bookings")
    .select("*, properties(name), units(name), unit_types(name)")
    .eq("guest_id", guestId)
    .order("check_in", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to)
  if (error) throw error
  return toPage(data as GuestBooking[], GUEST_BOOKINGS_PAGE_SIZE)
}

// Totalurile pentru profilul oaspetelui — agregate în DB (RPC), nu pe client
export type GuestStats = { total: number; upcoming: number; cancelled: number }

export async function fetchGuestStats(guestId: string): Promise<GuestStats> {
  const { data, error } = await supabase
    .rpc("get_guest_stats", { p_guest_id: guestId })
    .single()
  if (error) throw error
  return data
}

export type FindOrCreateResult = { guest_id: string; matched_by: string | null }

export async function findOrCreateGuest(
  orgId: string,
  fullName: string,
  email?: string,
  phone?: string
): Promise<FindOrCreateResult> {
  const { data, error } = await supabase.rpc("find_or_create_guest", {
    p_org_id: orgId,
    p_full_name: fullName,
    p_email: email ?? undefined,
    p_phone: phone ?? undefined,
  })
  if (error) throw error
  return data as FindOrCreateResult
}
