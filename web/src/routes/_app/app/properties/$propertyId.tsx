import { useState } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useForm, type UseFormReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import {
  ArchiveRestore, ArrowLeft, BedDouble, ChevronDown, ChevronRight,
  ExternalLink, History, Pencil, Plus, Tag, Trash2, User,
} from "lucide-react"
import { useProperty, useUpdateProperty } from "@/features/properties/hooks"
import {
  useCreateUnitType, useDeleteUnitType, useUnitTypes, useUpdateUnitType,
} from "@/features/unit-types/hooks"
import type { UnitType } from "@/features/unit-types/api"
import { UnitRows } from "@/features/unit-types/unit-rows"
import { UnitTypeHistoryDialog } from "@/features/unit-types/unit-type-history-dialog"
import { parseRoomNumbering } from "@/features/unit-types/room-numbering"
import { RateRulesDialog } from "@/features/pricing/rate-rules-dialog"
import { WeekendDaysToggle } from "@/features/pricing/weekend-days-toggle"
import { OccupancyStepper } from "@/features/pricing/occupancy-stepper"
import { DEFAULT_WEEKEND_DAYS } from "@/features/pricing/weekend-pricing"
import { t } from "@/lib/i18n"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"

export const Route = createFileRoute("/_app/app/properties/$propertyId")({
  component: PropertyDetailPage,
})

// ─── schemas ─────────────────────────────────────────────────────────────────

const capacityFields = {
  max_adults: z.coerce.number().int().min(1),
  max_children: z.coerce.number().int().min(0),
  base_price: z.coerce.number().min(0),
  weekend_adjustment_type: z.enum(["none", "percent", "amount"]),
  weekend_adjustment_value: z.coerce.number().min(0),
}

const createSchema = z.object({
  name: z.string().min(2),
  ...capacityFields,
  rooms_spec: z.string().refine(
    (v) => parseRoomNumbering(v) !== null,
    { message: "invalid_numbering" }
  ),
  rooms_start: z.string().optional(),
  room_prefix: z.string().min(1),
})
type CreateValues = z.output<typeof createSchema>

const editTypeSchema = z.object({
  name: z.string().min(2),
  ...capacityFields,
})
type EditTypeValues = z.output<typeof editTypeSchema>

// ─── rând tip cameră ─────────────────────────────────────────────────────────

function UnitTypeRow({
  ut, propertyId, currency, onEdit, onRates,
}: {
  ut: UnitType
  propertyId: string
  currency: string
  onEdit: (ut: UnitType) => void
  onRates: (ut: UnitType) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const deleteUnitType = useDeleteUnitType(propertyId)
  const updateUnitType = useUpdateUnitType(propertyId)

  async function onRestore() {
    try {
      await updateUnitType.mutateAsync({ id: ut.id, patch: { is_active: true } })
      toast.success(t("unit_types.restored_toast"))
    } catch {
      toast.error(t("common.error"))
    }
  }

  async function onDelete() {
    try {
      const result = await deleteUnitType.mutateAsync(ut.id)
      if (result === "archived") toast.info(t("unit_types.delete_blocked"))
      if (result === "has_future_bookings") toast.error(t("unit_types.has_future_bookings"))
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <>
      <TableRow className={ut.is_active ? "" : "opacity-50"}>
        <TableCell>
          <button
            className="flex items-center gap-2 font-medium hover:underline"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded
              ? <ChevronDown className="h-4 w-4 shrink-0" />
              : <ChevronRight className="h-4 w-4 shrink-0" />}
            {ut.name}
            {!ut.is_active && (
              <Badge variant="outline" className="ml-1 text-xs">{t("unit_types.archived")}</Badge>
            )}
          </button>
        </TableCell>
        <TableCell>
          <span className="flex items-center gap-1.5 text-sm">
            <span className="flex items-center gap-0.5" title={t("occupancy.adults")}>
              <User className="h-4 w-4 text-muted-foreground" />{ut.max_adults}
            </span>
            <span className="flex items-center gap-0.5" title={t("occupancy.children")}>
              <User className="h-3 w-3 text-muted-foreground" />{ut.max_children}
            </span>
          </span>
        </TableCell>
        <TableCell>
          {Number(ut.base_price).toFixed(2)} {currency}
          <span className="ml-1 text-xs text-muted-foreground">/ noapte</span>
        </TableCell>
        <TableCell>{ut.units?.[0]?.count ?? 0} {t("unit_types.units")}</TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            {!ut.is_active && (
              <Button
                variant="ghost" size="icon" className="h-8 w-8"
                title={t("unit_types.restore")}
                disabled={updateUnitType.isPending}
                onClick={onRestore}
              >
                <ArchiveRestore className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" title={t("pricing.manage")} onClick={() => onRates(ut)}>
              <Tag className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setHistoryOpen(true)}>
              <History className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(ut)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <UnitRows unitTypeId={ut.id} propertyId={propertyId} currency={currency} />
      )}
      <UnitTypeHistoryDialog
        unitTypeId={historyOpen ? ut.id : null}
        unitTypeName={ut.name}
        onClose={() => setHistoryOpen(false)}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("common.confirm_action")}
        description={`${t("common.confirm_delete")} (${ut.name})`}
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={onDelete}
      />
    </>
  )
}

