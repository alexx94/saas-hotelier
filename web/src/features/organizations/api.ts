import { supabase } from "@/lib/supabase"

export type Organization = {
  id: string
  name: string
  slug: string
  role: string
}

export async function fetchMyOrganizations(): Promise<Organization[]> {
  // RLS pe organization_members lasă vizibili TOȚI membrii org-urilor tale (pt.
  // management) → fără filtru ai primi un rând per membru (org-uri duplicate).
  // Filtrăm pe propriul user ca să rămână strict membership-urile tale.
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) return []

  const { data, error } = await supabase
    .from("organization_members")
    .select("role, organizations(id, name, slug)")
    .eq("user_id", userId)
  if (error) throw error
  return (data ?? []).flatMap((m) =>
    m.organizations
      ? [{ ...(m.organizations as { id: string; name: string; slug: string }), role: m.role }]
      : []
  )
}

export async function createOrganization(name: string, slug: string): Promise<string> {
  const { data, error } = await supabase.rpc("create_organization", {
    p_name: name,
    p_slug: slug,
  })
  if (error) throw error
  return data
}
