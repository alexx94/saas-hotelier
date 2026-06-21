import { useInfiniteQuery } from "@tanstack/react-query"
import { fetchActivityFeed, fetchEntityEvents, type ActivityFeedFilters } from "./api"

export const auditKeys = {
  entityEvents: (entityType: string, entityId: string) =>
    ["entity-events", entityType, entityId] as const,
  // filtrele intră în cheie — schimbarea lor e tratată ca un query nou, nu o
  // invalidare a celui vechi (paginile anterioare cu alte filtre rămân cache-uite)
  activityFeed: (propertyId: string, filters: ActivityFeedFilters) =>
    ["activity-feed", propertyId, filters] as const,
}

// Istoric generic pentru orice entitate auditată prin app.audit_entity
// (property, guest, payment, rate_rule, promotion, stay_rule, arrival_rule, closure).
export function useEntityEvents(entityType: string, entityId: string | null | undefined) {
  return useInfiniteQuery({
    queryKey: auditKeys.entityEvents(entityType, entityId ?? ""),
    queryFn: ({ pageParam }) => fetchEntityEvents(entityType, entityId!, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length : undefined),
    enabled: !!entityId,
  })
}

// Feed unificat per proprietate — toate evenimentele (booking/unit/unit_type/entity)
// ordonate cronologic, pentru pagina Activitate. staleTime mic (nu cel global de
// 30s): pagina e gândită să reflecte acțiuni recente ale altor membri ai echipei,
// nu doar ale userului curent — vezi și butonul de refresh manual din UI.
export function useActivityFeed(
  propertyId: string | null | undefined,
  filters: ActivityFeedFilters = {}
) {
  return useInfiniteQuery({
    queryKey: auditKeys.activityFeed(propertyId ?? "", filters),
    queryFn: ({ pageParam }) => fetchActivityFeed(propertyId!, pageParam, filters),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length : undefined),
    enabled: !!propertyId,
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
}
