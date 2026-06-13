import {
  useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient,
} from "@tanstack/react-query"
import {
  deletePayment, fetchPayments, fetchRevenueSummary, recordPayment,
  type RecordPaymentInput,
} from "./api"

export const paymentKeys = {
  all: ["payments"] as const,
  list: (bookingId: string) => ["payments", bookingId] as const,
  revenue: (propertyId: string) => ["revenue", propertyId] as const,
  revenueAll: ["revenue"] as const,
}

// O plată schimbă starea rezervării (payment_status, amount_paid) și venitul —
// invalidăm listele/detaliul rezervărilor, plățile și rezumatul de venit
function invalidatePaymentData(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: paymentKeys.all })
  qc.invalidateQueries({ queryKey: paymentKeys.revenueAll })
  qc.invalidateQueries({ queryKey: ["bookings"] })
  qc.invalidateQueries({ queryKey: ["booking"] })
  qc.invalidateQueries({ queryKey: ["booking-events"] })
}

// Listă paginată cu „Afișează mai mult" (vezi useBookingEvents)
export function usePayments(bookingId: string | undefined) {
  return useInfiniteQuery({
    queryKey: paymentKeys.list(bookingId ?? ""),
    queryFn: ({ pageParam }) => fetchPayments(bookingId!, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length : undefined),
    enabled: !!bookingId,
  })
}

export function useRecordPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: RecordPaymentInput) => recordPayment(input),
    onSuccess: () => invalidatePaymentData(qc),
  })
}

export function useDeletePayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deletePayment(id),
    onSuccess: () => invalidatePaymentData(qc),
  })
}

export function useRevenueSummary(propertyId: string | undefined) {
  return useQuery({
    queryKey: paymentKeys.revenue(propertyId ?? ""),
    queryFn: () => fetchRevenueSummary(propertyId!),
    enabled: !!propertyId,
  })
}
