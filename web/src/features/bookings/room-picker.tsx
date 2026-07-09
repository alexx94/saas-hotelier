import { Bot, User } from "lucide-react"
import { useAvailableUnits } from "./hooks"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

// Cele două bucăți ale alocării camerei (tip + auto/manual), extrase din formularul
// complet de azi ca să fie partajate între fluxul „+ Adaugă" (tip ales de user) și
// fluxul quick-create (cameră deja aleasă pe calendar, „schimbă camera" le redeschide).

export type UnitTypeLite = {
  id: string
  name: string
  base_price: number
  max_adults: number
  max_children: number
  is_active: boolean
}

// Selectorul de tip. Când proprietatea are un singur tip activ, pasul e ascuns —
// apelantul rezolvă deja `unitTypeId` automat, aici doar decidem dacă mai are sens
// să arătăm un selector cu o singură opțiune.
export function UnitTypeSelect({
  activeTypes,
  currency,
  unitTypeId,
  onSelectType,
  error,
}: {
  activeTypes: UnitTypeLite[]
  currency: string
  unitTypeId: string | undefined
  onSelectType: (id: string) => void
  error?: string
}) {
  if (activeTypes.length <= 1) return null
  return (
    <div className="space-y-2">
      <Label>{t("bookings.unit_type")}</Label>
      <Select value={unitTypeId || undefined} onValueChange={onSelectType}>
        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          {activeTypes.map((ut) => (
            <SelectItem key={ut.id} value={ut.id}>
              <span>{ut.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {Number(ut.base_price).toFixed(2)} {currency}{t("bookings.per_night")}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

// Alocarea camerei: auto (motorul alege) sau manual (listă camere libere/ocupate).
export function RoomAllocation({
  unitTypeId,
  checkIn,
  checkOut,
  currency,
  selectedType,
  roomMode,
  onRoomModeChange,
  selectedUnitId,
  onSelectUnit,
}: {
  unitTypeId: string | undefined
  checkIn: string
  checkOut: string
  currency: string
  selectedType: UnitTypeLite | undefined
  roomMode: "auto" | "manual"
  onRoomModeChange: (m: "auto" | "manual") => void
  selectedUnitId: string | null
  onSelectUnit: (id: string) => void
}) {
  const datesValid = !!checkIn && !!checkOut && checkOut > checkIn
  const { data: availableUnits, isLoading: loadingUnits } = useAvailableUnits(
    roomMode === "manual" && datesValid ? unitTypeId : undefined,
    checkIn,
    checkOut
  )

  if (!unitTypeId || !datesValid) return null

  return (
    <div className="space-y-2 rounded-md border p-3">
      <Label>{t("bookings.room_selection")}</Label>
      <div className="flex gap-2">
        <Button
          type="button" size="sm"
          variant={roomMode === "auto" ? "default" : "outline"}
          onClick={() => onRoomModeChange("auto")}
          className="flex-1"
        >
          <Bot className="h-3.5 w-3.5" />{t("bookings.auto_assign")}
        </Button>
        <Button
          type="button" size="sm"
          variant={roomMode === "manual" ? "default" : "outline"}
          onClick={() => onRoomModeChange("manual")}
          className="flex-1"
        >
          <User className="h-3.5 w-3.5" />{t("bookings.manual_select")}
        </Button>
      </div>

      {roomMode === "manual" && (
        <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
          {loadingUnits ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (availableUnits ?? []).map((u) => (
            <button
              type="button"
              key={u.unit_id}
              disabled={!u.is_free}
              onClick={() => onSelectUnit(u.unit_id)}
              className={cn(
                "flex w-full items-center justify-between rounded border px-3 py-1.5 text-sm transition-colors",
                u.is_free
                  ? selectedUnitId === u.unit_id
                    ? "border-primary bg-primary/10"
                    : "hover:bg-accent"
                  : "opacity-40 cursor-not-allowed"
              )}
            >
              <span>{u.name}</span>
              <div className="flex items-center gap-2">
                {selectedType && u.is_free && (
                  <span className="text-xs text-muted-foreground">
                    {Number(selectedType.base_price).toFixed(2)} {currency}{t("bookings.per_night")}
                  </span>
                )}
                <Badge variant={u.is_free ? "outline" : "secondary"} className="text-xs">
                  {u.is_free ? t("bookings.unit_free") : t("bookings.unit_occupied")}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
