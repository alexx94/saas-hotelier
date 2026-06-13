import { t, type TranslationKey } from "@/lib/i18n"
import type { BlockReason } from "./api"

export const BLOCK_REASON_LABEL: Record<BlockReason, TranslationKey> = {
  maintenance: "blocks.reason.maintenance",
  renovation: "blocks.reason.renovation",
  owner_use: "blocks.reason.owner_use",
  internal_use: "blocks.reason.internal_use",
  other: "blocks.reason.other",
}

export function blockReasonLabel(reason: string | null): string {
  const key = BLOCK_REASON_LABEL[(reason ?? "other") as BlockReason]
  return key ? t(key) : String(reason)
}

// Culori distincte per motiv pentru barele din calendar (border + fundal + text).
// Hașura (dungile) vine din BLOCK_STRIPES — împreună disting blocajele de cazări.
export const BLOCK_REASON_CALENDAR_CLASS: Record<BlockReason, string> = {
  maintenance: "border-amber-400 bg-amber-100 text-amber-900",
  renovation: "border-violet-400 bg-violet-100 text-violet-900",
  owner_use: "border-sky-400 bg-sky-100 text-sky-900",
  internal_use: "border-teal-400 bg-teal-100 text-teal-900",
  other: "border-zinc-400 bg-zinc-100 text-zinc-700",
}

// Suprapunere de dungi albe semi-transparente — efect hașurat peste barele colorate
export const BLOCK_STRIPES =
  "repeating-linear-gradient(45deg, rgba(255,255,255,0.5), rgba(255,255,255,0.5) 5px, transparent 5px, transparent 10px)"

// Hașura camerelor indisponibile (status non-activ) — pe tokens de temă:
// culoarea derivă din --muted-foreground, deci urmează automat tema (light/dark).
export const UNAVAILABLE_STRIPES =
  "repeating-linear-gradient(45deg, color-mix(in oklab, var(--muted-foreground) 16%, transparent), color-mix(in oklab, var(--muted-foreground) 16%, transparent) 5px, transparent 5px, transparent 10px)"

export function blockCalendarClass(reason: string | null): string {
  return BLOCK_REASON_CALENDAR_CLASS[(reason ?? "other") as BlockReason]
    ?? BLOCK_REASON_CALENDAR_CLASS.other
}
