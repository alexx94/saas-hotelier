import { t, type TranslationKey } from "@/lib/i18n"

// Zilele de weekend = DOW Postgres (0=Duminică … 6=Sâmbătă). Default: Vineri+Sâmbătă
// (nopțile cele mai scumpe în hotelărie).
export const DEFAULT_WEEKEND_DAYS = [5, 6]

// Ordinea de afișare în UI: Luni → Duminică (preferința RO), nu indexul brut 0..6.
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

export type WeekendAdjustmentType = "none" | "percent" | "amount"

export function dayLabel(dow: number): string {
  return t(`dow.${dow}` as TranslationKey)
}
