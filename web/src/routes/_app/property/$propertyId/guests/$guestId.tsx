import { useState } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { ArrowLeft, CalendarDays, Mail, Pencil, Phone, Trash2 } from "lucide-react"
import { useCurrentOrg } from "@/features/organizations/context"
import {
  useDeleteGuest, useGuest, useGuestBookings, useGuestStats, useUpdateGuest,
} from "@/features/guests/hooks"
import { StatusBadge } from "@/features/bookings/status-badge"
import type { BookingStatus } from "@/features/bookings/api"
import { PaginationControls } from "@/components/pagination"
import { usePagination } from "@/lib/pagination"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { t } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"

export const Route = createFileRoute("/_app/property/$propertyId/guests/$guestId")({
  component: GuestProfilePage,
})

const editSchema = z.object({
  full_name: z.string().min(2),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  notes: z.string().optional(),
})
type EditValues = z.infer<typeof editSchema>

function GuestProfilePage() {
  const { propertyId, guestId } = Route.useParams()
  const navigate = useNavigate()
  const { currentOrg } = useCurrentOrg()
  const { data: guest, isLoading } = useGuest(guestId)
  const pagination = usePagination()
  const { data: bookingsPage, isLoading: bookingsLoading } = useGuestBookings(
    guestId,
    pagination.page
  )
  const bookings = bookingsPage?.items
  const { data: stats } = useGuestStats(guestId)
  const updateGuest = useUpdateGuest(currentOrg.id)
  const deleteGuest = useDeleteGuest(currentOrg.id)

  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const form = useForm<EditValues>({ resolver: zodResolver(editSchema) })

  const total = stats?.total ?? 0

  function openEdit() {
    if (!guest) return
    form.reset({
      full_name: guest.full_name,
      email: guest.email ?? "",
      phone: guest.phone ?? "",
      notes: guest.notes ?? "",
    })
    setEditOpen(true)
  }

  async function onEditSubmit(values: EditValues) {
    try {
      await updateGuest.mutateAsync({
        guestId,
        patch: {
          full_name: values.full_name,
          email: values.email || null,
          phone: values.phone || null,
          notes: values.notes || null,
        },
      })
      toast.success(t("guests.updated"))
      setEditOpen(false)
    } catch (err) {
      const code = (err as { code?: string } | null)?.code
      toast.error(code === "23505" ? t("guests.duplicate") : t("common.error"))
    }
  }

  async function onDelete() {
    try {
      await deleteGuest.mutateAsync(guestId)
      toast.success(t("guests.deleted"))
      navigate({ to: "/property/$propertyId/guests", params: { propertyId } })
    } catch (err) {
      // 23503 = foreign_key_violation: are rezervări — ștergerea e interzisă
      const code = (err as { code?: string } | null)?.code
      toast.error(code === "23503" ? t("guests.delete_blocked") : t("common.error"))
    }
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (!guest) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          {t("guests.not_found")}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8 shrink-0">
            <Link
              to="/property/$propertyId/guests"
              params={{ propertyId }}
              title={t("common.back")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-xl font-semibold md:text-2xl">{guest.full_name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={openEdit}>
            <Pencil className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("guests.edit")}</span>
          </Button>
          <Button
            variant="outline"
            className="text-destructive"
            disabled={total > 0}
            title={total > 0 ? t("guests.delete_blocked") : undefined}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("common.delete")}</span>
          </Button>
        </div>
      </div>

      {/* Detalii + statistici */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("guests.profile")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              {guest.email ?? "—"}
            </p>
            <p className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              {guest.phone ?? "—"}
            </p>
            <p className="flex items-center gap-2">
              <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
              {t("guests.member_since")} {guest.created_at.slice(0, 10)}
            </p>
            {guest.notes && (
              <p className="pt-1 text-muted-foreground">
                {t("guests.notes")}: {guest.notes}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid grid-cols-3 gap-2 py-6 text-center">
            <Stat label={t("guests.stat_total")} value={stats?.total ?? 0} />
            <Stat label={t("guests.stat_upcoming")} value={stats?.upcoming ?? 0} />
            <Stat label={t("guests.stat_cancelled")} value={stats?.cancelled ?? 0} />
          </CardContent>
        </Card>
      </div>

      {/* Istoric rezervări — afișează snapshot-ul fiecărei rezervări */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("guests.bookings_title")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {bookingsLoading ? (
            <Skeleton className="m-4 h-32" />
          ) : !bookings || bookings.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">
              {t("guests.no_bookings")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("bookings.property")}</TableHead>
                  <TableHead>{t("bookings.unit")}</TableHead>
                  <TableHead>{t("bookings.check_in")}</TableHead>
                  <TableHead>{t("bookings.check_out")}</TableHead>
                  <TableHead>{t("bookings.total")}</TableHead>
                  <TableHead>{t("bookings.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">
                      <Link
                        to="/property/$propertyId/bookings/$bookingId"
                        params={{ propertyId, bookingId: b.id }}
                        className="hover:underline"
                      >
                        {b.properties?.name ?? "—"}
                      </Link>
                      {b.booked_full_name && b.booked_full_name !== guest.full_name && (
                        <span className="block text-xs text-muted-foreground">
                          {b.booked_full_name}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {b.units?.name}
                      <span className="block text-xs text-muted-foreground">
                        {b.unit_types?.name}
                      </span>
                    </TableCell>
                    <TableCell>{b.check_in}</TableCell>
                    <TableCell>{b.check_out}</TableCell>
                    <TableCell>
                      {Number(b.total_amount).toFixed(2)} {b.currency}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={b.status as BookingStatus} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {(pagination.hasPrev || bookingsPage?.hasMore) && (
            <div className="p-3">
              <PaginationControls
                hasPrev={pagination.hasPrev}
                hasNext={!!bookingsPage?.hasMore}
                onPrev={pagination.prev}
                onNext={pagination.next}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog editare profil */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("guests.edit")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onEditSubmit)} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="gp-name">{t("guests.full_name")}</Label>
              <Input id="gp-name" {...form.register("full_name")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="gp-email">{t("auth.email")}</Label>
                <Input id="gp-email" type="email" {...form.register("email")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="gp-phone">{t("guests.phone")}</Label>
                <Input id="gp-phone" {...form.register("phone")} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="gp-notes">{t("guests.notes")}</Label>
              <Input id="gp-notes" {...form.register("notes")} />
            </div>
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {t("common.save")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("common.confirm_delete")}
        description={t("guests.delete_confirm")}
        onConfirm={onDelete}
      />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
