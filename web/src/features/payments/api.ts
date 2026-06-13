import { supabase } from "@/lib/supabase"
import type { Tables } from "@/lib/database.types"
import { pageRange, toPage, type Page } from "@/lib/pagination"

export type Payment = Tables<"payments">

export type PaymentKind = "payment" | "refund"
export type PaymentMethod = "cash" | "card" | "bank_transfer" | "online" | "other"
export type PaymentStatus = "unpaid" | "partial" | "paid" | "refunded"

export const PAYMENT_METHODS: PaymentMethod[] = [
  "cash", "card", "bank_transfer", "online", "other",
]

// Rezumat venit (server-side, în timezone-ul proprietății)
export type RevenueSummary = {
  revenue_today: number
  revenue_month: number
  revenue_year: number
  currency: string
}

// Paginat ca istoricurile (Sprint 2.1): plățile pot crește nelimitat în timp,
// deci „Afișează mai mult" peste offset, nu fetch integral. Rezumatul (total/
// încasat/stare) NU depinde de lista asta — vine din rândul bookings (agregat
// server-side de trigger), deci e O(1) indiferent de câte plăți există.
export const PAYMENTS_PAGE_SIZE = 15

export async function fetchPayments(
  bookingId: string,
  page: number
): Promise<Page<Payment>> {
  const [from, to] = pageRange(page, PAYMENTS_PAGE_SIZE)
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("booking_id", bookingId)
    .order("paid_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to)
  if (error) throw error
  return toPage(data, PAYMENTS_PAGE_SIZE)
}

export type RecordPaymentInput = {
  bookingId: string
  amount: number
  kind: PaymentKind
  method: PaymentMethod
  paidAt?: string
  note?: string
}

export async function recordPayment(input: RecordPaymentInput): Promise<string> {
  const { data, error } = await supabase.rpc("record_payment", {
    p_booking_id: input.bookingId,
    p_amount: input.amount,
    p_kind: input.kind,
    p_method: input.method,
    p_paid_at: input.paidAt ?? undefined,
    p_note: input.note ?? undefined,
  })
  if (error) throw error
  return data
}

export async function deletePayment(id: string): Promise<void> {
  const { error } = await supabase.from("payments").delete().eq("id", id)
  if (error) throw error
}

export async function fetchRevenueSummary(propertyId: string): Promise<RevenueSummary> {
  const { data, error } = await supabase.rpc("get_revenue_summary", {
    p_property_id: propertyId,
  })
  if (error) throw error
  // RPC întoarce un singur rând
  return (data as RevenueSummary[])[0]
}
