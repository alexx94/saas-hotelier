import { useState } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import {
  ArrowLeft, BedDouble, ChevronDown, ChevronRight,
  ExternalLink, Pencil, Plus, Trash2,
} from "lucide-react"
import { useProperty, useUpdateProperty } from "@/features/properties/hooks"
import {
  useCreateUnitType, useDeleteUnit, useDeleteUnitType,
  useGenerateUnits, useUnitsForType, useUnitTypes, useSetUnitStatus, useUpdateUnit, useUpdateUnitType,
} from "@/features/unit-types/hooks"
import type { UnitType, UnitStatus } from "@/features/unit-types/api"
import { t } from "@/lib/i18n"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import type { TranslationKey } from "@/lib/i18n"

export const Route = createFileRoute("/_app/app/properties/$propertyId")({
  component: PropertyDetailPage,
})

// ─── helpers ─────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<UnitStatus, TranslationKey> = {
  active: "unit.status.active",
  inactive: "unit.status.inactive",
  out_of_service: "unit.status.out_of_service",
  archived: "unit.status.archived",
}

const STATUS_BADGE_CLASS: Record<UnitStatus, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  inactive: "bg-gray-50 text-gray-500 border-gray-200",
  out_of_service: "bg-amber-50 text-amber-700 border-amber-200",
  archived: "bg-red-50 text-red-700 border-red-200",
}

const STATUSES: UnitStatus[] = ["active", "inactive", "out_of_service", "archived"]

// ─── schemas ─────────────────────────────────────────────────────────────────

const createSchema = z.object({
  name: z.string().min(2),
  capacity: z.coerce.number().int().min(1),
  base_price: z.coerce.number().min(0),
  rooms_count: z.coerce.number().int().min(1).max(500),
  room_prefix: z.string().min(1),
})
type CreateValues = z.output<typeof createSchema>

const editTypeSchema = z.object({
  name: z.string().min(2),
  capacity: z.coerce.number().int().min(1),
  base_price: z.coerce.number().min(0),
})
type EditTypeValues = z.output<typeof editTypeSchema>

const editUnitSchema = z.object({ name: z.string().min(1) })
type EditUnitValues = z.infer<typeof editUnitSchema>

// ─── camere individuale ───────────────────────────────────────────────────────

