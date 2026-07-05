import { z } from "zod"
import { supabase } from "@/lib/supabase"

// ─────────────────────────────────────────────────────────────────────────
// Site public per proprietate (Sprint 10 — Website Builder).
// Sursa de adevăr a contractului: docs/backend/rpc/sites.md +
// supabase/migrations/20260705120000_property_sites.sql (coloana `content`).
// ─────────────────────────────────────────────────────────────────────────

// Schema `content` e text liber de marketing, completat treptat din UI-ul
// PMS-ului (celălalt agent, `features/site-builder/api.ts` are aceeași
// schemă) — parsăm tolerant cu `.catch()`, ca site-ul public să nu crape pe
// un site creat înainte de un câmp nou sau pe jsonb parțial/malformat.
const serviceItemSchema = z.object({
  icon: z.string().catch("wifi"),
  title: z.string().catch(""),
  description: z.string().catch(""),
})

const siteContentSchema = z
  .object({
    hero: z
      .object({
        title: z.string().nullable().catch(null),
        subtitle: z.string().nullable().catch(null),
      })
      .catch({ title: null, subtitle: null }),
    about: z
      .object({
        enabled: z.boolean().catch(true),
        text: z.string().nullable().catch(null),
      })
      .catch({ enabled: true, text: null }),
    rooms_teaser: z
      .object({
        enabled: z.boolean().catch(true),
        count: z.number().int().min(2).max(4).catch(2),
      })
      .catch({ enabled: true, count: 2 }),
    services: z
      .object({
        enabled: z.boolean().catch(true),
        items: z.array(serviceItemSchema).catch([]),
      })
      .catch({ enabled: true, items: [] }),
    map: z.object({ enabled: z.boolean().catch(true) }).catch({ enabled: true }),
    contact: z.object({ enabled: z.boolean().catch(true) }).catch({ enabled: true }),
    pages: z
      .object({
        rooms: z.boolean().catch(true),
        book: z.boolean().catch(true),
      })
      .catch({ rooms: true, book: true }),
  })
  .catch({
    hero: { title: null, subtitle: null },
    about: { enabled: true, text: null },
    rooms_teaser: { enabled: true, count: 2 },
    services: { enabled: true, items: [] },
    map: { enabled: true },
    contact: { enabled: true },
    pages: { rooms: true, book: true },
  })

export type SiteContent = z.infer<typeof siteContentSchema>

export type SiteServiceItem = SiteContent["services"]["items"][number]

export type PublicSiteRecord = {
  slug: string
  theme: string
  contact_phone: string | null
  contact_email: string | null
  map_embed_url: string | null
  content: SiteContent
}

export type PublicSiteProperty = {
  name: string
  slug: string
  type: string
  description: Record<string, string> | null
  address: string | null
  city: string | null
  country: string
  currency: string
  default_locale: string
}

export type PublicSiteUnitType = {
  id: string
  name: string
  description: Record<string, string> | null
  max_adults: number
  max_children: number
  base_price: number
  min_stay: number
  sort_order: number
}

export type PublicSitePhoto = {
  id: string
  storage_path: string
  unit_type_id: string | null
  sort_order: number
  alt: string | null
}

export type PublicSite = {
  site: PublicSiteRecord
  property: PublicSiteProperty
  unit_types: PublicSiteUnitType[]
  photos: PublicSitePhoto[]
}

// Forma brută întoarsă de `public_get_site` (jsonb) — validăm/normalizăm doar
// `content` prin Zod; restul câmpurilor sunt construite explicit de RPC
// (nu expune coloane interne), deci le trecem direct.
type RawPublicSite = {
  site: Omit<PublicSiteRecord, "content"> & { content: unknown }
  property: PublicSiteProperty
  unit_types: PublicSiteUnitType[]
  photos: PublicSitePhoto[]
}

/**
 * Hidratează pagina publică `/s/{slug}` într-un singur round-trip.
 * `null` = site inexistent, dezactivat, sau proprietate nepublicată
 * (RPC-ul nu distinge motivul — tratat uniform ca 404 în UI).
 */
export async function fetchPublicSite(slug: string): Promise<PublicSite | null> {
  const { data, error } = await supabase.rpc("public_get_site", { p_slug: slug })
  if (error) throw error
  if (!data) return null

  const raw = data as unknown as RawPublicSite
  return {
    ...raw,
    site: {
      ...raw.site,
      content: siteContentSchema.parse(raw.site.content),
    },
  }
}

/** URL public (CDN Storage) pentru o poză a site-ului. Bucket public — fără semnare. */
export function sitePhotoUrl(storagePath: string): string {
  return supabase.storage.from("site-photos").getPublicUrl(storagePath).data.publicUrl
}

/** Pozele tag-uite pe un anumit tip de cameră, în ordinea de afișare. */
export function photosForUnitType(
  photos: PublicSitePhoto[],
  unitTypeId: string
): PublicSitePhoto[] {
  return photos
    .filter((p) => p.unit_type_id === unitTypeId)
    .sort((a, b) => a.sort_order - b.sort_order)
}

/** Pozele generale (fără tip de cameră asociat) — galerie/hero/about. */
export function generalPhotos(photos: PublicSitePhoto[]): PublicSitePhoto[] {
  return photos
    .filter((p) => p.unit_type_id === null)
    .sort((a, b) => a.sort_order - b.sort_order)
}

/** Prima poză generală după `sort_order` — candidat pentru hero-ul landing-ului. */
export function heroPhoto(photos: PublicSitePhoto[]): PublicSitePhoto | null {
  return generalPhotos(photos)[0] ?? null
}
