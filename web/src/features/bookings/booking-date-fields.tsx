import { addDays, formatDateShort } from "./date-utils"
import { t } from "@/lib/i18n"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"

// Header compact al modului „cameră deja aleasă" (quick-create din calendar): nume
// cameră + interval editabil direct, fără să treci prin pasul tip+auto/manual.
export function CompactRoomHeader({
  unitName, checkIn, checkOut, nights, minStay,
  onCheckInChange, onCheckOutChange, onChangeRoom,
}: {
  unitName: string | undefined
  checkIn: string
  checkOut: string
  nights: number
  minStay: number
  onCheckInChange: (v: string) => void
  onCheckOutChange: (v: string) => void
  onChangeRoom: () => void
}) {
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          {unitName ? (
            <p className="truncate font-medium">{unitName}</p>
          ) : (
            <Skeleton className="h-5 w-24" />
          )}
          {checkIn && checkOut && checkOut > checkIn && (
            <p className="text-xs text-muted-foreground">
              {formatDateShort(checkIn)} – {formatDateShort(checkOut)} · {nights} {t("bookings.nights")}
            </p>
          )}
        </div>
        <button
          type="button"
          className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:underline"
          onClick={onChangeRoom}
        >
          {t("bookings.change_room")}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">{t("bookings.check_in")}</Label>
          <Input type="date" className="h-8" value={checkIn} onChange={(e) => onCheckInChange(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("bookings.check_out")}</Label>
          <Input
            type="date" className="h-8"
            min={checkIn ? addDays(checkIn, 1) : undefined}
            value={checkOut}
            onChange={(e) => onCheckOutChange(e.target.value)}
          />
        </div>
      </div>
      {minStay > 1 && (
        <p className="text-xs text-muted-foreground">
          {t("bookings.min_stay_hint")}{" "}
          <span className="font-semibold text-primary">{minStay} {t("bookings.nights")}</span>
        </p>
      )}
    </div>
  )
}

// Bloc de date al fluxului complet („+ Adaugă", fără cameră preselectată) — NESCHIMBAT
// ca logică față de formularul de azi (shortcut-uri de nopți limitate de min/max stay).
export function DatesFields({
  checkIn, checkOut, minStay, maxStay, nightShortcuts,
  onCheckInChange, onCheckOutChange,
}: {
  checkIn: string
  checkOut: string
  minStay: number
  maxStay: number
  nightShortcuts: number[]
  onCheckInChange: (v: string) => void
  onCheckOutChange: (v: string) => void
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t("bookings.check_in")}</Label>
          <Input type="date" value={checkIn} onChange={(e) => onCheckInChange(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t("bookings.check_out")}</Label>
          <Input
            type="date"
            disabled={!checkIn}
            min={checkIn ? addDays(checkIn, minStay) : undefined}
            max={checkIn ? addDays(checkIn, maxStay) : undefined}
            value={checkOut}
            onChange={(e) => onCheckOutChange(e.target.value)}
          />
          {checkIn && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-xs text-muted-foreground mr-1">
                {t("bookings.checkout_from")} {formatDateShort(checkIn)}:
              </span>
              {nightShortcuts.map((n) => (
                <button
                  key={n} type="button"
                  onClick={() => onCheckOutChange(addDays(checkIn, n))}
                  className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  {n}n
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {checkIn && checkOut && checkOut <= checkIn && (
        <p className="text-sm text-destructive">{t("bookings.invalid_date_range")}</p>
      )}
      {minStay > 1 && (
        <p className="text-xs text-muted-foreground">
          {t("bookings.min_stay_hint")}{" "}
          <span className="font-semibold text-primary">{minStay} {t("bookings.nights")}</span>
        </p>
      )}
    </div>
  )
}