// ─── câmpuri comune capacitate + preț + weekend (creare/editare tip) ──────────

function UnitTypeFields({
  form, currency, days, setDays,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>
  currency: string
  days: number[]
  setDays: (d: number[]) => void
}) {
  const weekendType = form.watch("weekend_adjustment_type") as string
  // steppere +/- pentru ocupare maximă (adulți min 1 / copii min 0, plafon 25)
  const maxAdults = Number(form.watch("max_adults") ?? 1)
  const maxChildren = Number(form.watch("max_children") ?? 0)
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <OccupancyStepper
          label={t("unit_types.max_adults")} value={maxAdults}
          onChange={(v) => form.setValue("max_adults", v)} min={1} max={25}
        />
        <OccupancyStepper
          label={t("unit_types.max_children")} value={maxChildren}
          onChange={(v) => form.setValue("max_children", v)} min={0} max={25}
        />
      </div>
      <div className="space-y-2">
        <Label>{t("unit_types.base_price")} ({currency})</Label>
        <Input type="number" min={0} step="0.01" {...form.register("base_price")} />
      </div>

      {/* preț weekend */}
      <div className="space-y-3 rounded-md border p-3">
        <Label className="text-sm font-medium">{t("unit_types.weekend_pricing")}</Label>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t("unit_types.weekend_type")}</Label>
            <Select
              value={weekendType}
              onValueChange={(v) => form.setValue("weekend_adjustment_type", v)}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("unit_types.weekend_none")}</SelectItem>
                <SelectItem value="percent">{t("unit_types.weekend_percent")}</SelectItem>
                <SelectItem value="amount">{t("unit_types.weekend_amount")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {weekendType !== "none" && (
            <div className="space-y-2">
              <Label>{t("unit_types.weekend_value")}</Label>
              <Input type="number" min={0} step="0.01" {...form.register("weekend_adjustment_value")} />
            </div>
          )}
        </div>
        {weekendType !== "none" && (
          <>
            <WeekendDaysToggle value={days} onChange={setDays} />
            <p className="text-xs text-muted-foreground">{t("unit_types.weekend_hint")}</p>
          </>
        )}
      </div>
    </>
  )
}

// ─── pagina principală ────────────────────────────────────────────────────────

