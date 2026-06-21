import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import {
  addMember, fetchOrgMembers, removeMember, setMemberAccess, setMemberRoles,
  transferOwnership,
} from "./api"
import { permissionKeys } from "@/features/auth/permissions"

export const memberKeys = {
  all: ["members"] as const,
  list: (orgId: string) => ["members", orgId] as const,
}

// O schimbare de membru/rol/acces poate schimba permisiunile efective ale
// userului curent → invalidăm și cache-ul de permisiuni.
function invalidateMemberData(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: memberKeys.all })
  qc.invalidateQueries({ queryKey: permissionKeys.all })
}

export function useMembers(orgId: string | undefined) {
  return useQuery({
    queryKey: memberKeys.list(orgId ?? ""),
    queryFn: () => fetchOrgMembers(orgId!),
    enabled: !!orgId,
  })
}

export function useAddMember(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ email, roleIds, propertyIds }: {
      email: string; roleIds: string[]; propertyIds: string[]
    }) => addMember(orgId, email, roleIds, propertyIds),
    onSuccess: () => invalidateMemberData(qc),
  })
}

export function useSetMemberRoles() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ memberId, roleIds }: { memberId: string; roleIds: string[] }) =>
      setMemberRoles(memberId, roleIds),
    onSuccess: () => invalidateMemberData(qc),
  })
}

export function useSetMemberAccess() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ memberId, propertyIds }: { memberId: string; propertyIds: string[] }) =>
      setMemberAccess(memberId, propertyIds),
    onSuccess: () => invalidateMemberData(qc),
  })
}

export function useRemoveMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (memberId: string) => removeMember(memberId),
    onSuccess: () => invalidateMemberData(qc),
  })
}

export function useTransferOwnership(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (newUserId: string) => transferOwnership(orgId, newUserId),
    onSuccess: () => invalidateMemberData(qc),
  })
}
