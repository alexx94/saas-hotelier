import { supabase } from "@/lib/supabase"

export type Role = {
  id: string
  name: string
  slug: string
  is_system: boolean
  org_id: string | null
  permission_keys: string[]
}

export type Permission = {
  key: string
  domain: string
  description: string
  sort_order: number
  is_elevated: boolean
}

// RLS lasă să se vadă rolurile de sistem (org_id null) + cele ale org-ului propriu.
export async function fetchRoles(): Promise<Role[]> {
  const { data, error } = await supabase
    .from("roles")
    .select("id, name, slug, is_system, org_id, role_permissions(permission_key)")
    .order("is_system", { ascending: false })
    .order("name")
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    is_system: r.is_system,
    org_id: r.org_id,
    permission_keys: (r.role_permissions ?? []).map((p) => p.permission_key),
  }))
}

export async function fetchPermissions(): Promise<Permission[]> {
  const { data, error } = await supabase
    .from("permissions")
    .select("key, domain, description, sort_order, is_elevated")
    .order("sort_order")
  if (error) throw error
  return (data ?? []) as Permission[]
}

export async function createRole(orgId: string, name: string, keys: string[]): Promise<void> {
  const { error } = await supabase.rpc("create_role", {
    p_org_id: orgId, p_name: name, p_permission_keys: keys,
  })
  if (error) throw error
}

export async function updateRole(roleId: string, name: string, keys: string[]): Promise<void> {
  const { error } = await supabase.rpc("update_role", {
    p_role_id: roleId, p_name: name, p_permission_keys: keys,
  })
  if (error) throw error
}

export async function deleteRole(roleId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_role", { p_role_id: roleId })
  if (error) throw error
}
