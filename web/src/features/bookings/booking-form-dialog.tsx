import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { useCurrentOrg } from "@/features/organizations/context"
import { GuestQuickField, type GuestSelection } from "@/features/guests/guest-quick-field"
import { resolveGuestId } from "@/features/guests/resolve-guest"
import { useFindOrCreateGuest } from "@/features/guests/hooks"
import { useUnitTypes } from "@/features/unit-types/hooks"
import { OccupancyStepper } from "@/features/pricing/occupancy-stepper"
import { applyPriceOverridePreview, type PriceOverride } from "@/features/pricing/price-override"
import { useQuotePrice } from "@/features/pricing/hooks"
import { usePermissions } from "@/features/auth/permissions"
import { useStayConstraints, useValidateBooking } from "@/features/reservation-rules/hooks"
import { isSoftCode } from "@/features/reservation-rules/api"
import { type BookingChannel } from "./api"
import { useCreateBooking, useUnits } from "./hooks"
import { toastBookingError } from "./booking-errors"
import { UnitTypeSelect, RoomAllocation } from "./room-picker"
import { CompactRoomHeader, DatesFields } from "./booking-date-fields"
import { BookingPriceField } from "./booking-price-field"
import { BookingMoreDetails } from "./booking-more-details"
import { BookingValidationPanel } from "./booking-validation-panel"
import { addDays, diffDays } from "./date-utils"
import { t } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

const NIGHT_SHORTCUTS = [1, 2, 3, 5, 7]
// limită de bun simț pentru ocupare când nu e ales încă un tip de cameră
const MAX_OCCUPANCY_UNBOUNDED = 25

// Preselectare la deschidere din calendar (selecție cameră + interval pe grilă) — dacă
// toate cele patru câmpuri sunt prezente, formularul pornește în modul compact
// (vezi `locked` în BookingFormInner). Contract public, NU se extinde (oaspete/preț/
// etc. se completează o singură dată, în același formular — nu mai există escaladare
// spre un al doilea dialog).
export type BookingFormInitial = {
  unitTypeId?: string
  unitId?: string
  checkIn?: string
  checkOut?: string
}

