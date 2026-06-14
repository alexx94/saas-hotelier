import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery, useMutation } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { CalendarDays, CheckCircle2, MapPin, Users } from "lucide-react"
import {
  createPublicBooking, fetchAvailability, fetchPublicProperty,
  type AvailabilityItem,
} from "@/features/public-booking/api"
import { OccupancyStepper } from "@/features/pricing/occupancy-stepper"
import { t } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"

export const Route = createFileRoute("/p/$slug")({
  component: PublicBookingPage,
})

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

const MAX_OCCUPANCY_UNBOUNDED = 25

const guestSchema = z.object({
  full_name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
})
type GuestFormInput = z.input<typeof guestSchema>
type GuestFormValues = z.output<typeof guestSchema>

function PublicBookingPage() {
  const { slug } = Route.useParams()
  const today = toISO(new Date())
  const tomorrow = toISO(new Date(Date.now() + 86_400_000))

  const [checkIn, setCheckIn] = useState(today)
  const [checkOut, setCheckOut] = useState(tomorrow)
  const [adults, setAdults] = useState(1)
  const [children, setChildren] = useState(0)
  const [searched, setSearched] = useState<
    { in: string; out: string; adults: number; children: number } | null
  >(null)
  const [selected, setSelected] = useState<AvailabilityItem | null>(null)
  // ocuparea rezervării (poate fi ajustată în dialog, în limitele tipului ales)
  const [bookAdults, setBookAdults] = useState(1)
  const [bookChildren, setBookChildren] = useState(0)
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

  const book = useMutation({ mutationFn: createPublicBooking })

  const form = useForm<GuestFormInput, unknown, GuestFormValues>({
    resolver: zodResolver(guestSchema),
  })

  function openBooking(item: AvailabilityItem) {
    // pornește de la ocuparea căutată, restrânsă la limitele tipului
    setBookAdults(Math.min(Math.max(1, searched?.adults ?? 1), item.max_adults))
    setBookChildren(Math.min(searched?.children ?? 0, item.max_children))
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

  async function onBook(values: GuestFormValues) {
    if (!selected || !searched) return
    try {
      const result = await book.mutateAsync({
        slug,
        unitTypeId: selected.unit_type_id,
        checkIn: searched.in,
        checkOut: searched.out,
        fullName: values.full_name,
        email: values.email,
        phone: values.phone,
        adults: bookAdults,
        children: bookChildren,
      })
      setSelected(null)
      setConfirmation(result.booking_id)
      form.reset()
    } catch (e) {
      const message = e instanceof Error ? e.message : ""
      toast.error(
        message.includes("UNIT_NOT_AVAILABLE")
          ? t("public.no_availability")
          : t("common.error")
      )
    }
  }

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
          <CardContent className="flex flex-wrap items-end gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="pin">{t("bookings.check_in")}</Label>
              <Input
                id="pin" type="date" min={today} value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pout">{t("bookings.check_out")}</Label>
              <Input
                id="pout" type="date" min={checkIn} value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
              />
            </div>
            <OccupancyStepper
              label={t("occupancy.adults")} value={adults} onChange={setAdults}
              min={1} max={MAX_OCCUPANCY_UNBOUNDED}
            />
            <OccupancyStepper
              label={t("occupancy.children")} value={children} onChange={setChildren}
              min={0} max={MAX_OCCUPANCY_UNBOUNDED}
            />
            <Button
              onClick={() => {
                setConfirmation(null)
                setSearched({ in: checkIn, out: checkOut, adults, children })
              }}
              disabled={!checkIn || !checkOut || checkOut <= checkIn}
            >
              <CalendarDays className="h-4 w-4" />
              {t("public.check_availability")}
            </Button>
          </CardContent>
        </Card>

        {isFetching ? (
          <Skeleton className="h-40 w-full" />
        ) : searched && availability ? (
          availability.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                {t("public.no_availability")}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {availability.map((item) => (
                <Card key={item.unit_type_id}>
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
                      <p>
                        {nights} nopți ·{" "}
                        <strong className="text-foreground">
                          {Number(item.total_price).toFixed(0)} {item.currency}
                        </strong>{" "}
                        {t("public.total_for_stay")}
                      </p>
                    </div>
                    <Button onClick={() => openBooking(item)}>
                      {t("public.book_now")}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        ) : null}
      </main>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selected?.name} · {searched?.in} → {searched?.out}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onBook)} className="space-y-4">
            <p className="text-sm font-medium">{t("public.your_details")}</p>
            <div className="space-y-2">
              <Label htmlFor="b-name">{t("guests.full_name")}</Label>
              <Input id="b-name" {...form.register("full_name")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="b-email">{t("auth.email")}</Label>
                <Input id="b-email" type="email" {...form.register("email")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="b-phone">{t("guests.phone")}</Label>
                <Input id="b-phone" {...form.register("phone")} />
              </div>
            </div>
            {selected && (
              <div className="grid grid-cols-2 gap-4">
                <OccupancyStepper
                  label={t("occupancy.adults")} value={bookAdults} onChange={setBookAdults}
                  min={1} max={selected.max_adults}
                />
                <OccupancyStepper
                  label={t("occupancy.children")} value={bookChildren} onChange={setBookChildren}
                  min={0} max={selected.max_children}
                />
              </div>
            )}
            {selected && (
              <p className="text-sm text-muted-foreground">
                {t("bookings.total")}:{" "}
                <strong className="text-foreground">
                  {Number(selected.total_price).toFixed(0)} {selected.currency}
                </strong>
              </p>
            )}
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {t("public.book_now")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
