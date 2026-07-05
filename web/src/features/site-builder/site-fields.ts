import type { EventFieldRegistry } from "@/features/bookings/event-diff"
import { resolveSiteTheme } from "@/features/site/themes"
import { SITE_PALETTE_META, SITE_TEMPLATE_META } from "./themes"
import { t, type TranslationKey } from "@/lib/i18n"

export const SITE_EVENT_LABEL: Record<string, TranslationKey> = {
  created: "site_builder.event.created",
  updated: "site_builder.event.updated",
  archived: "site_builder.event.archived",
  restored: "site_builder.event.restored",
  deleted: "site_builder.event.deleted",
}

/** „NumeTemplate · NumePaletă" pentru valoarea compusă `theme` din istoric (audit). */
function formatTheme(value: unknown): string {
  if (typeof value !== "string" || !value) return String(value ?? "")
  const { template, palette } = resolveSiteTheme(value)
  const templateMeta = SITE_TEMPLATE_META[template]
  const paletteMeta = SITE_PALETTE_META[template][palette]
  if (!templateMeta || !paletteMeta) return value
  return `${t(templateMeta.nameKey)} · ${t(paletteMeta.nameKey)}`
}

// Câmp nou auditat în app.audit_entity('property_site', ...) = o intrare nouă aici.
export const SITE_FIELDS: EventFieldRegistry = {
  slug: { label: "site_builder.field.slug" },
  theme: { label: "site_builder.field.theme", format: formatTheme },
  is_enabled: {
    label: "site_builder.field.is_enabled",
    format: (v) => (v ? t("common.yes") : t("common.no")),
  },
  contact_phone: { label: "site_builder.field.contact_phone" },
  contact_email: { label: "site_builder.field.contact_email" },
  map_embed_url: { label: "site_builder.field.map_embed_url" },
}
