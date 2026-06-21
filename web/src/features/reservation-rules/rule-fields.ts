import type { EventFieldRegistry } from "@/features/bookings/event-diff"
import { t, type TranslationKey } from "@/lib/i18n"

export const STAY_RULE_EVENT_LABEL: Record<string, TranslationKey> = {
  created: "stay_rules.event.created",
  updated: "stay_rules.event.updated",
  deleted: "stay_rules.event.deleted",
}

export const STAY_RULE_FIELDS: EventFieldRegistry = {
  name: { label: "stay_rules.name" },
  start_date: { label: "stay_rules.start" },
  end_date: { label: "stay_rules.end" },
  min_stay: { label: "stay_rules.min_stay" },
  max_stay: { label: "stay_rules.max_stay" },
}

export const ARRIVAL_RULE_EVENT_LABEL: Record<string, TranslationKey> = {
  created: "arrival_rules.event.created",
  deleted: "arrival_rules.event.deleted",
}

export const ARRIVAL_RULE_FIELDS: EventFieldRegistry = {
  name: { label: "stay_rules.name" },
  start_date: { label: "stay_rules.start" },
  end_date: { label: "stay_rules.end" },
  no_arrival: { label: "arrival_rules.no_arrival", format: (v) => (v ? t("common.yes") : t("common.no")) },
  no_departure: { label: "arrival_rules.no_departure", format: (v) => (v ? t("common.yes") : t("common.no")) },
}

export const CLOSURE_EVENT_LABEL: Record<string, TranslationKey> = {
  created: "closures.event.created",
  deleted: "closures.event.deleted",
}

export const CLOSURE_FIELDS: EventFieldRegistry = {
  reason: { label: "closures.reason" },
  start_date: { label: "closures.start" },
  end_date: { label: "closures.end" },
  notes: { label: "closures.notes" },
}
