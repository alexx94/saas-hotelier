import { supabase } from "@/lib/supabase"
import { naturalCompare } from "@/lib/natural-sort"
import type { Tables } from "@/lib/database.types"
import { pageRange, toPage, type Page } from "@/lib/pagination"
import { overrideRpcArgs, type PriceOverride } from "@/features/pricing/price-override"

export type BookingStatus =
  | "pending" | "confirmed" | "cancelled"
  | "checked_in" | "checked_out" | "no_show" | "blocked"

export type BookingChannel = "direct" | "booking_com" | "airbnb"

export const BOOKING_CHANNELS: BookingChannel[] = ["direct", "booking_com", "airbnb"]

export type UnitStatus = "active" | "inactive" | "out_of_service" | "archived"

export type Booking = Tables<"bookings"> & {
  guests: { full_name: string; email: string | null; phone: string | null } | null
  units: { name: string; status: string } | null
  unit_types: { name: string } | null
}

export type Unit = Tables<"units"> & {
  unit_types: {
    name: string; max_adults: number; max_children: number; base_price: number
    turnover_days: number
  } | null
}

export type BookingEvent = Tables<"booking_events"> & { actor_name: string | null }

export type AvailableUnit = {
  unit_id: string
  name: string
  status: string
  is_free: boolean
}

export const BOOKINGS_PAGE_SIZE = 20

// Parametrii listei într-un singur obiect — filtrele viitoare se adaugă aici;
// fiecare filtru restrânge rezultatul în query, înainte de offset
export type BookingListParams = { page?: number }

export async function fetchBookings(
  propertyId: string,
  params: BookingListParams = {}
): Promise<Page<Booking>> {
  const [from, to] = pageRange(params.page ?? 0, BOOKINGS_PAGE_SIZE)
  const { data, error } = await supabase
    .from("bookings")
    .select("*, guests(full_name,email,phone), units(name,status), unit_types(name)")
    .eq("property_id", propertyId)
    .order("check_in", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to)
  if (error) throw error
  return toPage(data as Booking[], BOOKINGS_PAGE_SIZE)
}

export async function fetchBookingsInRange(
  propertyId: string,
  from: string,
  to: string
): Promise<Booking[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*, guests(full_name,email,phone), units(name,status), unit_types(name)")
    .eq("property_id", propertyId)
    .lt("check_in", to)
    .gt("check_out", from)
    .not("status", "in", '("cancelled","no_show")')
  if (error) throw error
  return data as Booking[]
}

// Pentru calendar: toate camerele în exploatare (inclusiv inactive/mentenanță —
// rezervările lor existente rămân vizibile; doar arhivatele ies din grilă).
export async function fetchUnits(propertyId: string): Promise<Unit[]> {
  const { data, error } = await supabase
    .from("units")
    .select("*, unit_types(name, max_adults, max_children, base_price, turnover_days)")
    .eq("property_id", propertyId)
    .neq("status", "archived")
  if (error) throw error
  return (data as Unit[]).sort((a, b) => naturalCompare(a.name, b.name))
}

export type RoomBlock = Tables<"room_blocks">

export async function fetchBlocksInRange(
  propertyId: string,
  from: string,
  to: string
): Promise<RoomBlock[]> {
  const { data, error } = await supabase
    .from("room_blocks")
    .select("*")
    .eq("property_id", propertyId)
    .lt("start_date", to)
    .gt("end_date", from)
  if (error) throw error
  return data
}

export async function fetchAvailableUnits(
  unitTypeId: string,
  checkIn: string,
  checkOut: string,
  excludeBookingId?: string
): Promise<AvailableUnit[]> {
  const { data, error } = await supabase.rpc("get_available_units", {
    p_unit_type_id: unitTypeId,
    p_check_in: checkIn,
    p_check_out: checkOut,
    p_exclude_booking_id: excludeBookingId ?? undefined,
  })
  if (error) throw error
  return (data as AvailableUnit[]).sort((a, b) => naturalCompare(a.name, b.name))
}

// Detaliu complet pentru pagina rezervării
export type BookingDetail = Booking & {
  properties: { name: string } | null
}

export async function fetchBooking(bookingId: string): Promise<BookingDetail | null> {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "*, guests(full_name,email,phone), units(name,status), unit_types(name), properties(name)"
    )
    .eq("id", bookingId)
    .maybeSingle()
  if (error) throw error
  return data as BookingDetail | null
}

export async function linkBookingGuest(bookingId: string, guestId: string): Promise<void> {
  const { error } = await supabase.rpc("link_booking_guest", {
    p_booking_id: bookingId,
    p_guest_id: guestId,
  })
  if (error) throw error
}

