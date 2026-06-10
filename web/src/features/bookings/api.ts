import { supabase } from "@/lib/supabase"
import type { Tables } from "@/lib/database.types"

export type BookingStatus =
  | "pending" | "confirmed" | "cancelled"
  | "checked_in" | "checked_out" | "no_show" | "blocked"

export type UnitStatus = "active" | "inactive" | "out_of_service" | "archived"

export type Booking = Tables<"bookings"> & {
  guests: { full_name: string; email: string | null; phone: string | null } | null
  units: { name: string; status: string } | null
  unit_types: { name: string } | null
}

export type Unit = Tables<"units"> & {
  unit_types: { name: string; capacity: number; base_price: number } | null
}

export type BookingEvent = Tables<"booking_events">

export type AvailableUnit = {
  unit_id: string
  name: string
  status: string
  is_free: boolean
}

export async function fetchBookings(propertyId: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*, guests(full_name,email,phone), units(name,status), unit_types(name)")
    .eq("property_id", propertyId)
    .order("check_in", { ascending: false })
    .limit(300)
  if (error) throw error
  return data as Booking[]
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

export async function fetchUnits(propertyId: string): Promise<Unit[]> {
  const { data, error } = await supabase
    .from("units")
    .select("*, unit_types(name, capacity, base_price)")
    .eq("property_id", propertyId)
    .eq("status", "active")
    .order("name")
  if (error) throw error
  return data as Unit[]
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
  return data as AvailableUnit[]
}

export async function fetchBookingEvents(bookingId: string): Promise<BookingEvent[]> {
  const { data, error } = await supabase
    .from("booking_events")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true })
  if (error) throw error
  return data
}

export type CreateBookingInput = {
  unitTypeId: string
  checkIn: string
  checkOut: string
  guestId?: string
  unitId?: string
  guestsCount?: number
  status?: "pending" | "confirmed" | "blocked"
  total?: number
  notes?: string
}

export async function createBooking(input: CreateBookingInput): Promise<string> {
  const { data, error } = await supabase.rpc("create_booking", {
    p_unit_type_id: input.unitTypeId,
    p_check_in: input.checkIn,
    p_check_out: input.checkOut,
    p_guest_id: input.guestId ?? undefined,
    p_unit_id: input.unitId ?? undefined,
    p_guests_count: input.guestsCount ?? 1,
    p_status: input.status ?? "confirmed",
    p_total: input.total ?? undefined,
    p_notes: input.notes ?? undefined,
  })
  if (error) throw error
  return data
}

export async function updateBookingStatus(id: string, status: BookingStatus): Promise<void> {
  const { error } = await supabase.from("bookings").update({ status }).eq("id", id)
  if (error) throw error
}

export async function reassignBooking(bookingId: string, unitId: string): Promise<void> {
  const { error } = await supabase.rpc("reassign_booking", {
    p_booking_id: bookingId,
    p_unit_id: unitId,
  })
  if (error) throw error
}
