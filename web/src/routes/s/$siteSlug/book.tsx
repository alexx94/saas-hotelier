import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { z } from "zod"
import { CheckCircle2 } from "lucide-react"
import { fetchAvailability, type AvailabilityItem } from "@/features/public-booking/api"
import { AvailabilitySearch } from "@/features/public-booking/availability-search"
import { AvailabilityResults } from "@/features/public-booking/availability-results"
import { BookingDialog } from "@/features/public-booking/booking-dialog"
import { usePublicSite } from "@/features/site/hooks"
import { t } from "@/lib/i18n"

const bookSearchSchema = z.object({
  unitTypeId: z.string().optional(),
})

export const Route = createFileRoute("/s/$siteSlug/book")({
  validateSearch: bookSearchSchema,
  component: SiteBookPage,
})

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// Pagina de rezervare a site-ului: refolosește motorul existent COMPLET
// (disponibilitate + promo + creare) prin componentele extrase din
// /p/{slug}, apelate cu `property.slug` (RPC-urile publice merg pe el, nu
// pe slug-ul site-ului) — doar stilizarea vine din tema site-ului (wrapper
// [data-site-theme] setat în route.tsx părinte).
function SiteBookPage() {
  const { siteSlug } = Route.useParams()
  const { unitTypeId } = Route.useSearch()
  const { data: site } = usePublicSite(siteSlug)

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

  const propertySlug = site?.property.slug ?? ""

  const { data: availability, isFetching } = useQuery({
    queryKey: ["public-availability", propertySlug, searched],
    queryFn: () =>
      fetchAvailability(propertySlug, searched!.in, searched!.out, searched!.adults, searched!.children),
    enabled: !!searched && !!propertySlug,
  })

  if (!site) return null

  const nights = searched
    ? Math.round(
        (new Date(searched.out).getTime() - new Date(searched.in).getTime()) / 86_400_000
      )
    : 0

  function openBooking(item: AvailabilityItem) {
    // deep-link din /rooms preselectase un tip — odată căutat, alegerea e liberă
    setSelected(item)
  }

  const preselectedNotice = unitTypeId && !searched

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-16 sm:py-24">
      <div className="text-center">
        <h1 className="site-font-display text-4xl font-semibold sm:text-5xl">
          {t("site.book.title")}
        </h1>
        <p className="mt-3" style={{ color: "var(--site-muted)" }}>
          {t("site.book.subtitle")}
        </p>
      </div>

      {confirmation && (
        <div
          className="flex items-center gap-3 rounded-2xl border p-4"
          style={{ borderColor: "var(--site-border)", background: "var(--site-card)" }}
        >
          <CheckCircle2 className="h-6 w-6 shrink-0" style={{ color: "var(--site-sage)" }} />
          <div>
            <p className="font-medium">{t("public.booking_success")}</p>
            <p className="text-xs" style={{ color: "var(--site-muted)" }}>
              {t("public.booking_ref")}: {confirmation.slice(0, 8).toUpperCase()}
            </p>
          </div>
        </div>
      )}

      {preselectedNotice && (
        <p className="text-center text-sm" style={{ color: "var(--site-muted)" }}>
          {t("site.book.pick_dates_hint")}
        </p>
      )}

      <div
        className="rounded-2xl border p-5"
        style={{ borderColor: "var(--site-border)", background: "var(--site-card)" }}
      >
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
      </div>

      {searched && (
        <AvailabilityResults
          isLoading={isFetching}
          availability={availability}
          nights={nights}
          onSelect={openBooking}
        />
      )}

      <BookingDialog
        slug={propertySlug}
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
