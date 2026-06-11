import {
  keepPreviousData, useMutation, useQuery, useQueryClient,
} from "@tanstack/react-query"
import type { TablesInsert } from "@/lib/database.types"
import {
  createGuest, deleteGuest, fetchGuest, fetchGuestBookings,
  fetchGuests, fetchGuestStats, findOrCreateGuest, updateGuest,
  type GuestListParams,
} from "./api"

export const guestKeys = {
  all: (orgId: string) => ["guests", orgId] as const,
  // params (search, page, filtre viitoare) intră ca obiect în cheie —
  // invalidarea pe prefix all() acoperă toate paginile/filtrele
  list: (orgId: string, params: GuestListParams) =>
    ["guests", orgId, "list", params] as const,
  detail: (guestId: string) => ["guest", guestId] as const,
  bookings: (guestId: string, page: number) =>
    ["guest-bookings", guestId, { page }] as const,
  bookingsAll: ["guest-bookings"] as const,
  stats: (guestId: string) => ["guest-stats", guestId] as const,
  statsAll: ["guest-stats"] as const,
}

export function useGuests(orgId: string, params: GuestListParams = {}) {
  // normalizare → aceeași cerere produce aceeași cheie indiferent de apelant
  // (ex. combobox fără page și lista pe pagina 0 împart cache-ul)
  const normalized: GuestListParams = {
    search: params.search?.trim() || undefined,
    page: params.page ?? 0,
  }
  return useQuery({
    queryKey: guestKeys.list(orgId, normalized),
    queryFn: () => fetchGuests(orgId, normalized),
    enabled: !!orgId,
    placeholderData: keepPreviousData,
  })
}

export function useCreateGuest(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: TablesInsert<"guests">) => createGuest(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: guestKeys.all(orgId) }),
  })
}

export function useGuest(guestId: string | undefined) {
  return useQuery({
    queryKey: guestKeys.detail(guestId ?? ""),
    queryFn: () => fetchGuest(guestId!),
    enabled: !!guestId,
  })
}

export function useGuestBookings(guestId: string | undefined, page = 0) {
  return useQuery({
    queryKey: guestKeys.bookings(guestId ?? "", page),
    queryFn: () => fetchGuestBookings(guestId!, page),
    enabled: !!guestId,
    placeholderData: keepPreviousData,
  })
}

export function useGuestStats(guestId: string | undefined) {
  return useQuery({
    queryKey: guestKeys.stats(guestId ?? ""),
    queryFn: () => fetchGuestStats(guestId!),
    enabled: !!guestId,
  })
}

export function useUpdateGuest(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      guestId, patch,
    }: { guestId: string; patch: Parameters<typeof updateGuest>[1] }) =>
      updateGuest(guestId, patch),
    onSuccess: (_data, { guestId }) => {
      qc.invalidateQueries({ queryKey: guestKeys.all(orgId) })
      qc.invalidateQueries({ queryKey: guestKeys.detail(guestId) })
    },
  })
}

export function useDeleteGuest(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (guestId: string) => deleteGuest(guestId),
    onSuccess: () => qc.invalidateQueries({ queryKey: guestKeys.all(orgId) }),
  })
}

export function useFindOrCreateGuest(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      fullName, email, phone,
    }: { fullName: string; email?: string; phone?: string }) =>
      findOrCreateGuest(orgId, fullName, email, phone),
    onSuccess: () => qc.invalidateQueries({ queryKey: guestKeys.all(orgId) }),
  })
}
