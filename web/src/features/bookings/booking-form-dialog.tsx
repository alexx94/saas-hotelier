import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Ban, Bot, ShieldAlert, User, X } from "lucide-react"
import { useCurrentOrg } from "@/features/organizations/context"
import { GuestCombobox } from "@/features/guests/guest-combobox"
import { useUnitTypes } from "@/features/unit-types/hooks"
import { OccupancyStepper } from "@/features/pricing/occupancy-stepper"
import { PriceBreakdown } from "@/features/pricing/price-breakdown"
import { useQuotePrice } from "@/features/pricing/hooks"
import { useStayConstraints, useValidateBooking } from "@/features/reservation-rules/hooks"
import { VALIDATION_LABEL, isSoftCode } from "@/features/reservation-rules/api"
import { useAvailableUnits, useCreateBooking } from "./hooks"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { errorMessage } from "@/lib/errors"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

import { addDays, formatDateShort } from "./date-utils"

// ─── constants ────────────────────────────────────────────────────────────────

const NIGHT_SHORTCUTS = [1, 2, 3, 5, 7]
// limită de bun simț pentru ocupare când nu e ales încă un tip de cameră
const MAX_OCCUPANCY_UNBOUNDED = 25

// ─── schema ───────────────────────────────────────────────────────────────────

