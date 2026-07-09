import { ChevronDown, X } from "lucide-react"
import { BOOKING_CHANNELS, type BookingChannel } from "./api"
import type { AppliedPromotion } from "@/features/pricing/api"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

// Secțiune expandabilă „Mai multe detalii" — canal, note, cod promoțional. Ascunsă
// implicit (UI-ul de azi al formularului complet, portat neschimbat, doar strâns
// sub un toggle ca să nu aglomereze fluxul rapid).
export function BookingMoreDetails({
  open,
  onOpenChange,
  channel,
  onChannelChange,
  notes,
  onNotesChange,
  showPromo,
  promoInput,
  onPromoInputChange,
  promoCode,
  onPromoApply,
  onPromoClear,
  promoRejected,
  promotion,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  channel: BookingChannel
  onChannelChange: (c: BookingChannel) => void
  notes: string
  onNotesChange: (v: string) => void
  showPromo: boolean
  promoInput: string
  onPromoInputChange: (v: string) => void
  promoCode: string
  onPromoApply: () => void
  onPromoClear: () => void
  promoRejected: boolean
  promotion: AppliedPromotion | undefined
}) {
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="flex w-full items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        {t("bookings.more_details")}
      </button>

      {open && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>{t("bookings.channel")}</Label>
            <Select value={channel} onValueChange={(v) => onChannelChange(v as BookingChannel)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BOOKING_CHANNELS.map((ch) => (
                  <SelectItem key={ch} value={ch}>
                    {t(`bookings.channel.${ch}` as const)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("bookings.notes")}</Label>
            <Textarea rows={2} value={notes} onChange={(e) => onNotesChange(e.target.value)} />
          </div>

          {showPromo && (
            <div className="space-y-1.5">
              <Label>{t("bookings.promo_code")}</Label>
              <div className="flex gap-2">
                <Input
                  value={promoInput}
                  placeholder={t("promotions.code_placeholder")}
                  onChange={(e) => onPromoInputChange(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onPromoApply() } }}
                />
                <Button type="button" variant="outline" onClick={onPromoApply}>
                  {t("bookings.promo_apply")}
                </Button>
                {promoCode && (
                  <Button
                    type="button" variant="ghost" size="icon"
                    title={t("bookings.promo_remove")}
                    onClick={onPromoClear}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {promoRejected ? (
                <p className="text-xs text-destructive">{t("bookings.promo_invalid")}</p>
              ) : promoCode && promotion?.code_matched ? (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  {t("bookings.promo_applied")}: {promoCode}
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">{t("bookings.promo_bestof")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
