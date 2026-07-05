import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { CheckCircle2, MapPin } from "lucide-react"
import { fetchAvailability, fetchPublicProperty, type AvailabilityItem } from "@/features/public-booking/api"
import { AvailabilitySearch } from "@/features/public-booking/availability-search"
import { AvailabilityResults } from "@/features/public-booking/availability-results"
import { BookingDialog } from "@/features/public-booking/booking-dialog"
import { t } from "@/lib/i18n"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export const Route = createFileRoute("/p/$slug")({
  component: PublicBookingPage,
})

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function PublicBookingPage() {
  const { slug } = Route.useParams()
  // lazy initializer: evaluat o singură dată la montare, nu la fiecare render
  const [checkIn, setCheckIn] = useState(() => toISO(new Date()))
  const [checkOut, setCheckOut] = useState(() => toISO(new Date(Date.now() + 86_400_000)))
  const [adults, setAdults] = useState(1)
  const [children, setChildren] = useState(0)
  const [searched, setSearched] = useState<
    { in: string; out: string; adults: number; children: number } | null
  >(null)
  const [selected, setSelected] = useState<AvailabilityItem | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)

  const { data: property, isLoading, isError } = useQuery({
    queryKey: ["public-property", slug],
    queryFn: () => fetchPublicProperty(slug),
    retry: false,
  })

  const { data: availability, isFetching } = useQuery({
    queryKey: ["public-availability", slug, searched],
    queryFn: () => fetchAvailability(slug, searched!.in, searched!.out, searched!.adults, searched!.children),
    enabled: !!searched,
  })

  function openBooking(item: AvailabilityItem) {
    setSelected(item)
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (isError || !property) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        {t("common.no_results")}
      </div>
    )
  }

  const description =
    property.description?.[property.default_locale] ??
    property.description?.ro ?? ""

  const nights = searched
    ? Math.round(
        (new Date(searched.out).getTime() - new Date(searched.in).getTime()) /
          86_400_000
      )
    : 0

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <h1 className="text-3xl font-bold">{property.name}</h1>
          {(property.city || property.address) && (
            <p className="mt-1 flex items-center gap-1 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              {[property.address, property.city].filter(Boolean).join(", ")}
            </p>
          )}
          {description && <p className="mt-3 text-sm">{description}</p>}
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        {confirmation && (
          <Card className="border-emerald-300 bg-emerald-50">
            <CardContent className="flex items-center gap-3 py-4 text-emerald-900">
              <CheckCircle2 className="h-6 w-6 shrink-0" />
              <div>
                <p className="font-medium">{t("public.booking_success")}</p>
                <p className="text-xs">
                  {t("public.booking_ref")}: {confirmation.slice(0, 8).toUpperCase()}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="py-4">
            <AvailabilitySearch
              checkIn={checkIn}
              checkOut={checkOut}
              adults={adults}
              children={children}
              onCheckInChange={setCheckIn}
              onCheckOutChange={setCheckOut}
              onAdultsChange={setAdults}
              onChildrenChange={setChildren}
              onSearch={() => {
                setConfirmation(null)
                setSearched({ in: checkIn, out: checkOut, adults, children })
              }}
            />
          </CardContent>
        </Card>

        {searched && (
          <AvailabilityResults
            isLoading={isFetching}
            availability={availability}
            nights={nights}
            onSelect={openBooking}
          />
        )}
      </main>

      <BookingDialog
        slug={slug}
        selected={selected}
        searched={searched}
        onClose={() => setSelected(null)}
        onSuccess={(bookingId) => {
          setSelected(null)
          setConfirmation(bookingId)
        }}
      />
    </div>
  )
}
