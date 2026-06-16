import {
  useInfiniteQuery, useMutation, useQuery, useQueryClient,
} from "@tanstack/react-query"
import type { TablesInsert, TablesUpdate } from "@/lib/database.types"
import {
  createArrivalRule, createClosure, createStayRule, deleteArrivalRule, deleteClosure, deleteStayRule,
  fetchArrivalRules, fetchArrivalRulesInRange, fetchClosures, fetchClosuresInRange, fetchStayRules,
  getBookingRestrictions, getStayConstraints, updateStayRule,
} from "./api"

export const reservationKeys = {
  stayRules: (unitTypeId: string) => ["stay-rules", unitTypeId] as const,
  closures: (propertyId: string) => ["closures", propertyId] as const,
  closuresRange: (propertyId: string, from: string, to: string) =>
    ["closures-range", propertyId, from, to] as const,
  arrivalRules: (propertyId: string) => ["arrival-rules", propertyId] as const,
  arrivalRulesRange: (propertyId: string, from: string, to: string) =>
    ["arrival-rules-range", propertyId, from, to] as const,
  stayConstraints: (unitTypeId: string, checkIn: string) =>
    ["stay-constraints", unitTypeId, checkIn] as const,
  bookingRestrictions: (unitTypeId: string, checkIn: string, checkOut: string) =>
    ["booking-restrictions", unitTypeId, checkIn, checkOut] as const,
}

// Liste paginate „Afișează mai mult" (rândul în plus din Page.hasMore decide pagina următoare)
export function useStayRules(unitTypeId: string | null) {
  return useInfiniteQuery({
    queryKey: reservationKeys.stayRules(unitTypeId ?? ""),
    queryFn: ({ pageParam }) => fetchStayRules(unitTypeId!, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length : undefined),
    enabled: !!unitTypeId,
  })
}

export function useClosures(propertyId: string | null) {
  return useInfiniteQuery({
    queryKey: reservationKeys.closures(propertyId ?? ""),
    queryFn: ({ pageParam }) => fetchClosures(propertyId!, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length : undefined),
    enabled: !!propertyId,
  })
}

// Toate închiderile care ating intervalul (calendar). Mărginit de interval, nepaginat.
export function useClosuresInRange(propertyId: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: reservationKeys.closuresRange(propertyId ?? "", from, to),
    queryFn: () => fetchClosuresInRange(propertyId!, from, to),
    enabled: !!propertyId && !!from && !!to && to > from,
  })
}

// Orice schimbare de reguli afectează listele + disponibilitatea + constrângerile.
function invalidateRules(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["stay-rules"] })
  qc.invalidateQueries({ queryKey: ["closures"] })
  qc.invalidateQueries({ queryKey: ["closures-range"] })
  qc.invalidateQueries({ queryKey: ["arrival-rules"] })
  qc.invalidateQueries({ queryKey: ["arrival-rules-range"] })
  qc.invalidateQueries({ queryKey: ["stay-constraints"] })
  qc.invalidateQueries({ queryKey: ["booking-restrictions"] })
}

export function useCreateStayRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: TablesInsert<"stay_rules">) => createStayRule(input),
    onSuccess: () => invalidateRules(qc),
  })
}

export function useUpdateStayRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TablesUpdate<"stay_rules"> }) =>
      updateStayRule(id, patch),
    onSuccess: () => invalidateRules(qc),
  })
}

export function useDeleteStayRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteStayRule(id),
    onSuccess: () => invalidateRules(qc),
  })
}

export function useCreateClosure() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: TablesInsert<"closures">) => createClosure(input),
    onSuccess: () => invalidateRules(qc),
  })
}

export function useDeleteClosure() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteClosure(id),
    onSuccess: () => invalidateRules(qc),
  })
}

// Constrângeri de durată efective pentru un tip + dată de check-in (limitează check-out-ul).
export function useStayConstraints(unitTypeId: string | undefined, checkIn: string) {
  return useQuery({
    queryKey: reservationKeys.stayConstraints(unitTypeId ?? "", checkIn),
    queryFn: () => getStayConstraints(unitTypeId!, checkIn),
    enabled: !!unitTypeId && !!checkIn,
  })
}

// ─── arrival_rules (sosire/plecare) ──────────────────────────────────────────────

export function useArrivalRules(propertyId: string | null) {
  return useInfiniteQuery({
    queryKey: reservationKeys.arrivalRules(propertyId ?? ""),
    queryFn: ({ pageParam }) => fetchArrivalRules(propertyId!, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length : undefined),
    enabled: !!propertyId,
  })
}

// Toate restricțiile care ating intervalul (calendar). Mărginit de interval, nepaginat.
export function useArrivalRulesInRange(propertyId: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: reservationKeys.arrivalRulesRange(propertyId ?? "", from, to),
    queryFn: () => fetchArrivalRulesInRange(propertyId!, from, to),
    enabled: !!propertyId && !!from && !!to && to > from,
  })
}

export function useCreateArrivalRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: TablesInsert<"arrival_rules">) => createArrivalRule(input),
    onSuccess: () => invalidateRules(qc),
  })
}

export function useDeleteArrivalRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteArrivalRule(id),
    onSuccess: () => invalidateRules(qc),
  })
}

// Toate motivele „soft" pe un tip + interval (afișate simultan în formularul de rezervare).
export function useBookingRestrictions(
  unitTypeId: string | undefined,
  checkIn: string,
  checkOut: string
) {
  return useQuery({
    queryKey: reservationKeys.bookingRestrictions(unitTypeId ?? "", checkIn, checkOut),
    queryFn: () => getBookingRestrictions(unitTypeId!, checkIn, checkOut),
    enabled: !!unitTypeId && !!checkIn && !!checkOut && checkOut > checkIn,
  })
}
