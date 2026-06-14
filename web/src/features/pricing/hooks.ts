import {
  useInfiniteQuery, useMutation, useQuery, useQueryClient,
} from "@tanstack/react-query"
import type { TablesInsert, TablesUpdate } from "@/lib/database.types"
import {
  createRateRule, deleteRateRule, fetchOverrides, fetchRateCalendar, fetchSeasons,
  quotePrice, updateRateRule,
} from "./api"

export const pricingKeys = {
  seasons: (unitTypeId: string) => ["rate-seasons", unitTypeId] as const,
  overrides: (propertyId: string) => ["rate-overrides", propertyId] as const,
  calendar: (propertyId: string, from: string, to: string) =>
    ["rate-calendar", propertyId, from, to] as const,
  quote: (unitTypeId: string, checkIn: string, checkOut: string) =>
    ["price-quote", unitTypeId, checkIn, checkOut] as const,
}

// Liste paginate „Afișează mai mult" (rândul în plus din Page.hasMore decide pagina următoare)
export function useSeasons(unitTypeId: string | null) {
  return useInfiniteQuery({
    queryKey: pricingKeys.seasons(unitTypeId ?? ""),
    queryFn: ({ pageParam }) => fetchSeasons(unitTypeId!, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length : undefined),
    enabled: !!unitTypeId,
  })
}

export function useOverrides(propertyId: string | null) {
  return useInfiniteQuery({
    queryKey: pricingKeys.overrides(propertyId ?? ""),
    queryFn: ({ pageParam }) => fetchOverrides(propertyId!, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length : undefined),
    enabled: !!propertyId,
  })
}

export function useRateCalendar(propertyId: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: pricingKeys.calendar(propertyId ?? "", from, to),
    queryFn: () => fetchRateCalendar(propertyId!, from, to),
    enabled: !!propertyId && !!from && !!to && to > from,
  })
}

// Orice schimbare de reguli afectează listele + estimările + calendarul de tarife.
function invalidatePricing(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["rate-seasons"] })
  qc.invalidateQueries({ queryKey: ["rate-overrides"] })
  qc.invalidateQueries({ queryKey: ["rate-calendar"] })
  qc.invalidateQueries({ queryKey: ["price-quote"] })
}

export function useCreateRateRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: TablesInsert<"rate_rules">) => createRateRule(input),
    onSuccess: () => invalidatePricing(qc),
  })
}

export function useUpdateRateRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TablesUpdate<"rate_rules"> }) =>
      updateRateRule(id, patch),
    onSuccess: () => invalidatePricing(qc),
  })
}

export function useDeleteRateRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteRateRule(id),
    onSuccess: () => invalidatePricing(qc),
  })
}

export function useQuotePrice(
  unitTypeId: string | undefined,
  checkIn: string,
  checkOut: string
) {
  return useQuery({
    queryKey: pricingKeys.quote(unitTypeId ?? "", checkIn, checkOut),
    queryFn: () => quotePrice(unitTypeId!, checkIn, checkOut),
    enabled: !!unitTypeId && !!checkIn && !!checkOut && checkOut > checkIn,
  })
}
