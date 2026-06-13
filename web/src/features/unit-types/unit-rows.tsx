import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { CalendarOff, ChevronDown, History, Pencil, Plus, Trash2 } from "lucide-react"
import {
  useDeleteUnit, useSetUnitStatus, useUnitsForType, useUpdateUnit,
} from "./hooks"
import type { Unit, UnitStatus } from "./api"
import {
  UNIT_STATUS_BADGE_CLASS, UNIT_STATUS_DOT_CLASS, UNIT_STATUS_LABEL, UNIT_STATUSES,
} from "./unit-status"
import { BulkActionsBar } from "./bulk-actions-bar"
import { AddUnitsRow } from "./add-units-row"
import { UnitHistoryDialog } from "./unit-history-dialog"
import { BlockDialog } from "./block-dialog"
import { t } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { TableCell, TableRow } from "@/components/ui/table"
import { ConfirmDialog } from "@/components/confirm-dialog"

const editUnitSchema = z.object({ name: z.string().min(1) })
type EditUnitValues = z.infer<typeof editUnitSchema>

// ─── un rând de cameră ───────────────────────────────────────────────────────

function UnitRow({
  unit, propertyId, currency, selected, onToggleSelect, onShowHistory, onShowBlocks,
}: {
  unit: Unit
  propertyId: string
  currency: string
  selected: boolean
  onToggleSelect: () => void
  onShowHistory: () => void
  onShowBlocks: () => void
}) {
  const setStatus = useSetUnitStatus(propertyId)
  const updateUnit = useUpdateUnit(propertyId)
  const deleteUnit = useDeleteUnit(propertyId)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const form = useForm<EditUnitValues>({
    resolver: zodResolver(editUnitSchema),
    defaultValues: { name: unit.name },
  })

  const unitStatus = (unit.status ?? "active") as UnitStatus

  return (
    <TableRow className={`bg-muted/30 text-sm ${unitStatus === "archived" ? "opacity-40" : ""}`}>
      <TableCell className="pl-10">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-primary"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={unit.name}
          />
          {editing ? (
            <form
              onSubmit={form.handleSubmit(async (v) => {
                await updateUnit.mutateAsync({ id: unit.id, patch: { name: v.name } })
                setEditing(false)
              })}
              className="flex items-center gap-2"
            >
              <Input className="h-7 w-36" {...form.register("name")} autoFocus />
              <Button type="submit" size="sm" className="h-7">{t("common.save")}</Button>
              <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setEditing(false)}>
                {t("common.cancel")}
              </Button>
            </form>
          ) : (
            <span>{unit.name}</span>
          )}
        </div>
      </TableCell>
      <TableCell colSpan={2} className="text-muted-foreground text-xs">
        cameră individuală · {currency}
      </TableCell>
      {/* Badge stare */}
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={`rounded border px-2 py-0.5 text-xs font-medium transition-colors ${UNIT_STATUS_BADGE_CLASS[unitStatus]}`}>
              {t(UNIT_STATUS_LABEL[unitStatus])}
              <ChevronDown className="ml-1 inline-block h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {UNIT_STATUSES.map((s) => (
              <DropdownMenuItem
                key={s}
                disabled={s === unitStatus}
                onClick={async () => {
                  const result = await setStatus.mutateAsync({ id: unit.id, status: s })
                  if (result === "has_future_bookings") {
                    toast.error(t("unit.has_future_bookings"))
                  } else if (s === "archived") {
                    toast.info(t("unit.archived_warning"))
                  }
                }}
              >
                <span className={`mr-2 inline-block h-2 w-2 rounded-full ${UNIT_STATUS_DOT_CLASS[s]}`} />
                {t(UNIT_STATUS_LABEL[s])}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          {unitStatus === "active" && (
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              title={t("units.block")}
              onClick={onShowBlocks}
            >
              <CalendarOff className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onShowHistory}>
            <History className="h-3.5 w-3.5" />
          </Button>
          {unitStatus !== "archived" && (
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => { setEditing(true); form.setValue("name", unit.name) }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
          <ConfirmDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            title={t("common.confirm_action")}
            description={`${t("common.confirm_delete")} (${unit.name})`}
            confirmLabel={t("common.delete")}
            destructive
            onConfirm={async () => {
              const result = await deleteUnit.mutateAsync(unit.id)
              if (result === "has_future_bookings") {
                toast.error(t("unit.has_future_bookings"))
              } else if (result === "deactivated") {
                toast.info(t("units.bulk_deactivated_toast"))
              }
            }}
          />
        </div>
      </TableCell>
    </TableRow>
  )
}

// ─── lista camerelor unui tip (selecție + bulk + istoric + adăugare) ─────────

export function UnitRows({
  unitTypeId, propertyId, currency,
}: {
  unitTypeId: string
  propertyId: string
  currency: string
}) {
  const { data: units, isLoading } = useUnitsForType(unitTypeId)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [historyUnit, setHistoryUnit] = useState<Unit | null>(null)
  const [blockTarget, setBlockTarget] = useState<
    | { kind: "single"; unitId: string; unitName: string }
    | { kind: "bulk"; unitIds: string[]; onDone: () => void }
    | null
  >(null)
  const [addMode, setAddMode] = useState(false)

  if (isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={5}><Skeleton className="h-8 w-full" /></TableCell>
      </TableRow>
    )
  }

  const allIds = (units ?? []).map((u) => u.id)
  const allSelected = allIds.length > 0 && selectedIds.length === allIds.length

  function toggle(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  return (
    <>
      {/* bară selecție / acțiuni bulk */}
      <TableRow className="bg-muted/20">
        <TableCell colSpan={5}>
          <div className="flex items-center gap-3 pl-10">
            <label className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-primary"
                checked={allSelected}
                onChange={() => setSelectedIds(allSelected ? [] : allIds)}
              />
              {selectedIds.length === 0 && t("common.actions")}
            </label>
            {selectedIds.length > 0 && (
              <BulkActionsBar
                propertyId={propertyId}
                selectedIds={selectedIds}
                onDone={() => setSelectedIds([])}
                onBlock={() =>
                  setBlockTarget({
                    kind: "bulk",
                    unitIds: selectedIds,
                    onDone: () => setSelectedIds([]),
                  })
                }
              />
            )}
          </div>
        </TableCell>
      </TableRow>

      {(units ?? []).map((unit) => (
        <UnitRow
          key={unit.id}
          unit={unit}
          propertyId={propertyId}
          currency={currency}
          selected={selectedIds.includes(unit.id)}
          onToggleSelect={() => toggle(unit.id)}
          onShowHistory={() => setHistoryUnit(unit)}
          onShowBlocks={() => setBlockTarget({ kind: "single", unitId: unit.id, unitName: unit.name })}
        />
      ))}

      {/* footer: adaugă camere în plus la acest tip */}
      <TableRow className="bg-muted/20">
        <TableCell colSpan={5}>
          {addMode ? (
            <AddUnitsRow
              unitTypeId={unitTypeId}
              propertyId={propertyId}
              onDone={() => setAddMode(false)}
              onCancel={() => setAddMode(false)}
            />
          ) : (
            <button
              className="flex items-center gap-1 pl-10 text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5"
              onClick={() => setAddMode(true)}
            >
              <Plus className="h-3 w-3" /> {t("units.add_more")}
            </button>
          )}
        </TableCell>
      </TableRow>

      <UnitHistoryDialog
        unitId={historyUnit?.id ?? null}
        unitName={historyUnit?.name}
        onClose={() => setHistoryUnit(null)}
      />
      <BlockDialog
        propertyId={propertyId}
        target={blockTarget}
        onClose={() => setBlockTarget(null)}
      />
    </>
  )
}
