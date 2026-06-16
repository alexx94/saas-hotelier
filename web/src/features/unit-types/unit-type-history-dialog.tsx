import { useUnitTypeEvents } from "./hooks"
import { EventHistoryDialog } from "./event-history-dialog"
import type { EventFieldRegistry } from "@/features/bookings/event-diff"
import { dayLabel, WEEKDAY_ORDER } from "@/features/pricing/weekend-pricing"
import { t, type TranslationKey } from "@/lib/i18n"

const WEEKEND_TYPE_LABEL: Record<string, TranslationKey> = {
  none: "unit_types.weekend_none",
  percent: "unit_types.weekend_percent",
  amount: "unit_types.weekend_amount",
}

const EVENT_LABEL: Record<string, TranslationKey> = {
  created: "unit_type.event.created",
  updated: "unit_type.event.updated",
  archived: "unit_type.event.archived",
  restored: "unit_type.event.restored",
}

// Câmp nou auditat în app.audit_unit_type = o intrare nouă aici.
const TYPE_FIELDS: EventFieldRegistry = {
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

type Props = {
  unitTypeId: string | null
  unitTypeName?: string
  onClose: () => void
}

export function UnitTypeHistoryDialog({ unitTypeId, unitTypeName, onClose }: Props) {
  const query = useUnitTypeEvents(unitTypeId)

  return (
    <EventHistoryDialog
      open={!!unitTypeId}
      title={`${t("unit_types.history")}${unitTypeName ? `: ${unitTypeName}` : ""}`}
      onClose={onClose}
      events={query.data?.pages.flatMap((p) => p.items)}
      isLoading={query.isLoading}
      labels={EVENT_LABEL}
      fields={TYPE_FIELDS}
      hasMore={!!query.hasNextPage}
      loadingMore={query.isFetchingNextPage}
      onLoadMore={() => query.fetchNextPage()}
      endReached={!query.hasNextPage && (query.data?.pages.length ?? 0) > 1}
    />
  )
}
