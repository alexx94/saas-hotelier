import { useState } from "react"
import { format } from "date-fns"
import { toast } from "sonner"
import { History, LogIn, LogOut, Users2, CheckSquare, Square, X } from "lucide-react"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { UnitHistoryDialog } from "@/features/unit-types/unit-history-dialog"
import {
  CLEANING_STATUSES, CLEANING_STATUS_BADGE_CLASS, CLEANING_STATUS_LABEL,
} from "./cleaning-status"
import type { CleaningStatus, HousekeepingRoom } from "./api"
import {
  useBulkSetUnitCleaningStatus, useHousekeepingBoard, useSetUnitCleaningStatus,
} from "./hooks"

// Camera "necesită atenție": e murdară, SAU sosește azi un oaspete și camera
// nu a fost încă verificată (inspected) — prioritizare ca în Mews/Cloudbeds.
function needsAttention(room: HousekeepingRoom): boolean {
  return room.cleaning_status === "dirty" || (room.arrival_today && room.cleaning_status !== "inspected")
}

type Filter = "attention" | "all" | CleaningStatus

export function HousekeepingBoard({ propertyId }: { propertyId: string }) {
  const { data: rooms, isLoading } = useHousekeepingBoard(propertyId)
  const [filter, setFilter] = useState<Filter>("attention")
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [historyUnit, setHistoryUnit] = useState<{ id: string; name: string } | null>(null)

  function toggleSelected(unitId: string) {
    setSelected((prev) => (prev.includes(unitId) ? prev.filter((id) => id !== unitId) : [...prev, unitId]))
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelected([])
  }

  if (isLoading || !rooms) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-32 w-full" />)}
      </div>
    )
  }

  const counts = {
    attention: rooms.filter(needsAttention).length,
    all: rooms.length,
    dirty: rooms.filter((r) => r.cleaning_status === "dirty").length,
    inspected: rooms.filter((r) => r.cleaning_status === "inspected").length,
    clean: rooms.filter((r) => r.cleaning_status === "clean").length,
  }

  const visible = rooms.filter((r) => {
    if (filter === "attention") return needsAttention(r)
    if (filter === "all") return true
    return r.cleaning_status === filter
  })

  const visibleIds = visible.map((r) => r.unit_id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id))

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelected((prev) => prev.filter((id) => !visibleIds.includes(id)))
    } else {
      setSelected((prev) => Array.from(new Set([...prev, ...visibleIds])))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <FilterChip label={t("housekeeping.filter.attention")} count={counts.attention} active={filter === "attention"} onClick={() => setFilter("attention")} />
          <FilterChip label={t("housekeeping.filter.all")} count={counts.all} active={filter === "all"} onClick={() => setFilter("all")} />
          <FilterChip label={t(CLEANING_STATUS_LABEL.dirty)} count={counts.dirty} active={filter === "dirty"} onClick={() => setFilter("dirty")} />
          <FilterChip label={t(CLEANING_STATUS_LABEL.inspected)} count={counts.inspected} active={filter === "inspected"} onClick={() => setFilter("inspected")} />
          <FilterChip label={t(CLEANING_STATUS_LABEL.clean)} count={counts.clean} active={filter === "clean"} onClick={() => setFilter("clean")} />
        </div>
        <div className="flex items-center gap-2">
          {selectMode && (
            <Button type="button" size="sm" variant="outline" onClick={toggleSelectAll}>
              {allVisibleSelected ? t("housekeeping.deselect_all") : t("housekeeping.select_all")}
            </Button>
          )}
          <Button
            type="button" size="sm" variant={selectMode ? "secondary" : "outline"}
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
          >
            {selectMode ? t("housekeeping.select_cancel") : t("housekeeping.select_mode")}
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("housekeeping.empty")}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((room) => (
            <RoomCard
              key={room.unit_id}
              room={room}
              propertyId={propertyId}
              selectMode={selectMode}
              selected={selected.includes(room.unit_id)}
              onToggleSelected={() => toggleSelected(room.unit_id)}
              onShowHistory={() => setHistoryUnit({ id: room.unit_id, name: room.unit_name })}
            />
          ))}
        </div>
      )}

      {selectMode && selected.length > 0 && (
        <BulkBar propertyId={propertyId} selectedIds={selected} onDone={exitSelectMode} />
      )}

      <UnitHistoryDialog
        unitId={historyUnit?.id ?? null}
        unitName={historyUnit?.name}
        onClose={() => setHistoryUnit(null)}
      />
    </div>
  )
}

