import { supabase } from "@/lib/supabase"

export type PublicProperty = {
  id: string
  name: string
  slug: string
  type: string
  description: Record<string, string> | null
  address: string | null
  city: string | null
  country: string
  currency: string
  default_locale: string
}

export type AvailabilityItem = {
  unit_type_id: string
  name: string
  description: Record<string, string> | null
  max_adults: number
  max_children: number
  min_stay: number
  max_stay: number
  price_per_night: number
  total_price: number
  currency: string
  available_units: number
}

export async function fetchPublicProperty(slug: string): Promise<PublicProperty> {
  const { data, error } = await supabase
    .from("properties")
    .select("id, name, slug, type, description, address, city, country, currency, default_locale")
    .eq("slug", slug)
    .single()
  if (error) throw error
  return data as PublicProperty
}

export async function fetchAvailability(
  slug: string,
  checkIn: string,
  checkOut: string,
  adults = 1,
  children = 0
): Promise<AvailabilityItem[]> {
  const { data, error } = await supabase.rpc("public_get_availability", {
    p_slug: slug,
    p_check_in: checkIn,
    p_check_out: checkOut,
    p_adults: adults,
    p_children: children,
  })
  if (error) throw error
  return (data ?? []) as AvailabilityItem[]
}

export type PublicBookingInput = {
  slug: string
  unitTypeId: string
  checkIn: string
  checkOut: string
  fullName: string
  email: string
  phone?: string
  adults: number
  children: number
  notes?: string
}

export async function createPublicBooking(
  input: PublicBookingInput
): Promise<{ booking_id: string; status: string }> {
  const { data, error } = await supabase.rpc("public_create_booking", {
    p_slug: input.slug,
    p_unit_type_id: input.unitTypeId,
    p_check_in: input.checkIn,
    p_check_out: input.checkOut,
    p_full_name: input.fullName,
    p_email: input.email,
    p_phone: input.phone,
    p_adults: input.adults,
    p_children: input.children,
    p_notes: input.notes,
  })
  if (error) throw error
  return data as { booking_id: string; status: string }
}
