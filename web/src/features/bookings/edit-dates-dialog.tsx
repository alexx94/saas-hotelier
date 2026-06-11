import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { useUpdateBookingDates } from "./hooks"
import { addDays } from "./date-utils"
import type { Booking } from "./api"
import { t } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

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

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: booking
      ? { check_in: booking.check_in, check_out: booking.check_out }
      : { check_in: "", check_out: "" },
  })

  const checkIn = form.watch("check_in")

  async function onSubmit(values: FormValues) {
    if (!booking) return
    try {
      await updateDates.mutateAsync({
        bookingId: booking.id,
        checkIn: values.check_in,
        checkOut: values.check_out,
      })
      toast.success(t("bookings.dates_updated"))
      onOpenChange(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ""
      if (msg.includes("UNIT_NOT_AVAILABLE")) toast.error(t("bookings.not_available"))
      else if (msg.includes("BOOKING_NOT_EDITABLE")) toast.error(t("bookings.not_editable"))
      else if (msg.includes("INVALID_DATE_RANGE")) toast.error(t("bookings.invalid_date_range"))
      else toast.error(t("common.error"))
    }
  }

  if (!booking) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          <Button type="submit" className="w-full" disabled={updateDates.isPending}>
            {t("common.save")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
