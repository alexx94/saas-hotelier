import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { TablesInsert, TablesUpdate } from "@/lib/database.types"
import {
  createUnitType, deleteOrArchiveUnitType, deleteOrDeactivateUnit,
  fetchUnitTypes, fetchUnitsForType, generateUnitsForType, setUnitStatus,
  updateUnit, updateUnitType,
  type UnitStatus,
} from "./api"

export const unitTypeKeys = {
  list: (propertyId: string) => ["unit-types", propertyId] as const,
  units: (unitTypeId: string) => ["units-for-type", unitTypeId] as const,
}

export function useUnitTypes(propertyId: string) {
  return useQuery({
    queryKey: unitTypeKeys.list(propertyId),
    queryFn: () => fetchUnitTypes(propertyId),
  })
}

export function useUnitsForType(unitTypeId: string, enabled = true) {
  return useQuery({
    queryKey: unitTypeKeys.units(unitTypeId),
    queryFn: () => fetchUnitsForType(unitTypeId),
    enabled,
  })
}

export function useCreateUnitType(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      input, roomsCount, roomPrefix,
    }: {
      input: TablesInsert<"unit_types">
      roomsCount: number
      roomPrefix: string
    }) => createUnitType(input, roomsCount, roomPrefix),
    onSuccess: () => qc.invalidateQueries({ queryKey: unitTypeKeys.list(propertyId) }),
  })
}

export function useGenerateUnits(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ unitTypeId, count, prefix }: { unitTypeId: string; count: number; prefix: string }) =>
      generateUnitsForType(unitTypeId, count, prefix),
    onSuccess: (_, { unitTypeId }) => {
      qc.invalidateQueries({ queryKey: unitTypeKeys.list(propertyId) })
      qc.invalidateQueries({ queryKey: unitTypeKeys.units(unitTypeId) })
    },
  })
}

export function useUpdateUnitType(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TablesUpdate<"unit_types"> }) =>
      updateUnitType(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: unitTypeKeys.list(propertyId) }),
  })
}

export function useDeleteUnitType(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteOrArchiveUnitType(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: unitTypeKeys.list(propertyId) }),
  })
}

export function useUpdateUnit(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TablesUpdate<"units"> }) =>
      updateUnit(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: unitTypeKeys.list(propertyId) })
      qc.invalidateQueries({ queryKey: ["units-for-type"] })
    },
  })
}

export function useSetUnitStatus(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: UnitStatus }) =>
      setUnitStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: unitTypeKeys.list(propertyId) })
      qc.invalidateQueries({ queryKey: ["units-for-type"] })
      qc.invalidateQueries({ queryKey: ["units"] })
    },
  })
}

export function useDeleteUnit(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (unitId: string) => deleteOrDeactivateUnit(unitId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: unitTypeKeys.list(propertyId) })
      qc.invalidateQueries({ queryKey: ["units-for-type"] })
      qc.invalidateQueries({ queryKey: ["units"] })
    },
  })
}
