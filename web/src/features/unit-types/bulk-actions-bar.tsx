import { useState } from "react"
import { toast } from "sonner"
import { useBulkDeleteUnits, useBulkSetUnitStatus } from "./hooks"
import type { UnitStatus } from "./api"
import { t } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/confirm-dialog"

type Props = {
  propertyId: string
  selectedIds: string[]
  onDone: () => void
  onBlock: () => void
}

// Bară de acțiuni bulk pe camerele selectate:
// activare / dezactivare / blocare pe interval / arhivare / ștergere.
// Camerele care nu pot fi procesate sunt raportate pe nume, restul trec.
export function BulkActionsBar({ propertyId, selectedIds, onDone, onBlock }: Props) {
  const bulkSetStatus = useBulkSetUnitStatus(propertyId)
  const bulkDelete = useBulkDeleteUnits(propertyId)
  const pending = bulkSetStatus.isPending || bulkDelete.isPending
  const [confirmAction, setConfirmAction] = useState<"archive" | "delete" | null>(null)

  function reportBlocked(blocked: string[]) {
    if (blocked.length > 0) {
      toast.error(`${t("units.bulk_blocked_toast")} ${blocked.join(", ")}`)
    }
  }

  async function run(status: UnitStatus) {
    try {
      const { updated, blocked } = await bulkSetStatus.mutateAsync({
        unitIds: selectedIds,
        status,
      })
      toast.success(`${updated} ${t("units.bulk_updated_toast")}`)
      reportBlocked(blocked)
      onDone()
    } catch {
      toast.error(t("common.error"))
    }
  }

  async function runDelete() {
    try {
      const { deleted, deactivated, blocked } = await bulkDelete.mutateAsync(selectedIds)
      toast.success(
        `${deleted} ${t("units.bulk_deleted_toast")}`
        + (deactivated > 0 ? `, ${deactivated} ${t("units.bulk_deactivated_toast")}` : "")
      )
      reportBlocked(blocked)
      onDone()
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <div className="flex flex-col gap-2 py-1 pl-10 sm:flex-row sm:items-center">
      <span className="text-xs text-muted-foreground">
        {selectedIds.length} {t("units.selected")}
      </span>
      <div className="flex items-center gap-1">
        <Button
          type="button" size="sm" variant="outline" className="h-7"
          disabled={pending}
          onClick={() => run("active")}
        >
          {t("units.bulk_activate")}
        </Button>
        <Button
          type="button" size="sm" variant="outline" className="h-7"
          disabled={pending}
          onClick={() => run("inactive")}
        >
          {t("units.bulk_deactivate")}
        </Button>
        <Button
          type="button" size="sm" variant="outline" className="h-7"
          disabled={pending}
          onClick={onBlock}
        >
          {t("units.bulk_block")}
        </Button>
        <Button
          type="button" size="sm" variant="outline" className="h-7 text-destructive"
          disabled={pending}
          onClick={() => setConfirmAction("archive")}
        >
          {t("units.bulk_archive")}
        </Button>
        <Button
          type="button" size="sm" variant="outline" className="h-7 text-destructive"
          disabled={pending}
          onClick={() => setConfirmAction("delete")}
        >
          {t("units.bulk_delete")}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmAction !== null}
        onOpenChange={(o) => !o && setConfirmAction(null)}
        title={t("common.confirm_action")}
        description={confirmAction === "delete" ? t("common.confirm_delete") : t("units.bulk_archive_confirm")}
        confirmLabel={confirmAction === "delete" ? t("units.bulk_delete") : t("units.bulk_archive")}
        destructive
        onConfirm={() => (confirmAction === "delete" ? runDelete() : run("archived"))}
      />
    </div>
  )
}
