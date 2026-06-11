import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { toast } from "sonner"
import { CalendarDays, History, MoveRight, Plus, Undo2 } from "lucide-react"
import {
  PropertySelect, usePropertySelection,
} from "@/features/properties/property-select"
import { useBookings, useUpdateBookingStatus } from "@/features/bookings/hooks"
import { BookingFormDialog } from "@/features/bookings/booking-form-dialog"
import { ReassignDialog } from "@/features/bookings/reassign-dialog"
import { EditDatesDialog } from "@/features/bookings/edit-dates-dialog"
import { BookingHistory } from "@/features/bookings/booking-history"
import { StatusBadge, statusLabel } from "@/features/bookings/status-badge"
import {
  getRevertOptions, nextStatuses, statusChangeWarning,
} from "@/features/bookings/status-rules"
import type { Booking, BookingStatus } from "@/features/bookings/api"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { t } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"

export const Route = createFileRoute("/_app/app/bookings")({
  component: BookingsPage,
})

const REASSIGNABLE = new Set(["pending", "confirmed", "checked_in"])
const DATE_EDITABLE = new Set(["pending", "confirmed", "checked_in"])

function BookingsPage() {
  const { properties, property, setPropertyId } = usePropertySelection()
  const { data: bookings, isLoading } = useBookings(property?.id)
  const updateStatus = useUpdateBookingStatus()

  const [createOpen, setCreateOpen] = useState(false)
  const [reassignBooking, setReassignBooking] = useState<Booking | null>(null)
  const [editDatesBooking, setEditDatesBooking] = useState<Booking | null>(null)
  const [historyBooking, setHistoryBooking] = useState<Booking | null>(null)
  const [confirmChange, setConfirmChange] = useState<{
    booking: Booking
    status: BookingStatus
    warning: string
  } | null>(null)

  async function applyStatusChange(id: string, status: BookingStatus) {
    try {
      await updateStatus.mutateAsync({ id, status })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ""
      if (msg.includes("INVALID_STATUS_TRANSITION")) toast.error(t("bookings.invalid_transition"))
      else if (msg.includes("no_double_booking")) toast.error(t("bookings.unit_not_available"))
      else toast.error(t("common.error"))
    }
  }

  // Schimbările sensibile (date nepotrivite, undo) cer confirmare explicită
  function requestStatusChange(booking: Booking, status: BookingStatus) {
    const warningKey = statusChangeWarning(booking, status)
    if (warningKey) {
      setConfirmChange({ booking, status, warning: t(warningKey) })
    } else {
      applyStatusChange(booking.id, status)
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

      <EditDatesDialog
        booking={editDatesBooking}
        open={!!editDatesBooking}
        onOpenChange={(o) => !o && setEditDatesBooking(null)}
      />

      <ConfirmDialog
        open={!!confirmChange}
        onOpenChange={(o) => !o && setConfirmChange(null)}
        title={t("bookings.confirm_action")}
        description={confirmChange?.warning ?? ""}
        onConfirm={() => {
          if (confirmChange) applyStatusChange(confirmChange.booking.id, confirmChange.status)
        }}
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
                const reverts = getRevertOptions(b)
                const canReassign = REASSIGNABLE.has(b.status)
                const canEditDates = DATE_EDITABLE.has(b.status)
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
                        {(options.length > 0 || reverts.length > 0) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                                {t("common.edit")}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {options.map((s) => (
                                <DropdownMenuItem key={s} onClick={() => requestStatusChange(b, s)}>
                                  {statusLabel(s)}
                                </DropdownMenuItem>
                              ))}
                              {options.length > 0 && reverts.length > 0 && <DropdownMenuSeparator />}
                              {reverts.map((s) => (
                                <DropdownMenuItem
                                  key={s}
                                  onClick={() => requestStatusChange(b, s)}
                                  className="text-muted-foreground"
                                >
                                  <Undo2 className="h-3.5 w-3.5" />
                                  {t("bookings.revert_section")}: {statusLabel(s)}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                        {canEditDates && (
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                            title={t("bookings.edit_dates")}
                            onClick={() => setEditDatesBooking(b)}
                          >
                            <CalendarDays className="h-3.5 w-3.5" />
                          </Button>
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
