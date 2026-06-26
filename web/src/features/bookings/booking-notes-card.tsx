import { useState } from "react"
import { Pencil } from "lucide-react"
import { toast } from "sonner"
import { useUpdateBookingNotes } from "@/features/bookings/hooks"
import { t } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"

// Notă liberă pe rezervare, editabilă oricând (orice status) de către orice rol
// cu booking.edit — inclusiv recepție. Editare inline, fără dialog (Sprint 9.1).
export function BookingNotesCard({
  bookingId,
  notes,
  canEdit,
}: {
  bookingId: string
  notes: string | null
  canEdit: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState("")
  const updateNotes = useUpdateBookingNotes()

  function startEdit() {
    setValue(notes ?? "")
    setEditing(true)
  }

  async function onSave() {
    try {
      await updateNotes.mutateAsync({ bookingId, notes: value })
      toast.success(t("bookings.notes_saved"))
      setEditing(false)
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">{t("bookings.notes")}</CardTitle>
        {canEdit && !editing && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={startEdit}>
            <Pencil className="h-3 w-3" />
            {notes ? t("bookings.notes_edit") : t("bookings.notes_add")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {editing ? (
          <>
            <Textarea
              rows={3}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t("bookings.notes_placeholder")}
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" disabled={updateNotes.isPending} onClick={onSave}>
                {t("common.save")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </>
        ) : (
          <p className="whitespace-pre-wrap text-muted-foreground">
            {notes || t("bookings.notes_empty")}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
