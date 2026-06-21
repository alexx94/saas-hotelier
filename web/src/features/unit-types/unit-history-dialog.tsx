import { useUnitEvents } from "./hooks"
import { EventHistoryDialog } from "./event-history-dialog"
import { UNIT_EVENT_LABEL as EVENT_LABEL, UNIT_FIELDS } from "./unit-fields"
import { t } from "@/lib/i18n"

type Props = {
  unitId: string | null
  unitName?: string
  onClose: () => void
}

export function UnitHistoryDialog({ unitId, unitName, onClose }: Props) {
  const query = useUnitEvents(unitId)

  return (
    <EventHistoryDialog
      open={!!unitId}
      title={`${t("units.history")}${unitName ? `: ${unitName}` : ""}`}
      onClose={onClose}
      events={query.data?.pages.flatMap((p) => p.items)}
      isLoading={query.isLoading}
      labels={EVENT_LABEL}
      fields={UNIT_FIELDS}
      hasMore={!!query.hasNextPage}
      loadingMore={query.isFetchingNextPage}
      onLoadMore={() => query.fetchNextPage()}
      endReached={!query.hasNextPage && (query.data?.pages.length ?? 0) > 1}
    />
  )
}
