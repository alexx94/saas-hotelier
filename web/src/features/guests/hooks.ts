import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { TablesInsert } from "@/lib/database.types"
import { createGuest, fetchGuests, findOrCreateGuest } from "./api"

export const guestKeys = {
  list: (orgId: string, search?: string) => ["guests", orgId, { search }] as const,
  all: (orgId: string) => ["guests", orgId] as const,
}

export function useGuests(orgId: string, search?: string) {
  return useQuery({
    queryKey: guestKeys.list(orgId, search),
    queryFn: () => fetchGuests(orgId, search),
    enabled: !!orgId,
  })
}

export function useCreateGuest(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: TablesInsert<"guests">) => createGuest(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: guestKeys.all(orgId) }),
  })
}

export function useFindOrCreateGuest(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      fullName, email, phone,
    }: { fullName: string; email?: string; phone?: string }) =>
      findOrCreateGuest(orgId, fullName, email, phone),
    onSuccess: () => qc.invalidateQueries({ queryKey: guestKeys.all(orgId) }),
  })
}
