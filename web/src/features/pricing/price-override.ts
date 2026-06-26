import type { PriceNight, PriceQuote } from "./api"

// Moduri de override manual al prețului (doar roluri cu booking.price_override).
export type PriceOverrideKind = "total" | "adjustment" | "per_night"

export type PriceOverride = {
  kind: PriceOverrideKind
  // total absolut (kind='total') SAU delta cu semn (kind='adjustment', − reducere / + adaos);
  // null pentru per_night (breakdown-ul cară valorile)
  value?: number | null
  nights?: { date: string; rate: number }[] // doar pentru per_night
  note?: string | null
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

// Oglindă EXACTĂ a app.apply_price_override (SQL, migrația 20260626120000) — preview
// instant client-side; serverul recalculează autoritar la salvare (vezi TEST 108/109).
// Orice schimbare de algoritm se face în AMBELE locuri simultan.
export function applyPriceOverridePreview(base: PriceQuote, ov: PriceOverride): PriceQuote {
  const baseNights = base.nights
  const n = baseNights.length
  // baza = prețul motorului (subtotal, înainte de promo); override-ul înlocuiește promo
  const baseTotal = base.subtotal ?? base.total
  let nights: PriceNight[]
  let total: number

  if (ov.kind === "per_night") {
    const map = new Map((ov.nights ?? []).map((x) => [x.date, x.rate]))
    nights = baseNights.map((nt) => ({ ...nt, rate: round2(map.get(nt.date) ?? nt.rate), manual: true }))
    total = round2(nights.reduce((s, nt) => s + nt.rate, 0))
  } else {
    const target =
      ov.kind === "total" ? round2(ov.value ?? 0) : round2(baseTotal + (ov.value ?? 0))
    nights = baseNights.map((nt) => ({
      ...nt,
      rate: baseTotal > 0 ? round2((nt.rate * target) / baseTotal) : round2(target / n),
      manual: true,
    }))
    const sum = round2(nights.reduce((s, nt) => s + nt.rate, 0))
    if (sum !== target && n > 0) {
      nights[n - 1] = { ...nights[n - 1], rate: round2(nights[n - 1].rate + (target - sum)) }
    }
    total = target
  }

  return {
    ...base,
    nights,
    subtotal: total,
    total,
    discount: 0,
    promotion: undefined,
    avg_nightly: n > 0 ? round2(total / n) : 0,
    override: { kind: ov.kind, value: ov.value ?? null },
  }
}

// Argumente pentru RPC-uri (create_booking / override_booking_price). Pentru per_night,
// `value` e null și `nights` cară valorile; pentru total/adjustment invers.
export function overrideRpcArgs(ov: PriceOverride | null) {
  if (!ov) return { kind: null, value: null, nights: null, note: null }
  return {
    kind: ov.kind,
    value: ov.kind === "per_night" ? null : ov.value ?? 0,
    nights: ov.kind === "per_night" ? ov.nights ?? [] : null,
    note: ov.note?.trim() || null,
  }
}