function PropertyDetailPage() {
  const { propertyId } = Route.useParams()
  const { data: property, isLoading } = useProperty(propertyId)
  const { data: unitTypes, isLoading: loadingTypes } = useUnitTypes(propertyId)
  const updateProperty = useUpdateProperty()
  const createUnitType = useCreateUnitType(propertyId)
  const updateUnitType = useUpdateUnitType(propertyId)

  const [createOpen, setCreateOpen] = useState(false)
  const [editingType, setEditingType] = useState<UnitType | null>(null)
  const [ratesType, setRatesType] = useState<UnitType | null>(null)
  // weekend_days e gestionat ca state (toggle-uri), nu prin RHF
  const [createDays, setCreateDays] = useState<number[]>(DEFAULT_WEEKEND_DAYS)
  const [editDays, setEditDays] = useState<number[]>(DEFAULT_WEEKEND_DAYS)

  const createDefaults: z.input<typeof createSchema> = {
    name: "", max_adults: 2, max_children: 0, base_price: 0,
    weekend_adjustment_type: "none", weekend_adjustment_value: 0,
    rooms_spec: "1", rooms_start: "", room_prefix: "Camera ",
  }

  const createForm = useForm<z.input<typeof createSchema>, unknown, CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: createDefaults,
  })
  const editTypeForm = useForm<z.input<typeof editTypeSchema>, unknown, EditTypeValues>({
    resolver: zodResolver(editTypeSchema),
  })

  if (isLoading || !property) return <Skeleton className="h-64 w-full" />

  async function onCreate(values: CreateValues) {
    const numbering = parseRoomNumbering(
      values.rooms_spec,
      values.rooms_start ? Number(values.rooms_start) : undefined
    )
    if (!numbering) {
      toast.error(t("units.invalid_numbering"))
      return
    }
    try {
      const { unitsCreated } = await createUnitType.mutateAsync({
        input: {
          org_id: property!.org_id,
          property_id: property!.id,
          name: values.name,
          max_adults: values.max_adults,
          max_children: values.max_children,
          base_price: values.base_price,
          weekend_adjustment_type: values.weekend_adjustment_type,
          weekend_adjustment_value: values.weekend_adjustment_value,
          weekend_days: createDays,
        },
        roomsCount: numbering.count,
        roomPrefix: values.room_prefix,
        startNumber: numbering.start,
      })
      setCreateOpen(false)
      createForm.reset(createDefaults)
      setCreateDays(DEFAULT_WEEKEND_DAYS)
      toast.success(`${values.name} creat. ${unitsCreated} ${t("units.added_toast")}`)
    } catch {
      toast.error(t("common.error"))
    }
  }

  async function onEditType(values: EditTypeValues) {
    if (!editingType) return
    try {
      await updateUnitType.mutateAsync({
        id: editingType.id,
        patch: {
          name: values.name,
          max_adults: values.max_adults,
          max_children: values.max_children,
          base_price: values.base_price,
          weekend_adjustment_type: values.weekend_adjustment_type,
          weekend_adjustment_value: values.weekend_adjustment_value,
          weekend_days: editDays,
        },
      })
      setEditingType(null)
    } catch {
      toast.error(t("common.error"))
    }
  }

  function openEdit(ut: UnitType) {
    editTypeForm.reset({
      name: ut.name,
      max_adults: String(ut.max_adults) as unknown as number,
      max_children: String(ut.max_children) as unknown as number,
      base_price: String(ut.base_price) as unknown as number,
      weekend_adjustment_type: ut.weekend_adjustment_type as "none" | "percent" | "amount",
      weekend_adjustment_value: String(ut.weekend_adjustment_value) as unknown as number,
    })
    setEditDays(ut.weekend_days ?? DEFAULT_WEEKEND_DAYS)
    setEditingType(ut)
  }

  async function togglePublish() {
    try {
      await updateProperty.mutateAsync({
        id: property!.id,
        patch: { is_published: !property!.is_published },
      })
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/app/properties"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">{property.name}</h1>
            <p className="text-sm text-muted-foreground">
              {property.city ? `${property.city} · ` : ""}{property.currency}
            </p>
          </div>
          <Badge variant={property.is_published ? "default" : "secondary"}>
            {property.is_published ? t("properties.published") : t("properties.unpublished")}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {property.is_published && (
            <Button variant="outline" asChild>
              <Link to="/p/$slug" params={{ slug: property.slug }} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                {t("properties.public_page")}
              </Link>
            </Button>
          )}
          <Button variant="outline" onClick={togglePublish}>
            {property.is_published ? t("properties.unpublish") : t("properties.publish")}
          </Button>
        </div>
      </div>

      {/* tipuri camere */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">{t("unit_types.title")}</h2>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />{t("unit_types.add")}
        </Button>
      </div>

      {loadingTypes ? (
        <Skeleton className="h-40 w-full" />
      ) : !unitTypes || unitTypes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <BedDouble className="h-8 w-8" />{t("unit_types.empty")}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("unit_types.name")}</TableHead>
                <TableHead>{t("unit_types.occupancy")}</TableHead>
                <TableHead>{t("unit_types.base_price")}</TableHead>
                <TableHead>{t("unit_types.units")}</TableHead>
                <TableHead className="w-28 text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unitTypes.map((ut) => (
                <UnitTypeRow
                  key={ut.id}
                  ut={ut}
                  propertyId={propertyId}
                  currency={property.currency}
                  onEdit={openEdit}
                  onRates={setRatesType}
                />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* dialog creare tip */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("unit_types.add")}</DialogTitle></DialogHeader>
          <form onSubmit={createForm.handleSubmit(onCreate)} className="space-y-4">
            <div className="space-y-2">
              <Label>{t("unit_types.name")}</Label>
              <Input placeholder="Cameră dublă standard" {...createForm.register("name")} />
            </div>
            <UnitTypeFields form={createForm} currency={property.currency} days={createDays} setDays={setCreateDays} />
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t("units.numbering")}</Label>
                <Input
                  placeholder={t("units.numbering_placeholder")}
                  {...createForm.register("rooms_spec")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("units.start_at")}</Label>
                <Input type="number" min={1} {...createForm.register("rooms_start")} />
              </div>
              <div className="space-y-2">
                <Label>{t("unit_types.room_prefix")}</Label>
                <Input {...createForm.register("room_prefix")} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("units.numbering_hint")}</p>
            {createForm.formState.errors.rooms_spec && (
              <p className="text-xs text-destructive">{t("units.invalid_numbering")}</p>
            )}
            <Button type="submit" className="w-full" disabled={createForm.formState.isSubmitting}>
              {t("common.save")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* dialog editare tip */}
      <Dialog open={!!editingType} onOpenChange={(o) => !o && setEditingType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("common.edit")}: {editingType?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={editTypeForm.handleSubmit(onEditType)} className="space-y-4">
            <div className="space-y-2">
              <Label>{t("unit_types.name")}</Label>
              <Input {...editTypeForm.register("name")} />
            </div>
            <UnitTypeFields form={editTypeForm} currency={property.currency} days={editDays} setDays={setEditDays} />
            <p className="text-xs text-muted-foreground">
              Modificarea prețului afectează rezervările <strong>viitoare</strong> — cele existente rămân cu prețul lor.
            </p>
            <Button type="submit" className="w-full" disabled={editTypeForm.formState.isSubmitting}>
              {t("common.save")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* dialog reguli de preț (sezoane / override-uri) */}
      <RateRulesDialog
        unitTypeId={ratesType?.id ?? null}
        unitTypeName={ratesType?.name}
        orgId={property.org_id}
        propertyId={property.id}
        currency={property.currency}
        onClose={() => setRatesType(null)}
      />
    </div>
  )
}
