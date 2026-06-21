import type { EventFieldRegistry } from "@/features/bookings/event-diff"
import { paymentMethodLabel } from "./payment-status"
import type { PaymentMethod } from "./api"
import { t, type TranslationKey } from "@/lib/i18n"

export const PAYMENT_EVENT_LABEL: Record<string, TranslationKey> = {
  created: "payment.event.created",
  deleted: "payment.event.deleted",
}

// Plățile sunt un ledger (doar create/delete) — vezi app.audit_entity('payment', ...).
export const PAYMENT_FIELDS: EventFieldRegistry = {
  kind: { label: "payments.payment", format: (v) => t(`payments.kind.${v}` as TranslationKey) },
  amount: { label: "payments.amount", format: (v) => Number(v).toFixed(2) },
  method: { label: "payments.method", format: (v) => paymentMethodLabel(v as PaymentMethod) },
  note: { label: "payments.note" },
}
