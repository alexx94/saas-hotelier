import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { TablesInsert, TablesUpdate } from "@/lib/database.types"
import {
  createProperty, deleteProperty, fetchProperties, fetchProperty, updateProperty,
} from "./api"

export const propertyKeys = {
  all: ["properties"] as const,
  list: (orgId: string) => ["properties", orgId] as const,
  detail: (id: string) => ["properties", "detail", id] as const,
}

export function useProperties(orgId: string) {
  return useQuery({
    queryKey: propertyKeys.list(orgId),
    queryFn: () => fetchProperties(orgId),
  })
}

export function useProperty(id: string) {
  return useQuery({
    queryKey: propertyKeys.detail(id),
    queryFn: () => fetchProperty(id),
  })
}

export function useCreateProperty() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: TablesInsert<"properties">) => createProperty(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: propertyKeys.all }),
  })
}

export function useUpdateProperty() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TablesUpdate<"properties"> }) =>
      updateProperty(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: propertyKeys.all }),
  })
}

export function useDeleteProperty() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteProperty(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: propertyKeys.all }),
  })
}
