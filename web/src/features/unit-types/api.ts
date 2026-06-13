import { supabase } from "@/lib/supabase"
import { naturalCompare } from "@/lib/natural-sort"
import { pageRange, toPage, type Page } from "@/lib/pagination"
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/database.types"

export type UnitType = Tables<"unit_types"> & { units: { count: number }[] }
export type Unit = Tables<"units">
export type UnitStatus = "active" | "inactive" | "out_of_service" | "archived"
export type UnitEvent = Tables<"unit_events">
export type UnitTypeEvent = Tables<"unit_type_events">

export type BlockReason =
  | "maintenance" | "renovation" | "owner_use" | "internal_use" | "other"
export const BLOCK_REASONS: BlockReason[] = [
  "maintenance", "renovation", "owner_use", "internal_use", "other",
]

// Blocaj de disponibilitate pe interval — tabel dedicat (migrația 17).
// Statusul camerei rămâne neatins; indisponibilitatea e doar pe perioada blocată.
export type UnitBlock = Tables<"room_blocks">
export type BulkBlockResult = { blocked: number; skipped: string[] }
export type BulkStatusResult = { updated: number; blocked: string[] }

export async function fetchUnitTypes(propertyId: string): Promise<UnitType[]> {
  const { data, error } = await supabase
    .from("unit_types")
    .select("*, units(count)")
    .eq("property_id", propertyId)
    .order("sort_order")
    .order("name")
  if (error) throw error
  return data as UnitType[]
}

export async function fetchUnitsForType(unitTypeId: string): Promise<Unit[]> {
  const { data, error } = await supabase
    .from("units")
    .select("*")
    .eq("unit_type_id", unitTypeId)
  if (error) throw error
  return data.sort((a, b) => naturalCompare(a.name, b.name))
}

export async function createUnitType(
  input: TablesInsert<"unit_types">,
  roomsCount: number,
  roomPrefix: string,
  startNumber = 1
): Promise<{ id: string; unitsCreated: number }> {
  const { data, error } = await supabase
    .from("unit_types")
    .insert(input)
    .select("id")
    .single()
  if (error) throw error
  const unitsCreated = await generateUnitsForType(data.id, roomsCount, roomPrefix, startNumber)
  return { id: data.id, unitsCreated }
}

export async function generateUnitsForType(
  unitTypeId: string,
  count: number,
  prefix: string,
  startNumber = 1
): Promise<number> {
  const { data, error } = await supabase.rpc("generate_units", {
    p_unit_type_id: unitTypeId,
    p_count: count,
    p_prefix: prefix,
    p_start_number: startNumber,
  })
  if (error) throw error
  return data as number
}

export async function updateUnitType(
  id: string,
  patch: TablesUpdate<"unit_types">
): Promise<void> {
  const { error } = await supabase.from("unit_types").update(patch).eq("id", id)
  if (error) throw error
}

export async function deleteOrArchiveUnitType(
  id: string
): Promise<"deleted" | "archived" | "has_future_bookings"> {
  const { error } = await supabase.from("unit_types").delete().eq("id", id)
  if (!error) return "deleted"
  // FK restrict (camere cu rezervări istorice) → arhivează tipul
  if (error.code === "23503") {
    await updateUnitType(id, { is_active: false })
    return "archived"
  }
  // Trigger guard la ștergerea în cascadă a camerelor cu rezervări viitoare
  if (error.message?.includes("UNIT_HAS_FUTURE_BOOKINGS")) {
    return "has_future_bookings"
  }
  throw error
}

export async function updateUnit(
  id: string,
  patch: TablesUpdate<"units">
): Promise<void> {
  const { error } = await supabase.from("units").update(patch).eq("id", id)
  if (error) throw error
}

export async function setUnitStatus(
  unitId: string,
  status: UnitStatus
): Promise<"ok" | "has_future_bookings"> {
  const { error } = await supabase
    .from("units")
    .update({ status })
    .eq("id", unitId)
  if (!error) return "ok"
  if (error.message?.includes("UNIT_HAS_FUTURE_BOOKINGS")) {
    return "has_future_bookings"
  }
  throw error
}

