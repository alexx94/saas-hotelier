import { t, type TranslationKey } from "@/lib/i18n"
import type { PaymentMethod, PaymentStatus } from "./api"

// Registru de culori pe stare plată (reutilizabil — vezi status-badge.tsx).
export const paymentStatusColors: Record<PaymentStatus, string> = {
  unpaid: "bg-gray-100 text-gray-600 border-gray-300",
  partial: "bg-amber-100 text-amber-900 border-amber-300",
  paid: "bg-emerald-100 text-emerald-900 border-emerald-300",
  refunded: "bg-rose-100 text-rose-900 border-rose-300",
}

export function paymentStatusLabel(status: PaymentStatus): string {
  return t(`payments.status.${status}` as TranslationKey)
}

export function paymentMethodLabel(method: PaymentMethod): string {
  return t(`payments.method.${method}` as TranslationKey)
}
