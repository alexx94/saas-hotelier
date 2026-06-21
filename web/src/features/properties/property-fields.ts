import type { EventFieldRegistry } from "@/features/bookings/event-diff"
import { t, type TranslationKey } from "@/lib/i18n"

export const PROPERTY_EVENT_LABEL: Record<string, TranslationKey> = {
  created: "property.event.created",
  updated: "property.event.updated",
  deleted: "property.event.deleted",
}

// Câmp nou auditat în app.audit_entity('property', ...) = o intrare nouă aici.
export const PROPERTY_FIELDS: EventFieldRegistry = {
  name: { label: "properties.name" },
  type: { label: "properties.type", format: (v) => t(`properties.type.${v}` as TranslationKey) },
  address: { label: "properties.address" },
  city: { label: "properties.city" },
  currency: { label: "properties.currency" },
  is_published: { label: "properties.published", format: (v) => (v ? t("properties.published") : t("properties.unpublished")) },
}
