import { useUnitTypeEvents } from "./hooks"
import { EventHistoryDialog } from "./event-history-dialog"
import { UNIT_TYPE_EVENT_LABEL as EVENT_LABEL, TYPE_FIELDS } from "./unit-type-fields"
import { t } from "@/lib/i18n"

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
