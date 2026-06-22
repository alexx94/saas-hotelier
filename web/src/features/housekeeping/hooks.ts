import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  bulkSetUnitCleaningStatus, fetchHousekeepingBoard, setUnitCleaningStatus,
  type CleaningStatus,
} from "./api"

export const housekeepingKeys = {
  board: (propertyId: string) => ["housekeeping-board", propertyId] as const,
}

// Housekeeper-ii sunt mereu pe mobil, schimbând camere — date proaspete fără
// refresh manual (default global staleTime 0 + refetchOnWindowFocus).
export function useHousekeepingBoard(propertyId: string) {
  return useQuery({
    queryKey: housekeepingKeys.board(propertyId),
    queryFn: () => fetchHousekeepingBoard(propertyId),
  })
}

export function useSetUnitCleaningStatus(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ unitId, status }: { unitId: string; status: CleaningStatus }) =>
      setUnitCleaningStatus(unitId, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: housekeepingKeys.board(propertyId) })
      qc.invalidateQueries({ queryKey: ["unit-events"] })
      qc.invalidateQueries({ queryKey: ["units-for-type"] })
      qc.invalidateQueries({ queryKey: ["units"] })
    },
  })
}

export function useBulkSetUnitCleaningStatus(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ unitIds, status }: { unitIds: string[]; status: CleaningStatus }) =>
      bulkSetUnitCleaningStatus(unitIds, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: housekeepingKeys.board(propertyId) })
      qc.invalidateQueries({ queryKey: ["unit-events"] })
      qc.invalidateQueries({ queryKey: ["units-for-type"] })
      qc.invalidateQueries({ queryKey: ["units"] })
    },
  })
}
