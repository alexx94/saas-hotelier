import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Check, ChevronsUpDown, Plus, UserRound } from "lucide-react"
import { useFindOrCreateGuest, useGuests } from "./hooks"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"

const newGuestSchema = z.object({
  full_name: z.string().min(2),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
})
type NewGuestValues = z.infer<typeof newGuestSchema>

type Props = {
  orgId: string
  value: string | null       // guest_id
  onChange: (guestId: string) => void
  disabled?: boolean
}

export function GuestCombobox({ orgId, value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const { data: guests, isLoading } = useGuests(orgId, debouncedSearch || undefined)
  const findOrCreate = useFindOrCreateGuest(orgId)

  const form = useForm<NewGuestValues>({ resolver: zodResolver(newGuestSchema) })

  const selected = guests?.find((g) => g.id === value)

  async function onCreateGuest(values: NewGuestValues) {
    try {
      const result = await findOrCreate.mutateAsync({
        fullName: values.full_name,
        email: values.email || undefined,
        phone: values.phone || undefined,
      })
      if (result.matched_by === "email") toast.info(t("guests.found_by_email"))
      else if (result.matched_by === "phone") toast.info(t("guests.found_by_phone"))
      onChange(result.guest_id)
      setCreateOpen(false)
      form.reset()
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            {selected
              ? <span className="flex items-center gap-2">
                  <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span>{selected.full_name}</span>
                  {selected.email && (
                    <span className="text-xs text-muted-foreground">· {selected.email}</span>
                  )}
                </span>
              : <span className="text-muted-foreground">{t("guests.select_or_create")}</span>
            }
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-2" align="start">
          <Input
            placeholder={t("guests.search_placeholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-2 h-8"
            autoFocus
          />
          <div className="max-h-52 overflow-y-auto space-y-0.5">
            {isLoading ? (
              <Skeleton className="h-8 w-full" />
            ) : !guests || guests.length === 0 ? (
              <p className="py-2 text-center text-sm text-muted-foreground">
                {t("common.no_results")}
              </p>
            ) : (
              guests.map((g) => (
                <button
                  key={g.id}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent",
                    value === g.id && "bg-accent"
                  )}
                  onClick={() => { onChange(g.id); setOpen(false) }}
                >
                  <Check className={cn("h-3.5 w-3.5 shrink-0", value === g.id ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1 text-left">
                    <span className="font-medium">{g.full_name}</span>
                    {g.email && <span className="ml-1 text-xs text-muted-foreground">{g.email}</span>}
                    {g.phone && <span className="ml-1 text-xs text-muted-foreground">· {g.phone}</span>}
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="mt-2 border-t pt-2">
            <button
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-primary hover:bg-accent"
              onClick={() => { setOpen(false); setCreateOpen(true) }}
            >
              <Plus className="h-3.5 w-3.5" />
              {t("guests.create_new")}
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("guests.create_new")}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onCreateGuest)} className="space-y-3">
            <div className="space-y-1">
              <Label>{t("guests.full_name")}</Label>
              <Input {...form.register("full_name")} autoFocus />
            </div>
            <div className="space-y-1">
              <Label>{t("auth.email")}</Label>
              <Input type="email" {...form.register("email")} />
            </div>
            <div className="space-y-1">
              <Label>{t("guests.phone")}</Label>
              <Input {...form.register("phone")} />
            </div>
            <Button type="submit" className="w-full" disabled={findOrCreate.isPending}>
              {t("common.save")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
