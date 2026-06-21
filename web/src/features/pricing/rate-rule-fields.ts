import type { EventFieldRegistry } from "@/features/bookings/event-diff"
import { t, type TranslationKey } from "@/lib/i18n"

export const RATE_RULE_EVENT_LABEL: Record<string, TranslationKey> = {
  created: "pricing.rule.event.created",
  updated: "pricing.rule.event.updated",
  deleted: "pricing.rule.event.deleted",
}

// Câmp nou auditat în app.audit_entity('rate_rule', ...) = o intrare nouă aici.
export const RATE_RULE_FIELDS: EventFieldRegistry = {
  name: { label: "pricing.rule_name" },
  kind: { label: "pricing.rule_kind", format: (v) => t(`pricing.kind.${v}` as TranslationKey) },
  start_date: { label: "pricing.start" },
  end_date: { label: "pricing.end" },
  price: { label: "pricing.price", format: (v) => Number(v).toFixed(2) },
}
