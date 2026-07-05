import { Ban, Users } from "lucide-react"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { AvailabilityItem } from "./api"

// Mesajul afișat pe card când tipul nu poate fi rezervat (în ordinea din backend).
function reasonText(item: AvailabilityItem): string {
  switch (item.reason) {
    case "OCCUPANCY": return t("public.reason.occupancy")
    case "CLOSED": return t("public.reason.closed")
    case "STAY_TOO_SHORT": return `${t("public.reason.stay_short")} ${item.min_stay} ${t("bookings.nights")}`
    case "STAY_TOO_LONG": return `${t("public.reason.stay_long")} ${item.max_stay} ${t("bookings.nights")}`
    case "NO_ARRIVAL": return t("public.reason.no_arrival")
    case "NO_DEPARTURE": return t("public.reason.no_departure")
    case "UNAVAILABLE": return t("public.reason.unavailable")
    default: return ""
  }
}

// Cardurile de tipuri disponibile (preț/reduceri/motive de blocare) — folosite
// atât pe /p/{slug} (temă implicită) cât și pe /s/.../book (temă site,
// componenta e agnostică de temă, folosește clasele shadcn standard).
export function AvailabilityResults({
  isLoading,
  availability,
  nights,
  onSelect,
  className,
}: {
  isLoading: boolean
  availability: AvailabilityItem[] | undefined
  nights: number
  onSelect: (item: AvailabilityItem) => void
  className?: string
}) {
  if (isLoading) {
    return <Skeleton className={cn("h-40 w-full", className)} />
  }

  if (!availability) return null

  if (availability.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-10 text-center text-muted-foreground">
          {t("public.no_availability")}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={cn("space-y-4", className)}>
      {availability.map((item) => {
        const bookable = item.reason === null
        const hasDiscount = bookable && item.discount > 0
        const discounted = item.total_price - item.discount
        return (
          <Card key={item.unit_type_id} className={cn(!bookable && "opacity-75")}>
            <CardHeader>
              <CardTitle className="flex items-start justify-between gap-4">
                <span>{item.name}</span>
                <span className="whitespace-nowrap text-right">
                  {Number(item.price_per_night).toFixed(0)} {item.currency}
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}{t("public.per_night")}
                  </span>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-end justify-between gap-4">
              <div className="space-y-1 text-sm text-muted-foreground">
                <p className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  max. {item.max_adults} {t("occupancy.adults").toLowerCase()} ·{" "}
                  {item.max_children} {t("occupancy.children").toLowerCase()} · {item.available_units}{" "}
                  {t("public.available_rooms")}
                </p>
                {bookable && item.min_stay > 1 && (
                  <p>{t("public.min_nights")} {item.min_stay} {t("bookings.nights")}</p>
                )}
                {bookable ? (
                  hasDiscount ? (
                    <p className="flex flex-wrap items-center gap-2">
                      <span>{nights} {t("bookings.nights")} ·</span>
                      <span className="text-muted-foreground line-through" title={t("public.before")}>
                        {Number(item.total_price).toFixed(0)} {item.currency}
                      </span>
                      <strong className="text-emerald-600 dark:text-emerald-400">
                        {Number(discounted).toFixed(0)} {item.currency}
                      </strong>
                      {item.promo_label && (
                        <Badge variant="outline" className="text-[10px]">{item.promo_label}</Badge>
                      )}
                    </p>
                  ) : (
                    <p>
                      {nights} {t("bookings.nights")} ·{" "}
                      <strong className="text-foreground">
                        {Number(item.total_price).toFixed(0)} {item.currency}
                      </strong>{" "}
                      {t("public.total_for_stay")}
                    </p>
                  )
                ) : (
                  <p className="flex items-center gap-1.5 text-destructive">
                    <Ban className="h-4 w-4 shrink-0" />{reasonText(item)}
                  </p>
                )}
              </div>
              <Button onClick={() => onSelect(item)} disabled={!bookable}>
                {t("public.book_now")}
              </Button>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
