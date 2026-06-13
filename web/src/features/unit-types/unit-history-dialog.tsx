import { format } from "date-fns"
import { useUnitEvents } from "./hooks"
import { unitStatusLabel } from "./unit-status"
import { blockReasonLabel } from "./block-reason"
import { EventHistoryDialog } from "./event-history-dialog"
import type { EventFieldRegistry } from "@/features/bookings/event-diff"
import { t, type TranslationKey } from "@/lib/i18n"

const EVENT_LABEL: Record<string, TranslationKey> = {
  created: "unit.event.created",
  status_changed: "unit.event.status_changed",
  renamed: "unit.event.renamed",
  block_created: "unit.event.block_created",
  block_updated: "unit.event.block_updated",
  block_removed: "unit.event.block_removed",
}

const fmtDate = (v: unknown) => format(new Date(String(v)), "dd.MM.yyyy")

const UNIT_FIELDS: EventFieldRegistry = {
  name: { label: "common.name" },
  status: { label: "unit.status_label", format: (v) => unitStatusLabel(String(v)) },
  block_start: { label: "blocks.start", format: fmtDate },
  block_end: { label: "blocks.end", format: fmtDate },
  block_reason: { label: "blocks.reason", format: (v) => blockReasonLabel(String(v)) },
}

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
