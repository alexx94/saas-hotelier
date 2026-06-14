import { Minus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

// Stepper +/- reutilizabil pentru ocupare (adulți/copii). Min/max impuse de apelant:
// adulți min 1, copii min 0; maximul = regulile tipului selectat sau o limită de bun
// simț când nu e ales niciun tip.
export function OccupancyStepper({
  label,
  value,
  onChange,
  min,
  max,
  className,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  className?: string
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  return (
    <div className={cn("space-y-2", className)}>
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Button
          type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0"
          disabled={value <= min}
          onClick={() => onChange(clamp(value - 1))}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <span className="w-8 text-center text-sm font-medium tabular-nums">{value}</span>
        <Button
          type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0"
          disabled={value >= max}
          onClick={() => onChange(clamp(value + 1))}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
