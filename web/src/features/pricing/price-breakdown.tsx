import { t } from "@/lib/i18n"
import { formatMoney } from "@/lib/money"
import { Badge } from "@/components/ui/badge"
import type { PriceQuote } from "./api"

function nightLabel(kind: string): string {
  if (kind === "season") return t("pricing.kind.season")
  if (kind === "override") return t("pricing.kind.override")
  return t("pricing.kind.base")
}

// Detaliul de preț per-noapte (override/sezon/base + marcaj weekend) + totalul.
// Reutilizat la estimarea rezervării și pe pagina rezervării (snapshot).
export function PriceBreakdown({ quote }: { quote: PriceQuote }) {
  const { currency, nights, total } = quote
  return (
    <div className="rounded-md border text-sm">
      <ul className="divide-y">
        {nights.map((n) => (
          <li key={n.date} className="flex items-center justify-between px-3 py-1.5">
            <span className="flex items-center gap-2 text-muted-foreground">
              {n.date}
              {n.kind !== "base" && (
                <Badge variant="outline" className="text-[10px]">{nightLabel(n.kind)}</Badge>
              )}
              {n.weekend && (
                <Badge variant="secondary" className="text-[10px]">{t("pricing.weekend_badge")}</Badge>
              )}
            </span>
            <span className="tabular-nums">{formatMoney(n.rate, currency)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t px-3 py-2 font-medium">
        <span>{t("pricing.nights_total")} · {nights.length} {t("bookings.nights")}</span>
        <span className="tabular-nums">{formatMoney(total, currency)}</span>
      </div>
    </div>
  )
}
