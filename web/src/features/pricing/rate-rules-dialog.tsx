import { useState } from "react"
import { format } from "date-fns"
import { toast } from "sonner"
import { CalendarRange, History, Pencil, Trash2 } from "lucide-react"
import {
  useCreateRateRule, useDeleteRateRule, useSeasons, useUpdateRateRule,
} from "./hooks"
import type { RateRule } from "./api"
import { RATE_RULE_EVENT_LABEL, RATE_RULE_FIELDS } from "./rate-rule-fields"
import { EntityHistoryDialog } from "@/features/audit/entity-history-dialog"
import { Can } from "@/features/auth/can"
import { dedupeById } from "@/lib/pagination"
import { t } from "@/lib/i18n"
import { formatMoney } from "@/lib/money"
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
  currency: string
  onClose: () => void
}

type FormState = {
  id: string | null
  name: string
  start: string
  end: string
  price: string
}

const EMPTY: FormState = { id: null, name: "", start: "", end: "", price: "" }

// Doar SEZOANE per tip de cameră. Override-urile (tarife preferențiale pe perioadă)
// se adaugă din calendar — vezi OverrideDialog.
export function RateRulesDialog({
  unitTypeId, unitTypeName, orgId, propertyId, currency, onClose,
}: Props) {
  const seasonsQuery = useSeasons(unitTypeId)
  const createRule = useCreateRateRule()
  const updateRule = useUpdateRateRule()
  const deleteRule = useDeleteRateRule()

  const [form, setForm] = useState<FormState>(EMPTY)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [historyId, setHistoryId] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)
  const seasons = dedupeById(seasonsQuery.data?.pages.flatMap((p) => p.items) ?? [])
  const pending = createRule.isPending || updateRule.isPending
  const valid = !!form.name.trim() && !!form.start && !!form.end && form.price !== ""

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function startEdit(r: RateRule) {
    setForm({
      id: r.id, name: r.name, start: r.start_date, end: r.end_date, price: String(r.price),
    })
  }

  async function onSubmit() {
    if (!unitTypeId || !valid) return
    if (form.end < form.start) {
      toast.error(t("pricing.invalid_dates"))
      return
    }
    // nu permitem perioade complet în trecut — nu se vor aplica niciodată
    if (form.end < today) {
      toast.error(t("pricing.past_dates"))
      return
    }
    try {
      if (form.id) {
        await updateRule.mutateAsync({
          id: form.id,
          patch: {
            name: form.name.trim(), start_date: form.start,
            end_date: form.end, price: Number(form.price),
          },
        })
        toast.success(t("pricing.rule_updated"))
      } else {
        await createRule.mutateAsync({
          org_id: orgId, property_id: propertyId, unit_type_id: unitTypeId,
          kind: "season", name: form.name.trim(),
          start_date: form.start, end_date: form.end, price: Number(form.price),
        })
        toast.success(t("pricing.rule_created"))
      }
      setForm(EMPTY)
    } catch {
      toast.error(t("common.error"))
    }
  }

  async function onDelete(id: string) {
    try {
      await deleteRule.mutateAsync(id)
      toast.success(t("pricing.rule_deleted"))
      if (form.id === id) setForm(EMPTY)
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <Dialog open={unitTypeId !== null} onOpenChange={(o) => { if (!o) { setForm(EMPTY); onClose() } }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4" />
            {t("pricing.seasons_title")}{unitTypeName ? `: ${unitTypeName}` : ""}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{t("pricing.seasons_subtitle")}</p>

        {/* formular adăugare / editare sezon */}
        <div className="space-y-3 rounded-md border p-3">
          <div className="space-y-1.5">
            <Label>{t("pricing.rule_name")}</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("pricing.start")}</Label>
              <Input type="date" min={today} value={form.start} onChange={(e) => set("start", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("pricing.end")}</Label>
              <Input type="date" min={form.start || today} value={form.end} onChange={(e) => set("end", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("pricing.price")} ({currency})</Label>
            <Input type="number" min={0} step="0.01" value={form.price} onChange={(e) => set("price", e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" disabled={pending || !valid} onClick={onSubmit}>
              {form.id ? t("common.save") : t("pricing.add_season")}
            </Button>
            {form.id && (
              <Button variant="outline" onClick={() => setForm(EMPTY)}>{t("common.cancel")}</Button>
            )}
          </div>
        </div>

        {/* listă sezoane existente (paginată „Afișează mai mult") */}
        {seasonsQuery.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : seasons.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("pricing.seasons_empty")}</p>
        ) : (
          <div className="space-y-1.5">
            {seasons.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{r.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {format(new Date(r.start_date), "dd.MM.yyyy")} – {format(new Date(r.end_date), "dd.MM.yyyy")}
                    {" · "}{formatMoney(r.price, currency)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Can permission="audit.view">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setHistoryId(r.id)}>
                      <History className="h-3.5 w-3.5" />
                    </Button>
                  </Can>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(r)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={deleteRule.isPending} onClick={() => setDeleteId(r.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
            {seasonsQuery.hasNextPage && (
              <Button
                variant="ghost" size="sm" className="w-full"
                disabled={seasonsQuery.isFetchingNextPage}
                onClick={() => seasonsQuery.fetchNextPage()}
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
          description={t("pricing.delete_confirm")}
          confirmLabel={t("common.delete")}
          destructive
          onConfirm={() => deleteId && onDelete(deleteId)}
        />

        <EntityHistoryDialog
          entityType="rate_rule"
          entityId={historyId}
          title={t("history.title")}
          labels={RATE_RULE_EVENT_LABEL}
          fields={RATE_RULE_FIELDS}
          onClose={() => setHistoryId(null)}
        />
      </DialogContent>
    </Dialog>
  )
}
