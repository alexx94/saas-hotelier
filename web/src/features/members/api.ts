import { supabase } from "@/lib/supabase"

// Membru staff al organizației (lane staff — vezi docs/backend/rbac.md §1).
// Vine din RPC get_org_members (email/nume din auth.users/profiles, neexpuse direct).
export type OrgMember = {
  member_id: string
  user_id: string
  email: string | null
  full_name: string | null
  is_owner: boolean
  role_ids: string[]
  property_ids: string[]
}

export async function fetchOrgMembers(orgId: string): Promise<OrgMember[]> {
  const { data, error } = await supabase.rpc("get_org_members", { p_org_id: orgId })
  if (error) throw error
  return (data ?? []) as OrgMember[]
}

// propertyIds: subset explicit de proprietăți SAU [] = „toate" (acces complet,
// permis doar dacă invitatorul nu e restrâns). Backend-ul (add_member) validează
// fiecare proprietate ca accesibilă invitatorului (PROPERTY_FORBIDDEN).
export async function addMember(
  orgId: string, email: string, roleIds: string[], propertyIds: string[]
): Promise<void> {
  const { error } = await supabase.rpc("add_member", {
    p_org_id: orgId, p_email: email, p_role_ids: roleIds, p_property_ids: propertyIds,
  })
  if (error) throw error
}

export async function setMemberRoles(memberId: string, roleIds: string[]): Promise<void> {
  const { error } = await supabase.rpc("set_member_roles", {
    p_member_id: memberId, p_role_ids: roleIds,
  })
  if (error) throw error
}

export async function setMemberAccess(memberId: string, propertyIds: string[]): Promise<void> {
  const { error } = await supabase.rpc("set_member_property_access", {
    p_member_id: memberId, p_property_ids: propertyIds,
  })
  if (error) throw error
}

export async function removeMember(memberId: string): Promise<void> {
  const { error } = await supabase.rpc("remove_member", { p_member_id: memberId })
  if (error) throw error
}

export async function transferOwnership(orgId: string, newUserId: string): Promise<void> {
  const { error } = await supabase.rpc("transfer_ownership", {
    p_org_id: orgId, p_new_user_id: newUserId,
  })
  if (error) throw error
}
