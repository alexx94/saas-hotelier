import { createElement } from "react"
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react"
import type { ServiceItem } from "./api"
import { DEFAULT_SERVICE_ICON, SERVICE_ICON_MAP, SERVICE_ICONS } from "./service-icons"
import { t } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

function ServiceIconPreview({ iconKey }: { iconKey: string }) {
  return createElement(SERVICE_ICON_MAP.get(iconKey) ?? DEFAULT_SERVICE_ICON, {
    className: "h-4 w-4 shrink-0",
  })
}

export function ServicesEditor({
  items,
  onChange,
}: {
  items: ServiceItem[]
  onChange: (items: ServiceItem[]) => void
}) {
  function updateItem(index: number, patch: Partial<ServiceItem>) {
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)))
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index))
  }

  function moveItem(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= items.length) return
    const next = [...items]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  function addItem() {
    onChange([...items, { icon: "wifi", title: "", description: "" }])
  }

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("site_builder.content.services.empty")}</p>
      )}
      {items.map((item, index) => (
        <div key={index} className="space-y-2 rounded-md border p-3">
          <div className="flex items-start gap-2">
            <div className="w-40 shrink-0 space-y-1">
              <Label className="text-xs">{t("site_builder.content.services.icon_label")}</Label>
              <Select value={item.icon} onValueChange={(v) => updateItem(index, { icon: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_ICONS.map(({ key, labelKey }) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <ServiceIconPreview iconKey={key} />
                        {t(labelKey)}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs">{t("site_builder.content.services.title_label")}</Label>
              <Input
                value={item.title}
                onChange={(e) => updateItem(index, { title: e.target.value })}
              />
            </div>
            <div className="flex shrink-0 items-center gap-1 pt-5">
              <Button
                type="button" variant="ghost" size="icon" className="h-8 w-8"
                disabled={index === 0}
                title={t("site_builder.content.services.move_up")}
                onClick={() => moveItem(index, -1)}
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                type="button" variant="ghost" size="icon" className="h-8 w-8"
                disabled={index === items.length - 1}
                title={t("site_builder.content.services.move_down")}
                onClick={() => moveItem(index, 1)}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
              <Button
                type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                title={t("site_builder.content.services.remove")}
                onClick={() => removeItem(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("site_builder.content.services.description_label")}</Label>
            <Input
              value={item.description}
              onChange={(e) => updateItem(index, { description: e.target.value })}
            />
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addItem}>
        <Plus className="h-4 w-4" />
        {t("site_builder.content.services.add")}
      </Button>
    </div>
  )
}
