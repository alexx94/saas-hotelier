import { Badge } from "@/components/ui/badge"
import { t } from "@/lib/i18n"
import type { TranslationKey } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { BookingStatus } from "./api"

export const statusColors: Record<BookingStatus, string> = {
  pending: "bg-amber-100 text-amber-900 border-amber-300",
  confirmed: "bg-emerald-100 text-emerald-900 border-emerald-300",
  cancelled: "bg-gray-100 text-gray-500 border-gray-300",
  checked_in: "bg-blue-100 text-blue-900 border-blue-300",
  checked_out: "bg-slate-100 text-slate-600 border-slate-300",
  no_show: "bg-gray-100 text-gray-500 border-gray-300",
  blocked: "bg-zinc-200 text-zinc-700 border-zinc-400",
}

export function statusLabel(status: BookingStatus): string {
  return t(`status.${status}` as TranslationKey)
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <Badge variant="outline" className={cn(statusColors[status])}>
      {statusLabel(status)}
    </Badge>
  )
}