function UnitRows({
  unitTypeId, propertyId, currency,
}: {
  unitTypeId: string
  propertyId: string
  currency: string
}) {
  const { data: units, isLoading } = useUnitsForType(unitTypeId)
  const setStatus = useSetUnitStatus(propertyId)
  const updateUnit = useUpdateUnit(propertyId)
  const deleteUnit = useDeleteUnit(propertyId)
  const generateUnits = useGenerateUnits(propertyId)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addMode, setAddMode] = useState(false)
  const [addCount, setAddCount] = useState(1)
  const [addPrefix, setAddPrefix] = useState("Camera ")
  const form = useForm<EditUnitValues>({ resolver: zodResolver(editUnitSchema) })

  if (isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={5}><Skeleton className="h-8 w-full" /></TableCell>
      </TableRow>
    )
  }

  return (
    <>
      {(units ?? []).map((unit) => {
        const unitStatus = (unit.status ?? "active") as UnitStatus
        return (
          <TableRow key={unit.id} className={`bg-muted/30 text-sm ${unitStatus === "archived" ? "opacity-40" : ""}`}>
            <TableCell className="pl-10">
              {editingId === unit.id ? (
                <form
                  onSubmit={form.handleSubmit(async (v) => {
                    await updateUnit.mutateAsync({ id: unit.id, patch: { name: v.name } })
                    setEditingId(null)
                  })}
                  className="flex items-center gap-2"
                >
                  <Input className="h-7 w-36" defaultValue={unit.name} {...form.register("name")} autoFocus />
                  <Button type="submit" size="sm" className="h-7">{t("common.save")}</Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setEditingId(null)}>{t("common.cancel")}</Button>
                </form>
              ) : (
                <span>{unit.name}</span>
              )}
            </TableCell>
            <TableCell colSpan={2} className="text-muted-foreground text-xs">
              cameră individuală · {currency}
            </TableCell>
            {/* Badge stare */}
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={`rounded border px-2 py-0.5 text-xs font-medium transition-colors ${STATUS_BADGE_CLASS[unitStatus]}`}>
                    {t(STATUS_LABEL[unitStatus])}
                    <ChevronDown className="ml-1 inline-block h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {STATUSES.map((s) => (
                    <DropdownMenuItem
                      key={s}
                      disabled={s === unitStatus}
                      onClick={async () => {
                        const result = await setStatus.mutateAsync({ id: unit.id, status: s })
                        if (result === "has_future_bookings") {
                          toast.error(t("unit.has_future_bookings"))
                        } else if (s === "archived") {
                          toast.info(t("unit.archived_warning"))
                        }
                      }}
                    >
                      <span className={`mr-2 inline-block h-2 w-2 rounded-full ${
                        s === "active" ? "bg-emerald-500"
                        : s === "out_of_service" ? "bg-amber-500"
                        : s === "archived" ? "bg-red-500"
                        : "bg-gray-400"
                      }`} />
                      {t(STATUS_LABEL[s])}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1">
                {unitStatus !== "archived" && (
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => { setEditingId(unit.id); form.setValue("name", unit.name) }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost" size="icon" className="h-7 w-7"
                  onClick={async () => {
                    if (!confirm(t("common.confirm_delete"))) return
                    const result = await deleteUnit.mutateAsync(unit.id)
                    if (result === "has_future_bookings") {
                      toast.error(t("unit.has_future_bookings"))
                    } else if (result === "deactivated") {
                      toast.info("Camera dezactivată (are rezervări istorice).")
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        )
      })}

      {/* footer: adaugă camere în plus la acest tip */}
      {addMode ? (
        <TableRow className="bg-muted/20">
          <TableCell colSpan={5}>
            <div className="flex items-center gap-2 py-1 pl-10">
              <Input
                type="number" min={1} max={500}
                value={addCount}
                onChange={(e) => setAddCount(Math.max(1, Number(e.target.value)))}
                className="h-7 w-20"
              />
              <Input
                value={addPrefix}
                onChange={(e) => setAddPrefix(e.target.value)}
                placeholder="Camera "
                className="h-7 w-32"
              />
              <Button
                type="button" size="sm" className="h-7"
                disabled={generateUnits.isPending}
                onClick={async () => {
                  const n = await generateUnits.mutateAsync({ unitTypeId, count: addCount, prefix: addPrefix })
                  toast.success(`${n} ${t("units.added_toast")}`)
                  setAddMode(false)
                  setAddCount(1)
                }}
              >
                {t("common.save")}
              </Button>
              <Button
                type="button" size="sm" variant="ghost" className="h-7"
                onClick={() => setAddMode(false)}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </TableCell>
        </TableRow>
      ) : (
        <TableRow className="bg-muted/20">
          <TableCell colSpan={5}>
            <button
              className="flex items-center gap-1 pl-10 text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5"
              onClick={() => setAddMode(true)}
            >
              <Plus className="h-3 w-3" /> {t("units.add_more")}
            </button>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

// ─── rând tip cameră ─────────────────────────────────────────────────────────

function UnitTypeRow({
  ut, propertyId, currency, onEdit,
}: {
  ut: UnitType
  propertyId: string
  currency: string
  onEdit: (ut: UnitType) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const deleteUnitType = useDeleteUnitType(propertyId)

  async function onDelete() {
    if (!confirm(t("common.confirm_delete"))) return
    const result = await deleteUnitType.mutateAsync(ut.id)
    if (result === "archived") toast.info(t("unit_types.delete_blocked"))
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
        <TableCell>{ut.capacity}</TableCell>
        <TableCell>
          {Number(ut.base_price).toFixed(2)} {currency}
          <span className="ml-1 text-xs text-muted-foreground">/ noapte</span>
        </TableCell>
        <TableCell>{ut.units?.[0]?.count ?? 0} {t("unit_types.units")}</TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(ut)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <UnitRows unitTypeId={ut.id} propertyId={propertyId} currency={currency} />
      )}
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

  const createForm = useForm<z.input<typeof createSchema>, unknown, CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { capacity: 2, base_price: 0, rooms_count: 1, room_prefix: "Camera " },
  })
  const editTypeForm = useForm<z.input<typeof editTypeSchema>, unknown, EditTypeValues>({
    resolver: zodResolver(editTypeSchema),
  })

  if (isLoading || !property) return <Skeleton className="h-64 w-full" />

  async function onCreate(values: CreateValues) {
    try {
      const { unitsCreated } = await createUnitType.mutateAsync({
        input: {
          org_id: property!.org_id,
          property_id: property!.id,
          name: values.name,
          capacity: values.capacity,
          base_price: values.base_price,
        },
        roomsCount: values.rooms_count,
        roomPrefix: values.room_prefix,
      })
      setCreateOpen(false)
      createForm.reset({ capacity: 2, base_price: 0, rooms_count: 1, room_prefix: "Camera " })
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
        patch: { name: values.name, capacity: values.capacity, base_price: values.base_price },
      })
      setEditingType(null)
    } catch {
      toast.error(t("common.error"))
    }
  }

  function openEdit(ut: UnitType) {
    editTypeForm.reset({
      name: ut.name,
      capacity: String(ut.capacity) as unknown as number,
      base_price: String(ut.base_price) as unknown as number,
    })
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
                <TableHead>{t("unit_types.capacity")}</TableHead>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("unit_types.capacity")}</Label>
                <Input type="number" min={1} {...createForm.register("capacity")} />
              </div>
              <div className="space-y-2">
                <Label>{t("unit_types.base_price")} ({property.currency})</Label>
                <Input type="number" min={0} step="0.01" {...createForm.register("base_price")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("unit_types.rooms_count")}</Label>
                <Input type="number" min={1} max={500} {...createForm.register("rooms_count")} />
              </div>
              <div className="space-y-2">
                <Label>{t("unit_types.room_prefix")}</Label>
                <Input {...createForm.register("room_prefix")} />
              </div>
            </div>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("unit_types.capacity")}</Label>
                <Input type="number" min={1} {...editTypeForm.register("capacity")} />
              </div>
              <div className="space-y-2">
                <Label>{t("unit_types.base_price")} ({property.currency})</Label>
                <Input type="number" min={0} step="0.01" {...editTypeForm.register("base_price")} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Modificarea prețului afectează rezervările <strong>viitoare</strong> — cele existente rămân cu prețul lor.
            </p>
            <Button type="submit" className="w-full" disabled={editTypeForm.formState.isSubmitting}>
              {t("common.save")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
