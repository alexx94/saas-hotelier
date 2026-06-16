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

// Motivul pentru care un tip nu poate fi rezervat (NULL = rezervabil). Prioritate =
// ordinea verificărilor din motorul de creare (vezi public_get_availability).
export type AvailabilityReason =
  | "OCCUPANCY" | "CLOSED" | "STAY_TOO_SHORT" | "STAY_TOO_LONG"
  | "NO_ARRIVAL" | "NO_DEPARTURE" | "UNAVAILABLE"

export type AvailabilityItem = {
  unit_type_id: string
  name: string
  description: Record<string, string> | null
  max_adults: number
  max_children: number
  min_stay: number
  max_stay: number
  price_per_night: number
  total_price: number          // subtotal „de raft" (înainte de reducere)
  discount: number             // reducere automată pe sejur (0 dacă nerezervabil)
  promo_label: string | null   // cod sau nume al promoției automate
  currency: string
  available_units: number
  reason: AvailabilityReason | null  // NULL = rezervabil
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

// Preview reducere pe pagina publică (subtotal/discount/total + promoția rezolvată).
export type PromoPreview = {
  currency: string
  subtotal: number
  discount: number
  total: number
  promotion: {
    applied: boolean
    code_matched?: boolean
    code?: string | null
    name?: string
    discount_amount?: number
    reason?: string | null
  }
}

export async function previewPromo(
  slug: string,
  unitTypeId: string,
  checkIn: string,
  checkOut: string,
  code?: string
): Promise<PromoPreview> {
  const { data, error } = await supabase.rpc("public_preview_promo", {
    p_slug: slug,
    p_unit_type_id: unitTypeId,
    p_check_in: checkIn,
    p_check_out: checkOut,
    p_code: code?.trim() || undefined,
  })
  if (error) throw error
  return data as unknown as PromoPreview
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
  promoCode?: string
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
    p_promo_code: input.promoCode?.trim() || undefined,
  })
  if (error) throw error
  return data as { booking_id: string; status: string }
}
