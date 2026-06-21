import { format } from "date-fns"
import { unitStatusLabel } from "./unit-status"
import { blockReasonLabel } from "./block-reason"
import type { EventFieldRegistry } from "@/features/bookings/event-diff"
import type { TranslationKey } from "@/lib/i18n"

export const UNIT_EVENT_LABEL: Record<string, TranslationKey> = {
  created: "unit.event.created",
  status_changed: "unit.event.status_changed",
  renamed: "unit.event.renamed",
  block_created: "unit.event.block_created",
  block_updated: "unit.event.block_updated",
  block_removed: "unit.event.block_removed",
}

const fmtDate = (v: unknown) => format(new Date(String(v)), "dd.MM.yyyy")

export const UNIT_FIELDS: EventFieldRegistry = {
  name: { label: "common.name" },
  status: { label: "unit.status_label", format: (v) => unitStatusLabel(String(v)) },
  block_start: { label: "blocks.start", format: fmtDate },
  block_end: { label: "blocks.end", format: fmtDate },
  block_reason: { label: "blocks.reason", format: (v) => blockReasonLabel(String(v)) },
}
