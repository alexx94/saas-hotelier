import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { t } from "@/lib/i18n"
import { errorMessage } from "@/lib/errors"
import { formatMoney } from "@/lib/money"
import { PAYMENT_METHODS, type PaymentKind } from "./api"
import { paymentMethodLabel } from "./payment-status"
import { useRecordPayment } from "./hooks"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

const schema = z.object({
  amount: z.coerce.number().positive(),
  method: z.enum(["cash", "card", "bank_transfer", "online", "other"]),
  paid_at: z.string().optional(),
  note: z.string().optional(),
})
type FormInput = z.input<typeof schema>
type FormValues = z.output<typeof schema>

export function RecordPaymentDialog({
  bookingId,
  currency,
  balance,
  kind,
  open,
  onOpenChange,
}: {
  bookingId: string
  currency: string
  balance: number      // rest de plată sugerat (prefill pentru încasare)
  kind: PaymentKind
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const record = useRecordPayment()
  const isRefund = kind === "refund"

  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { method: "cash" },
  })

  // prefill suma cu restul de plată la fiecare deschidere a dialogului de încasare
  function handleOpenChange(o: boolean) {
    if (o) {
      form.reset({
        method: "cash",
        amount: !isRefund && balance > 0 ? balance : undefined,
      } as FormInput)
    }
    onOpenChange(o)
  }

  async function onSubmit(values: FormValues) {
    try {
      await record.mutateAsync({
        bookingId,
        amount: values.amount,
        kind,
        method: values.method,
        paidAt: values.paid_at || undefined,
        note: values.note || undefined,
      })
      toast.success(t(isRefund ? "payments.refund_recorded" : "payments.recorded"))
      onOpenChange(false)
    } catch (e) {
      const msg = errorMessage(e)
      if (msg.includes("INVALID_AMOUNT")) toast.error(t("payments.invalid_amount"))
      else toast.error(t("common.error"))
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t(isRefund ? "payments.add_refund" : "payments.add")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("payments.amount")} ({currency})</Label>
            <Input type="number" step="0.01" min="0" {...form.register("amount")} />
            {form.formState.errors.amount && (
              <p className="text-sm text-destructive">{t("payments.invalid_amount")}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("payments.method")}</Label>
              <Select
                defaultValue="cash"
                onValueChange={(v) => form.setValue("method", v as FormValues["method"])}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>{paymentMethodLabel(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("payments.paid_at")}</Label>
              <Input type="date" {...form.register("paid_at")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("payments.note")}</Label>
            <Textarea rows={2} {...form.register("note")} />
          </div>

          {!isRefund && balance > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("payments.balance_due")}: {formatMoney(balance, currency)}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={record.isPending}>
            {t("common.save")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