export function BookingFormDialog({
  propertyId,
  open,
  onOpenChange,
  currency = "",
  initial,
}: {
  propertyId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  currency?: string
  initial?: BookingFormInitial
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("bookings.add")}</DialogTitle>
        </DialogHeader>
        {/* montat DOAR când open, ca lazy initializers (useState) să prindă `initial`
            proaspăt la fiecare deschidere — vezi HANDOFF „Capcane" */}
        {open && (
          <BookingFormInner
            propertyId={propertyId}
            currency={currency}
            initial={initial}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function BookingFormInner({
  propertyId,
  currency,
  initial,
  onOpenChange,
}: {
  propertyId: string
  currency: string
  initial?: BookingFormInitial
  onOpenChange: (open: boolean) => void
}) {
  const { currentOrg } = useCurrentOrg()
  const { data: unitTypes } = useUnitTypes(propertyId)
  const { data: units } = useUnits(propertyId)
  const createBooking = useCreateBooking()
  const findOrCreate = useFindOrCreateGuest(currentOrg.id)
  const { has } = usePermissions()
  const canOverride = ["owner", "manager"].includes(currentOrg.role)
  const canPriceOverride = has("booking.price_override")

  // cameră + interval deja alese pe calendar → pornim în modul compact
  const locked = !!(initial?.unitId && initial?.checkIn && initial?.checkOut)

  const [manualTypeId, setManualTypeId] = useState<string | null>(initial?.unitTypeId ?? null)
  const [roomMode, setRoomMode] = useState<"auto" | "manual">(initial?.unitId ? "manual" : "auto")
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(initial?.unitId ?? null)
  // în modul compact, „schimbă camera" dezvăluie tip+auto/manual (cod partajat cu
  // fluxul „+ Adaugă", nu duplicat) — o dată deschis, rămâne deschis
  const [roomPickerOpen, setRoomPickerOpen] = useState(false)

  const [checkIn, setCheckIn] = useState(initial?.checkIn ?? "")
  const [checkOut, setCheckOut] = useState(initial?.checkOut ?? "")

  const [guest, setGuest] = useState<GuestSelection | null>(null)
  const [adults, setAdults] = useState(1)
  const [children, setChildren] = useState(0)
  const [status, setStatus] = useState<"confirmed" | "pending">("confirmed")
  const [channel, setChannel] = useState<BookingChannel>("direct")
  const [notes, setNotes] = useState("")
  const [promoInput, setPromoInput] = useState("")
  const [promoCode, setPromoCode] = useState("")
  const [override, setOverride] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  // preț: implicit un total mare editabil (mod „simplu"); „editare avansată" comută
  // la PriceOverrideEditor (3 moduri). Ambele scriu în același `priceOverride` efectiv.
  const [priceMode, setPriceMode] = useState<"simple" | "advanced">("simple")
  const [manualTotal, setManualTotal] = useState<string | null>(null)
  const [advancedOverride, setAdvancedOverride] = useState<PriceOverride | null>(null)

  const activeTypes = (unitTypes ?? []).filter((ut) => ut.is_active)
  // auto-selectare tip unic — doar în fluxul „+ Adaugă" (fără cameră preselectată) și
  // doar dacă userul nu a ales deja manual; derivat curat din datele încărcate, fără
  // useEffect/ref (dacă query-ul nu s-a încărcat încă, activeTypes e gol și nu se
  // întâmplă nimic — se rezolvă singur la următorul render, fără condiție de cursă)
  const autoTypeId = !locked && !manualTypeId && activeTypes.length === 1 ? activeTypes[0].id : null
  const unitTypeId = manualTypeId ?? autoTypeId ?? undefined
  const selectedType = activeTypes.find((ut) => ut.id === unitTypeId)
  const maxAdults = selectedType?.max_adults ?? MAX_OCCUPANCY_UNBOUNDED
  const maxChildren = selectedType?.max_children ?? MAX_OCCUPANCY_UNBOUNDED

  const datesValid = !!checkIn && !!checkOut && checkOut > checkIn
  const nights = datesValid ? diffDays(checkIn, checkOut) : 0
  const showRoomPicker = !locked || roomPickerOpen
  const lockedUnitName = locked ? units?.find((u) => u.id === initial!.unitId)?.name : undefined

  const { data: quote } = useQuotePrice(
    datesValid ? unitTypeId : undefined, checkIn, checkOut, promoCode
  )
  const promoRejected = !!promoCode && !!quote?.promotion && !quote.promotion.code_matched

  const parsedManual = manualTotal !== null && manualTotal.trim() !== "" ? Number(manualTotal) : null
  const simpleOverride: PriceOverride | null =
    canPriceOverride && quote && parsedManual !== null && !Number.isNaN(parsedManual) && parsedManual !== quote.total
      ? { kind: "total", value: parsedManual }
      : null
  const priceOverride = canPriceOverride ? (priceMode === "advanced" ? advancedOverride : simpleOverride) : null
  const displayQuote = quote && priceOverride ? applyPriceOverridePreview(quote, priceOverride) : quote

  const { data: stay } = useStayConstraints(unitTypeId, checkIn)
  const minStay = stay?.min_stay ?? 1
  const maxStay = stay?.max_stay ?? 30
  const nightShortcuts = NIGHT_SHORTCUTS.filter((n) => n >= minStay && n <= maxStay)

  const { data: validation } = useValidateBooking({
    unitTypeId: datesValid ? unitTypeId : undefined,
    checkIn, checkOut,
    adults, children,
    unitId: roomMode === "manual" ? selectedUnitId : null,
    promoCode: promoCode || null,
    override: override && canOverride,
  })
  const errors = (unitTypeId ? validation?.errors : undefined) ?? []
  const softWarnings = ((unitTypeId ? validation?.warnings : undefined) ?? []).filter(isSoftCode)
  const overridable = canOverride && [...errors, ...softWarnings].some(isSoftCode)
  const blockedByRules = datesValid && errors.length > 0

  const saving = createBooking.isPending || findOrCreate.isPending

  function selectType(v: string) {
    setManualTypeId(v)
    setSelectedUnitId(null)
    const next = activeTypes.find((ut) => ut.id === v)
    if (next) {
      setAdults((a) => Math.min(Math.max(1, a), next.max_adults))
      setChildren((c) => Math.min(c, next.max_children))
    }
  }

  // compact: userul poate întinde rezervarea peste ce era selectat pe calendar —
  // check-out sare automat la +1 zi dacă devine invalid
  function handleCompactCheckIn(v: string) {
    setCheckIn(v)
    if (!checkOut || checkOut <= v) setCheckOut(addDays(v, 1))
  }

  // flux complet: check-out se golește la schimbarea check-in-ului (ca azi) — userul
  // reia din shortcut-uri/listă, nu presupunem o durată
  function handleFullCheckIn(v: string) {
    setCheckIn(v)
    setSelectedUnitId(null)
    if (checkOut && checkOut <= v) setCheckOut("")
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!guest || !datesValid || blockedByRules || !unitTypeId) return
    try {
      const guestId = await resolveGuestId(guest, findOrCreate)
      await createBooking.mutateAsync({
        unitTypeId,
        checkIn, checkOut,
        guestId,
        unitId: roomMode === "manual" && selectedUnitId ? selectedUnitId : undefined,
        adults, children,
        status,
        notes: notes.trim() || undefined,
        override: override && canOverride,
        promoCode: promoCode || undefined,
        priceOverride,
        channel,
      })
      toast.success(t("bookings.created"))
      onOpenChange(false)
    } catch (err) {
      toastBookingError(err)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {!showRoomPicker ? (
        <CompactRoomHeader
          unitName={lockedUnitName}
          checkIn={checkIn}
          checkOut={checkOut}
          nights={nights}
          minStay={minStay}
          onCheckInChange={handleCompactCheckIn}
          onCheckOutChange={setCheckOut}
          onChangeRoom={() => setRoomPickerOpen(true)}
        />
      ) : (
        <>
          <UnitTypeSelect
            activeTypes={activeTypes} currency={currency}
            unitTypeId={unitTypeId} onSelectType={selectType}
          />

          {!locked && (
            <DatesFields
              checkIn={checkIn} checkOut={checkOut}
              minStay={minStay} maxStay={maxStay}
              nightShortcuts={nightShortcuts}
              onCheckInChange={handleFullCheckIn}
              onCheckOutChange={(v) => { setCheckOut(v); setSelectedUnitId(null) }}
            />
          )}

          <RoomAllocation
            unitTypeId={unitTypeId} checkIn={checkIn} checkOut={checkOut} currency={currency}
            selectedType={selectedType}
            roomMode={roomMode}
            onRoomModeChange={(m) => { setRoomMode(m); if (m === "auto") setSelectedUnitId(null) }}
            selectedUnitId={selectedUnitId} onSelectUnit={setSelectedUnitId}
          />
        </>
      )}

      {/* Oaspete — devreme în formular (după date, înainte de ocupare), consistent
          în ambele moduri */}
      <div className="space-y-2">
        <Label>{t("bookings.guest")}</Label>
        <GuestQuickField orgId={currentOrg.id} value={guest} onChange={setGuest} />
      </div>

      {/* Ocupare */}
      <div className="grid grid-cols-2 gap-4">
        <OccupancyStepper
          label={t("occupancy.adults")} value={adults} onChange={setAdults} min={1} max={maxAdults}
        />
        <OccupancyStepper
          label={t("occupancy.children")} value={children} onChange={setChildren} min={0} max={maxChildren}
        />
      </div>

      {/* Preț — vizibil direct, nu în spatele „Mai multe detalii" */}
      <BookingPriceField
        quote={quote} displayQuote={displayQuote} currency={currency}
        canOverride={canPriceOverride}
        mode={priceMode} onModeChange={setPriceMode}
        manualTotal={manualTotal} onManualTotalChange={setManualTotal}
        hasSimpleOverride={!!simpleOverride}
        advancedOverride={advancedOverride} onAdvancedOverrideChange={setAdvancedOverride}
      />

      {/* Status */}
      <div className="space-y-1.5">
        <Label>{t("bookings.status")}</Label>
        <div className="flex gap-2">
          <Button
            type="button" size="sm" className="flex-1"
            variant={status === "confirmed" ? "default" : "outline"}
            onClick={() => setStatus("confirmed")}
          >
            {t("status.confirmed")}
          </Button>
          <Button
            type="button" size="sm" className="flex-1"
            variant={status === "pending" ? "default" : "outline"}
            onClick={() => setStatus("pending")}
          >
            {t("status.pending")}
          </Button>
        </div>
      </div>

      <BookingMoreDetails
        open={moreOpen} onOpenChange={setMoreOpen}
        channel={channel} onChannelChange={setChannel}
        notes={notes} onNotesChange={setNotes}
        showPromo={datesValid && !!unitTypeId}
        promoInput={promoInput} onPromoInputChange={setPromoInput}
        promoCode={promoCode}
        onPromoApply={() => setPromoCode(promoInput.trim())}
        onPromoClear={() => { setPromoInput(""); setPromoCode("") }}
        promoRejected={promoRejected}
        promotion={quote?.promotion}
      />

      {/* validare unificată — mereu vizibilă, nu ascunsă sub „Mai multe detalii" */}
      <BookingValidationPanel
        errors={datesValid ? errors : []}
        softWarnings={datesValid ? softWarnings : []}
        overridable={overridable}
        override={override}
        onOverrideChange={setOverride}
      />

      <Button
        type="submit" className="w-full"
        disabled={!guest || !datesValid || blockedByRules || !unitTypeId || saving}
      >
        {t("common.save")}
      </Button>
    </form>
  )
}
