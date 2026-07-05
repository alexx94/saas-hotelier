import { useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { X } from "lucide-react"
import { OccupancyStepper } from "@/features/pricing/occupancy-stepper"
import { t } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createPublicBooking, previewPromo, type AvailabilityItem } from "./api"

const guestSchema = z.object({
  full_name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
})
type GuestFormInput = z.input<typeof guestSchema>
type GuestFormValues = z.output<typeof guestSchema>

// Dialogul de rezervare (formular oaspete + promo + total + submit), extras
// din /p/{slug} — reutilizat identic pe /s/.../book. Primește doar `slug`
// (slug-ul PROPRIETĂȚII, nu al site-ului — RPC-urile publice merg pe el),
// item-ul selectat și intervalul căutat; își ține propriile query-uri de
// promo pentru a nu obliga părintele să le orchestreze.
export function BookingDialog({
  slug,
  selected,
  searched,
  onClose,
  onSuccess,
}: {
  slug: string
  selected: AvailabilityItem | null
  searched: { in: string; out: string; adults: number; children: number } | null
  onClose: () => void
  onSuccess: (bookingId: string) => void
}) {
  // ocuparea rezervării (poate fi ajustată în dialog, în limitele tipului ales)
  const [bookAdults, setBookAdults] = useState(() =>
    Math.min(Math.max(1, searched?.adults ?? 1), selected?.max_adults ?? 1)
  )
  const [bookChildren, setBookChildren] = useState(() =>
    Math.min(searched?.children ?? 0, selected?.max_children ?? 0)
  )
  const [promoInput, setPromoInput] = useState("")
  const [promoCode, setPromoCode] = useState("")

  const book = useMutation({ mutationFn: createPublicBooking })

  // preview reducere în dialog: cod aplicat sau cea mai bună promoție automată
  const { data: promo } = useQuery({
    queryKey: ["public-promo", slug, selected?.unit_type_id, searched?.in, searched?.out, promoCode],
    queryFn: () => previewPromo(slug, selected!.unit_type_id, searched!.in, searched!.out, promoCode),
    enabled: !!selected && !!searched,
  })
  const promoRejected = !!promoCode && !!promo && !promo.promotion.code_matched

  const form = useForm<GuestFormInput, unknown, GuestFormValues>({
    resolver: zodResolver(guestSchema),
  })

  async function onBook(values: GuestFormValues) {
    if (!selected || !searched) return
    try {
      const result = await book.mutateAsync({
        slug,
        unitTypeId: selected.unit_type_id,
        checkIn: searched.in,
        checkOut: searched.out,
        fullName: values.full_name,
        email: values.email,
        phone: values.phone,
        adults: bookAdults,
        children: bookChildren,
        promoCode: promoCode || undefined,
      })
      onSuccess(result.booking_id)
      form.reset()
    } catch (e) {
      const message = e instanceof Error ? e.message : ""
      toast.error(
        message.includes("PROMO_INVALID")
          ? t("bookings.promo_invalid")
          : message.includes("PROMO_LIMIT_REACHED")
            ? t("bookings.promo_limit")
            : message.includes("STAY_TOO_SHORT")
              ? t("bookings.stay_too_short")
              : message.includes("STAY_TOO_LONG")
                ? t("bookings.stay_too_long")
                : message.includes("DATES_CLOSED")
                  ? t("bookings.dates_closed")
                  : message.includes("UNIT_NOT_AVAILABLE")
                    ? t("public.no_availability")
                    : t("common.error")
      )
    }
  }

  return (
    <Dialog open={!!selected} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {selected?.name} · {searched?.in} → {searched?.out}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onBook)} className="space-y-4">
          <p className="text-sm font-medium">{t("public.your_details")}</p>
          <div className="space-y-2">
            <Label htmlFor="b-name">{t("guests.full_name")}</Label>
            <Input id="b-name" {...form.register("full_name")} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="b-email">{t("auth.email")}</Label>
              <Input id="b-email" type="email" {...form.register("email")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-phone">{t("guests.phone")}</Label>
              <Input id="b-phone" {...form.register("phone")} />
            </div>
          </div>
          {selected && (
            <div className="grid grid-cols-2 gap-4">
              <OccupancyStepper
                label={t("occupancy.adults")} value={bookAdults} onChange={setBookAdults}
                min={1} max={selected.max_adults}
              />
              <OccupancyStepper
                label={t("occupancy.children")} value={bookChildren} onChange={setBookChildren}
                min={0} max={selected.max_children}
              />
            </div>
          )}
          {selected && selected.min_stay > 1 && (
            <p className="text-sm text-muted-foreground">
              {t("public.min_nights")}{" "}
              <span className="font-semibold text-primary">{selected.min_stay} {t("bookings.nights")}</span>
            </p>
          )}
          {/* cod promoțional (opțional) */}
          {selected && (
            <div className="space-y-1.5">
              <Label htmlFor="b-promo">{t("public.promo_code")}</Label>
              <div className="flex gap-2">
                <Input
                  id="b-promo" value={promoInput}
                  onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setPromoCode(promoInput.trim()) } }}
                />
                <Button type="button" variant="outline" onClick={() => setPromoCode(promoInput.trim())}>
                  {t("public.promo_apply")}
                </Button>
                {promoCode && (
                  <Button
                    type="button" variant="ghost" size="icon"
                    title={t("bookings.promo_remove")}
                    onClick={() => { setPromoInput(""); setPromoCode("") }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {promoRejected ? (
                <p className="text-xs text-destructive">{t("bookings.promo_invalid")}</p>
              ) : promoCode && promo?.promotion.code_matched ? (
                <p className="text-xs text-emerald-600">{t("bookings.promo_applied")}: {promoCode}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">{t("bookings.promo_bestof")}</p>
            </div>
          )}
          {selected && (
            <div className="space-y-0.5 text-sm">
              {promo?.promotion.applied && promo.discount > 0 && (
                <>
                  <p className="flex justify-between text-muted-foreground">
                    <span>{t("bookings.subtotal")}</span>
                    <span>{Number(promo.subtotal).toFixed(0)} {selected.currency}</span>
                  </p>
                  <p className="flex justify-between text-emerald-600">
                    <span>
                      {t("public.discount")}
                      {promo.promotion.code ? ` (${promo.promotion.code})` : promo.promotion.name ? ` (${promo.promotion.name})` : ""}
                    </span>
                    <span>−{Number(promo.discount).toFixed(0)} {selected.currency}</span>
                  </p>
                </>
              )}
              <p className="flex justify-between font-medium">
                <span>{t("bookings.total")}</span>
                <strong className="text-foreground">
                  {Number(promo?.total ?? selected.total_price).toFixed(0)} {selected.currency}
                </strong>
              </p>
            </div>
          )}
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {t("public.book_now")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
