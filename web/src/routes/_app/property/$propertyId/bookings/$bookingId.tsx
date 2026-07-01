import { useState } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { toast } from "sonner"
import { ArrowLeft, Link2, Pencil, UserRound } from "lucide-react"
import { useCurrentOrg } from "@/features/organizations/context"
import { useBooking, useLinkBookingGuest } from "@/features/bookings/hooks"
import { BookingHistory } from "@/features/bookings/booking-history"
import { BookingNotesCard } from "@/features/bookings/booking-notes-card"
import { StatusBadge } from "@/features/bookings/status-badge"
import { PriceOverrideDialog } from "@/features/bookings/price-override-dialog"
import type { BookingStatus } from "@/features/bookings/api"
import type { PaymentStatus } from "@/features/payments/api"
import { PaymentStatusBadge } from "@/features/payments/payment-status-badge"
import { PaymentsCard } from "@/features/payments/payments-card"
import { GuestCombobox } from "@/features/guests/guest-combobox"
import { PriceBreakdown } from "@/features/pricing/price-breakdown"
import type { PriceQuote } from "@/features/pricing/api"
import type { PriceOverride, PriceOverrideKind } from "@/features/pricing/price-override"
import { usePermissions } from "@/features/auth/permissions"
import { t, type TranslationKey } from "@/lib/i18n"
import { formatMoney } from "@/lib/money"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"

export const Route = createFileRoute("/_app/property/$propertyId/bookings/$bookingId")({
  component: BookingDetailPage,
})

const SOURCE_LABEL: Record<string, TranslationKey> = {
  admin: "bookings.source.admin",
  public: "bookings.source.public",
  blocked: "bookings.source.blocked",
}

const CHANNEL_LABEL: Record<string, TranslationKey> = {
  direct: "bookings.channel.direct",
  booking_com: "bookings.channel.booking_com",
  airbnb: "bookings.channel.airbnb",
}

