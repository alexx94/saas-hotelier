import { useState } from "react"
import { format } from "date-fns"
import { toast } from "sonner"
import { CalendarClock, Minus, Plus, Trash2, X } from "lucide-react"
import { useCreateStayRule, useDeleteStayRule, useStayRules } from "./hooks"
import { dedupeById } from "@/lib/pagination"
import { t } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/confirm-dialog"

type Props = {
  unitTypeId: string | null
  unitTypeName?: string
  orgId: string
  propertyId: string
  onClose: () => void
}

type FormState = { name: string; start: string; end: string; min: number | null; max: number | null }
const EMPTY: FormState = { name: "", start: "", end: "", min: null, max: null }

// stepper +/- care suportă starea „moștenit" (null = ia valoarea globală a tipului)
function StayLimitField({
  label, value, onChange, inheritDefault,
}: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  inheritDefault: number
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {value === null ? (
        <Button
          type="button" variant="outline"
          className="w-full font-normal text-muted-foreground"
          onClick={() => onChange(inheritDefault)}
        >
          {t("stay_rules.inherited")}
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0"
            disabled={value <= 1} onClick={() => onChange(Math.max(1, value - 1))}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="w-8 text-center text-sm font-medium tabular-nums">{value}</span>
          <Button
            type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0"
            disabled={value >= 30} onClick={() => onChange(Math.min(30, value + 1))}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground"
            title={t("stay_rules.set_inherit")} onClick={() => onChange(null)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}

// Reguli de durată pe perioadă (per tip). Suprascriu min/max stay global, cheiate pe
// data de check-in. Min/max lăsate goale moștenesc valoarea globală a tipului.
export function StayRulesDialog({ unitTypeId, unitTypeName, orgId, propertyId, onClose }: Props) {
  const rulesQuery = useStayRules(unitTypeId)
  const createRule = useCreateStayRule()
  const deleteRule = useDeleteStayRule()

  const [form, setForm] = useState<FormState>(EMPTY)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)
  const rules = dedupeById(rulesQuery.data?.pages.flatMap((p) => p.items) ?? [])
  const valid = !!form.name.trim() && !!form.start && !!form.end && (form.min !== null || form.max !== null)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function onSubmit() {
    if (!unitTypeId || !valid) return
    if (form.end < form.start) {
      toast.error(t("stay_rules.invalid_dates"))
      return
    }
    if (form.min !== null && form.max !== null && form.max < form.min) {
      toast.error(t("unit_types.stay_order"))
      return
    }
    try {
      await createRule.mutateAsync({
        org_id: orgId, property_id: propertyId, unit_type_id: unitTypeId,
        name: form.name.trim(), start_date: form.start, end_date: form.end,
        min_stay: form.min,
        max_stay: form.max,
      })
      toast.success(t("stay_rules.created"))
      setForm(EMPTY)
    } catch {
      toast.error(t("common.error"))
    }
  }

  async function onDelete(id: string) {
    try {
      await deleteRule.mutateAsync(id)
      toast.success(t("stay_rules.deleted"))
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <Dialog open={unitTypeId !== null} onOpenChange={(o) => { if (!o) { setForm(EMPTY); onClose() } }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            {t("stay_rules.title")}{unitTypeName ? `: ${unitTypeName}` : ""}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{t("stay_rules.subtitle")}</p>

        {/* formular adăugare regulă */}
        <div className="space-y-3 rounded-md border p-3">
          <div className="space-y-1.5">
            <Label>{t("stay_rules.name")}</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("stay_rules.start")}</Label>
              <Input type="date" min={today} value={form.start} onChange={(e) => set("start", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("stay_rules.end")}</Label>
              <Input type="date" min={form.start || today} value={form.end} onChange={(e) => set("end", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StayLimitField
              label={t("stay_rules.min_stay")} value={form.min}
              onChange={(v) => set("min", v)} inheritDefault={1}
            />
            <StayLimitField
              label={t("stay_rules.max_stay")} value={form.max}
              onChange={(v) => set("max", v)} inheritDefault={30}
            />
          </div>
          <p className="text-xs text-muted-foreground">{t("stay_rules.range_hint")}</p>
          <Button className="w-full" disabled={createRule.isPending || !valid} onClick={onSubmit}>
            {t("stay_rules.add")}
          </Button>
        </div>

        {/* listă reguli existente (paginată „Afișează mai mult") */}
        {rulesQuery.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("stay_rules.empty")}</p>
        ) : (
          <div className="space-y-1.5">
            {rules.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{r.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {format(new Date(r.start_date), "dd.MM.yyyy")} – {format(new Date(r.end_date), "dd.MM.yyyy")}
                    {r.min_stay != null ? ` · ${t("stay_rules.min_stay")} ${r.min_stay}` : ""}
                    {r.max_stay != null ? ` · ${t("stay_rules.max_stay")} ${r.max_stay}` : ""}
                  </span>
                </div>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                  disabled={deleteRule.isPending} onClick={() => setDeleteId(r.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
            {rulesQuery.hasNextPage && (
              <Button
                variant="ghost" size="sm" className="w-full"
                disabled={rulesQuery.isFetchingNextPage}
                onClick={() => rulesQuery.fetchNextPage()}
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
          description={t("stay_rules.delete_confirm")}
          confirmLabel={t("common.delete")}
          destructive
          onConfirm={() => deleteId && onDelete(deleteId)}
        />
      </DialogContent>
    </Dialog>
  )
}
