import { useState } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, MoreVertical, Trash2 } from "lucide-react"
import type { UnitType } from "@/features/unit-types/api"
import { sitePhotoUrl, type SitePhoto } from "./api"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { ConfirmDialog } from "@/components/confirm-dialog"

const GENERAL_VALUE = "__general__"

export function SortablePhotoCard({
  photo,
  unitTypes,
  onUpdate,
  onDelete,
}: {
  photo: SitePhoto
  unitTypes: UnitType[]
  onUpdate: (id: string, patch: { unit_type_id?: string | null; alt?: string }) => void
  onDelete: (photo: SitePhoto) => void
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [altDraft, setAltDraft] = useState(photo.alt ?? "")
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: photo.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const taggedType = unitTypes.find((u) => u.id === photo.unit_type_id)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative aspect-video overflow-hidden rounded-md border bg-muted",
        isDragging && "z-10 opacity-70"
      )}
    >
      <img
        src={sitePhotoUrl(photo.storage_path)}
        alt={photo.alt ?? ""}
        className="h-full w-full object-cover"
      />

      <button
        {...attributes}
        {...listeners}
        className="absolute left-2 top-2 flex h-7 w-7 cursor-grab items-center justify-center rounded-md bg-background/80 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {taggedType && (
        <Badge variant="secondary" className="absolute bottom-2 left-2">
          {taggedType.name}
        </Badge>
      )}

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="secondary" size="icon"
            className="absolute right-2 top-2 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 space-y-3" align="end">
          <div className="space-y-2">
            <Label className="text-xs">{t("site_builder.photos.tag_label")}</Label>
            <Select
              value={photo.unit_type_id ?? GENERAL_VALUE}
              onValueChange={(v) =>
                onUpdate(photo.id, { unit_type_id: v === GENERAL_VALUE ? null : v })}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={GENERAL_VALUE}>{t("site_builder.photos.general")}</SelectItem>
                {unitTypes.filter((u) => u.is_active).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">{t("site_builder.photos.alt_label")}</Label>
            <Input
              value={altDraft}
              onChange={(e) => setAltDraft(e.target.value)}
              onBlur={() => onUpdate(photo.id, { alt: altDraft })}
            />
          </div>
          <Button
            variant="destructive" size="sm" className="w-full"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            {t("common.delete")}
          </Button>
        </PopoverContent>
      </Popover>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("site_builder.photos.delete_title")}
        description={t("site_builder.photos.delete_description")}
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={() => onDelete(photo)}
      />
    </div>
  )
}
