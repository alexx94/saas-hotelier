import { format } from "date-fns"
import { History } from "lucide-react"
import { EventDiff, type EventFieldRegistry } from "@/features/bookings/event-diff"
import { dedupeById } from "@/lib/pagination"
import { t, type TranslationKey } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"

// Forma comună a evenimentelor de audit (unit_events, unit_type_events, ...).
export type AuditEvent = {
  id: string
  event_type: string
  actor_email: string | null
  old_data: unknown
  new_data: unknown
  created_at: string
}

type Props = {
  open: boolean
  title: string
  onClose: () => void
  events: AuditEvent[] | undefined
  isLoading: boolean
  labels: Record<string, TranslationKey>
  fields: EventFieldRegistry
  // paginare "Afișează mai mult" (istoricurile cresc nelimitat în timp)
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
  // afișat doar după ce userul a paginat și a epuizat istoricul
  endReached: boolean
}

// Dialog generic de istoric pentru orice entitate auditată:
// listă de evenimente cu etichetă, actor (cine), diff (ce) și timestamp (când).
export function EventHistoryDialog({
  open, title, onClose, events: rawEvents, isLoading, labels, fields,
  hasMore, loadingMore, onLoadMore, endReached,
}: Props) {
  const events = dedupeById(rawEvents)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : !events || events.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("units.history_empty")}</p>
        ) : (
          <div className="space-y-2">
            {events.map((ev) => (
              <div key={ev.id} className="flex items-start gap-2 text-sm">
                <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="flex-1">
                  <span className="font-medium">
                    {labels[ev.event_type] ? t(labels[ev.event_type]) : ev.event_type}
                  </span>
                  {ev.actor_email && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      {t("unit.event.by")} {ev.actor_email}
                    </span>
                  )}
                  <EventDiff oldData={ev.old_data} newData={ev.new_data} fields={fields} />
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {format(new Date(ev.created_at), "dd.MM.yyyy HH:mm")}
                </span>
              </div>
            ))}
            {hasMore ? (
              <Button
                variant="ghost" size="sm" className="w-full"
                disabled={loadingMore}
                onClick={onLoadMore}
              >
                {t("common.show_more")}
              </Button>
            ) : endReached ? (
              <p className="pt-1 text-center text-xs text-muted-foreground">
                {t("history.end")}
              </p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
