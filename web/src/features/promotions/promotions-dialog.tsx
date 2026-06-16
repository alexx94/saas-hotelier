import { useState } from "react"
import { toast } from "sonner"
import { Pencil, Plus, Tag, Ticket, Trash2, X } from "lucide-react"
import {
  useCreatePromotion, useDeletePromotion, usePromotions, useUpdatePromotion,
  useUpdatePromotionWithRules,
} from "./hooks"
import {
  isDuplicateCodeError, isPromotionInUseError, isPromotionLockedError,
  RULE_TYPES, type DiscountType, type PromotionWithRules, type RuleType,
} from "./api"

// input doar cu cifre (numere naturale, fără virgule) — pentru valoare reducere,
// limită de utilizări și valorile condițiilor
const digitsOnly = (s: string) => s.replace(/\D/g, "")
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
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/confirm-dialog"

type Props = {
  open: boolean
  orgId: string
  propertyId: string
  currency: string
  unitTypes: UnitType[]
  onClose: () => void
}

const ALL_SCOPE = "__all__"
const ruleLabel = (rt: RuleType) => t(`promotions.rule.${rt}` as TranslationKey)

type Condition = { rule_type: RuleType; value: string }
type FormState = {
  name: string; code: string
  discountType: DiscountType; value: string
  scope: string
  stayStart: string; stayEnd: string
  bookStart: string; bookEnd: string
  maxUses: string
  conditions: Condition[]
}
const EMPTY: FormState = {
  name: "", code: "", discountType: "percent", value: "",
  scope: ALL_SCOPE, stayStart: "", stayEnd: "", bookStart: "", bookEnd: "",
  maxUses: "", conditions: [],
}

