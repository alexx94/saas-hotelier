import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { toast } from "sonner"
import { History, MoveRight, Plus } from "lucide-react"
import {
  PropertySelect, usePropertySelection,
} from "@/features/properties/property-select"
import { useBookings, useUpdateBookingStatus } from "@/features/bookings/hooks"
import { BookingFormDialog } from "@/features/bookings/booking-form-dialog"
import { ReassignDialog } from "@/features/bookings/reassign-dialog"
import { BookingHistory } from "@/features/bookings/booking-history"
import { StatusBadge, statusLabel } from "@/features/bookings/status-badge"
import type { Booking, BookingStatus } from "@/features/bookings/api"
import { t } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"

export const Route = createFileRoute("/_app/app/bookings")({
  component: BookingsPage,
})

const nextStatuses: Record<string, BookingStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["checked_in", "cancelled", "no_show"],
  checked_in: ["checked_out"],
  blocked: ["cancelled"],
}

const REASSIGNABLE = new Set(["pending", "confirmed", "checked_in"])

function BookingsPage() {
  const { properties, property, setPropertyId } = usePropertySelection()
  const { data: bookings, isLoading } = useBookings(property?.id)
  const updateStatus = useUpdateBookingStatus()

  const [createOpen, setCreateOpen] = useState(false)
  const [reassignBooking, setReassignBooking] = useState<Booking | null>(null)
  const [historyBooking, setHistoryBooking] = useState<Booking | null>(null)

  async function onStatusChange(id: string, status: BookingStatus) {
    try {
      await updateStatus.mutateAsync({ id, status })
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <h1 className="text-xl font-semibold md:text-2xl">{t("bookings.title")}</h1>
        <div className="flex items-center gap-2">
          <PropertySelect
            properties={properties}
            value={property?.id}
            onChange={setPropertyId}
            triggerClassName="flex-1 w-full sm:w-56 sm:flex-none"
          />
          <Button onClick={() => setCreateOpen(true)} disabled={!property} className="shrink-0">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t("bookings.add")}</span>
          </Button>
        </div>
      </div>

      {property && (
        <BookingFormDialog
          propertyId={property.id}
          open={createOpen}
          onOpenChange={setCreateOpen}
        />
      )}

      <ReassignDialog
        booking={reassignBooking}
        open={!!reassignBooking}
        onOpenChange={(o) => !o && setReassignBooking(null)}
      />

      {/* Dialog istoric */}
      <Dialog open={!!historyBooking} onOpenChange={(o) => !o && setHistoryBooking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("bookings.history")}</DialogTitle>
          </DialogHeader>
          {historyBooking && (
            <>
              <p className="text-sm text-muted-foreground">
                {historyBooking.guests?.full_name ?? t("status.blocked")} ·{" "}
                {historyBooking.check_in} → {historyBooking.check_out}
              </p>
              <Separator />
              <BookingHistory bookingId={historyBooking.id} />
            </>
          )}
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !bookings || bookings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("bookings.empty")}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("bookings.guest")}</TableHead>
                <TableHead>{t("bookings.unit")}</TableHead>
                <TableHead>{t("bookings.check_in")}</TableHead>
                <TableHead>{t("bookings.check_out")}</TableHead>
                <TableHead>{t("bookings.total")}</TableHead>
                <TableHead>{t("bookings.status")}</TableHead>
                <TableHead className="w-48">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bookings.map((b) => {
                const options = nextStatuses[b.status] ?? []
                const canReassign = REASSIGNABLE.has(b.status)
                return (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">
                      {b.status === "blocked"
                        ? t("status.blocked")
                        : b.guests?.full_name ?? "—"}
                      {b.guests?.email && (
                        <span className="block text-xs text-muted-foreground">{b.guests.email}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {b.units?.name}
                      <span className="block text-xs text-muted-foreground">{b.unit_types?.name}</span>
                    </TableCell>
                    <TableCell>{b.check_in}</TableCell>
                    <TableCell>{b.check_out}</TableCell>
                    <TableCell>{Number(b.total_amount).toFixed(2)} {b.currency}</TableCell>
                    <TableCell>
                      <StatusBadge status={b.status as BookingStatus} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {options.length > 0 && (
                          <Select onValueChange={(v) => onStatusChange(b.id, v as BookingStatus)}>
                            <SelectTrigger className="h-7 w-28 text-xs">
                              <span>{t("common.edit")}</span>
                            </SelectTrigger>
                            <SelectContent>
                              {options.map((s) => (
                                <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {canReassign && (
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                            title={t("bookings.reassign")}
                            onClick={() => setReassignBooking(b)}
                          >
                            <MoveRight className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                          title={t("bookings.history")}
                          onClick={() => setHistoryBooking(b)}
                        >
                          <History className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
