import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { t } from "@/lib/i18n"

export function PaginationControls({
  hasPrev,
  hasNext,
  onPrev,
  onNext,
}: {
  hasPrev: boolean
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
}) {
  if (!hasPrev && !hasNext) return null
  return (
    <div className="flex items-center justify-end gap-2">
      <Button variant="outline" size="sm" disabled={!hasPrev} onClick={onPrev}>
        <ChevronLeft className="h-4 w-4" />
        {t("common.prev_page")}
      </Button>
      <Button variant="outline" size="sm" disabled={!hasNext} onClick={onNext}>
        {t("common.next_page")}
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
