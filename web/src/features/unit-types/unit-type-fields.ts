import { dayLabel, WEEKDAY_ORDER } from "@/features/pricing/weekend-pricing"
import type { EventFieldRegistry } from "@/features/bookings/event-diff"
import { t, type TranslationKey } from "@/lib/i18n"

const WEEKEND_TYPE_LABEL: Record<string, TranslationKey> = {
  none: "unit_types.weekend_none",
  percent: "unit_types.weekend_percent",
  amount: "unit_types.weekend_amount",
}

export const UNIT_TYPE_EVENT_LABEL: Record<string, TranslationKey> = {
  created: "unit_type.event.created",
  updated: "unit_type.event.updated",
  archived: "unit_type.event.archived",
  restored: "unit_type.event.restored",
}

// Câmp nou auditat în app.audit_unit_type = o intrare nouă aici.
export const TYPE_FIELDS: EventFieldRegistry = {
  name: { label: "unit_types.name" },
  max_adults: { label: "unit_types.max_adults" },
  max_children: { label: "unit_types.max_children" },
  base_price: { label: "unit_types.base_price", format: (v) => Number(v).toFixed(2) },
  min_stay: { label: "unit_types.min_stay" },
  max_stay: { label: "unit_types.max_stay" },
  turnover_days: { label: "unit_types.turnover_days_hist" },
  weekend_adjustment_type: {
    label: "unit_types.weekend_type_hist",
    format: (v) => t(WEEKEND_TYPE_LABEL[String(v)] ?? "unit_types.weekend_none"),
  },
  weekend_adjustment_value: { label: "unit_types.weekend_value_hist" },
  weekend_days: {
    label: "unit_types.weekend_days_hist",
    // DOW int[] → etichete în ordinea Lu→Du (ex. "Vi, Sâ")
    format: (v) =>
      WEEKDAY_ORDER.filter((d) => (v as number[]).includes(d)).map(dayLabel).join(", "),
  },
}
