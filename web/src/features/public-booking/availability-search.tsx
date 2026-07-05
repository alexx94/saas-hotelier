import { CalendarDays } from "lucide-react"
import { OccupancyStepper } from "@/features/pricing/occupancy-stepper"
import { t } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const MAX_OCCUPANCY_UNBOUNDED = 25

// Bara de căutare disponibilitate (date + ocupare + buton) — reutilizată de
// pagina publică de booking (/p/{slug}) și de vitrina site-ului (/s/.../book).
// Fără fetch propriu: primește starea și callback-urile de la părinte.
export function AvailabilitySearch({
  checkIn,
  checkOut,
  adults,
  children,
  onCheckInChange,
  onCheckOutChange,
  onAdultsChange,
  onChildrenChange,
  onSearch,
  className,
}: {
  checkIn: string
  checkOut: string
  adults: number
  children: number
  onCheckInChange: (v: string) => void
  onCheckOutChange: (v: string) => void
  onAdultsChange: (v: number) => void
  onChildrenChange: (v: number) => void
  onSearch: () => void
  className?: string
}) {
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className={className}>
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label htmlFor="pin">{t("bookings.check_in")}</Label>
          <Input
            id="pin" type="date" min={today} value={checkIn}
            onChange={(e) => onCheckInChange(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pout">{t("bookings.check_out")}</Label>
          <Input
            id="pout" type="date" min={checkIn} value={checkOut}
            onChange={(e) => onCheckOutChange(e.target.value)}
          />
        </div>
        <OccupancyStepper
          label={t("occupancy.adults")} value={adults} onChange={onAdultsChange}
          min={1} max={MAX_OCCUPANCY_UNBOUNDED}
        />
        <OccupancyStepper
          label={t("occupancy.children")} value={children} onChange={onChildrenChange}
          min={0} max={MAX_OCCUPANCY_UNBOUNDED}
        />
        <Button
          onClick={onSearch}
          disabled={!checkIn || !checkOut || checkOut <= checkIn}
        >
          <CalendarDays className="h-4 w-4" />
          {t("public.check_availability")}
        </Button>
      </div>
    </div>
  )
}
