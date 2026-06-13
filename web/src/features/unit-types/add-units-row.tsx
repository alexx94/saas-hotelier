import { useState } from "react"
import { toast } from "sonner"
import { useGenerateUnits } from "./hooks"
import { parseRoomNumbering } from "./room-numbering"
import { t } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Props = {
  unitTypeId: string
  propertyId: string
  onDone: () => void
  onCancel: () => void
}

// Generare bulk de camere suplimentare la un tip existent.
// Numerotare: interval ("101-120") sau număr de camere + start opțional.
export function AddUnitsRow({ unitTypeId, propertyId, onDone, onCancel }: Props) {
  const generateUnits = useGenerateUnits(propertyId)
  const [spec, setSpec] = useState("1")
  const [startAt, setStartAt] = useState("")
  const [prefix, setPrefix] = useState("Camera ")

  const isRange = /-/.test(spec)
  const parsed = parseRoomNumbering(spec, startAt ? Number(startAt) : undefined)

  async function onSave() {
    if (!parsed) {
      toast.error(t("units.invalid_numbering"))
      return
    }
    try {
      const n = await generateUnits.mutateAsync({
        unitTypeId,
        count: parsed.count,
        prefix,
        startNumber: parsed.start,
      })
      toast.success(`${n} ${t("units.added_toast")}`)
      onDone()
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <div className="flex flex-col gap-2 py-1 pl-10 sm:flex-row sm:items-center">
      <Input
        value={spec}
        onChange={(e) => setSpec(e.target.value)}
        placeholder={t("units.numbering_placeholder")}
        title={t("units.numbering_hint")}
        className="h-7 w-32"
      />
      {!isRange && (
        <Input
          type="number" min={1}
          value={startAt}
          onChange={(e) => setStartAt(e.target.value)}
          placeholder={t("units.start_at")}
          className="h-7 w-28"
        />
      )}
      <Input
        value={prefix}
        onChange={(e) => setPrefix(e.target.value)}
        placeholder="Camera "
        className="h-7 w-32"
      />
      <div className="flex items-center gap-1">
        <Button
          type="button" size="sm" className="h-7"
          disabled={generateUnits.isPending}
          onClick={onSave}
        >
          {t("common.save")}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  )
}
