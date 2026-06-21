import type { EventFieldRegistry } from "@/features/bookings/event-diff"
import type { TranslationKey } from "@/lib/i18n"

export const GUEST_EVENT_LABEL: Record<string, TranslationKey> = {
  created: "guest.event.created",
  updated: "guest.event.updated",
  deleted: "guest.event.deleted",
}

// Câmp nou auditat în app.audit_entity('guest', ...) = o intrare nouă aici.
export const GUEST_FIELDS: EventFieldRegistry = {
  full_name: { label: "guests.full_name" },
  email: { label: "auth.email" },
  phone: { label: "guests.phone" },
  notes: { label: "guests.notes" },
}