const schema = z
  .object({
    unit_type_id: z.string().uuid(),
    check_in: z.string().min(10),
    check_out: z.string().min(10),
    // adulți/copii sunt gestionați ca state (steppere) — vezi mai jos
    // Blocajele de disponibilitate nu mai sunt rezervări — se creează din
    // pagina camerelor (Availability Blocks, migrația 17).
    status: z.enum(["pending", "confirmed"]),
    guest_id: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine((v) => v.check_out > v.check_in, {
    message: "Check-out trebuie să fie după check-in",
    path: ["check_out"],
  })
  .refine((v) => !!v.guest_id, { message: "Alege un oaspete", path: ["guest_id"] })

type FormInput = z.input<typeof schema>
type FormValues = z.output<typeof schema>

export function BookingFormDialog({
  propertyId,
  open,
  onOpenChange,
  currency = "",
}: {
  propertyId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  currency?: string
}) {
  const { currentOrg } = useCurrentOrg()
  const { data: unitTypes } = useUnitTypes(propertyId)
  const createBooking = useCreateBooking()

  const [guestId, setGuestId] = useState<string | null>(null)
  const [roomMode, setRoomMode] = useState<"auto" | "manual">("auto")
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)
  const [adults, setAdults] = useState(1)
  const [children, setChildren] = useState(0)
  const [override, setOverride] = useState(false)
  // cod promo introdus vs cod „aplicat" (trimis la quote doar la apăsarea Aplică)
  const [promoInput, setPromoInput] = useState("")
  const [promoCode, setPromoCode] = useState("")

  const canOverride = ["owner", "manager"].includes(currentOrg.role)

  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { status: "confirmed" },
  })

  const unitTypeId = form.watch("unit_type_id")
  const checkIn = form.watch("check_in")
  const checkOut = form.watch("check_out")
  const datesValid = checkIn && checkOut && checkOut > checkIn

  const { data: availableUnits, isLoading: loadingUnits } = useAvailableUnits(
    roomMode === "manual" && datesValid ? unitTypeId : undefined,
    checkIn ?? "",
    checkOut ?? ""
  )

  const activeTypes = (unitTypes ?? []).filter((ut) => ut.is_active)
  const selectedType = activeTypes.find((ut) => ut.id === unitTypeId)
  const maxAdults = selectedType?.max_adults ?? MAX_OCCUPANCY_UNBOUNDED
  const maxChildren = selectedType?.max_children ?? MAX_OCCUPANCY_UNBOUNDED

  // estimare preț server-side (același motor ca la creare — sursă unică de adevăr);
  // include reducerea promoției (cod aplicat sau cea mai bună automată)
  const { data: quote } = useQuotePrice(
    datesValid ? unitTypeId : undefined, checkIn ?? "", checkOut ?? "", promoCode
  )
  // cod introdus dar care nu corespunde unei promoții eligibile (greșit/neeligibil) —
  // chiar dacă o promoție automată mai bună s-a aplicat (best-of), semnalăm codul
  const promoRejected = !!promoCode && !!quote?.promotion && !quote.promotion.code_matched

  // constrângeri de durată (min/max stay) rezolvate pe data de check-in
  const { data: stay } = useStayConstraints(unitTypeId || undefined, checkIn ?? "")
  const minStay = stay?.min_stay ?? 1
  const maxStay = stay?.max_stay ?? 30
  // shortcut-uri de nopți limitate la intervalul permis
  const nightShortcuts = NIGHT_SHORTCUTS.filter((n) => n >= minStay && n <= maxStay)

  // validare unificată (occupancy + stay + restricții + availability + promoție),
  // clasificată server-side după Manager Override. errors[] = blocante; soft forțat = warnings.
  const { data: validation } = useValidateBooking({
    unitTypeId: datesValid ? unitTypeId : undefined,
    checkIn: checkIn ?? "", checkOut: checkOut ?? "",
    adults, children,
    unitId: roomMode === "manual" ? selectedUnitId : null,
    promoCode: promoCode || null,
    override: override && canOverride,
  })
  const errors = (unitTypeId ? validation?.errors : undefined) ?? []
  const softWarnings = ((unitTypeId ? validation?.warnings : undefined) ?? []).filter(isSoftCode)
  const overridable = canOverride && [...errors, ...softWarnings].some(isSoftCode)
  const blockedByRules = errors.length > 0

  // la schimbarea tipului, restrânge ocuparea la limitele lui
  function selectType(v: string) {
    form.setValue("unit_type_id", v)
    setSelectedUnitId(null)
    const next = activeTypes.find((ut) => ut.id === v)
    if (next) {
      setAdults((a) => Math.min(Math.max(1, a), next.max_adults))
      setChildren((c) => Math.min(c, next.max_children))
    }
  }

  function resetForm() {
    form.reset({ status: "confirmed", guest_id: undefined })
    setGuestId(null)
    setRoomMode("auto")
    setSelectedUnitId(null)
    setAdults(1)
    setChildren(0)
    setOverride(false)
    setPromoInput("")
    setPromoCode("")
  }

  function handleGuestChange(id: string) {
    setGuestId(id)
    form.setValue("guest_id", id, { shouldValidate: true })
  }

  function handleCheckInChange(value: string) {
    form.setValue("check_in", value)
    setSelectedUnitId(null)
    if (checkOut && checkOut <= value) {
      form.setValue("check_out", "", { shouldValidate: false })
    }
  }

  async function onSubmit(values: FormValues) {
    try {
      await createBooking.mutateAsync({
        unitTypeId: values.unit_type_id,
        checkIn: values.check_in,
        checkOut: values.check_out,
        guestId: values.guest_id,
        unitId: roomMode === "manual" && selectedUnitId ? selectedUnitId : undefined,
        adults,
        children,
        status: values.status,
        notes: values.notes,
        override: override && canOverride,
        promoCode: promoCode || undefined,
      })
      toast.success(t("bookings.created"))
      onOpenChange(false)
      resetForm()
    } catch (e) {
      const message = errorMessage(e)
      if (message.includes("PROMO_INVALID")) toast.error(t("bookings.promo_invalid"))
      else if (message.includes("PROMO_LIMIT_REACHED")) toast.error(t("bookings.promo_limit"))
      else if (message.includes("OVERRIDE_FORBIDDEN")) toast.error(t("bookings.override_forbidden"))
      else if (message.includes("STAY_TOO_SHORT")) toast.error(t("bookings.stay_too_short"))
      else if (message.includes("STAY_TOO_LONG")) toast.error(t("bookings.stay_too_long"))
      else if (message.includes("DATES_CLOSED")) toast.error(t("bookings.dates_closed"))
      else if (message.includes("NO_ARRIVAL")) toast.error(t("bookings.no_arrival"))
      else if (message.includes("NO_DEPARTURE")) toast.error(t("bookings.no_departure"))
      else if (message.includes("UNIT_NOT_AVAILABLE")) toast.error(t("bookings.not_available"))
      else if (message.includes("UNIT_BLOCKED")) toast.error(t("bookings.unit_blocked"))
      else toast.error(t("common.error"))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetForm() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("bookings.add")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

          {/* Tip cameră */}
          <div className="space-y-2">
            <Label>{t("bookings.unit_type")}</Label>
            <Select onValueChange={selectType}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {activeTypes.map((ut) => (
                  <SelectItem key={ut.id} value={ut.id}>
                    <span>{ut.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {Number(ut.base_price).toFixed(2)} {currency}{t("bookings.per_night")}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {unitTypeId && minStay > 1 && (
              <p className="text-xs text-muted-foreground">
                {t("bookings.min_stay_hint")}{" "}
                <span className="font-semibold text-primary">{minStay} {t("bookings.nights")}</span>
              </p>
            )}
          </div>

          {/* Date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("bookings.check_in")}</Label>
              <Input
                type="date"
                {...form.register("check_in")}
                onChange={(e) => handleCheckInChange(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("bookings.check_out")}</Label>
              <Input
                type="date"
                {...form.register("check_out")}
                disabled={!checkIn}
                min={checkIn ? addDays(checkIn, minStay) : undefined}
                max={checkIn ? addDays(checkIn, maxStay) : undefined}
                onChange={(e) => { form.setValue("check_out", e.target.value, { shouldValidate: true }); setSelectedUnitId(null) }}
              />
              {checkIn && (
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-xs text-muted-foreground mr-1">
                    {t("bookings.checkout_from")} {formatDateShort(checkIn)}:
                  </span>
                  {nightShortcuts.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        form.setValue("check_out", addDays(checkIn, n), { shouldValidate: true })
                        setSelectedUnitId(null)
                      }}
                      className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    >
                      {n}n
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {form.formState.errors.check_out && (
            <p className="text-sm text-destructive">{form.formState.errors.check_out.message}</p>
          )}

          {/* Alocare cameră AUTO / MANUAL */}
          {unitTypeId && datesValid && (
            <div className="space-y-2 rounded-md border p-3">
              <Label>{t("bookings.room_selection")}</Label>
              <div className="flex gap-2">
                <Button
                  type="button" size="sm"
                  variant={roomMode === "auto" ? "default" : "outline"}
                  onClick={() => { setRoomMode("auto"); setSelectedUnitId(null) }}
                  className="flex-1"
                >
                  <Bot className="h-3.5 w-3.5" />{t("bookings.auto_assign")}
                </Button>
                <Button
                  type="button" size="sm"
                  variant={roomMode === "manual" ? "default" : "outline"}
                  onClick={() => setRoomMode("manual")}
                  className="flex-1"
                >
                  <User className="h-3.5 w-3.5" />{t("bookings.manual_select")}
                </Button>
              </div>

              {roomMode === "manual" && (
                <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                  {loadingUnits ? (
                    <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
                  ) : (availableUnits ?? []).map((u) => (
                    <button
                      type="button"
                      key={u.unit_id}
                      disabled={!u.is_free}
                      onClick={() => setSelectedUnitId(u.unit_id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded border px-3 py-1.5 text-sm transition-colors",
                        u.is_free
                          ? selectedUnitId === u.unit_id
                            ? "border-primary bg-primary/10"
                            : "hover:bg-accent"
                          : "opacity-40 cursor-not-allowed"
                      )}
                    >
                      <span>{u.name}</span>
                      <div className="flex items-center gap-2">
                        {selectedType && u.is_free && (
                          <span className="text-xs text-muted-foreground">
                            {Number(selectedType.base_price).toFixed(2)} {currency}{t("bookings.per_night")}
                          </span>
                        )}
                        <Badge variant={u.is_free ? "outline" : "secondary"} className="text-xs">
                          {u.is_free ? t("bookings.unit_free") : t("bookings.unit_occupied")}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Status */}
          <div className="space-y-2">
            <Label>{t("bookings.status")}</Label>
            <Select defaultValue="confirmed" onValueChange={(v) => form.setValue("status", v as FormValues["status"])}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="confirmed">{t("status.confirmed")}</SelectItem>
                <SelectItem value="pending">{t("status.pending")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Ocupare: adulți (min 1) + copii (min 0) */}
          <div className="grid grid-cols-2 gap-4">
            <OccupancyStepper
              label={t("occupancy.adults")} value={adults} onChange={setAdults}
              min={1} max={maxAdults}
            />
            <OccupancyStepper
              label={t("occupancy.children")} value={children} onChange={setChildren}
              min={0} max={maxChildren}
            />
          </div>

          {/* Oaspete */}
          <div className="space-y-2">
            <Label>{t("bookings.guest")}</Label>
            <GuestCombobox
              orgId={currentOrg.id}
              value={guestId}
              onChange={handleGuestChange}
            />
            {form.formState.errors.guest_id && (
              <p className="text-sm text-destructive">{form.formState.errors.guest_id.message}</p>
            )}
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label>{t("bookings.notes")}</Label>
            <Textarea rows={2} {...form.register("notes")} />
          </div>

          {/* Cod promoțional (opțional) — aplicat la quote la apăsarea Aplică */}
          {datesValid && unitTypeId && (
            <div className="space-y-1.5">
              <Label>{t("bookings.promo_code")}</Label>
              <div className="flex gap-2">
                <Input
                  value={promoInput}
                  placeholder={t("promotions.code_placeholder")}
                  onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setPromoCode(promoInput.trim()) } }}
                />
                <Button type="button" variant="outline" onClick={() => setPromoCode(promoInput.trim())}>
                  {t("bookings.promo_apply")}
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
              ) : promoCode && quote?.promotion?.code_matched ? (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  {t("bookings.promo_applied")}: {promoCode}
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">{t("bookings.promo_bestof")}</p>
            </div>
          )}

          {/* Estimare preț: breakdown per noapte + reducere promoție + total final */}
          {quote && quote.nights.length > 0 && (
            <div className="space-y-1.5">
              <Label>{t("bookings.price_estimate")}</Label>
              <PriceBreakdown quote={quote} />
            </div>
          )}

          {/* validare unificată: blocante (errors) + soft forțate prin override (warnings) */}
          {datesValid && (errors.length > 0 || softWarnings.length > 0) && (
            <div className="space-y-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm">
              <div className="flex items-center gap-2 font-medium text-destructive">
                <Ban className="h-4 w-4 shrink-0" />
                {t("bookings.restrictions_title")}
              </div>
              <ul className="ml-6 list-disc space-y-0.5 text-destructive">
                {errors.map((c) => (
                  <li key={c}>{VALIDATION_LABEL[c] ? t(VALIDATION_LABEL[c]!) : c}</li>
                ))}
              </ul>
              {softWarnings.length > 0 && (
                <ul className="ml-6 list-disc space-y-0.5 text-muted-foreground line-through">
                  {softWarnings.map((c) => (
                    <li key={c}>{VALIDATION_LABEL[c] ? t(VALIDATION_LABEL[c]!) : c}</li>
                  ))}
                </ul>
              )}
              {overridable && (
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
          <Button
            type="submit" className="w-full"
            disabled={form.formState.isSubmitting || blockedByRules}
          >
            {t("common.save")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
