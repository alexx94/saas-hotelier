import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Ban, ShieldAlert } from "lucide-react"
import { useUpdateBookingDates } from "./hooks"
import { addDays } from "./date-utils"
import type { Booking } from "./api"
import { useCurrentOrg } from "@/features/organizations/context"
import { useBookingRestrictions } from "@/features/reservation-rules/hooks"
import type { RestrictionReason } from "@/features/reservation-rules/api"
import { t, type TranslationKey } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const RESTRICTION_LABEL: Record<RestrictionReason, TranslationKey> = {
  DATES_CLOSED: "bookings.dates_closed",
  STAY_TOO_SHORT: "bookings.stay_too_short",
  STAY_TOO_LONG: "bookings.stay_too_long",
  NO_ARRIVAL: "bookings.no_arrival",
  NO_DEPARTURE: "bookings.no_departure",
}

const schema = z
  .object({
    check_in: z.string().min(10),
    check_out: z.string().min(10),
  })
  .refine((v) => v.check_out > v.check_in, {
    message: t("bookings.invalid_date_range"),
    path: ["check_out"],
  })

type FormValues = z.infer<typeof schema>

type Props = {
  booking: Booking | null
  open: boolean
  onOpenChange: (o: boolean) => void
}

export function EditDatesDialog({ booking, open, onOpenChange }: Props) {
  const updateDates = useUpdateBookingDates()
  const { currentOrg } = useCurrentOrg()
  const canOverride = ["owner", "manager"].includes(currentOrg.role)
  const [override, setOverride] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: booking
      ? { check_in: booking.check_in, check_out: booking.check_out }
      : { check_in: "", check_out: "" },
  })

  const checkIn = form.watch("check_in")
  const checkOut = form.watch("check_out")
  const datesChanged =
    !!booking && (checkIn !== booking.check_in || checkOut !== booking.check_out)

  // restricțiile se reevaluează DOAR când datele se schimbă (altfel sunt ignorate)
  const { data: restrictions } = useBookingRestrictions(
    datesChanged ? booking?.unit_type_id : undefined, checkIn ?? "", checkOut ?? ""
  )
  const reasons = (datesChanged ? restrictions : undefined) ?? []
  const blockedByRules = reasons.length > 0 && !(override && canOverride)

  async function onSubmit(values: FormValues) {
    if (!booking) return
    try {
      await updateDates.mutateAsync({
        bookingId: booking.id,
        checkIn: values.check_in,
        checkOut: values.check_out,
        override: override && canOverride,
      })
      toast.success(t("bookings.dates_updated"))
      onOpenChange(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ""
      if (msg.includes("OVERRIDE_FORBIDDEN")) toast.error(t("bookings.override_forbidden"))
      else if (msg.includes("STAY_TOO_SHORT")) toast.error(t("bookings.stay_too_short"))
      else if (msg.includes("STAY_TOO_LONG")) toast.error(t("bookings.stay_too_long"))
      else if (msg.includes("DATES_CLOSED")) toast.error(t("bookings.dates_closed"))
      else if (msg.includes("NO_ARRIVAL")) toast.error(t("bookings.no_arrival"))
      else if (msg.includes("NO_DEPARTURE")) toast.error(t("bookings.no_departure"))
      else if (msg.includes("UNIT_NOT_AVAILABLE")) toast.error(t("bookings.not_available"))
      else if (msg.includes("BOOKING_NOT_EDITABLE")) toast.error(t("bookings.not_editable"))
      else if (msg.includes("INVALID_DATE_RANGE")) toast.error(t("bookings.invalid_date_range"))
      else toast.error(t("common.error"))
    }
  }

  if (!booking) return null

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setOverride(false) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("bookings.edit_dates")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {booking.guests?.full_name ?? t("status.blocked")} · {booking.units?.name}
        </p>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("bookings.check_in")}</Label>
              <Input type="date" {...form.register("check_in")} />
            </div>
            <div className="space-y-2">
              <Label>{t("bookings.check_out")}</Label>
              <Input
                type="date"
                {...form.register("check_out")}
                disabled={!checkIn}
                min={checkIn ? addDays(checkIn, 1) : undefined}
              />
              {form.formState.errors.check_out && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.check_out.message}
                </p>
              )}
            </div>
          </div>

          {/* restricții pe noile date (afișate simultan) + override pentru manager */}
          {reasons.length > 0 && (
            <div className="space-y-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm">
              <div className="flex items-center gap-2 font-medium text-destructive">
                <Ban className="h-4 w-4 shrink-0" />
                {t("bookings.restrictions_title")}
              </div>
              <ul className="ml-6 list-disc space-y-0.5 text-destructive">
                {reasons.map((r) => (
                  <li key={r}>{t(RESTRICTION_LABEL[r])}</li>
                ))}
              </ul>
              {canOverride && (
                <button
                  type="button"
                  onClick={() => setOverride((v) => !v)}
                  className={cn(
                    "mt-1 flex w-full items-center gap-2 rounded border px-3 py-1.5 text-left text-xs transition-colors",
                    override
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-destructive/40 text-muted-foreground hover:bg-background"
                  )}
                >
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    <span className="font-semibold">{t("bookings.override")}</span>
                    {" — "}{t("bookings.override_hint")}
                  </span>
                  <span className="ml-auto font-semibold">{override ? "ON" : "OFF"}</span>
                </button>
              )}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={updateDates.isPending || blockedByRules}>
            {t("common.save")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
