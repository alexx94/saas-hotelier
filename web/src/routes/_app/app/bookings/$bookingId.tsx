import { useState } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { toast } from "sonner"
import { ArrowLeft, Link2, UserRound } from "lucide-react"
import { useCurrentOrg } from "@/features/organizations/context"
import { useBooking, useLinkBookingGuest } from "@/features/bookings/hooks"
import { BookingHistory } from "@/features/bookings/booking-history"
import { StatusBadge } from "@/features/bookings/status-badge"
import type { BookingStatus } from "@/features/bookings/api"
import { GuestCombobox } from "@/features/guests/guest-combobox"
import { t, type TranslationKey } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"

export const Route = createFileRoute("/_app/app/bookings/$bookingId")({
  component: BookingDetailPage,
})

const SOURCE_LABEL: Record<string, TranslationKey> = {
  admin: "bookings.source.admin",
  public: "bookings.source.public",
  blocked: "bookings.source.blocked",
}

function BookingDetailPage() {
  const { bookingId } = Route.useParams()
  const { currentOrg } = useCurrentOrg()
  const { data: booking, isLoading } = useBooking(bookingId)
  const linkGuest = useLinkBookingGuest()

  const [linkOpen, setLinkOpen] = useState(false)
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null)

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

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild className="h-8 w-8 shrink-0">
          <Link to="/app/bookings" title={t("common.back")}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold md:text-2xl">{t("bookings.detail_title")}</h1>
        <StatusBadge status={booking.status as BookingStatus} />
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
            <Row label={t("bookings.guests_count")} value={String(booking.guests_count)} />
            <Row
              label={t("bookings.total")}
              value={`${Number(booking.total_amount).toFixed(2)} ${booking.currency}`}
            />
            <Row
              label={t("bookings.source")}
              value={t(SOURCE_LABEL[booking.source] ?? "bookings.source.admin")}
            />
            <Row label={t("bookings.created_at")} value={booking.created_at.slice(0, 10)} />
            {booking.notes && <Row label={t("bookings.notes")} value={booking.notes} />}
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
                    to="/app/guests/$guestId"
                    params={{ guestId: booking.guest_id }}
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
