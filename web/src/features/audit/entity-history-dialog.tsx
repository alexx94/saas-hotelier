import { useEntityEvents } from "./hooks"
import { EventHistoryDialog } from "@/features/unit-types/event-history-dialog"
import type { EventFieldRegistry } from "@/features/bookings/event-diff"
import type { TranslationKey } from "@/lib/i18n"

type Props = {
  entityType: string
  entityId: string | null
  title: string
  labels: Record<string, TranslationKey>
  fields: EventFieldRegistry
  onClose: () => void
}

// Wrapper generic peste EventHistoryDialog pentru orice entitate auditată prin
// app.audit_entity (vezi entity_events) — o entitate nouă înseamnă un apel cu alt
// entityType/labels/fields, nu un fișier nou.
export function EntityHistoryDialog({ entityType, entityId, title, labels, fields, onClose }: Props) {
  const query = useEntityEvents(entityType, entityId)
  return (
    <EventHistoryDialog
      open={!!entityId}
      title={title}
      onClose={onClose}
      events={query.data?.pages.flatMap((p) => p.items)}
      isLoading={query.isLoading}
      labels={labels}
      fields={fields}
      hasMore={!!query.hasNextPage}
      loadingMore={query.isFetchingNextPage}
      onLoadMore={() => query.fetchNextPage()}
      endReached={!query.hasNextPage && (query.data?.pages.length ?? 0) > 1}
    />
  )
}
