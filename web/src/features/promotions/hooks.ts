import {
  useInfiniteQuery, useMutation, useQueryClient,
} from "@tanstack/react-query"
import type { TablesInsert, TablesUpdate } from "@/lib/database.types"
import {
  createPromotion, deletePromotion, fetchPromotions, updatePromotion,
  updatePromotionWithRules, type RuleType,
} from "./api"

export const promotionKeys = {
  list: (propertyId: string) => ["promotions", propertyId] as const,
}

// Liste paginate „Afișează mai mult" (rândul în plus din Page.hasMore decide pagina următoare)
export function usePromotions(propertyId: string | null) {
  return useInfiniteQuery({
    queryKey: promotionKeys.list(propertyId ?? ""),
    queryFn: ({ pageParam }) => fetchPromotions(propertyId!, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length : undefined),
    enabled: !!propertyId,
  })
}

// Schimbările de promoții afectează listele + estimările de preț (quote include promoția).
function invalidatePromotions(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["promotions"] })
  qc.invalidateQueries({ queryKey: ["price-quote"] })
}

export function useCreatePromotion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ promotion, rules }: {
      promotion: TablesInsert<"promotions">
      rules: { rule_type: RuleType; value: number }[]
    }) => createPromotion(promotion, rules),
    onSuccess: () => invalidatePromotions(qc),
  })
}

export function useUpdatePromotion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TablesUpdate<"promotions"> }) =>
      updatePromotion(id, patch),
    onSuccess: () => invalidatePromotions(qc),
  })
}

export function useUpdatePromotionWithRules() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch, rules }: {
      id: string
      patch: TablesUpdate<"promotions">
      rules: { rule_type: RuleType; value: number }[]
    }) => updatePromotionWithRules(id, patch, rules),
    onSuccess: () => invalidatePromotions(qc),
  })
}

export function useDeletePromotion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deletePromotion(id),
    onSuccess: () => invalidatePromotions(qc),
  })
}
