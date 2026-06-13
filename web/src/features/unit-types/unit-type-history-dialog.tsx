import { useUnitTypeEvents } from "./hooks"
import { EventHistoryDialog } from "./event-history-dialog"
import type { EventFieldRegistry } from "@/features/bookings/event-diff"
import { t, type TranslationKey } from "@/lib/i18n"

const EVENT_LABEL: Record<string, TranslationKey> = {
  created: "unit_type.event.created",
  updated: "unit_type.event.updated",
  archived: "unit_type.event.archived",
  restored: "unit_type.event.restored",
}

// Câmp nou auditat în app.audit_unit_type = o intrare nouă aici.
const TYPE_FIELDS: EventFieldRegistry = {
  name: { label: "unit_types.name" },
  capacity: { label: "unit_types.capacity" },
  base_price: { label: "unit_types.base_price", format: (v) => Number(v).toFixed(2) },
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
