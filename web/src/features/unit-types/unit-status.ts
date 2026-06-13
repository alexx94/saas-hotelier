import { t, type TranslationKey } from "@/lib/i18n"
import type { UnitStatus } from "./api"

export const UNIT_STATUSES: UnitStatus[] = [
  "active", "inactive", "out_of_service", "archived",
]

export const UNIT_STATUS_LABEL: Record<UnitStatus, TranslationKey> = {
  active: "unit.status.active",
  inactive: "unit.status.inactive",
  out_of_service: "unit.status.out_of_service",
  archived: "unit.status.archived",
}

export const UNIT_STATUS_BADGE_CLASS: Record<UnitStatus, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  inactive: "bg-gray-50 text-gray-500 border-gray-200",
  out_of_service: "bg-amber-50 text-amber-700 border-amber-200",
  archived: "bg-red-50 text-red-700 border-red-200",
}

export const UNIT_STATUS_DOT_CLASS: Record<UnitStatus, string> = {
  active: "bg-emerald-500",
  inactive: "bg-gray-400",
  out_of_service: "bg-amber-500",
  archived: "bg-red-500",
}

export function unitStatusLabel(status: string): string {
  const key = UNIT_STATUS_LABEL[status as UnitStatus]
  return key ? t(key) : status
}
