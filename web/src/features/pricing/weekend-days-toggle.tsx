import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { t } from "@/lib/i18n"
import { WEEKDAY_ORDER, dayLabel } from "./weekend-pricing"

// Selector de zile de weekend (DOW Postgres). Afișat Luni→Duminică.
export function WeekendDaysToggle({
  value,
  onChange,
  disabled,
}: {
  value: number[]
  onChange: (days: number[]) => void
  disabled?: boolean
}) {
  function toggle(dow: number) {
    onChange(value.includes(dow) ? value.filter((d) => d !== dow) : [...value, dow].sort())
  }
  return (
    <div className="space-y-1.5">
      <Label>{t("unit_types.weekend_days")}</Label>
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAY_ORDER.map((dow) => (
          <Button
            key={dow}
            type="button" size="sm" variant={value.includes(dow) ? "default" : "outline"}
            disabled={disabled}
            className="h-8 w-10 px-0"
            onClick={() => toggle(dow)}
          >
            {dayLabel(dow)}
          </Button>
        ))}
      </div>
    </div>
  )
}
