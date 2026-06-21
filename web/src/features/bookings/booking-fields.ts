import type { EventFieldRegistry } from "./event-diff"
import { statusLabel } from "./status-badge"
import { formatDateShort } from "./date-utils"
import type { BookingStatus } from "./api"
import { paymentStatusLabel } from "@/features/payments/payment-status"
import type { PaymentStatus } from "@/features/payments/api"
import type { TranslationKey } from "@/lib/i18n"

export const BOOKING_EVENT_LABEL: Record<string, TranslationKey> = {
  created: "bookings.event.created",
  status_changed: "bookings.event.status_changed",
  reassigned: "bookings.event.reassigned",
  dates_changed: "bookings.event.dates_changed",
  guest_changed: "bookings.event.guest_changed",
  payment_status: "bookings.event.payment_status",
  updated: "bookings.event.updated",
}

export const BOOKING_FIELDS: EventFieldRegistry = {
  unit: { label: "bookings.unit" },
  guest: { label: "bookings.guest" },
  status: { label: "bookings.status", format: (v) => statusLabel(v as BookingStatus) },
  check_in: { label: "bookings.check_in", format: (v) => formatDateShort(String(v)) },
  check_out: { label: "bookings.check_out", format: (v) => formatDateShort(String(v)) },
  guests_count: { label: "bookings.guests_count" },
  total_amount: { label: "bookings.total" },
  payment_status: {
    label: "payments.payment",
    format: (v) => paymentStatusLabel(v as PaymentStatus),
  },
  notes: { label: "bookings.notes" },
}
