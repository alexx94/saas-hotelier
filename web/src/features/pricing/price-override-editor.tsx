import { useState } from "react"
import { Pencil, Minus, Plus } from "lucide-react"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { PriceQuote } from "./api"
import type { PriceOverride, PriceOverrideKind } from "./price-override"

// Editor reutilizabil de override manual al prețului (creare + editare rezervare).
// Primește quote-ul motorului (base, fără override) pentru valori implicite + preview-ul
// se calculează în părinte cu applyPriceOverridePreview. Emite PriceOverride | null.

type EditorState = {
  enabled: boolean
  mode: PriceOverrideKind
  total: string
  adjSign: "-" | "+"
  adjAmount: string
  perNight: Record<string, string>
  note: string
}

const MODES: PriceOverrideKind[] = ["total", "adjustment", "per_night"]

function initialState(base: PriceQuote, value: PriceOverride | null): EditorState {
  return {
    enabled: !!value,
    mode: value?.kind ?? "total",
    total: String(value?.kind === "total" ? value.value ?? base.subtotal : base.subtotal ?? base.total),
    adjSign: value?.kind === "adjustment" && (value.value ?? 0) < 0 ? "-" : value?.kind === "adjustment" ? "+" : "-",
    adjAmount: value?.kind === "adjustment" ? String(Math.abs(value.value ?? 0)) : "",
    perNight: Object.fromEntries(
      base.nights.map((n) => {
        const fromValue =
          value?.kind === "per_night" ? value.nights?.find((x) => x.date === n.date)?.rate : undefined
        return [n.date, String(fromValue ?? n.rate)]
      })
    ),
    note: value?.note ?? "",
  }
}

function toOverride(base: PriceQuote, st: EditorState): PriceOverride | null {
  if (!st.enabled) return null
  const note = st.note.trim() || null
  if (st.mode === "total") {
    return { kind: "total", value: Number(st.total) || 0, note }
  }
  if (st.mode === "adjustment") {
    const amt = Math.abs(Number(st.adjAmount) || 0)
    return { kind: "adjustment", value: st.adjSign === "-" ? -amt : amt, note }
  }
  return {
    kind: "per_night",
    nights: base.nights.map((n) => ({ date: n.date, rate: Number(st.perNight[n.date] ?? n.rate) || 0 })),
    note,
  }
}

export function PriceOverrideEditor({
  base,
  currency,
  value,
  onChange,
}: {
  base: PriceQuote
  currency: string
  value: PriceOverride | null
  onChange: (ov: PriceOverride | null) => void
}) {
  const [st, setSt] = useState<EditorState>(() => initialState(base, value))

  // o singură funcție de update care setează state-ul ȘI emite override-ul derivat
  function apply(patch: Partial<EditorState>) {
    const next = { ...st, ...patch }
    setSt(next)
    onChange(toOverride(base, next))
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <button
        type="button"
        onClick={() => apply({ enabled: !st.enabled })}
        className={cn(
          "flex w-full items-center gap-2 text-left text-sm",
          st.enabled ? "font-medium text-foreground" : "text-muted-foreground"
        )}
      >
        <Pencil className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium">{t("pricing.override.title")}</span>
        <span className="ml-auto text-xs font-semibold">{st.enabled ? "ON" : "OFF"}</span>
      </button>

      {st.enabled && (
        <div className="space-y-3 pt-1">
          {/* selector mod */}
          <div className="flex gap-1">
            {MODES.map((m) => (
              <Button
                key={m}
                type="button" size="sm"
                variant={st.mode === m ? "default" : "outline"}
                className="h-8 flex-1 text-xs"
                onClick={() => apply({ mode: m })}
              >
                {t(`pricing.override.mode.${m}`)}
              </Button>
            ))}
          </div>

          {st.mode === "total" && (
            <div className="space-y-1">
              <Label className="text-xs">{t("pricing.override.total_label")}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number" min="0" step="0.01" inputMode="decimal"
                  value={st.total}
                  onChange={(e) => apply({ total: e.target.value })}
                />
                <span className="text-sm text-muted-foreground">{currency}</span>
              </div>
            </div>
          )}

          {st.mode === "adjustment" && (
            <div className="space-y-1">
              <Label className="text-xs">{t("pricing.override.adjust_label")}</Label>
              <div className="flex items-center gap-2">
                <div className="flex">
                  <Button
                    type="button" size="sm"
                    variant={st.adjSign === "-" ? "default" : "outline"}
                    className="h-9 rounded-r-none px-2"
                    onClick={() => apply({ adjSign: "-" })}
                    title={t("pricing.override.discount")}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button" size="sm"
                    variant={st.adjSign === "+" ? "default" : "outline"}
                    className="h-9 rounded-l-none px-2"
                    onClick={() => apply({ adjSign: "+" })}
                    title={t("pricing.override.surcharge")}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Input
                  type="number" min="0" step="0.01" inputMode="decimal"
                  value={st.adjAmount}
                  onChange={(e) => apply({ adjAmount: e.target.value })}
                />
                <span className="text-sm text-muted-foreground">{currency}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {st.adjSign === "-" ? t("pricing.override.discount") : t("pricing.override.surcharge")}
              </p>
            </div>
          )}

          {st.mode === "per_night" && (
            <div className="space-y-1.5">
              <Label className="text-xs">{t("pricing.override.per_night_label")}</Label>
              <div className="max-h-44 space-y-1 overflow-y-auto">
                {base.nights.map((n) => (
                  <div key={n.date} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 text-xs text-muted-foreground">{n.date}</span>
                    <Input
                      type="number" min="0" step="0.01" inputMode="decimal"
                      className="h-8"
                      value={st.perNight[n.date] ?? String(n.rate)}
                      onChange={(e) => apply({ perNight: { ...st.perNight, [n.date]: e.target.value } })}
                    />
                    <span className="text-xs text-muted-foreground">{currency}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">{t("pricing.override.note_label")}</Label>
            <Input
              value={st.note}
              placeholder={t("pricing.override.note_placeholder")}
              onChange={(e) => apply({ note: e.target.value })}
            />
          </div>

          <p className="text-xs text-muted-foreground">{t("pricing.override.replaces_promo")}</p>
        </div>
      )}
    </div>
  )
}
