import { useState } from "react"
import { format } from "date-fns"
import { toast } from "sonner"
import { Ban, ChevronDown, Trash2 } from "lucide-react"
import { useCreateClosure, useClosures, useDeleteClosure } from "./hooks"
import { CLOSURE_REASONS, type Closure, type ClosureReason } from "./api"
import type { UnitType } from "@/features/unit-types/api"
import { dedupeById } from "@/lib/pagination"
import { cn } from "@/lib/utils"
import { t, type TranslationKey } from "@/lib/i18n"
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

type Props = {
  open: boolean
  orgId: string
  propertyId: string
  unitTypes: UnitType[]
  onClose: () => void
}

const PROPERTY_SCOPE = "__property__"

// rând închidere: nota e ascunsă sub un acordeon subtil (chevron) — apare doar dacă există
function ClosureRow({
  closure: c, scopeLabel, deleting, onDelete,
}: {
  closure: Closure
  scopeLabel: string
  deleting: boolean
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded border px-2 py-1.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="font-medium">{scopeLabel}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {format(new Date(c.start_date), "dd.MM.yyyy")} – {format(new Date(c.end_date), "dd.MM.yyyy")}
            {" · "}{t(`closures.reason.${c.reason as ClosureReason}` as TranslationKey)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {c.notes && (
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => setOpen((v) => !v)}
            >
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
            </Button>
          )}
          <Button
            variant="ghost" size="icon" className="h-7 w-7"
            disabled={deleting} onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>
      {open && c.notes && (
        <p className="mt-1.5 border-t pt-1.5 text-xs text-muted-foreground leading-snug">{c.notes}</p>
      )}
    </div>
  )
}

// Stop-sell / închideri la nivel de proprietate. Scope: toată proprietatea
// (unit_type_id null) sau un singur tip. Nu atinge camerele fizice (≠ blocaje).
export function ClosuresDialog({ open, orgId, propertyId, unitTypes, onClose }: Props) {
  const closuresQuery = useClosures(open ? propertyId : null)
  const createClosure = useCreateClosure()
  const deleteClosure = useDeleteClosure()

  const [scope, setScope] = useState<string>(PROPERTY_SCOPE)
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [reason, setReason] = useState<ClosureReason>("seasonal")
  const [notes, setNotes] = useState("")
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)
  const closures = dedupeById(closuresQuery.data?.pages.flatMap((p) => p.items) ?? [])
  const typeName = (id: string | null) =>
    id ? (unitTypes.find((u) => u.id === id)?.name ?? id) : t("closures.all_types")

  function resetForm() {
    setScope(PROPERTY_SCOPE); setStart(""); setEnd(""); setReason("seasonal"); setNotes("")
  }

  async function onCreate() {
    if (!start || !end) return
    if (end <= start) {
      toast.error(t("closures.invalid_dates"))
      return
    }
    try {
      await createClosure.mutateAsync({
        org_id: orgId, property_id: propertyId,
        unit_type_id: scope === PROPERTY_SCOPE ? null : scope,
        start_date: start, end_date: end, reason, notes: notes.trim() || null,
      })
      toast.success(t("closures.created"))
      resetForm()
    } catch {
      toast.error(t("common.error"))
    }
  }

  async function onDelete(id: string) {
    try {
      await deleteClosure.mutateAsync(id)
      toast.success(t("closures.deleted"))
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { resetForm(); onClose() } }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-4 w-4" /> {t("closures.title")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{t("closures.subtitle")}</p>

        {/* formular adăugare închidere */}
        <div className="space-y-3 rounded-md border p-3">
          <div className="space-y-1.5">
            <Label>{t("closures.scope")}</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={PROPERTY_SCOPE}>{t("closures.scope_property")}</SelectItem>
                {unitTypes.filter((u) => u.is_active).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("closures.start")}</Label>
              <Input type="date" min={today} value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("closures.end")}</Label>
              <Input type="date" min={start || today} value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("closures.reason")}</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as ClosureReason)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CLOSURE_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>{t(`closures.reason.${r}` as TranslationKey)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("closures.notes")}</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button className="w-full" disabled={createClosure.isPending || !start || !end} onClick={onCreate}>
            {t("closures.create")}
          </Button>
        </div>

        {/* listă închideri existente */}
        {closuresQuery.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : closures.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("closures.empty")}</p>
        ) : (
          <div className="space-y-1.5">
            {closures.map((c) => (
              <ClosureRow
                key={c.id}
                closure={c}
                scopeLabel={typeName(c.unit_type_id)}
                deleting={deleteClosure.isPending}
                onDelete={() => setDeleteId(c.id)}
              />
            ))}
            {closuresQuery.hasNextPage && (
              <Button
                variant="ghost" size="sm" className="w-full"
                disabled={closuresQuery.isFetchingNextPage}
                onClick={() => closuresQuery.fetchNextPage()}
              >
                {t("common.show_more")}
              </Button>
            )}
          </div>
        )}

        <ConfirmDialog
          open={deleteId !== null}
          onOpenChange={(o) => !o && setDeleteId(null)}
          title={t("common.confirm_action")}
          description={t("closures.delete_confirm")}
          confirmLabel={t("common.delete")}
          destructive
          onConfirm={() => deleteId && onDelete(deleteId)}
        />
      </DialogContent>
    </Dialog>
  )
}