// Operațiune bulk parțială (stil Cloudbeds): camerele blocate de rezervări
// viitoare sunt sărite și raportate pe nume, restul se actualizează.
export async function bulkSetUnitStatus(
  unitIds: string[],
  status: UnitStatus
): Promise<BulkStatusResult> {
  const { data, error } = await supabase.rpc("bulk_update_unit_status", {
    p_unit_ids: unitIds,
    p_status: status,
  })
  if (error) throw error
  return data as BulkStatusResult
}

// Ștergere în masă, server-side: șterge / dezactivează (rezervări istorice) /
// raportează blocate (rezervări viitoare) — aceeași logică per cameră ca individual.
export type BulkDeleteResult = { deleted: number; deactivated: number; blocked: string[] }
export async function bulkDeleteUnits(unitIds: string[]): Promise<BulkDeleteResult> {
  const { data, error } = await supabase.rpc("bulk_delete_units", {
    p_unit_ids: unitIds,
  })
  if (error) throw error
  return data as BulkDeleteResult
}

// ─── blocaje de disponibilitate ───────────────────────────────────────────────

export async function fetchUnitBlocks(unitId: string): Promise<UnitBlock[]> {
  const { data, error } = await supabase
    .from("room_blocks")
    .select("*")
    .eq("unit_id", unitId)
    .order("start_date", { ascending: true })
  if (error) throw error
  return data
}

export async function blockUnit(
  unitId: string, start: string, end: string, reason: BlockReason, notes?: string
): Promise<void> {
  const { error } = await supabase.rpc("block_unit", {
    p_unit_id: unitId, p_start: start, p_end: end, p_reason: reason, p_notes: notes ?? undefined,
  })
  if (error) throw error
}

export async function bulkBlockUnits(
  unitIds: string[], start: string, end: string, reason: BlockReason, notes?: string
): Promise<BulkBlockResult> {
  const { data, error } = await supabase.rpc("bulk_block_units", {
    p_unit_ids: unitIds, p_start: start, p_end: end, p_reason: reason, p_notes: notes ?? undefined,
  })
  if (error) throw error
  return data as BulkBlockResult
}

export async function removeBlock(blockId: string): Promise<void> {
  const { error } = await supabase.rpc("remove_block", { p_block_id: blockId })
  if (error) throw error
}

// Elimină în masă blocajele care ating intervalul, pe camerele selectate.
// Un singur DELETE server-side; returnează câte blocaje au fost eliminate.
export async function bulkRemoveBlocks(
  unitIds: string[], start: string, end: string
): Promise<number> {
  const { data, error } = await supabase.rpc("bulk_remove_blocks", {
    p_unit_ids: unitIds, p_start: start, p_end: end,
  })
  if (error) throw error
  return data as number
}

// Istoricurile cresc nelimitat în timp — se aduc paginat (cele mai recente
// primele), cu "Afișează mai mult" în UI. Ordine stabilă: created_at + id desc.
export const EVENTS_PAGE_SIZE = 15

export async function fetchUnitEvents(
  unitId: string,
  page: number
): Promise<Page<UnitEvent>> {
  const [from, to] = pageRange(page, EVENTS_PAGE_SIZE)
  const { data, error } = await supabase
    .from("unit_events")
    .select("*")
    .eq("unit_id", unitId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to)
  if (error) throw error
  return toPage(data, EVENTS_PAGE_SIZE)
}

export async function fetchUnitTypeEvents(
  unitTypeId: string,
  page: number
): Promise<Page<UnitTypeEvent>> {
  const [from, to] = pageRange(page, EVENTS_PAGE_SIZE)
  const { data, error } = await supabase
    .from("unit_type_events")
    .select("*")
    .eq("unit_type_id", unitTypeId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to)
  if (error) throw error
  return toPage(data, EVENTS_PAGE_SIZE)
}

export async function deleteOrDeactivateUnit(
  unitId: string
): Promise<"deleted" | "deactivated" | "has_future_bookings"> {
  // Încearcă ştergere directă
  const { error } = await supabase.from("units").delete().eq("id", unitId)
  if (!error) return "deleted"
  // FK restrict (are rezervări istorice) → dezactivează
  if (error.code === "23503") {
    const result = await setUnitStatus(unitId, "inactive")
    if (result === "has_future_bookings") return "has_future_bookings"
    return "deactivated"
  }
  // Trigger guard UNIT_HAS_FUTURE_BOOKINGS la delete
  if (error.message?.includes("UNIT_HAS_FUTURE_BOOKINGS")) {
    return "has_future_bookings"
  }
  throw error
}
