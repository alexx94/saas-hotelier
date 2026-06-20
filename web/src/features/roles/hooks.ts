import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { createRole, deleteRole, fetchPermissions, fetchRoles, updateRole } from "./api"
import { memberKeys } from "@/features/members/hooks"
import { permissionKeys } from "@/features/auth/permissions"

export const roleKeys = {
  all: ["roles"] as const,
  permissions: ["permissions-catalog"] as const,
}

// Schimbarea unui rol afectează ce pot membrii care-l au → invalidăm membri + permisiuni
function invalidateRoleData(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: roleKeys.all })
  qc.invalidateQueries({ queryKey: memberKeys.all })
  qc.invalidateQueries({ queryKey: permissionKeys.all })
}

export function useRoles() {
  return useQuery({ queryKey: roleKeys.all, queryFn: fetchRoles })
}

// catalogul (descrieri + domenii) se încarcă lazy: doar când e nevoie efectiv
// (la deschiderea editorului sau la extinderea unui rol în listă)
export function usePermissionCatalog(enabled = true) {
  return useQuery({
    queryKey: roleKeys.permissions,
    queryFn: fetchPermissions,
    staleTime: Infinity,
    enabled,
  })
}

export function useCreateRole(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, keys }: { name: string; keys: string[] }) => createRole(orgId, name, keys),
    onSuccess: () => invalidateRoleData(qc),
  })
}

export function useUpdateRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ roleId, name, keys }: { roleId: string; name: string; keys: string[] }) =>
      updateRole(roleId, name, keys),
    onSuccess: () => invalidateRoleData(qc),
  })
}

export function useDeleteRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (roleId: string) => deleteRole(roleId),
    onSuccess: () => invalidateRoleData(qc),
  })
}
