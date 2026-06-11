import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Plus, Search } from "lucide-react"
import { useCurrentOrg } from "@/features/organizations/context"
import { useCreateGuest, useGuests } from "@/features/guests/hooks"
import { t } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"

export const Route = createFileRoute("/_app/app/guests")({
  component: GuestsPage,
})

const schema = z.object({
  full_name: z.string().min(2),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

function GuestsPage() {
  const { currentOrg } = useCurrentOrg()
  const [search, setSearch] = useState("")
  const { data: guests, isLoading } = useGuests(currentOrg.id, search || undefined)
  const createGuest = useCreateGuest(currentOrg.id)
  const [open, setOpen] = useState(false)

  const form = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    try {
      await createGuest.mutateAsync({
        org_id: currentOrg.id,
        full_name: values.full_name,
        email: values.email || null,
        phone: values.phone || null,
      })
      setOpen(false)
      form.reset()
    } catch (err) {
      // 23505 = unique_violation (unicitate email/telefon per organizație)
      const code = (err as { code?: string } | null)?.code
      toast.error(code === "23505" ? t("guests.duplicate") : t("common.error"))
    }
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <h1 className="text-xl font-semibold md:text-2xl">{t("guests.title")}</h1>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("common.search")}
              className="w-full pl-8 sm:w-56"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="shrink-0">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">{t("guests.add")}</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("guests.add")}</DialogTitle>
              </DialogHeader>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="g-name">{t("guests.full_name")}</Label>
                  <Input id="g-name" {...form.register("full_name")} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="g-email">{t("auth.email")}</Label>
                    <Input id="g-email" type="email" {...form.register("email")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="g-phone">{t("guests.phone")}</Label>
                    <Input id="g-phone" {...form.register("phone")} />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                  {t("common.save")}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !guests || guests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("guests.empty")}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("guests.full_name")}</TableHead>
                <TableHead>{t("auth.email")}</TableHead>
                <TableHead>{t("guests.phone")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {guests.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">{g.full_name}</TableCell>
                  <TableCell>{g.email ?? "—"}</TableCell>
                  <TableCell>{g.phone ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