function FilterChip({
  label, count, active, onClick,
}: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <Button type="button" size="sm" variant={active ? "default" : "outline"} className="h-8" onClick={onClick}>
      {label}
      <span className={cn("ml-1 text-xs", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
        {count}
      </span>
    </Button>
  )
}

function RoomCard({
  room, propertyId, selectMode, selected, onToggleSelected, onShowHistory,
}: {
  room: HousekeepingRoom
  propertyId: string
  selectMode: boolean
  selected: boolean
  onToggleSelected: () => void
  onShowHistory: () => void
}) {
  const setStatus = useSetUnitCleaningStatus(propertyId)

  async function run(status: CleaningStatus) {
    try {
      await setStatus.mutateAsync({ unitId: room.unit_id, status })
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-4",
        selected && "border-primary ring-1 ring-primary"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          className="flex items-start gap-2 text-left"
          disabled={!selectMode}
          onClick={onToggleSelected}
        >
          {selectMode && (selected
            ? <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            : <Square className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />)}
          <span>
            <span className="block font-medium">{room.unit_name}</span>
            <span className="block text-xs text-muted-foreground">{room.unit_type_name}</span>
          </span>
        </button>
        <div className="flex items-center gap-1">
          <Badge variant="outline" className={CLEANING_STATUS_BADGE_CLASS[room.cleaning_status as CleaningStatus]}>
            {t(CLEANING_STATUS_LABEL[room.cleaning_status as CleaningStatus])}
          </Badge>
          <Button
            type="button" size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground"
            title={t("units.history")}
            onClick={onShowHistory}
          >
            <History className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {(room.occupied_today || room.arrival_today || room.departure_today) && (
        <div className="flex flex-wrap gap-1.5">
          {room.occupied_today && (
            <Badge variant="secondary" className="gap-1"><Users2 className="h-3 w-3" />{t("housekeeping.occupied")}</Badge>
          )}
          {room.arrival_today && (
            <Badge variant="secondary" className="gap-1"><LogIn className="h-3 w-3" />{t("housekeeping.arrival_today")}</Badge>
          )}
          {room.departure_today && (
            <Badge variant="secondary" className="gap-1"><LogOut className="h-3 w-3" />{t("housekeeping.departure_today")}</Badge>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-1.5">
        {CLEANING_STATUSES.map((s) => (
          <Button
            key={s}
            type="button"
            size="sm"
            variant={room.cleaning_status === s ? "default" : "outline"}
            disabled={setStatus.isPending || room.cleaning_status === s}
            className="h-10"
            onClick={() => run(s)}
          >
            {t(CLEANING_STATUS_LABEL[s])}
          </Button>
        ))}
      </div>

      <p className="text-right text-xs text-muted-foreground">
        {room.cleaning_status_by_name && <>{room.cleaning_status_by_name} · </>}
        {format(new Date(room.cleaning_status_at), "dd.MM HH:mm")}
      </p>
    </div>
  )
}

function BulkBar({
  propertyId, selectedIds, onDone,
}: { propertyId: string; selectedIds: string[]; onDone: () => void }) {
  const bulkSetStatus = useBulkSetUnitCleaningStatus(propertyId)

  async function run(status: CleaningStatus) {
    try {
      const updated = await bulkSetStatus.mutateAsync({ unitIds: selectedIds, status })
      toast.success(`${updated} ${t("housekeeping.bulk_updated_toast")}`)
      onDone()
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <div className="sticky bottom-4 flex flex-wrap items-center gap-2 rounded-lg border bg-background p-3 shadow-lg">
      <span className="text-sm text-muted-foreground">
        {selectedIds.length} {t("housekeeping.selected")}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {CLEANING_STATUSES.map((s) => (
          <Button
            key={s} type="button" size="sm" variant="outline"
            disabled={bulkSetStatus.isPending}
            onClick={() => run(s)}
          >
            {t(CLEANING_STATUS_LABEL[s])}
          </Button>
        ))}
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
