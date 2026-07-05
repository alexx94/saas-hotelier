import { Check } from "lucide-react"
import { SITE_THEMES } from "./themes"
import { t } from "@/lib/i18n"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function ThemeSelector({
  value,
  onChange,
}: {
  value: string
  onChange: (theme: string) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {SITE_THEMES.map((theme) => {
        const selected = theme.key === value
        return (
          <Card
            key={theme.key}
            role="button"
            tabIndex={0}
            onClick={() => onChange(theme.key)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onChange(theme.key) }}
            className={cn(
              "cursor-pointer transition-colors hover:border-primary/50",
              selected && "border-primary ring-1 ring-primary"
            )}
          >
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <div className="flex gap-1.5">
                  {theme.swatch.map((color) => (
                    <span
                      key={color}
                      className="h-6 w-6 rounded-full border"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                {selected && <Check className="h-4 w-4 text-primary" />}
              </div>
              <div>
                <p className="font-medium">{t(theme.nameKey)}</p>
                <p className="text-sm text-muted-foreground">{t(theme.descriptionKey)}</p>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
