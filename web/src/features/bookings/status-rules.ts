import type { Booking, BookingStatus } from "./api"
import type { TranslationKey } from "@/lib/i18n"

// Tranziții "înainte" — fluxul normal de operare.
// Oglindesc exact harta din trigger-ul DB app.validate_booking_update.
export const nextStatuses: Record<string, BookingStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["checked_in", "cancelled", "no_show"],
  checked_in: ["checked_out"],
  blocked: ["cancelled"],
}

// Tranziții de revenire (undo) — pentru corectarea greșelilor de operare.
// Ținute separat de cele forward: un feature viitor de roluri va putea
// restricționa revenirile la manager/owner fără să atingă fluxul normal.
export const revertStatuses: Record<string, BookingStatus[]> = {
  confirmed: ["pending"],
  checked_in: ["confirmed"],
  checked_out: ["checked_in"],
  cancelled: ["pending"],
  no_show: ["confirmed"],
}

export function getRevertOptions(b: Booking): BookingStatus[] {
  const opts = revertStatuses[b.status] ?? []
  // o blocare anulată nu are oaspete — nu poate redeveni rezervare
  return opts.filter((s) => !(s === "pending" && !b.guest_id))
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// Întoarce cheia mesajului de atenționare dacă schimbarea cere confirmare,
// sau null dacă se aplică direct.
export function statusChangeWarning(b: Booking, to: BookingStatus): TranslationKey | null {
  const today = todayISO()
  if (to === "checked_in" && today < b.check_in) return "bookings.warn_early_checkin"
  if (to === "checked_out" && today < b.check_out) return "bookings.warn_early_checkout"
  if (to === "no_show" && today <= b.check_in) return "bookings.warn_no_show_early"
  if (b.status === "cancelled") return "bookings.warn_reinstate"
  if ((revertStatuses[b.status] ?? []).includes(to)) return "bookings.warn_revert"
  return null
}
