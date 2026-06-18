import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useCurrentOrg } from "@/features/organizations/context"

// Permisiunile efective ale userului în organizația curentă (RBAC Sprint 6.2).
// Backend-ul rămâne autoritatea (RLS + gărzi RPC); astea sunt DOAR pentru a
// ascunde/dezactiva acțiuni în UI — niciodată singura barieră.
export const permissionKeys = {
  all: ["permissions"] as const,
  mine: (orgId: string) => ["permissions", orgId] as const,
}

export async function fetchMyPermissions(orgId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("get_my_permissions", { p_org_id: orgId })
  if (error) throw error
  return data ?? []
}

export function usePermissions() {
  const { currentOrg } = useCurrentOrg()
  const orgId = currentOrg.id
  const query = useQuery({
    queryKey: permissionKeys.mine(orgId),
    queryFn: () => fetchMyPermissions(orgId),
    // permisiunile se schimbă rar; se vor invalida la mutații de membru/rol (6.3)
    staleTime: 5 * 60_000,
  })
  const set = useMemo(() => new Set(query.data ?? []), [query.data])
  return {
    isLoading: query.isLoading,
    permissions: set,
    has: (key: string) => set.has(key),
  }
}

/** true dacă userul are CEL PUȚIN una dintre permisiuni (any-of) */
export function useHasPermission(permission: string | string[]) {
  const { has, isLoading } = usePermissions()
  const keys = Array.isArray(permission) ? permission : [permission]
  return { allowed: keys.some(has), isLoading }
}
