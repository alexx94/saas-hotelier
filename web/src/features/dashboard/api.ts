import { supabase } from "@/lib/supabase"

// Metrici operaționale ale panoului, agregate server-side în timezone-ul
// proprietății (RPC get_dashboard_stats). Venitul vine separat din
// payments/ (get_revenue_summary) — vezi RevenueCards.
export type DashboardStats = {
  arrivals_today: number
  departures_today: number
  in_house_guests: number
  occupied_units: number
  available_units: number
  total_units: number
  occupancy_pct: number
  bookings_month: number
  bookings_year: number
  cancellations_month: number
}

export async function fetchDashboardStats(propertyId: string): Promise<DashboardStats> {
  const { data, error } = await supabase.rpc("get_dashboard_stats", {
    p_property_id: propertyId,
  })
  if (error) throw error
  // RPC întoarce un singur rând
  return (data as DashboardStats[])[0]
}
