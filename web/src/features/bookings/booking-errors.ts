import { toast } from "sonner"
import { errorMessage } from "@/lib/errors"
import { t } from "@/lib/i18n"

// Mapare cod-mașină (RPC create_booking / update_booking_dates) → toast tradus.
// Sursă unică, refolosită de formularul complet (booking-form-dialog) și de
// quick-create din calendar (quick-booking-dialog) — nu duplica lista de coduri.
export function toastBookingError(e: unknown) {
  const message = errorMessage(e)
  if (message.includes("PROMO_INVALID")) return toast.error(t("bookings.promo_invalid"))
  if (message.includes("PROMO_LIMIT_REACHED")) return toast.error(t("bookings.promo_limit"))
  if (message.includes("PRICE_OVERRIDE_FORBIDDEN")) return toast.error(t("bookings.price_override_forbidden"))
  if (message.includes("PRICE_OVERRIDE_NEGATIVE")) return toast.error(t("bookings.price_override_negative"))
  if (message.includes("OVERRIDE_FORBIDDEN")) return toast.error(t("bookings.override_forbidden"))
  if (message.includes("STAY_TOO_SHORT")) return toast.error(t("bookings.stay_too_short"))
  if (message.includes("STAY_TOO_LONG")) return toast.error(t("bookings.stay_too_long"))
  if (message.includes("DATES_CLOSED")) return toast.error(t("bookings.dates_closed"))
  if (message.includes("NO_ARRIVAL")) return toast.error(t("bookings.no_arrival"))
  if (message.includes("NO_DEPARTURE")) return toast.error(t("bookings.no_departure"))
  if (message.includes("UNIT_NOT_AVAILABLE")) return toast.error(t("bookings.not_available"))
  if (message.includes("UNIT_BLOCKED")) return toast.error(t("bookings.unit_blocked"))
  return toast.error(t("common.error"))
}
