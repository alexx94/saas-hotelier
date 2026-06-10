import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createOrganization, fetchMyOrganizations } from "./api"

export const orgKeys = {
  all: ["orgs"] as const,
}

export function useMyOrganizations() {
  return useQuery({ queryKey: orgKeys.all, queryFn: fetchMyOrganizations })
}

export function useCreateOrganization() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, slug }: { name: string; slug: string }) =>
      createOrganization(name, slug),
    onSuccess: () => qc.invalidateQueries({ queryKey: orgKeys.all }),
  })
}
