import { format } from "date-fns"
import { History } from "lucide-react"
import { useBookingEvents } from "./hooks"
import { t } from "@/lib/i18n"
import { Skeleton } from "@/components/ui/skeleton"
import type { TranslationKey } from "@/lib/i18n"

const EVENT_LABEL: Record<string, TranslationKey> = {
  created: "bookings.event.created",
  status_changed: "bookings.event.status_changed",
  reassigned: "bookings.event.reassigned",
  dates_changed: "bookings.event.dates_changed",
  updated: "bookings.event.updated",
}

type Props = { bookingId: string }

export function BookingHistory({ bookingId }: Props) {
  const { data: events, isLoading } = useBookingEvents(bookingId)

  if (isLoading) return <Skeleton className="h-16 w-full" />

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
              {ev.event_type === "reassigned" && ev.old_data && ev.new_data && (
                <span className="ml-1 text-muted-foreground">
                  (cameră schimbată)
                </span>
              )}
              {ev.event_type === "status_changed" && ev.old_data && ev.new_data && (
                <span className="ml-1 text-muted-foreground">
                  ({(ev.old_data as Record<string, unknown>)["status"] as string}
                  {" → "}
                  {(ev.new_data as Record<string, unknown>)["status"] as string})
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {format(new Date(ev.created_at), "dd.MM HH:mm")}
            </span>
          </div>
        )
      })}
    </div>
  )
}
