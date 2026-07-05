import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { TablesUpdate } from "@/lib/database.types"
import {
  checkSlugAvailable, createPropertySite, deleteSitePhoto, fetchPropertySite, fetchSitePhotos,
  isSiteSlugValid, reorderSitePhotos, updatePropertySite, updateSitePhoto, uploadSitePhoto,
  type SitePhoto,
} from "./api"

export const siteBuilderKeys = {
  site: (propertyId: string) => ["property-site", propertyId] as const,
  photos: (propertyId: string) => ["site-photos", propertyId] as const,
  slugCheck: (slug: string) => ["site-slug-check", slug] as const,
}

export function usePropertySite(propertyId: string) {
  return useQuery({
    queryKey: siteBuilderKeys.site(propertyId),
    queryFn: () => fetchPropertySite(propertyId),
  })
}

// Verificare disponibilitate live — activă doar când slug-ul e valid sintactic
// (fără round-trip pentru fiecare tastă apăsată pe un slug incomplet).
export function useSlugAvailability(slug: string) {
  return useQuery({
    queryKey: siteBuilderKeys.slugCheck(slug),
    queryFn: () => checkSlugAvailable(slug),
    enabled: isSiteSlugValid(slug),
    staleTime: 0,
  })
}

export function useCreatePropertySite(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ orgId, slug }: { orgId: string; slug: string }) =>
      createPropertySite({ propertyId, orgId, slug }),
    onSuccess: (site) => qc.setQueryData(siteBuilderKeys.site(propertyId), site),
  })
}

export function useUpdatePropertySite(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TablesUpdate<"property_sites"> }) =>
      updatePropertySite(id, patch),
    onSuccess: (site) => qc.setQueryData(siteBuilderKeys.site(propertyId), site),
  })
}

export function useSitePhotos(propertyId: string) {
  return useQuery({
    queryKey: siteBuilderKeys.photos(propertyId),
    queryFn: () => fetchSitePhotos(propertyId),
  })
}

export function useUploadSitePhoto(propertyId: string, orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => uploadSitePhoto(propertyId, orgId, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: siteBuilderKeys.photos(propertyId) }),
  })
}

export function useUpdateSitePhoto(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TablesUpdate<"site_photos"> }) =>
      updateSitePhoto(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: siteBuilderKeys.photos(propertyId) }),
  })
}

// Optimist: reordonarea trebuie să simtă instant la drop, fără să aștepte round-trip-ul.
export function useReorderSitePhotos(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (items: { id: string; sort_order: number }[]) => reorderSitePhotos(items),
    onMutate: async (items) => {
      await qc.cancelQueries({ queryKey: siteBuilderKeys.photos(propertyId) })
      const previous = qc.getQueryData<SitePhoto[]>(siteBuilderKeys.photos(propertyId))
      if (previous) {
        const order = new Map(items.map((i) => [i.id, i.sort_order]))
        const next = previous
          .map((p) => (order.has(p.id) ? { ...p, sort_order: order.get(p.id)! } : p))
          .sort((a, b) => a.sort_order - b.sort_order)
        qc.setQueryData(siteBuilderKeys.photos(propertyId), next)
      }
      return { previous }
    },
    onError: (_err, _items, context) => {
      if (context?.previous) qc.setQueryData(siteBuilderKeys.photos(propertyId), context.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: siteBuilderKeys.photos(propertyId) }),
  })
}

export function useDeleteSitePhoto(propertyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (photo: SitePhoto) => deleteSitePhoto(photo),
    onSuccess: () => qc.invalidateQueries({ queryKey: siteBuilderKeys.photos(propertyId) }),
  })
}
