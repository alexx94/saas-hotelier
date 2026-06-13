import {
  useInfiniteQuery, useMutation, useQuery, useQueryClient,
} from "@tanstack/react-query"
import type { TablesInsert, TablesUpdate } from "@/lib/database.types"
import {
  blockUnit, bulkBlockUnits, bulkDeleteUnits, bulkRemoveBlocks, bulkSetUnitStatus, createUnitType,
  deleteOrArchiveUnitType, deleteOrDeactivateUnit, fetchUnitBlocks, fetchUnitEvents,
  fetchUnitTypeEvents, fetchUnitTypes, fetchUnitsForType, generateUnitsForType,
  removeBlock, setUnitStatus, updateUnit, updateUnitType,
  type BlockReason, type UnitStatus,
} from "./api"

export const unitTypeKeys = {
  list: (propertyId: string) => ["unit-types", propertyId] as const,
  units: (unitTypeId: string) => ["units-for-type", unitTypeId] as const,
  events: (unitId: string) => ["unit-events", unitId] as const,
  typeEvents: (unitTypeId: string) => ["unit-type-events", unitTypeId] as const,
  blocks: (unitId: string) => ["unit-blocks", unitId] as const,
}

// Blocajele sunt rezervări (status='blocked') — orice mutație pe ele afectează
// și calendarul/listele de rezervări, nu doar lista de blocaje a camerei.
function invalidateBlockData(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["unit-blocks"] })
  qc.invalidateQueries({ queryKey: ["bookings"] })
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
      input, roomsCount, roomPrefix, startNumber,
    }: {
      input: TablesInsert<"unit_types">
      roomsCount: number
      roomPrefix: string
      startNumber?: number
    }) => createUnitType(input, roomsCount, roomPrefix, startNumber),
    onSuccess: () => qc.invalidateQueries({ queryKey: unitTypeKeys.list(propertyId) }),
  })
}

export function useGenerateUnits(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      unitTypeId, count, prefix, startNumber,
    }: { unitTypeId: string; count: number; prefix: string; startNumber?: number }) =>
      generateUnitsForType(unitTypeId, count, prefix, startNumber),
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: unitTypeKeys.list(propertyId) })
      qc.invalidateQueries({ queryKey: ["unit-type-events"] })
    },
  })
}

export function useDeleteUnitType(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteOrArchiveUnitType(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: unitTypeKeys.list(propertyId) })
      qc.invalidateQueries({ queryKey: ["unit-type-events"] })
    },
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
      qc.invalidateQueries({ queryKey: ["unit-events"] })
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
      qc.invalidateQueries({ queryKey: ["unit-events"] })
    },
  })
}

export function useBulkSetUnitStatus(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ unitIds, status }: { unitIds: string[]; status: UnitStatus }) =>
      bulkSetUnitStatus(unitIds, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: unitTypeKeys.list(propertyId) })
      qc.invalidateQueries({ queryKey: ["units-for-type"] })
      qc.invalidateQueries({ queryKey: ["units"] })
      qc.invalidateQueries({ queryKey: ["unit-events"] })
    },
  })
}

export function useBulkDeleteUnits(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (unitIds: string[]) => bulkDeleteUnits(unitIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: unitTypeKeys.list(propertyId) })
      qc.invalidateQueries({ queryKey: ["units-for-type"] })
      qc.invalidateQueries({ queryKey: ["units"] })
      qc.invalidateQueries({ queryKey: ["unit-events"] })
    },
  })
}

export function useUnitBlocks(unitId: string | null) {
  return useQuery({
    queryKey: unitTypeKeys.blocks(unitId ?? ""),
    queryFn: () => fetchUnitBlocks(unitId!),
    enabled: !!unitId,
  })
}

export function useBlockUnit(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ unitId, start, end, reason, notes }: {
      unitId: string; start: string; end: string; reason: BlockReason; notes?: string
    }) => blockUnit(unitId, start, end, reason, notes),
    onSuccess: () => {
      invalidateBlockData(qc)
      qc.invalidateQueries({ queryKey: unitTypeKeys.list(propertyId) })
    },
  })
}

export function useBulkBlockUnits(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ unitIds, start, end, reason, notes }: {
      unitIds: string[]; start: string; end: string; reason: BlockReason; notes?: string
    }) => bulkBlockUnits(unitIds, start, end, reason, notes),
    onSuccess: () => {
      invalidateBlockData(qc)
      qc.invalidateQueries({ queryKey: unitTypeKeys.list(propertyId) })
    },
  })
}

export function useRemoveBlock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (blockId: string) => removeBlock(blockId),
    onSuccess: () => invalidateBlockData(qc),
  })
}

export function useBulkRemoveBlocks() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ unitIds, start, end }: { unitIds: string[]; start: string; end: string }) =>
      bulkRemoveBlocks(unitIds, start, end),
    onSuccess: () => invalidateBlockData(qc),
  })
}

// Istoricuri: infinite query — "Afișează mai mult" cere pagina următoare;
// rândul în plus din Page.hasMore decide dacă mai există ceva, fără count(*).
export function useUnitEvents(unitId: string | null) {
  return useInfiniteQuery({
    queryKey: unitTypeKeys.events(unitId ?? ""),
    queryFn: ({ pageParam }) => fetchUnitEvents(unitId!, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length : undefined),
    enabled: !!unitId,
  })
}

export function useUnitTypeEvents(unitTypeId: string | null) {
  return useInfiniteQuery({
    queryKey: unitTypeKeys.typeEvents(unitTypeId ?? ""),
    queryFn: ({ pageParam }) => fetchUnitTypeEvents(unitTypeId!, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length : undefined),
    enabled: !!unitTypeId,
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
