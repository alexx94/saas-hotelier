import type { EventFieldRegistry } from "@/features/bookings/event-diff"
import { t, type TranslationKey } from "@/lib/i18n"

export const PROMOTION_EVENT_LABEL: Record<string, TranslationKey> = {
  created: "promotions.event.created",
  updated: "promotions.event.updated",
  archived: "promotions.event.archived",
  restored: "promotions.event.restored",
  deleted: "promotions.event.deleted",
}

// Câmp nou auditat în app.audit_entity('promotion', ...) = o intrare nouă aici.
export const PROMOTION_FIELDS: EventFieldRegistry = {
  name: { label: "promotions.name" },
  code: { label: "promotions.code" },
  discount_type: { label: "promotions.discount_type", format: (v) => t(`promotions.${v}` as TranslationKey) },
  discount_value: { label: "promotions.value" },
  stay_start: { label: "promotions.from" },
  stay_end: { label: "promotions.to" },
  book_start: { label: "promotions.from" },
  book_end: { label: "promotions.to" },
  max_uses: { label: "promotions.max_uses" },
  is_active: { label: "promotions.active", format: (v) => (v ? t("promotions.active") : t("promotions.inactive")) },
}
