import { useState } from "react"
import { toast } from "sonner"
import { MoveRight } from "lucide-react"
import { useAvailableUnits, useReassignBooking } from "./hooks"
import type { Booking } from "./api"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"

type Props = {
  booking: Booking | null
  open: boolean
  onOpenChange: (o: boolean) => void
}

export function ReassignDialog({ booking, open, onOpenChange }: Props) {
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)
  const reassign = useReassignBooking()

  const { data: units, isLoading } = useAvailableUnits(
    booking?.unit_type_id ?? undefined,
    booking?.check_in ?? "",
    booking?.check_out ?? "",
    booking?.id
  )

  async function onConfirm() {
    if (!booking || !selectedUnitId) return
    try {
      await reassign.mutateAsync({ bookingId: booking.id, unitId: selectedUnitId })
      toast.success(t("bookings.reassigned_ok"))
      onOpenChange(false)
      setSelectedUnitId(null)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ""
      if (msg.includes("UNIT_NOT_AVAILABLE")) toast.error(t("bookings.unit_not_available"))
      else if (msg.includes("BOOKING_NOT_REASSIGNABLE")) toast.error(t("bookings.not_reassignable"))
      else toast.error(t("common.error"))
    }
  }

  if (!booking) return null

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setSelectedUnitId(null) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("bookings.reassign_title")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {booking.guests?.full_name} · {booking.check_in} → {booking.check_out}
        </p>
        <p className="text-xs text-muted-foreground">
          Camera curentă: <strong>{booking.units?.name ?? "—"}</strong>
        </p>

        <div className="space-y-1">
          <p className="text-sm font-medium">{t("bookings.reassign_select")}</p>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {(units ?? []).map((u) => (
                <button
                  key={u.unit_id}
                  disabled={!u.is_free || u.unit_id === booking.unit_id}
                  onClick={() => setSelectedUnitId(u.unit_id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded border px-3 py-2 text-sm transition-colors",
                    u.unit_id === booking.unit_id
                      ? "border-primary bg-primary/5 text-muted-foreground"
                      : u.is_free
                        ? selectedUnitId === u.unit_id
                          ? "border-primary bg-primary/10"
                          : "hover:bg-accent"
                        : "opacity-40 cursor-not-allowed"
                  )}
                >
                  <span className="flex items-center gap-2">
                    {u.unit_id === booking.unit_id && <MoveRight className="h-3.5 w-3.5 text-primary" />}
                    {u.name}
                    {u.unit_id === booking.unit_id && (
                      <span className="text-xs text-muted-foreground">(curentă)</span>
                    )}
                  </span>
                  <Badge variant={u.is_free ? "outline" : "secondary"} className="text-xs">
                    {u.is_free ? t("bookings.unit_free") : t("bookings.unit_occupied")}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </div>

        <Button
          onClick={onConfirm}
          disabled={!selectedUnitId || selectedUnitId === booking.unit_id || reassign.isPending}
          className="w-full"
        >
          {t("bookings.reassign")}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
