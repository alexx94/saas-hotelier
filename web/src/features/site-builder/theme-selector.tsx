import { Check } from "lucide-react"
import { composeSiteTheme, resolveSiteTheme, SITE_TEMPLATES } from "@/features/site/themes"
import { palettesForTemplate, SITE_PALETTE_META, SITE_TEMPLATE_META, SITE_TEMPLATE_ORDER } from "./themes"
import { t } from "@/lib/i18n"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

// Selector în două trepte: template (structură/layout) + paletă (culori) a
// template-ului ales. `value`/`onChange` rămân stringul brut compus
// persistat în DB (`property_sites.theme`) — parsarea/compunerea vin din
// sursa unică `features/site/themes.ts`, nu se duplică aici.
export function ThemeSelector({
  value,
  onChange,
}: {
  value: string
  onChange: (theme: string) => void
}) {
  const { template, palette } = resolveSiteTheme(value)
  const palettes = palettesForTemplate(template)

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SITE_TEMPLATE_ORDER.map((key) => {
          const meta = SITE_TEMPLATE_META[key]
          const defaultPalette = SITE_PALETTE_META[key][SITE_TEMPLATES[key].defaultPalette]
          const selected = key === template

          return (
            <Card
              key={key}
              role="button"
              tabIndex={0}
              onClick={() => onChange(composeSiteTheme(key, SITE_TEMPLATES[key].defaultPalette))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  onChange(composeSiteTheme(key, SITE_TEMPLATES[key].defaultPalette))
                }
              }}
              className={cn(
                "cursor-pointer transition-colors hover:border-primary/50",
                selected && "border-primary ring-1 ring-primary"
              )}
            >
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex gap-1.5">
                    {defaultPalette.swatch.map((color, i) => (
                      <span
                        key={`${color}-${i}`}
                        className="h-6 w-6 rounded-full border"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  {selected && <Check className="h-4 w-4 text-primary" />}
                </div>
                <div>
                  <p className="font-medium">{t(meta.nameKey)}</p>
                  <p className="text-sm text-muted-foreground">{t(meta.descriptionKey)}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">{t("site_builder.theme.palette_label")}</p>
        <div className="flex flex-wrap gap-3">
          {palettes.map((meta) => {
            const selected = meta.key === palette
            return (
              <button
                key={meta.key}
                type="button"
                onClick={() => onChange(composeSiteTheme(template, meta.key))}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors hover:border-primary/50",
                  selected && "border-primary ring-1 ring-primary"
                )}
              >
                <span className="flex -space-x-1">
                  {meta.swatch.map((color, i) => (
                    <span
                      key={`${color}-${i}`}
                      className="h-4 w-4 rounded-full border border-background"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </span>
                {t(meta.nameKey)}
                {selected && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
