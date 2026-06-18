import {
  keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"
import {
  createBooking, fetchAvailableUnits, fetchBooking, fetchBookingEvents,
  fetchBlocksInRange, fetchBookings, fetchBookingsInRange, fetchUnits, linkBookingGuest,
  reassignBooking, updateBookingDates, updateBookingStatus,
  type BookingListParams, type BookingStatus, type CreateBookingInput,
} from "./api"
import { guestKeys } from "@/features/guests/hooks"
import { dashboardKeys } from "@/features/dashboard/hooks"

export const bookingKeys = {
  all: ["bookings"] as const,
  // params (page, filtre viitoare) intră ca obiect în cheie —
  // invalidarea pe prefix all acoperă toate paginile/filtrele
  list: (propertyId: string, params: BookingListParams) =>
    ["bookings", propertyId, "list", params] as const,
  range: (propertyId: string, from: string, to: string) =>
    ["bookings", propertyId, "range", { from, to }] as const,
  detail: (bookingId: string) => ["booking", bookingId] as const,
  detailAll: ["booking"] as const,
  events: (bookingId: string) => ["booking-events", bookingId] as const,
  eventsAll: ["booking-events"] as const,
}

// Orice mutație pe rezervări afectează listele, detaliul, istoricul (audit),
// datele oaspetelui (istoric + statistici) și metricile panoului
// (sosiri/plecări/ocupare/rezervări)
function invalidateBookingData(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: bookingKeys.all })
  qc.invalidateQueries({ queryKey: bookingKeys.detailAll })
  qc.invalidateQueries({ queryKey: bookingKeys.eventsAll })
  qc.invalidateQueries({ queryKey: guestKeys.bookingsAll })
  qc.invalidateQueries({ queryKey: guestKeys.statsAll })
  qc.invalidateQueries({ queryKey: dashboardKeys.all })
}

export const unitKeys = {
  list: (propertyId: string) => ["units", propertyId] as const,
  available: (unitTypeId: string, checkIn: string, checkOut: string, excludeId?: string) =>
    ["units-available", unitTypeId, checkIn, checkOut, excludeId] as const,
}

export const blockKeys = {
  range: (propertyId: string, from: string, to: string) =>
    ["unit-blocks", propertyId, "range", { from, to }] as const,
}

export function useBookings(
  propertyId: string | undefined,
  params: BookingListParams = {}
) {
  // normalizare → aceeași cerere produce aceeași cheie indiferent de apelant
  const normalized: BookingListParams = { page: params.page ?? 0 }
  return useQuery({
    queryKey: bookingKeys.list(propertyId ?? "", normalized),
    queryFn: () => fetchBookings(propertyId!, normalized),
    enabled: !!propertyId,
    placeholderData: keepPreviousData,
  })
}

export function useBookingsInRange(propertyId: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: bookingKeys.range(propertyId ?? "", from, to),
    queryFn: () => fetchBookingsInRange(propertyId!, from, to),
    enabled: !!propertyId,
  })
}

export function useBlocksInRange(propertyId: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: blockKeys.range(propertyId ?? "", from, to),
    queryFn: () => fetchBlocksInRange(propertyId!, from, to),
    enabled: !!propertyId,
  })
}

export function useUnits(propertyId: string | undefined) {
  return useQuery({
    queryKey: unitKeys.list(propertyId ?? ""),
    queryFn: () => fetchUnits(propertyId!),
    enabled: !!propertyId,
  })
}

export function useAvailableUnits(
  unitTypeId: string | undefined,
  checkIn: string,
  checkOut: string,
  excludeBookingId?: string
) {
  return useQuery({
    queryKey: unitKeys.available(unitTypeId ?? "", checkIn, checkOut, excludeBookingId),
    queryFn: () => fetchAvailableUnits(unitTypeId!, checkIn, checkOut, excludeBookingId),
    enabled: !!unitTypeId && !!checkIn && !!checkOut && checkOut > checkIn,
  })
}

export function useBookingEvents(bookingId: string | undefined) {
  return useInfiniteQuery({
    queryKey: bookingKeys.events(bookingId ?? ""),
    queryFn: ({ pageParam }) => fetchBookingEvents(bookingId!, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length : undefined),
    enabled: !!bookingId,
  })
}

export function useBooking(bookingId: string | undefined) {
  return useQuery({
    queryKey: bookingKeys.detail(bookingId ?? ""),
    queryFn: () => fetchBooking(bookingId!),
    enabled: !!bookingId,
  })
}

export function useLinkBookingGuest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ bookingId, guestId }: { bookingId: string; guestId: string }) =>
      linkBookingGuest(bookingId, guestId),
    onSuccess: () => invalidateBookingData(qc),
  })
}

export function useCreateBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateBookingInput) => createBooking(input),
    onSuccess: () => invalidateBookingData(qc),
  })
}

export function useUpdateBookingStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: BookingStatus }) =>
      updateBookingStatus(id, status),
    onSuccess: () => invalidateBookingData(qc),
  })
}

export function useReassignBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ bookingId, unitId }: { bookingId: string; unitId: string }) =>
      reassignBooking(bookingId, unitId),
    onSuccess: () => invalidateBookingData(qc),
  })
}

export function useUpdateBookingDates() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ bookingId, checkIn, checkOut, override }:
      { bookingId: string; checkIn: string; checkOut: string; override?: boolean }) =>
      updateBookingDates(bookingId, checkIn, checkOut, override ?? false),
    onSuccess: () => invalidateBookingData(qc),
  })
}
