import { supabase } from "@/lib/supabase"
import { naturalCompare } from "@/lib/natural-sort"
import type { Database } from "@/lib/database.types"

export type CleaningStatus = "clean" | "dirty" | "inspected"

export type HousekeepingRoom =
  Database["public"]["Functions"]["get_housekeeping_board"]["Returns"][number]

// Panou housekeeping per proprietate — agregare server-side (ocupare/sosire/
// plecare azi, în tz proprietății), aceeași filozofie ca get_dashboard_stats.
// Gated server-side pe unit.manage (RPC aruncă FORBIDDEN, nu doar membership).
export async function fetchHousekeepingBoard(propertyId: string): Promise<HousekeepingRoom[]> {
  const { data, error } = await supabase.rpc("get_housekeeping_board", {
    p_property_id: propertyId,
  })
  if (error) throw error
  return [...data].sort((a, b) => naturalCompare(a.unit_name, b.unit_name))
}

// Schimbare directă, ca setUnitStatus — RLS (units_cud / unit.manage)
// autorizează; cleaning_status_at se actualizează automat (trigger DB).
export async function setUnitCleaningStatus(
  unitId: string,
  status: CleaningStatus
): Promise<void> {
  const { error } = await supabase.from("units").update({ cleaning_status: status }).eq("id", unitId)
  if (error) throw error
}

// Selecție multiplă (ex. manager care închide o tură) — RPC, fără raport
// parțial: curățenia nu interacționează cu rezervările viitoare.
export async function bulkSetUnitCleaningStatus(
  unitIds: string[],
  status: CleaningStatus
): Promise<number> {
  const { data, error } = await supabase.rpc("bulk_set_unit_cleaning_status", {
    p_unit_ids: unitIds,
    p_status: status,
  })
  if (error) throw error
  return data as number
}