// Paginat, cele mai recente primele — UI-ul cere pagina următoare cu "Afișează mai mult"
export const EVENTS_PAGE_SIZE = 15

export async function fetchBookingEvents(
  bookingId: string,
  page: number
): Promise<Page<BookingEvent>> {
  const [from, to] = pageRange(page, EVENTS_PAGE_SIZE)
  // Actorul (nume/email) e rezolvat server-side prin get_booking_events —
  // identic cu get_housekeeping_board/get_activity_feed (JOIN profiles/auth.users),
  // nu mapare client-side. p_limit cere intenționat un rând în plus (ca la
  // .range() PostgREST) — rândul suplimentar semnalează hasMore în toPage().
  const { data, error } = await supabase.rpc("get_booking_events", {
    p_booking_id: bookingId,
    p_limit: to - from + 1,
    p_offset: from,
  })
  if (error) throw error
  return toPage(data as BookingEvent[], EVENTS_PAGE_SIZE)
}

export type CreateBookingInput = {
  unitTypeId: string
  checkIn: string
  checkOut: string
  guestId?: string
  unitId?: string
  adults?: number
  children?: number
  // blocajele nu mai sunt rezervări — vezi room_blocks (Availability Blocks)
  status?: "pending" | "confirmed"
  // prețul (total + breakdown) e calculat și snapshot-uit server-side, din engine
  notes?: string
  // Manager Override: forțează peste restricțiile soft (doar owner/manager — validat server-side)
  override?: boolean
  // cod promoțional (opțional) — reducerea se rezolvă și se snapshot-uiește server-side
  promoCode?: string
  // override manual de preț (doar booking.price_override — validat server-side, Sprint 9).
  // Înlocuiește promoția. Vezi features/pricing/price-override.ts.
  priceOverride?: PriceOverride | null
  // canalul de distribuție (de unde a venit rezervarea). Default server-side: 'direct'.
  channel?: BookingChannel
}

export async function createBooking(input: CreateBookingInput): Promise<string> {
  const ov = overrideRpcArgs(input.priceOverride ?? null)
  const { data, error } = await supabase.rpc("create_booking", {
    p_unit_type_id: input.unitTypeId,
    p_check_in: input.checkIn,
    p_check_out: input.checkOut,
    p_guest_id: input.guestId ?? undefined,
    p_unit_id: input.unitId ?? undefined,
    p_adults: input.adults ?? 1,
    p_children: input.children ?? 0,
    p_status: input.status ?? "confirmed",
    p_notes: input.notes ?? undefined,
    p_override: input.override ?? false,
    p_promo_code: input.promoCode?.trim() || undefined,
    p_price_override_kind: ov.kind ?? undefined,
    p_price_override_value: ov.value ?? undefined,
    p_price_override_nights: ov.nights ?? undefined,
    p_price_override_note: ov.note ?? undefined,
    p_channel: input.channel ?? "direct",
  })
  if (error) throw error
  return data
}

// Editare preț pe rezervare existentă (override_booking_price RPC, Sprint 9).
// p_kind null = curăță override-ul (revine la prețul calculat de motor).
export async function overrideBookingPrice(
  bookingId: string,
  override: PriceOverride | null
): Promise<void> {
  const ov = overrideRpcArgs(override)
  const { error } = await supabase.rpc("override_booking_price", {
    p_booking_id: bookingId,
    p_kind: ov.kind ?? undefined,
    p_value: ov.value ?? undefined,
    p_nights: ov.nights ?? undefined,
    p_note: ov.note ?? undefined,
  })
  if (error) throw error
}

// Editare notă pe rezervare existentă (update_booking_notes RPC, Sprint 9.1).
// Disponibilă oricărui rol cu booking.edit (inclusiv recepție), indiferent de status.
export async function updateBookingNotes(bookingId: string, notes: string): Promise<void> {
  const { error } = await supabase.rpc("update_booking_notes", {
    p_booking_id: bookingId,
    p_notes: notes,
  })
  if (error) throw error
}

export async function updateBookingStatus(id: string, status: BookingStatus): Promise<void> {
  const { error } = await supabase.from("bookings").update({ status }).eq("id", id)
  if (error) throw new Error(error.message)
}

export async function updateBookingDates(
  bookingId: string,
  checkIn: string,
  checkOut: string,
  override = false
): Promise<void> {
  const { error } = await supabase.rpc("update_booking_dates", {
    p_booking_id: bookingId,
    p_check_in: checkIn,
    p_check_out: checkOut,
    p_override: override,
  })
  if (error) throw new Error(error.message)
}

export async function reassignBooking(bookingId: string, unitId: string): Promise<void> {
  const { error } = await supabase.rpc("reassign_booking", {
    p_booking_id: bookingId,
    p_unit_id: unitId,
  })
  if (error) throw error
}
