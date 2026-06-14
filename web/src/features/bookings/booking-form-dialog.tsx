import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Bot, User } from "lucide-react"
import { useCurrentOrg } from "@/features/organizations/context"
import { GuestCombobox } from "@/features/guests/guest-combobox"
import { useUnitTypes } from "@/features/unit-types/hooks"
import { OccupancyStepper } from "@/features/pricing/occupancy-stepper"
import { PriceBreakdown } from "@/features/pricing/price-breakdown"
import { useQuotePrice } from "@/features/pricing/hooks"
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

  // estimare preț server-side (același motor ca la creare — sursă unică de adevăr)
  const { data: quote } = useQuotePrice(
    datesValid ? unitTypeId : undefined, checkIn ?? "", checkOut ?? ""
  )

  // alocare manuală fără nicio cameră liberă pe interval → nu are sens submit-ul
  const noFreeUnits =
    roomMode === "manual" && !!datesValid && !loadingUnits &&
    (availableUnits ?? []).every((u) => !u.is_free)

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
      })
      toast.success(t("bookings.created"))
      onOpenChange(false)
      resetForm()
    } catch (e) {
      const message = errorMessage(e)
      if (message.includes("UNIT_NOT_AVAILABLE")) toast.error(t("bookings.not_available"))
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
                min={checkIn ? addDays(checkIn, 1) : undefined}
                onChange={(e) => { form.setValue("check_out", e.target.value, { shouldValidate: true }); setSelectedUnitId(null) }}
              />
              {checkIn && (
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-xs text-muted-foreground mr-1">
                    {t("bookings.checkout_from")} {formatDateShort(checkIn)}:
                  </span>
                  {NIGHT_SHORTCUTS.map((n) => (
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

          {/* Estimare preț: breakdown per noapte din motor (override > sezon > base + weekend) */}
          {quote && quote.nights.length > 0 && (
            <div className="space-y-1.5">
              <Label>{t("bookings.price_estimate")}</Label>
              <PriceBreakdown quote={quote} />
            </div>
          )}

          {noFreeUnits && (
            <p className="text-sm text-destructive">{t("bookings.not_available")}</p>
          )}
          <Button
            type="submit" className="w-full"
            disabled={form.formState.isSubmitting || noFreeUnits}
          >
            {t("common.save")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