function BookingDetailPage() {
  const { propertyId, bookingId } = Route.useParams()
  const { currentOrg } = useCurrentOrg()
  const { data: booking, isLoading } = useBooking(bookingId)
  const linkGuest = useLinkBookingGuest()

  const [linkOpen, setLinkOpen] = useState(false)
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null)
  const [priceOpen, setPriceOpen] = useState(false)
  const { has } = usePermissions()

  async function onLinkGuest() {
    if (!selectedGuestId) return
    try {
      await linkGuest.mutateAsync({ bookingId, guestId: selectedGuestId })
      toast.success(t("bookings.guest_linked"))
      setLinkOpen(false)
      setSelectedGuestId(null)
    } catch {
      toast.error(t("common.error"))
    }
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (!booking) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          {t("bookings.not_found")}
        </CardContent>
      </Card>
    )
  }

  const isBlocked = booking.status === "blocked"
  const nights =
    (new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime()) / 86400000
  // snapshot-ul de preț salvat la creare (nu se recalculează). Reducerea (dacă există)
  // vine din coloanele autoritare ale rezervării (discount_amount + total_amount), ca
  // breakdown-ul să arate subtotal → reducere → total corect.
  const rawBreakdown = booking.price_breakdown as unknown as PriceQuote | null
  const discount = Number(booking.discount_amount ?? 0)
  const breakdown: PriceQuote | null = rawBreakdown
    ? {
        ...rawBreakdown,
        subtotal: Number(booking.total_amount) + discount,
        discount,
        total: Number(booking.total_amount),
      }
    : null

  // override manual de preț (booking.price_override): editabil pe rezervări reale
  // ne-anulate; prefill din coloanele snapshot ale rezervării
  const canPriceOverride = has("booking.price_override")
  const priceEditable = canPriceOverride && !isBlocked && booking.status !== "cancelled"
  const overrideKind = booking.price_override_kind as PriceOverrideKind | null
  const initialOverride: PriceOverride | null = overrideKind
    ? overrideKind === "per_night"
      ? {
          kind: "per_night",
          nights: (rawBreakdown?.nights ?? []).map((n) => ({ date: n.date, rate: n.rate })),
          note: booking.price_override_note,
        }
      : { kind: overrideKind, value: Number(booking.price_override_value), note: booking.price_override_note }
    : null

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild className="h-8 w-8 shrink-0">
          <Link
            to="/property/$propertyId/bookings"
            params={{ propertyId }}
            title={t("common.back")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold md:text-2xl">{t("bookings.detail_title")}</h1>
        <StatusBadge status={booking.status as BookingStatus} />
        {!isBlocked && (
          <PaymentStatusBadge status={booking.payment_status as PaymentStatus} />
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Detalii sejur */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("bookings.detail_title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Row label={t("bookings.property")} value={booking.properties?.name ?? "—"} />
            <Row
              label={t("bookings.unit")}
              value={`${booking.units?.name ?? "—"} · ${booking.unit_types?.name ?? ""}`}
            />
            <Row label={t("bookings.check_in")} value={booking.check_in} />
            <Row label={t("bookings.check_out")} value={`${booking.check_out} (${nights} ${t("bookings.nights")})`} />
            <Row
              label={t("bookings.guests_count")}
              value={`${booking.adults} ${t("occupancy.adults").toLowerCase()} · ${booking.children} ${t("occupancy.children").toLowerCase()}`}
            />
            {!isBlocked && (
              <Row
                label={t("bookings.unit_price")}
                value={formatMoney(booking.unit_price, booking.currency)}
              />
            )}
            <Row
              label={t("bookings.total")}
              value={formatMoney(booking.total_amount, booking.currency)}
            />
            <Row
              label={t("bookings.source")}
              value={t(SOURCE_LABEL[booking.source] ?? "bookings.source.admin")}
            />
            <Row
              label={t("bookings.channel")}
              value={t(CHANNEL_LABEL[booking.channel ?? "direct"] ?? "bookings.channel.direct")}
            />
            <Row label={t("bookings.created_at")} value={booking.created_at.slice(0, 10)} />
            {!isBlocked && breakdown && breakdown.nights?.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-muted-foreground">{t("pricing.breakdown")}</p>
                <PriceBreakdown quote={breakdown} />
              </div>
            )}
            {priceEditable && (
              <Button
                variant="outline" size="sm" className="mt-1 h-7 text-xs"
                onClick={() => setPriceOpen(true)}
              >
                <Pencil className="h-3 w-3" />
                {t("bookings.price_override_action")}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Oaspete: snapshot + profil asociat */}
        {!isBlocked && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("bookings.snapshot_title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="space-y-1.5">
                <Row label={t("guests.full_name")} value={booking.booked_full_name ?? "—"} />
                <Row label={t("auth.email")} value={booking.booked_email ?? "—"} />
                <Row label={t("guests.phone")} value={booking.booked_phone ?? "—"} />
                <p className="text-xs text-muted-foreground">{t("bookings.snapshot_hint")}</p>
              </div>

              <div className="rounded-md border p-3">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  {t("bookings.linked_profile")}
                </p>
                {booking.guests && booking.guest_id ? (
                  <Link
                    to="/property/$propertyId/guests/$guestId"
                    params={{ propertyId, guestId: booking.guest_id }}
                    className="flex items-center gap-2 font-medium hover:underline"
                  >
                    <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                    {booking.guests.full_name}
                    {booking.guests.email && (
                      <span className="text-xs font-normal text-muted-foreground">
                        · {booking.guests.email}
                      </span>
                    )}
                  </Link>
                ) : (
                  <p className="text-muted-foreground">—</p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 h-7 text-xs"
                  onClick={() => setLinkOpen(true)}
                >
                  <Link2 className="h-3 w-3" />
                  {t("bookings.link_guest")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Notă */}
      <BookingNotesCard
        bookingId={booking.id}
        notes={booking.notes}
        canEdit={has("booking.edit")}
      />

      {/* Plăți */}
      {!isBlocked && (
        <PaymentsCard
          bookingId={booking.id}
          currency={booking.currency}
          total={Number(booking.total_amount)}
          amountPaid={Number(booking.amount_paid)}
          paymentStatus={booking.payment_status as PaymentStatus}
        />
      )}

      {/* Istoric */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("bookings.history")}</CardTitle>
        </CardHeader>
        <CardContent>
          <BookingHistory bookingId={booking.id} />
        </CardContent>
      </Card>

      {/* Dialog asociere alt profil */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("bookings.link_guest")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("bookings.link_guest_hint")}</p>
          <GuestCombobox
            orgId={currentOrg.id}
            value={selectedGuestId}
            onChange={setSelectedGuestId}
          />
          <Button
            className="w-full"
            disabled={!selectedGuestId || linkGuest.isPending}
            onClick={onLinkGuest}
          >
            {t("common.save")}
          </Button>
        </DialogContent>
      </Dialog>

      <PriceOverrideDialog
        open={priceOpen}
        onClose={() => setPriceOpen(false)}
        bookingId={booking.id}
        unitTypeId={booking.unit_type_id}
        checkIn={booking.check_in}
        checkOut={booking.check_out}
        currency={booking.currency}
        initial={initialOverride}
        hasOverride={!!overrideKind}
      />
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </p>
  )
}
