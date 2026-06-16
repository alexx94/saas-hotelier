import { useState } from "react"
import { format } from "date-fns"
import { toast } from "sonner"
import { CalendarX2, LogIn, LogOut, Trash2 } from "lucide-react"
import { useArrivalRules, useCreateArrivalRule, useDeleteArrivalRule } from "./hooks"
import type { ArrivalRule } from "./api"
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
// ordine afișare DOW: Luni → Duminică (preferința RO); valorile = DOW Postgres (0=Du..6=Sâ)
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

const dowLabel = (dow: number) => t(`dow.${dow}` as TranslationKey)

// rezumat lizibil al zilelor vizate (gol = fiecare zi din interval)
function weekdaysSummary(weekdays: number[] | null): string {
  if (!weekdays || weekdays.length === 0) return t("arrival_rules.everyday")
  return WEEKDAY_ORDER.filter((d) => weekdays.includes(d)).map(dowLabel).join(", ")
}

function ArrivalRuleRow({
  rule, scopeLabel, deleting, onDelete,
}: {
  rule: ArrivalRule
  scopeLabel: string
  deleting: boolean
  onDelete: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-sm">
      <div className="min-w-0">
        <span className="font-medium">{rule.name}</span>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>{scopeLabel}</span>
          <span>·</span>
          <span>
            {format(new Date(rule.start_date), "dd.MM.yyyy")} – {format(new Date(rule.end_date), "dd.MM.yyyy")}
          </span>
          <span>·</span>
          <span>{weekdaysSummary(rule.weekdays)}</span>
          {rule.no_arrival && (
            <span className="inline-flex items-center gap-0.5 text-destructive">
              <LogIn className="h-3 w-3" />{t("arrival_rules.no_arrival")}
            </span>
          )}
          {rule.no_departure && (
            <span className="inline-flex items-center gap-0.5 text-destructive">
              <LogOut className="h-3 w-3" />{t("arrival_rules.no_departure")}
            </span>
          )}
        </div>
      </div>
      <Button
        variant="ghost" size="icon" className="h-7 w-7 shrink-0"
        disabled={deleting} onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5 text-destructive" />
      </Button>
    </div>
  )
}

// Restricții de sosire/plecare (CTA/CTD), pe zi a săptămânii sau dată fixă. Scope:
// toată proprietatea (unit_type_id null) sau un tip. Cea mai restrictivă regulă se aplică.
export function ArrivalRulesDialog({ open, orgId, propertyId, unitTypes, onClose }: Props) {
  const rulesQuery = useArrivalRules(open ? propertyId : null)
  const createRule = useCreateArrivalRule()
  const deleteRule = useDeleteArrivalRule()

  const [scope, setScope] = useState<string>(PROPERTY_SCOPE)
  const [name, setName] = useState("")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [weekdays, setWeekdays] = useState<number[]>([])
  const [noArrival, setNoArrival] = useState(false)
  const [noDeparture, setNoDeparture] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)
  const rules = dedupeById(rulesQuery.data?.pages.flatMap((p) => p.items) ?? [])
  const typeName = (id: string | null) =>
    id ? (unitTypes.find((u) => u.id === id)?.name ?? id) : t("arrival_rules.scope_property")
  const valid = !!name.trim() && !!start && !!end && (noArrival || noDeparture)

  function toggleDay(dow: number) {
    setWeekdays((w) => (w.includes(dow) ? w.filter((d) => d !== dow) : [...w, dow].sort()))
  }

  function resetForm() {
    setScope(PROPERTY_SCOPE); setName(""); setStart(""); setEnd("")
    setWeekdays([]); setNoArrival(false); setNoDeparture(false)
  }

  async function onCreate() {
    if (!valid) return
    if (end < start) {
      toast.error(t("arrival_rules.invalid_dates"))
      return
    }
    try {
      await createRule.mutateAsync({
        org_id: orgId, property_id: propertyId,
        unit_type_id: scope === PROPERTY_SCOPE ? null : scope,
        name: name.trim(), start_date: start, end_date: end,
        weekdays: weekdays.length > 0 ? weekdays : null,
        no_arrival: noArrival, no_departure: noDeparture,
      })
      toast.success(t("arrival_rules.created"))
      resetForm()
    } catch {
      toast.error(t("common.error"))
    }
  }

  async function onDelete(id: string) {
    try {
      await deleteRule.mutateAsync(id)
      toast.success(t("arrival_rules.deleted"))
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { resetForm(); onClose() } }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarX2 className="h-4 w-4" /> {t("arrival_rules.title")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{t("arrival_rules.subtitle")}</p>

        {/* formular adăugare restricție */}
        <div className="space-y-3 rounded-md border p-3">
          <div className="space-y-1.5">
            <Label>{t("arrival_rules.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("arrival_rules.scope")}</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={PROPERTY_SCOPE}>{t("arrival_rules.scope_property")}</SelectItem>
                {unitTypes.filter((u) => u.is_active).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("arrival_rules.start")}</Label>
              <Input type="date" min={today} value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("arrival_rules.end")}</Label>
              <Input type="date" min={start || today} value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("arrival_rules.weekdays")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_ORDER.map((dow) => (
                <Button
                  key={dow}
                  type="button" size="sm" variant={weekdays.includes(dow) ? "default" : "outline"}
                  className="h-8 w-10 px-0"
                  onClick={() => toggleDay(dow)}
                >
                  {dowLabel(dow)}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t("arrival_rules.weekdays_hint")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button" size="sm"
              variant={noArrival ? "default" : "outline"}
              className={cn("flex-1", noArrival && "bg-destructive hover:bg-destructive/90")}
              onClick={() => setNoArrival((v) => !v)}
            >
              <LogIn className="h-3.5 w-3.5" />{t("arrival_rules.no_arrival")}
            </Button>
            <Button
              type="button" size="sm"
              variant={noDeparture ? "default" : "outline"}
              className={cn("flex-1", noDeparture && "bg-destructive hover:bg-destructive/90")}
              onClick={() => setNoDeparture((v) => !v)}
            >
              <LogOut className="h-3.5 w-3.5" />{t("arrival_rules.no_departure")}
            </Button>
          </div>
          {!noArrival && !noDeparture && (
            <p className="text-xs text-destructive">{t("arrival_rules.need_one")}</p>
          )}
          <Button className="w-full" disabled={createRule.isPending || !valid} onClick={onCreate}>
            {t("arrival_rules.add")}
          </Button>
        </div>

        {/* listă restricții existente */}
        {rulesQuery.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("arrival_rules.empty")}</p>
        ) : (
          <div className="space-y-1.5">
            {rules.map((r) => (
              <ArrivalRuleRow
                key={r.id}
                rule={r}
                scopeLabel={typeName(r.unit_type_id)}
                deleting={deleteRule.isPending}
                onDelete={() => setDeleteId(r.id)}
              />
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
          description={t("arrival_rules.delete_confirm")}
          confirmLabel={t("common.delete")}
          destructive
          onConfirm={() => deleteId && onDelete(deleteId)}
        />
      </DialogContent>
    </Dialog>
  )
}
