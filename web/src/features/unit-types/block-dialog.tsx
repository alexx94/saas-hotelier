import { useState } from "react"
import { format } from "date-fns"
import { toast } from "sonner"
import { CalendarOff, Trash2 } from "lucide-react"
import {
  useBlockUnit, useBulkBlockUnits, useBulkRemoveBlocks, useRemoveBlock, useUnitBlocks,
} from "./hooks"
import { errorMessage } from "@/lib/errors"
import { BLOCK_REASONS, type BlockReason } from "./api"
import { BLOCK_REASON_LABEL, blockReasonLabel } from "./block-reason"
import { t } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/confirm-dialog"

// Mod single: blochează o cameră + listează/șterge blocajele ei existente.
// `initialRange` precompletează intervalul (quick-create din calendar — camera + zilele
// sunt deja alese pe grilă).
// Mod bulk: blochează camerele selectate (sare peste suprapuneri, le raportează).
type Target =
  | { kind: "single"; unitId: string; unitName: string; initialRange?: { start: string; end: string } }
  | { kind: "bulk"; unitIds: string[]; onDone: () => void }

type Props = {
  propertyId: string
  target: Target | null
  onClose: () => void
}

function reportSkipped(skipped: string[]) {
  if (skipped.length > 0) {
    toast.error(`${t("blocks.bulk_skipped")} ${skipped.join(", ")}`)
  }
}

function mapBlockError(e: unknown) {
  const msg = errorMessage(e)
  // BLOCK_OVERLAPS (alt blocaj) și BLOCK_OVERLAPS_BOOKING (rezervări pe interval)
  if (msg.includes("BLOCK_OVERLAPS")) return toast.error(t("blocks.overlaps"))
  if (msg.includes("INVALID_DATES")) return toast.error(t("blocks.invalid_dates"))
  if (msg.includes("UNIT_NOT_ACTIVE")) return toast.error(t("blocks.unit_not_active"))
  return toast.error(t("common.error"))
}

// cheie stabilă pe conținutul target-ului — un target nou (altă cameră/interval) trebuie
// să remonteze BlockForm ca useState(start/end) să prindă noul `initialRange`
function targetKey(target: Target): string {
  return target.kind === "single"
    ? `single-${target.unitId}-${target.initialRange?.start ?? ""}-${target.initialRange?.end ?? ""}`
    : `bulk-${target.unitIds.join(",")}`
}

export function BlockDialog({ propertyId, target, onClose }: Props) {
  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        {/* montat DOAR când target există, cu key pe conținutul lui — la fel ca la
            BookingFormDialog/QuickBookingDialog, altfel start/end rămân blocate pe
            valoarea de la primul target (vezi HANDOFF „Capcane") */}
        {target && <BlockForm key={targetKey(target)} propertyId={propertyId} target={target} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function BlockForm({
  propertyId,
  target,
  onClose,
}: {
  propertyId: string
  target: Target
  onClose: () => void
}) {
  const blockUnit = useBlockUnit(propertyId)
  const bulkBlock = useBulkBlockUnits(propertyId)
  const removeBlock = useRemoveBlock()
  const bulkRemove = useBulkRemoveBlocks()
  const [start, setStart] = useState(target.kind === "single" ? target.initialRange?.start ?? "" : "")
  const [end, setEnd] = useState(target.kind === "single" ? target.initialRange?.end ?? "" : "")
  const [reason, setReason] = useState<BlockReason>("maintenance")
  const [notes, setNotes] = useState("")
  const [removeId, setRemoveId] = useState<string | null>(null)
  const [confirmBulkRemove, setConfirmBulkRemove] = useState(false)

  const singleUnitId = target.kind === "single" ? target.unitId : null
  const { data: blocks, isLoading } = useUnitBlocks(singleUnitId)
  const pending = blockUnit.isPending || bulkBlock.isPending

  function resetForm() {
    setStart(""); setEnd(""); setReason("maintenance"); setNotes("")
  }

  async function onCreate() {
    if (!start || !end) return
    try {
      if (target.kind === "single") {
        await blockUnit.mutateAsync({ unitId: target.unitId, start, end, reason, notes: notes || undefined })
        toast.success(t("blocks.created"))
        resetForm()
      } else {
        const { blocked, skipped } = await bulkBlock.mutateAsync({
          unitIds: target.unitIds, start, end, reason, notes: notes || undefined,
        })
        toast.success(`${blocked} ${t("blocks.bulk_done")}`)
        reportSkipped(skipped)
        target.onDone()
        onClose()
      }
    } catch (e) {
      mapBlockError(e)
    }
  }

  async function onRemove(blockId: string) {
    try {
      await removeBlock.mutateAsync(blockId)
      toast.success(t("blocks.removed"))
    } catch {
      toast.error(t("common.error"))
    }
  }

  // bulk: elimină toate blocajele care ating intervalul, de pe camerele selectate
  async function onBulkRemove() {
    if (target.kind !== "bulk" || !start || !end) return
    try {
      const n = await bulkRemove.mutateAsync({ unitIds: target.unitIds, start, end })
      toast.success(`${n} ${t("blocks.bulk_removed_toast")}`)
      target.onDone()
      onClose()
    } catch (e) {
      mapBlockError(e)
    }
  }

  const title =
    target.kind === "single"
      ? `${t("blocks.title")}: ${target.unitName}`
      : `${t("blocks.title")} · ${target.unitIds.length} ${t("units.selected")}`

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CalendarOff className="h-4 w-4" /> {title}
        </DialogTitle>
      </DialogHeader>

      {/* formular adăugare blocaj */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("blocks.start")}</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("blocks.end")}</Label>
            <Input type="date" min={start || undefined} value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{t("blocks.reason")}</Label>
          <Select value={reason} onValueChange={(v) => setReason(v as BlockReason)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {BLOCK_REASONS.map((r) => (
                <SelectItem key={r} value={r}>{t(BLOCK_REASON_LABEL[r])}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t("blocks.notes")}</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <Button className="w-full" disabled={pending || !start || !end} onClick={onCreate}>
          {t("blocks.create")}
        </Button>
        {target.kind === "bulk" && (
          <Button
            variant="outline" className="w-full text-destructive"
            disabled={bulkRemove.isPending || !start || !end}
            onClick={() => setConfirmBulkRemove(true)}
          >
            {t("blocks.bulk_remove")}
          </Button>
        )}
      </div>

      {/* listă blocaje existente (doar mod single) */}
      {target.kind === "single" && (
        <div className="mt-2 border-t pt-3">
          {isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : !blocks || blocks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("blocks.empty")}</p>
          ) : (
            <div className="space-y-1.5">
              {blocks.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">
                      {format(new Date(b.start_date), "dd.MM.yyyy")} – {format(new Date(b.end_date), "dd.MM.yyyy")}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {blockReasonLabel(b.reason)}
                      {b.notes ? ` · ${b.notes}` : ""}
                    </span>
                  </div>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                    disabled={removeBlock.isPending}
                    onClick={() => setRemoveId(b.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={removeId !== null}
        onOpenChange={(o) => !o && setRemoveId(null)}
        title={t("common.confirm_action")}
        description={t("blocks.confirm_remove")}
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={() => removeId && onRemove(removeId)}
      />
      <ConfirmDialog
        open={confirmBulkRemove}
        onOpenChange={setConfirmBulkRemove}
        title={t("common.confirm_action")}
        description={t("blocks.bulk_remove_confirm")}
        confirmLabel={t("blocks.bulk_remove")}
        destructive
        onConfirm={onBulkRemove}
      />
    </>
  )
}
