import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  createBooking, fetchAvailableUnits, fetchBookingEvents,
  fetchBookings, fetchBookingsInRange, fetchUnits,
  reassignBooking, updateBookingStatus,
  type BookingStatus, type CreateBookingInput,
} from "./api"

export const bookingKeys = {
  all: ["bookings"] as const,
  list: (propertyId: string) => ["bookings", propertyId] as const,
  range: (propertyId: string, from: string, to: string) =>
    ["bookings", propertyId, { from, to }] as const,
  events: (bookingId: string) => ["booking-events", bookingId] as const,
}

export const unitKeys = {
  list: (propertyId: string) => ["units", propertyId] as const,
  available: (unitTypeId: string, checkIn: string, checkOut: string, excludeId?: string) =>
    ["units-available", unitTypeId, checkIn, checkOut, excludeId] as const,
}

export function useBookings(propertyId: string | undefined) {
  return useQuery({
    queryKey: bookingKeys.list(propertyId ?? ""),
    queryFn: () => fetchBookings(propertyId!),
    enabled: !!propertyId,
  })
}

export function useBookingsInRange(propertyId: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: bookingKeys.range(propertyId ?? "", from, to),
    queryFn: () => fetchBookingsInRange(propertyId!, from, to),
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
  return useQuery({
    queryKey: bookingKeys.events(bookingId ?? ""),
    queryFn: () => fetchBookingEvents(bookingId!),
    enabled: !!bookingId,
  })
}

export function useCreateBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateBookingInput) => createBooking(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: bookingKeys.all }),
  })
}

export function useUpdateBookingStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: BookingStatus }) =>
      updateBookingStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: bookingKeys.all }),
  })
}

export function useReassignBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ bookingId, unitId }: { bookingId: string; unitId: string }) =>
      reassignBooking(bookingId, unitId),
    onSuccess: () => qc.invalidateQueries({ queryKey: bookingKeys.all }),
  })
}
