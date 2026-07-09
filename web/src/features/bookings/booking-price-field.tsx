import { X } from "lucide-react"
import { PriceBreakdown } from "@/features/pricing/price-breakdown"
import { PriceOverrideEditor } from "@/features/pricing/price-override-editor"
import type { PriceOverride } from "@/features/pricing/price-override"
import type { PriceQuote } from "@/features/pricing/api"
import { t } from "@/lib/i18n"
import { formatMoney } from "@/lib/money"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"

// Preț, implicit simplu (un total mare editabil direct — pattern portat din fostul
// quick-booking-dialog) cu link către editorul avansat existent (3 moduri, NEMODIFICAT).
// Ambele moduri scriu în același state al părintelui (`priceOverride`); aici doar
// randăm în funcție de `mode` — logica de derivare a override-ului stă în părinte.
export function BookingPriceField({
  quote,
  displayQuote,
  currency,
  canOverride,
  mode,
  onModeChange,
  manualTotal,
  onManualTotalChange,
  hasSimpleOverride,
  advancedOverride,
  onAdvancedOverrideChange,
}: {
  quote: PriceQuote | undefined
  displayQuote: PriceQuote | undefined
  currency: string
  canOverride: boolean
  mode: "simple" | "advanced"
  onModeChange: (m: "simple" | "advanced") => void
  manualTotal: string | null
  onManualTotalChange: (v: string | null) => void
  hasSimpleOverride: boolean
  advancedOverride: PriceOverride | null
  onAdvancedOverrideChange: (v: PriceOverride | null) => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>{t("bookings.price_estimate")}</Label>
        {canOverride && quote && (
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => onModeChange(mode === "simple" ? "advanced" : "simple")}
          >
            {mode === "simple" ? t("bookings.price_advanced_link") : t("bookings.price_simple_link")}
          </button>
        )}
      </div>

      {!quote ? (
        <Skeleton className="h-16 w-full" />
      ) : mode === "advanced" && canOverride ? (
        <>
          <PriceOverrideEditor
            base={quote}
            currency={currency}
            value={advancedOverride}
            onChange={onAdvancedOverrideChange}
          />
          {displayQuote && displayQuote.nights.length > 0 && <PriceBreakdown quote={displayQuote} />}
        </>
      ) : (
        <div className="rounded-md border p-3">
          {canOverride ? (
            <div className="flex items-center gap-2">
              <Input
                type="number" min="0" step="0.01" inputMode="decimal"
                className="h-9 w-32 text-lg font-semibold tabular-nums"
                value={manualTotal ?? String(displayQuote?.total ?? quote.total)}
                onChange={(e) => onManualTotalChange(e.target.value)}
              />
              <span className="text-sm text-muted-foreground">{currency}</span>
              {hasSimpleOverride && (
                <Button
                  type="button" variant="ghost" size="icon" className="h-7 w-7"
                  title={t("bookings.price_override_clear")}
                  onClick={() => onManualTotalChange(null)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ) : (
            <p className="text-lg font-semibold tabular-nums">
              {formatMoney(displayQuote?.total ?? quote.total, currency)}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {formatMoney(displayQuote?.avg_nightly ?? quote.avg_nightly, currency)} {t("bookings.per_night")}
          </p>
        </div>
      )}
    </div>
  )
}
