import { useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, Plus, Trash2, Undo2 } from "lucide-react"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { formatMoney } from "@/lib/money"
import { dedupeById } from "@/lib/pagination"
import { usePayments, useDeletePayment } from "./hooks"
import { paymentMethodLabel } from "./payment-status"
import { PaymentStatusBadge } from "./payment-status-badge"
import { RecordPaymentDialog } from "./record-payment-dialog"
import { Can } from "@/features/auth/can"
import type { Payment, PaymentKind, PaymentMethod, PaymentStatus } from "./api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Skeleton } from "@/components/ui/skeleton"

export function PaymentsCard({
  bookingId,
  currency,
  total,
  amountPaid,
  paymentStatus,
}: {
  bookingId: string
  currency: string
  total: number
  amountPaid: number
  paymentStatus: PaymentStatus
}) {
  const query = usePayments(bookingId)
  const payments = dedupeById(query.data?.pages.flatMap((p) => p.items))
  const deletePayment = useDeletePayment()

  const [dialogKind, setDialogKind] = useState<PaymentKind | null>(null)
  const [toDelete, setToDelete] = useState<Payment | null>(null)

  // diferența semnată: > 0 rest de plată, < 0 încasat în plus, 0 achitat exact.
  // NU se mai trunchiază la 0 — supraîncasarea trebuie să fie vizibilă.
  const diff = total - amountPaid
  const overpaid = diff < 0

  async function onDelete() {
    if (!toDelete) return
    try {
      await deletePayment.mutateAsync(toDelete.id)
      toast.success(t("payments.deleted"))
      setToDelete(null)
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{t("payments.title")}</CardTitle>
        <PaymentStatusBadge status={paymentStatus} />
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {/* Sumar */}
        <div className="space-y-1.5">
          <Row label={t("bookings.total")} value={formatMoney(total, currency)} />
          <Row label={t("payments.paid")} value={formatMoney(amountPaid, currency)} />
          {overpaid ? (
            <Row
              label={t("payments.overpaid")}
              value={formatMoney(-diff, currency)}
              tone="warning"
              strong
            />
          ) : (
            <Row label={t("payments.balance")} value={formatMoney(diff, currency)} strong />
          )}
        </div>

        {/* Avertisment supraîncasare */}
        {overpaid && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{t("payments.overpaid_warning")} {formatMoney(-diff, currency)}.</span>
          </div>
        )}

        {/* Acțiuni */}
        <div className="flex gap-2">
          <Can permission="payment.record">
            <Button size="sm" variant="outline" className="flex-1" onClick={() => setDialogKind("payment")}>
              <Plus className="h-3.5 w-3.5" />
              {t("payments.add")}
            </Button>
          </Can>
          <Can permission="payment.refund">
            <Button
              size="sm" variant="ghost" className="flex-1"
              disabled={amountPaid <= 0}
              onClick={() => setDialogKind("refund")}
            >
              <Undo2 className="h-3.5 w-3.5" />
              {t("payments.add_refund")}
            </Button>
          </Can>
        </div>

        {/* Listă tranzacții (paginată: „Afișează mai mult") */}
        {query.isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : !payments || payments.length === 0 ? (
          <p className="text-muted-foreground">{t("payments.empty")}</p>
        ) : (
          <div className="space-y-1">
            {payments.map((p) => {
              const isRefund = p.kind === "refund"
              return (
                <div key={p.id} className="flex items-center justify-between gap-2 rounded border px-3 py-1.5">
                  <div className="min-w-0">
                    <span className={isRefund ? "font-medium text-rose-700" : "font-medium"}>
                      {isRefund ? "−" : "+"}{formatMoney(p.amount, p.currency)}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {paymentMethodLabel(p.method as PaymentMethod)} · {p.paid_at.slice(0, 10)}
                    </span>
                    {/* cine a consemnat plata (snapshot email, fără join spre auth.users) */}
                    {p.recorded_by_email && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {t("payments.recorded_by")} {p.recorded_by_email}
                      </span>
                    )}
                    {p.note && (
                      <span className="block truncate text-xs text-muted-foreground">{p.note}</span>
                    )}
                  </div>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                    title={t("payments.delete")}
                    onClick={() => setToDelete(p)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              )
            })}
            {query.hasNextPage && (
              <Button
                variant="ghost" size="sm" className="w-full"
                disabled={query.isFetchingNextPage}
                onClick={() => query.fetchNextPage()}
              >
                {t("common.show_more")}
              </Button>
            )}
          </div>
        )}
      </CardContent>

      <RecordPaymentDialog
        bookingId={bookingId}
        currency={currency}
        balance={Math.max(diff, 0)}
        kind={dialogKind ?? "payment"}
        open={!!dialogKind}
        onOpenChange={(o) => !o && setDialogKind(null)}
      />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={t("payments.delete")}
        description={t("payments.delete_confirm")}
        destructive
        onConfirm={onDelete}
      />
    </Card>
  )
}

function Row({
  label, value, strong, tone,
}: {
  label: string
  value: string
  strong?: boolean
  tone?: "warning"
}) {
  return (
    <p className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-right",
          strong ? "font-semibold" : "font-medium",
          tone === "warning" && "text-amber-700"
        )}
      >
        {value}
      </span>
    </p>
  )
}
