import { supabase } from "@/lib/supabase"
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/database.types"

export type Property = Tables<"properties">

export async function fetchProperties(orgId: string): Promise<Property[]> {
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at")
  if (error) throw error
  return data
}

export async function fetchProperty(id: string): Promise<Property> {
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .single()
  if (error) throw error
  return data
}

export async function createProperty(
  input: TablesInsert<"properties">
): Promise<Property> {
  const { data, error } = await supabase
    .from("properties")
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateProperty(
  id: string,
  patch: TablesUpdate<"properties">
): Promise<Property> {
  const { data, error } = await supabase
    .from("properties")
    .update(patch)
    .eq("id", id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteProperty(id: string): Promise<void> {
  const { error } = await supabase.from("properties").delete().eq("id", id)
  if (error) throw error
}
