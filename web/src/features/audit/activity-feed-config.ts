import { BOOKING_EVENT_LABEL, BOOKING_FIELDS } from "@/features/bookings/booking-fields"
import { UNIT_EVENT_LABEL, UNIT_FIELDS } from "@/features/unit-types/unit-fields"
import { UNIT_TYPE_EVENT_LABEL, TYPE_FIELDS } from "@/features/unit-types/unit-type-fields"
import { PROPERTY_EVENT_LABEL, PROPERTY_FIELDS } from "@/features/properties/property-fields"
import { GUEST_EVENT_LABEL, GUEST_FIELDS } from "@/features/guests/guest-fields"
import { PAYMENT_EVENT_LABEL, PAYMENT_FIELDS } from "@/features/payments/payment-fields"
import { RATE_RULE_EVENT_LABEL, RATE_RULE_FIELDS } from "@/features/pricing/rate-rule-fields"
import { PROMOTION_EVENT_LABEL, PROMOTION_FIELDS } from "@/features/promotions/promotion-fields"
import {
  ARRIVAL_RULE_EVENT_LABEL, ARRIVAL_RULE_FIELDS,
  CLOSURE_EVENT_LABEL, CLOSURE_FIELDS,
  STAY_RULE_EVENT_LABEL, STAY_RULE_FIELDS,
} from "@/features/reservation-rules/rule-fields"
import { SITE_EVENT_LABEL, SITE_FIELDS } from "@/features/site-builder/site-fields"
import type { EventFieldRegistry } from "@/features/bookings/event-diff"
import type { TranslationKey } from "@/lib/i18n"

type EntityConfig = {
  entityLabel: TranslationKey
  eventLabels: Record<string, TranslationKey>
  fields: EventFieldRegistry
}

// Sursă unică pentru feed-ul de Activitate — o intrare nouă aici expune automat
// entitatea în feed-ul global, reutilizând registrele deja definite per entitate
// (niciun fișier nou, doar referință la ce există deja).
export const ACTIVITY_FEED_CONFIG: Record<string, EntityConfig> = {
  booking: { entityLabel: "entity.booking", eventLabels: BOOKING_EVENT_LABEL, fields: BOOKING_FIELDS },
  unit: { entityLabel: "entity.unit", eventLabels: UNIT_EVENT_LABEL, fields: UNIT_FIELDS },
  unit_type: { entityLabel: "entity.unit_type", eventLabels: UNIT_TYPE_EVENT_LABEL, fields: TYPE_FIELDS },
  property: { entityLabel: "entity.property", eventLabels: PROPERTY_EVENT_LABEL, fields: PROPERTY_FIELDS },
  guest: { entityLabel: "entity.guest", eventLabels: GUEST_EVENT_LABEL, fields: GUEST_FIELDS },
  payment: { entityLabel: "entity.payment", eventLabels: PAYMENT_EVENT_LABEL, fields: PAYMENT_FIELDS },
  rate_rule: { entityLabel: "entity.rate_rule", eventLabels: RATE_RULE_EVENT_LABEL, fields: RATE_RULE_FIELDS },
  promotion: { entityLabel: "entity.promotion", eventLabels: PROMOTION_EVENT_LABEL, fields: PROMOTION_FIELDS },
  stay_rule: { entityLabel: "entity.stay_rule", eventLabels: STAY_RULE_EVENT_LABEL, fields: STAY_RULE_FIELDS },
  arrival_rule: { entityLabel: "entity.arrival_rule", eventLabels: ARRIVAL_RULE_EVENT_LABEL, fields: ARRIVAL_RULE_FIELDS },
  closure: { entityLabel: "entity.closure", eventLabels: CLOSURE_EVENT_LABEL, fields: CLOSURE_FIELDS },
  property_site: { entityLabel: "entity.property_site", eventLabels: SITE_EVENT_LABEL, fields: SITE_FIELDS },
}

export const ACTIVITY_ENTITY_TYPES = Object.keys(ACTIVITY_FEED_CONFIG)

// Tipurile de eveniment disponibile pentru filtrul „Eveniment" — uniunea
// evenimentelor entităților selectate (sau ale tuturor, dacă nu e ales niciun tip).
export function availableEventTypes(entityTypes: string[]): string[] {
  const types = entityTypes.length > 0 ? entityTypes : ACTIVITY_ENTITY_TYPES
  const set = new Set<string>()
  for (const type of types) {
    for (const eventType of Object.keys(ACTIVITY_FEED_CONFIG[type]?.eventLabels ?? {})) {
      set.add(eventType)
    }
  }
  return [...set]
}
