import { useQuery } from "@tanstack/react-query"
import { fetchDashboardStats } from "./api"

export const dashboardKeys = {
  all: ["dashboard"] as const,
  stats: (propertyId: string) => ["dashboard", propertyId] as const,
}

// Metricile operaționale derivă din bookings/units, deci se invalidează la
// orice mutație pe rezervări (vezi invalidateBookingData în bookings/hooks).
// Cardul „Venit" reutilizează useRevenueSummary, invalidat la rândul lui de
// mutațiile de plăți — nu depinde de cheia asta.
export function useDashboardStats(propertyId: string | undefined) {
  return useQuery({
    queryKey: dashboardKeys.stats(propertyId ?? ""),
    queryFn: () => fetchDashboardStats(propertyId!),
    enabled: !!propertyId,
  })
}
