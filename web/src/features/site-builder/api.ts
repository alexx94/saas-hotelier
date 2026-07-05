import { z } from "zod"
import { supabase } from "@/lib/supabase"
import { slugify as baseSlugify } from "@/lib/slugify"
import type { Tables, TablesUpdate } from "@/lib/database.types"

// ─── content jsonb: oglinda Zod a contractului din migrația 20260705120000 ───
// `.catch()` pe fiecare nivel = tolerant la jsonb parțial/vechi (o secțiune
// lipsă sau malformată nu crapă UI-ul, cade pe default-uri sigure).

const serviceItemSchema = z.object({
  icon: z.string().catch("wifi"),
  title: z.string().catch(""),
  description: z.string().catch(""),
})

export const siteContentSchema = z.object({
  hero: z.object({
    title: z.string().nullable().catch(null),
    subtitle: z.string().nullable().catch(null),
  }).catch({ title: null, subtitle: null }),
  about: z.object({
    enabled: z.boolean().catch(true),
    text: z.string().nullable().catch(null),
  }).catch({ enabled: true, text: null }),
  rooms_teaser: z.object({
    enabled: z.boolean().catch(true),
    count: z.number().int().min(2).max(4).catch(2),
  }).catch({ enabled: true, count: 2 }),
  services: z.object({
    enabled: z.boolean().catch(true),
    items: z.array(serviceItemSchema).catch([]),
  }).catch({ enabled: true, items: [] }),
  map: z.object({
    enabled: z.boolean().catch(true),
  }).catch({ enabled: true }),
  contact: z.object({
    enabled: z.boolean().catch(true),
  }).catch({ enabled: true }),
  pages: z.object({
    rooms: z.boolean().catch(true),
    book: z.boolean().catch(true),
  }).catch({ rooms: true, book: true }),
}).catch({
  hero: { title: null, subtitle: null },
  about: { enabled: true, text: null },
  rooms_teaser: { enabled: true, count: 2 },
  services: { enabled: true, items: [] },
  map: { enabled: true },
  contact: { enabled: true },
  pages: { rooms: true, book: true },
})

export type SiteContent = z.infer<typeof siteContentSchema>
export type ServiceItem = z.infer<typeof serviceItemSchema>

export function parseSiteContent(raw: unknown): SiteContent {
  return siteContentSchema.parse(raw)
}

export const DEFAULT_SITE_CONTENT: SiteContent = siteContentSchema.parse({})

// ─── tipuri ───

export type PropertySite = Tables<"property_sites">
export type SitePhoto = Tables<"site_photos">

// ─── slug: format + disponibilitate ───

// Oglindă a CHECK-ului din migrație: lowercase, 3–63 caractere, fără cratimă la capete.
export const SITE_SLUG_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/
export const SITE_SLUG_RESERVED = [
  "www", "app", "api", "admin", "mail", "ftp", "site", "my-site",
  "pms", "static", "cdn", "assets",
]

export function isSiteSlugValid(slug: string): boolean {
  return (
    slug.length >= 3 &&
    slug.length <= 63 &&
    SITE_SLUG_REGEX.test(slug) &&
    !SITE_SLUG_RESERVED.includes(slug)
  )
}

// Sugestie inițială din numele proprietății: reutilizează slugify-ul generic,
// apoi ajustează la constrângerile stricte de label DNS (3–63, fără cratimă la capăt).
export function slugify(name: string): string {
  let slug = baseSlugify(name).slice(0, 63).replace(/-+$/, "")
  if (slug.length < 3) slug = `${slug}-site`.slice(0, 63)
  return slug
}

export async function checkSlugAvailable(slug: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_site_slug_available", { p_slug: slug })
  if (error) throw error
  return data
}

// ─── map embed: acceptă fie URL-ul, fie tot <iframe>-ul lipit din Google Maps ───

export function extractMapEmbedSrc(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const iframeMatch = trimmed.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i)
  const candidate = iframeMatch ? iframeMatch[1] : trimmed
  return candidate.startsWith("https://www.google.com/maps/embed") ? candidate : null
}

// ─── property_sites CRUD ───

export async function fetchPropertySite(propertyId: string): Promise<PropertySite | null> {
  const { data, error } = await supabase
    .from("property_sites")
    .select("*")
    .eq("property_id", propertyId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createPropertySite({
  propertyId, orgId, slug,
}: { propertyId: string; orgId: string; slug: string }): Promise<PropertySite> {
  const { data, error } = await supabase
    .from("property_sites")
    .insert({ property_id: propertyId, org_id: orgId, slug })
    .select("*")
    .single()
  if (error) throw error
  return data
}

export async function updatePropertySite(
  id: string,
  patch: TablesUpdate<"property_sites">
): Promise<PropertySite> {
  const { data, error } = await supabase
    .from("property_sites")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single()
  if (error) throw error
  return data
}

// `true` dacă slug-ul dorit e deja folosit de alt site (index unic global).
export function isDuplicateSlugError(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === "23505"
}

// ─── site_photos CRUD ───

const SITE_PHOTOS_BUCKET = "site-photos"
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"]

export async function fetchSitePhotos(propertyId: string): Promise<SitePhoto[]> {
  const { data, error } = await supabase
    .from("site_photos")
    .select("*")
    .eq("property_id", propertyId)
    .order("sort_order")
    .order("created_at")
  if (error) throw error
  return data
}

export function sitePhotoUrl(storagePath: string): string {
  return supabase.storage.from(SITE_PHOTOS_BUCKET).getPublicUrl(storagePath).data.publicUrl
}

export class InvalidPhotoError extends Error {}

export async function uploadSitePhoto(
  propertyId: string,
  orgId: string,
  file: File
): Promise<SitePhoto> {
  if (file.size > MAX_PHOTO_BYTES) {
    throw new InvalidPhotoError("site_photos.too_large")
  }
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
    throw new InvalidPhotoError("site_photos.invalid_type")
  }

  const existing = await fetchSitePhotos(propertyId)
  const nextSortOrder = existing.reduce((max, p) => Math.max(max, p.sort_order), -1) + 1

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg"
  const path = `${propertyId}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(SITE_PHOTOS_BUCKET)
    .upload(path, file, { contentType: file.type })
  if (uploadError) throw uploadError

  const { data, error: insertError } = await supabase
    .from("site_photos")
    .insert({
      property_id: propertyId,
      org_id: orgId,
      storage_path: path,
      sort_order: nextSortOrder,
    })
    .select("*")
    .single()

  if (insertError) {
    // fără orfani: dacă insert-ul eșuează, ștergem obiectul deja urcat
    await supabase.storage.from(SITE_PHOTOS_BUCKET).remove([path])
    throw insertError
  }

  return data
}

export async function updateSitePhoto(
  id: string,
  patch: TablesUpdate<"site_photos">
): Promise<SitePhoto> {
  const { data, error } = await supabase
    .from("site_photos")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single()
  if (error) throw error
  return data
}

export async function reorderSitePhotos(
  items: { id: string; sort_order: number }[]
): Promise<void> {
  await Promise.all(
    items.map(async ({ id, sort_order }) => {
      const { error } = await supabase.from("site_photos").update({ sort_order }).eq("id", id)
      if (error) throw error
    })
  )
}

export async function deleteSitePhoto(photo: SitePhoto): Promise<void> {
  const { error } = await supabase.from("site_photos").delete().eq("id", photo.id)
  if (error) throw error
  await supabase.storage.from(SITE_PHOTOS_BUCKET).remove([photo.storage_path])
}
