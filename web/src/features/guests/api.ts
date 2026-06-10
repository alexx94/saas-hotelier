import { supabase } from "@/lib/supabase"
import type { Tables, TablesInsert } from "@/lib/database.types"

export type Guest = Tables<"guests">

export async function fetchGuests(orgId: string, search?: string): Promise<Guest[]> {
  let query = supabase
    .from("guests")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(200)
  if (search && search.trim()) {
    const s = search.trim()
    query = query.or(`full_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`)
  }
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function createGuest(input: TablesInsert<"guests">): Promise<Guest> {
  const { data, error } = await supabase
    .from("guests")
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data
}

export type FindOrCreateResult = { guest_id: string; matched_by: string | null }

export async function findOrCreateGuest(
  orgId: string,
  fullName: string,
  email?: string,
  phone?: string
): Promise<FindOrCreateResult> {
  const { data, error } = await supabase.rpc("find_or_create_guest", {
    p_org_id: orgId,
    p_full_name: fullName,
    p_email: email ?? undefined,
    p_phone: phone ?? undefined,
  })
  if (error) throw error
  return data as FindOrCreateResult
}
