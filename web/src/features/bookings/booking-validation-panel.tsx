import { Ban, ShieldAlert } from "lucide-react"
import { VALIDATION_LABEL, type ValidationCode } from "@/features/reservation-rules/api"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"

// Panoul de validare — erori blocante + warnings soft forțate prin override + toggle
// Manager Override. Rămâne mereu vizibil (nu se ascunde sub „Mai multe detalii"),
// portat neschimbat din formularul complet.
export function BookingValidationPanel({
  errors,
  softWarnings,
  overridable,
  override,
  onOverrideChange,
}: {
  errors: ValidationCode[]
  softWarnings: ValidationCode[]
  overridable: boolean
  override: boolean
  onOverrideChange: (v: boolean) => void
}) {
  if (errors.length === 0 && softWarnings.length === 0) return null
  return (
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
          onClick={() => onOverrideChange(!override)}
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
  )
}
