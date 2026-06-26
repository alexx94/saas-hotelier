import { useState } from "react"
import { toast } from "sonner"
import { t } from "@/lib/i18n"
import { errorMessage } from "@/lib/errors"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { useQuotePrice } from "@/features/pricing/hooks"
import { PriceBreakdown } from "@/features/pricing/price-breakdown"
import { PriceOverrideEditor } from "@/features/pricing/price-override-editor"
import { applyPriceOverridePreview, type PriceOverride } from "@/features/pricing/price-override"
import { useOverrideBookingPrice } from "./hooks"

// Dialog de editare a prețului pe o rezervare existentă (override_booking_price).
// Montat condiționat de `open` (initial vine din props → evită lazy-init stale).
export function PriceOverrideDialog(props: {
  open: boolean
  onClose: () => void
  bookingId: string
  unitTypeId: string
  checkIn: string
  checkOut: string
  currency: string
  initial: PriceOverride | null
  hasOverride: boolean
}) {
  return props.open ? <Inner {...props} /> : null
}

function Inner({
  onClose, bookingId, unitTypeId, checkIn, checkOut, currency, initial, hasOverride,
}: {
  onClose: () => void
  bookingId: string
  unitTypeId: string
  checkIn: string
  checkOut: string
  currency: string
  initial: PriceOverride | null
  hasOverride: boolean
}) {
  // quote-ul motorului (fără override) = baza pentru editor + recalcul autoritar la server
  const { data: base } = useQuotePrice(unitTypeId, checkIn, checkOut)
  const [override, setOverride] = useState<PriceOverride | null>(initial)
  const save = useOverrideBookingPrice()

  const displayQuote = base && override ? applyPriceOverridePreview(base, override) : base

  async function submit(value: PriceOverride | null) {
    try {
      await save.mutateAsync({ bookingId, override: value })
      toast.success(t("bookings.price_override_saved"))
      onClose()
    } catch (e) {
      const m = errorMessage(e)
      if (m.includes("PRICE_OVERRIDE_NEGATIVE")) toast.error(t("bookings.price_override_negative"))
      else if (m.includes("BOOKING_NOT_EDITABLE")) toast.error(t("bookings.not_editable"))
      else if (m.includes("FORBIDDEN")) toast.error(t("bookings.price_override_forbidden"))
      else toast.error(t("common.error"))
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("bookings.price_override_title")}</DialogTitle>
        </DialogHeader>

        {!base ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="space-y-4">
            <PriceOverrideEditor
              base={base}
              currency={currency}
              value={override}
              onChange={setOverride}
            />

            {displayQuote && displayQuote.nights.length > 0 && (
              <div className="space-y-1.5">
                <Label>{t("bookings.price_estimate")}</Label>
                <PriceBreakdown quote={displayQuote} />
              </div>
            )}

            <div className="flex gap-2">
              {hasOverride && (
                <Button
                  type="button" variant="outline" className="flex-1"
                  disabled={save.isPending}
                  onClick={() => submit(null)}
                >
                  {t("bookings.price_override_clear")}
                </Button>
              )}
              <Button
                type="button" className="flex-1"
                disabled={save.isPending}
                onClick={() => submit(override)}
              >
                {t("common.save")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
