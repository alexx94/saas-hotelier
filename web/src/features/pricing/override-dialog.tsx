import { useState } from "react"
import { format } from "date-fns"
import { toast } from "sonner"
import { CalendarClock, Trash2 } from "lucide-react"
import { useUnitTypes } from "@/features/unit-types/hooks"
import { useCreateRateRule, useDeleteRateRule, useOverrides } from "./hooks"
import { dedupeById } from "@/lib/pagination"
import { t } from "@/lib/i18n"
import { formatMoney } from "@/lib/money"
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

// Tarif preferențial (override) pe perioadă determinată, aplicat AUTOMAT tuturor
// camerelor unui tip. Gestionat din calendar — override > sezon la rezolvare.
export function OverrideDialog({
  propertyId,
  orgId,
  currency,
  open,
  onClose,
}: {
  propertyId: string
  orgId: string
  currency: string
  open: boolean
  onClose: () => void
}) {
  const { data: unitTypes } = useUnitTypes(propertyId)
  const overridesQuery = useOverrides(open ? propertyId : null)
  const overrides = dedupeById(overridesQuery.data?.pages.flatMap((p) => p.items) ?? [])
  const createRule = useCreateRateRule()
  const deleteRule = useDeleteRateRule()
  const today = new Date().toISOString().slice(0, 10)

  const [unitTypeId, setUnitTypeId] = useState("")
  const [name, setName] = useState("")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [price, setPrice] = useState("")
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const activeTypes = (unitTypes ?? []).filter((ut) => ut.is_active)
  const typeName = (id: string) => activeTypes.find((ut) => ut.id === id)?.name ?? ""
  const valid = !!unitTypeId && !!name.trim() && !!start && !!end && price !== ""

  function reset() {
    setUnitTypeId(""); setName(""); setStart(""); setEnd(""); setPrice("")
  }

  async function onCreate() {
    if (!valid) return
    if (end < start) { toast.error(t("pricing.invalid_dates")); return }
    if (end < today) { toast.error(t("pricing.past_dates")); return }
    try {
      await createRule.mutateAsync({
        org_id: orgId, property_id: propertyId, unit_type_id: unitTypeId,
        kind: "override", name: name.trim(),
        start_date: start, end_date: end, price: Number(price),
      })
      toast.success(t("pricing.override_created"))
      reset()
    } catch {
      toast.error(t("common.error"))
    }
  }

  async function onDelete(id: string) {
    try {
      await deleteRule.mutateAsync(id)
      toast.success(t("pricing.override_deleted"))
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose() } }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" /> {t("pricing.override_title")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{t("pricing.override_subtitle")}</p>

        {/* formular adăugare override */}
        <div className="space-y-3 rounded-md border p-3">
          <div className="space-y-1.5">
            <Label>{t("bookings.unit_type")}</Label>
            <Select value={unitTypeId} onValueChange={setUnitTypeId}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {activeTypes.map((ut) => (
                  <SelectItem key={ut.id} value={ut.id}>{ut.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("pricing.rule_name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Festival, Revelion" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("pricing.start")}</Label>
              <Input type="date" min={today} value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("pricing.end")}</Label>
              <Input type="date" min={start || today} value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("pricing.price")} ({currency})</Label>
            <Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <Button className="w-full" disabled={createRule.isPending || !valid} onClick={onCreate}>
            {t("pricing.add_override")}
          </Button>
        </div>

        {/* listă override-uri active (paginată „Afișează mai mult") */}
        {overridesQuery.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : overrides.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("pricing.override_empty")}</p>
        ) : (
          <div className="space-y-1.5">
            {overrides.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{r.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {typeName(r.unit_type_id)} · {format(new Date(r.start_date), "dd.MM")} – {format(new Date(r.end_date), "dd.MM.yyyy")}
                    {" · "}{formatMoney(r.price, currency)}
                  </span>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" disabled={deleteRule.isPending} onClick={() => setDeleteId(r.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
            {overridesQuery.hasNextPage && (
              <Button
                variant="ghost" size="sm" className="w-full"
                disabled={overridesQuery.isFetchingNextPage}
                onClick={() => overridesQuery.fetchNextPage()}
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
          description={t("pricing.override_delete_confirm")}
          confirmLabel={t("common.delete")}
          destructive
          onConfirm={() => deleteId && onDelete(deleteId)}
        />
      </DialogContent>
    </Dialog>
  )
}
