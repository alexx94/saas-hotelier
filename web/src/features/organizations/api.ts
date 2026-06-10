import { supabase } from "@/lib/supabase"

export type Organization = {
  id: string
  name: string
  slug: string
  role: string
}

export async function fetchMyOrganizations(): Promise<Organization[]> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("role, organizations(id, name, slug)")
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