function PromotionRow({
  promo, currency, scopeLabel, busy, editing, onEdit, onToggle, onDelete,
}: {
  promo: PromotionWithRules
  currency: string
  scopeLabel: string
  busy: boolean
  editing: boolean
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const discount = promo.discount_type === "percent"
    ? `−${Number(promo.discount_value)}%`
    : `−${Number(promo.discount_value)} ${currency}`
  return (
    <div className={cn("rounded border px-2 py-1.5 text-sm", editing && "border-primary bg-primary/5")}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="font-medium">{promo.name}</span>
          <span className="ml-2 font-semibold text-emerald-600 dark:text-emerald-400">{discount}</span>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {promo.code
              ? <Badge variant="outline" className="text-[10px]">{promo.code}</Badge>
              : <Badge variant="secondary" className="text-[10px]">{t("promotions.auto")}</Badge>}
            <span>{scopeLabel}</span>
            {promo.max_uses != null && (
              <span>{promo.uses_count}/{promo.max_uses} {t("promotions.uses")}</span>
            )}
            {promo.promotion_rules.map((r) => (
              <span key={r.id}>{ruleLabel(r.rule_type as RuleType)}: {Number(r.value)}</span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant={promo.is_active ? "secondary" : "outline"} size="sm"
            className="h-7 text-xs" disabled={busy} onClick={onToggle}
          >
            {promo.is_active ? t("promotions.active") : t("promotions.inactive")}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title={t("promotions.edit")} onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={busy} onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// Promoții și reduceri la nivel de proprietate (cod sau automate + condiții + limită).
export function PromotionsDialog({ open, orgId, propertyId, currency, unitTypes, onClose }: Props) {
  const promotionsQuery = usePromotions(open ? propertyId : null)
  const createPromotion = useCreatePromotion()
  const updatePromotion = useUpdatePromotion()
  const updatePromotionWithRules = useUpdatePromotionWithRules()
  const deletePromotion = useDeletePromotion()

  const [form, setForm] = useState<FormState>(EMPTY)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const promotions = dedupeById(promotionsQuery.data?.pages.flatMap((p) => p.items) ?? [])
  // identitatea financiară (cod + tip + valoare) e blocată după ce promoția a fost
  // folosită — ranforțat și pe backend (trigger app.guard_promotion_update)
  const editingPromo = editingId ? promotions.find((p) => p.id === editingId) : undefined
  const financialLocked = (editingPromo?.uses_count ?? 0) > 0
  const valueNum = Number(form.value)
  const valid =
    !!form.name.trim() && form.value !== "" && valueNum > 0 &&
    (form.discountType !== "percent" || valueNum <= 100)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }
  const typeName = (id: string | null) =>
    id ? (unitTypes.find((u) => u.id === id)?.name ?? id) : t("promotions.scope_all")

  function addCondition() {
    set("conditions", [...form.conditions, { rule_type: "min_nights", value: "1" }])
  }
  function setCondition(i: number, patch: Partial<Condition>) {
    set("conditions", form.conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  }
  function removeCondition(i: number) {
    set("conditions", form.conditions.filter((_, idx) => idx !== i))
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY)
  }

  // încarcă o promoție existentă în formular pentru editare (inclusiv condițiile)
  function startEdit(promo: PromotionWithRules) {
    setEditingId(promo.id)
    setForm({
      name: promo.name,
      code: promo.code ?? "",
      discountType: promo.discount_type as DiscountType,
      value: String(promo.discount_value),
      scope: promo.unit_type_id ?? ALL_SCOPE,
      stayStart: promo.stay_start ?? "", stayEnd: promo.stay_end ?? "",
      bookStart: promo.book_start ?? "", bookEnd: promo.book_end ?? "",
      maxUses: promo.max_uses != null ? String(promo.max_uses) : "",
      conditions: promo.promotion_rules.map((r) => ({
        rule_type: r.rule_type as RuleType, value: String(Number(r.value)),
      })),
    })
  }

  async function onSave() {
    if (!valid) {
      toast.error(t("promotions.invalid"))
      return
    }
    const fields = {
      unit_type_id: form.scope === ALL_SCOPE ? null : form.scope,
      name: form.name.trim(),
      code: form.code.trim() ? form.code.trim().toUpperCase() : null,
      discount_type: form.discountType,
      discount_value: valueNum,
      stay_start: form.stayStart || null, stay_end: form.stayEnd || null,
      book_start: form.bookStart || null, book_end: form.bookEnd || null,
      max_uses: form.maxUses ? Number(form.maxUses) : null,
    }
    const rules = form.conditions
      .filter((c) => c.value !== "" && Number(c.value) >= 0)
      .map((c) => ({ rule_type: c.rule_type, value: Number(c.value) }))
    try {
      if (editingId) {
        // rezervările existente păstrează snapshot-ul — editarea nu le afectează
        await updatePromotionWithRules.mutateAsync({ id: editingId, patch: fields, rules })
        toast.success(t("promotions.updated"))
      } else {
        await createPromotion.mutateAsync({
          promotion: { org_id: orgId, property_id: propertyId, ...fields },
          rules,
        })
        toast.success(t("promotions.created"))
      }
      cancelEdit()
    } catch (e) {
      if (isPromotionLockedError(e)) toast.error(t("promotions.locked_error"))
      else if (isDuplicateCodeError(e)) toast.error(t("promotions.code_duplicate"))
      else toast.error(t("common.error"))
    }
  }

  async function onToggle(promo: PromotionWithRules) {
    try {
      await updatePromotion.mutateAsync({ id: promo.id, patch: { is_active: !promo.is_active } })
      toast.success(promo.is_active ? t("promotions.deactivated") : t("promotions.activated"))
    } catch {
      toast.error(t("common.error"))
    }
  }

  async function onDelete(id: string) {
    try {
      await deletePromotion.mutateAsync(id)
      toast.success(t("promotions.deleted"))
    } catch (e) {
      // FK NO ACTION pe bookings.promotion_id → promoția e folosită; istoricul e protejat
      toast.error(isPromotionInUseError(e) ? t("promotions.delete_blocked") : t("common.error"))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { cancelEdit(); onClose() } }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="h-4 w-4" /> {t("promotions.title")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{t("promotions.subtitle")}</p>

        {/* formular creare promoție */}
        <div className="space-y-3 rounded-md border p-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("promotions.name")}</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("promotions.code")} <span className="text-muted-foreground">{t("promotions.optional")}</span></Label>
              <Input
                value={form.code} placeholder={t("promotions.code_placeholder")}
                disabled={financialLocked}
                onChange={(e) => set("code", e.target.value.toUpperCase())}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("promotions.code_hint")}</p>
          {financialLocked && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
              {t("promotions.locked_hint")}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("promotions.discount_type")}</Label>
              <Select value={form.discountType} disabled={financialLocked} onValueChange={(v) => set("discountType", v as DiscountType)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">{t("promotions.percent")}</SelectItem>
                  <SelectItem value="amount">{t("promotions.amount")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("promotions.value")}{form.discountType === "amount" ? ` (${currency})` : ""}</Label>
              <Input
                inputMode="numeric" value={form.value} disabled={financialLocked}
                onChange={(e) => set("value", digitsOnly(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("promotions.scope")}</Label>
            <Select value={form.scope} onValueChange={(v) => set("scope", v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SCOPE}>{t("promotions.scope_all")}</SelectItem>
                {unitTypes.filter((u) => u.is_active).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ferestre de valabilitate (opționale) */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("promotions.stay_window")} {t("promotions.optional")}</Label>
            <div className="grid grid-cols-2 gap-3">
              <Input type="date" value={form.stayStart} onChange={(e) => set("stayStart", e.target.value)} />
              <Input type="date" min={form.stayStart || undefined} value={form.stayEnd} onChange={(e) => set("stayEnd", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("promotions.book_window")} {t("promotions.optional")}</Label>
            <div className="grid grid-cols-2 gap-3">
              <Input type="date" value={form.bookStart} onChange={(e) => set("bookStart", e.target.value)} />
              <Input type="date" min={form.bookStart || undefined} value={form.bookEnd} onChange={(e) => set("bookEnd", e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("promotions.windows_hint")}</p>

          <div className="space-y-1.5">
            <Label>{t("promotions.max_uses")} <span className="text-muted-foreground">{t("promotions.optional")}</span></Label>
            <Input
              inputMode="numeric" value={form.maxUses}
              placeholder={t("promotions.max_uses_hint")}
              onChange={(e) => set("maxUses", digitsOnly(e.target.value))}
            />
          </div>

          {/* condiții (AND) */}
          <div className="space-y-2 rounded-md border border-dashed p-2.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">{t("promotions.conditions")}</Label>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addCondition}>
                <Plus className="h-3.5 w-3.5" />{t("promotions.add_condition")}
              </Button>
            </div>
            {form.conditions.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("promotions.no_conditions")}</p>
            ) : (
              form.conditions.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select value={c.rule_type} onValueChange={(v) => setCondition(i, { rule_type: v as RuleType })}>
                    <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RULE_TYPES.map((rt) => (
                        <SelectItem key={rt} value={rt}>{ruleLabel(rt)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    inputMode="numeric" className="w-24"
                    value={c.value} onChange={(e) => setCondition(i, { value: digitsOnly(e.target.value) })}
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeCondition(i)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={createPromotion.isPending || updatePromotionWithRules.isPending || !valid}
              onClick={onSave}
            >
              <Tag className="h-4 w-4" />{editingId ? t("promotions.update") : t("promotions.add")}
            </Button>
            {editingId && (
              <Button variant="outline" onClick={cancelEdit}>{t("promotions.cancel_edit")}</Button>
            )}
          </div>
        </div>

        {/* listă promoții existente */}
        {promotionsQuery.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : promotions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("promotions.empty")}</p>
        ) : (
          <div className="space-y-1.5">
            {promotions.map((p) => (
              <PromotionRow
                key={p.id}
                promo={p}
                currency={currency}
                scopeLabel={typeName(p.unit_type_id)}
                busy={updatePromotion.isPending || deletePromotion.isPending}
                editing={editingId === p.id}
                onEdit={() => startEdit(p)}
                onToggle={() => onToggle(p)}
                onDelete={() => setDeleteId(p.id)}
              />
            ))}
            {promotionsQuery.hasNextPage && (
              <Button
                variant="ghost" size="sm" className="w-full"
                disabled={promotionsQuery.isFetchingNextPage}
                onClick={() => promotionsQuery.fetchNextPage()}
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
          description={t("promotions.delete_confirm")}
          confirmLabel={t("common.delete")}
          destructive
          onConfirm={() => deleteId && onDelete(deleteId)}
        />
      </DialogContent>
    </Dialog>
  )
}
