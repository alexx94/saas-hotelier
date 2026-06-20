import { useState } from "react"
import { t } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

// Confirmare cu tastat (stil GitHub): butonul rămâne dezactivat până când
// utilizatorul tastează exact `phrase`. Pentru acțiuni ireversibile/grave.
export function TypedConfirmDialog({
  open, onOpenChange, title, description, phrase, confirmLabel, destructive, onConfirm,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description: string
  phrase: string
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => void
}) {
  const [value, setValue] = useState("")
  const matches = value.trim() === phrase

  function close(o: boolean) {
    if (!o) setValue("")
    onOpenChange(o)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{description}</p>
          <p className="text-sm">
            {t("members.type_to_confirm").replace("{x}", "")}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{phrase}</code>
          </p>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            placeholder={phrase}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => close(false)}>{t("common.cancel")}</Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={!matches}
            onClick={() => { onConfirm(); close(false) }}
          >
            {confirmLabel ?? t("common.delete")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
