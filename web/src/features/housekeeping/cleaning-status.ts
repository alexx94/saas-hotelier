import { t, type TranslationKey } from "@/lib/i18n"
import type { CleaningStatus } from "./api"

// Mirror exact al unit-types/unit-status.ts — aceeași formă de registry
// (array + 3 hărți + helper), pentru o stare de domeniu diferită (curățenie,
// nu disponibilitate operațională).
export const CLEANING_STATUSES: CleaningStatus[] = ["dirty", "inspected", "clean"]

export const CLEANING_STATUS_LABEL: Record<CleaningStatus, TranslationKey> = {
  clean: "unit.cleaning.clean",
  dirty: "unit.cleaning.dirty",
  inspected: "unit.cleaning.inspected",
}

export const CLEANING_STATUS_BADGE_CLASS: Record<CleaningStatus, string> = {
  clean: "bg-emerald-50 text-emerald-700 border-emerald-200",
  dirty: "bg-red-50 text-red-700 border-red-200",
  inspected: "bg-blue-50 text-blue-700 border-blue-200",
}

export const CLEANING_STATUS_DOT_CLASS: Record<CleaningStatus, string> = {
  clean: "bg-emerald-500",
  dirty: "bg-red-500",
  inspected: "bg-blue-500",
}

export function cleaningStatusLabel(status: string): string {
  const key = CLEANING_STATUS_LABEL[status as CleaningStatus]
  return key ? t(key) : status
}
