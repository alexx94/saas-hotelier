import { supabase } from "@/lib/supabase"
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/database.types"

export type UnitType = Tables<"unit_types"> & { units: { count: number }[] }
export type Unit = Tables<"units">
export type UnitStatus = "active" | "inactive" | "out_of_service" | "archived"

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
    .order("name")
  if (error) throw error
  return data
}

export async function createUnitType(
  input: TablesInsert<"unit_types">,
  roomsCount: number,
  roomPrefix: string
): Promise<{ id: string; unitsCreated: number }> {
  const { data, error } = await supabase
    .from("unit_types")
    .insert(input)
    .select("id")
    .single()
  if (error) throw error
  const { data: unitsCreated, error: genError } = await supabase.rpc("generate_units", {
    p_unit_type_id: data.id,
    p_count: roomsCount,
    p_prefix: roomPrefix,
  })
  if (genError) throw genError
  return { id: data.id, unitsCreated: unitsCreated as number }
}

export async function generateUnitsForType(
  unitTypeId: string,
  count: number,
  prefix: string
): Promise<number> {
  const { data, error } = await supabase.rpc("generate_units", {
    p_unit_type_id: unitTypeId,
    p_count: count,
    p_prefix: prefix,
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
): Promise<"deleted" | "archived"> {
  const { error } = await supabase.from("unit_types").delete().eq("id", id)
  if (!error) return "deleted"
  if (error.code === "23503") {
    await updateUnitType(id, { is_active: false })
    return "archived"
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
