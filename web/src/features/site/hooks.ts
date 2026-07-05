import { useQuery } from "@tanstack/react-query"
import { fetchPublicSite } from "./api"

export const siteKeys = {
  all: ["public-site"] as const,
  bySlug: (slug: string) => ["public-site", slug] as const,
}

export function usePublicSite(slug: string) {
  return useQuery({
    queryKey: siteKeys.bySlug(slug),
    queryFn: () => fetchPublicSite(slug),
    enabled: !!slug,
    retry: false,
  })
}
