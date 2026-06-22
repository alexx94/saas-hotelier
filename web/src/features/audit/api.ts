import { supabase } from "@/lib/supabase"
import type { Database, Tables } from "@/lib/database.types"
import { pageRange, toPage, type Page } from "@/lib/pagination"

export type EntityEvent = Tables<"entity_events">
// get_activity_feed întoarce un actor_name suplimentar (rezolvat server-side
// prin JOIN pe profiles), absent din entity_events — de aceea tipul propriu RPC.
export type ActivityFeedItem =
  Database["public"]["Functions"]["get_activity_feed"]["Returns"][number]

// Istoricurile cresc nelimitat în timp — se aduc paginat, ca la unit_events/booking_events.
export const EVENTS_PAGE_SIZE = 15
export const ACTIVITY_FEED_PAGE_SIZE = 20

export async function fetchEntityEvents(
  entityType: string,
  entityId: string,
  page: number
): Promise<Page<EntityEvent>> {
  const [from, to] = pageRange(page, EVENTS_PAGE_SIZE)
  const { data, error } = await supabase
    .from("entity_events")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to)
  if (error) throw error
  return toPage(data, EVENTS_PAGE_SIZE)
}

// Filtre opționale — împinse direct în RPC (vezi get_activity_feed: fiecare
// filtru e aplicat în interiorul fiecărei ramuri UNION, pe coloana indexată a
// tabelului sursă, nu pe rezultatul deja agregat).
export type ActivityFeedFilters = {
  entityTypes?: string[]
  eventTypes?: string[]
  dateFrom?: string // ISO
  dateTo?: string // ISO
}

// Feed unificat per proprietate (entity_events + booking_events + unit_events +
// unit_type_events) — vine din RPC, nu dintr-un tabel, deci paginarea e prin
// limit/offset în loc de .range().
export async function fetchActivityFeed(
  propertyId: string,
  page: number,
  filters: ActivityFeedFilters = {}
): Promise<Page<ActivityFeedItem>> {
  const [from] = pageRange(page, ACTIVITY_FEED_PAGE_SIZE)
  const { data, error } = await supabase.rpc("get_activity_feed", {
    p_property_id: propertyId,
    p_limit: ACTIVITY_FEED_PAGE_SIZE + 1,
    p_offset: from,
    p_entity_types: filters.entityTypes?.length ? filters.entityTypes : undefined,
    p_event_types: filters.eventTypes?.length ? filters.eventTypes : undefined,
    p_date_from: filters.dateFrom,
    p_date_to: filters.dateTo,
  })
  if (error) throw error
  return toPage(data ?? [], ACTIVITY_FEED_PAGE_SIZE)
}
