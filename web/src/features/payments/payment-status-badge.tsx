import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { PaymentStatus } from "./api"
import { paymentStatusColors, paymentStatusLabel } from "./payment-status"

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge variant="outline" className={cn(paymentStatusColors[status])}>
      {paymentStatusLabel(status)}
    </Badge>
  )
}
