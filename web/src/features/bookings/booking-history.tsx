import { format } from "date-fns"
import { History } from "lucide-react"
import { useBookingEvents } from "./hooks"
import { EventDiff } from "./event-diff"
import { BOOKING_EVENT_LABEL as EVENT_LABEL } from "./booking-fields"
import { dedupeById } from "@/lib/pagination"
import { t } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

type Props = { bookingId: string }

export function BookingHistory({ bookingId }: Props) {
  const query = useBookingEvents(bookingId)
  const events = dedupeById(query.data?.pages.flatMap((p) => p.items))

  if (query.isLoading) return <Skeleton className="h-16 w-full" />

  if (!events || events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t("bookings.history_empty")}</p>
    )
  }

  return (
    <div className="space-y-2">
      {events.map((ev) => {
        const labelKey = EVENT_LABEL[ev.event_type] ?? "bookings.event.updated"
        return (
          <div key={ev.id} className="flex items-start gap-2 text-sm">
            <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="flex-1">
              <span className="font-medium">{t(labelKey)}</span>
              <EventDiff oldData={ev.old_data} newData={ev.new_data} />
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {format(new Date(ev.created_at), "dd.MM HH:mm")}
            </span>
          </div>
        )
      })}
      {query.hasNextPage ? (
        <Button
          variant="ghost" size="sm" className="w-full"
          disabled={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          {t("common.show_more")}
        </Button>
      ) : (query.data?.pages.length ?? 0) > 1 ? (
        <p className="pt-1 text-center text-xs text-muted-foreground">
          {t("history.end")}
        </p>
      ) : null}
    </div>
  )
}
