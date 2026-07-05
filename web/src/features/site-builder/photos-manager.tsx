import { useRef } from "react"
import { toast } from "sonner"
import { ImageIcon, Upload } from "lucide-react"
import {
  closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove, rectSortingStrategy, SortableContext,
} from "@dnd-kit/sortable"
import { useUnitTypes } from "@/features/unit-types/hooks"
import {
  useDeleteSitePhoto, useReorderSitePhotos, useSitePhotos, useUpdateSitePhoto, useUploadSitePhoto,
} from "./hooks"
import { InvalidPhotoError, type SitePhoto } from "./api"
import { SortablePhotoCard } from "./sortable-photo-card"
import { errorMessage } from "@/lib/errors"
import { t } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function PhotosManager({
  propertyId,
  orgId,
}: {
  propertyId: string
  orgId: string
}) {
  const { data: photos, isLoading } = useSitePhotos(propertyId)
  const { data: unitTypes } = useUnitTypes(propertyId)
  const uploadPhoto = useUploadSitePhoto(propertyId, orgId)
  const updatePhoto = useUpdateSitePhoto(propertyId)
  const deletePhoto = useDeleteSitePhoto(propertyId)
  const reorderPhotos = useReorderSitePhotos(propertyId)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    for (const file of Array.from(files)) {
      try {
        await uploadPhoto.mutateAsync(file)
      } catch (e) {
        if (e instanceof InvalidPhotoError) {
          toast.error(t(e.message as Parameters<typeof t>[0]))
        } else {
          toast.error(errorMessage(e) || t("site_builder.photos.upload_error"))
        }
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !photos) return
    const oldIndex = photos.findIndex((p) => p.id === active.id)
    const newIndex = photos.findIndex((p) => p.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(photos, oldIndex, newIndex)
    reorderPhotos.mutate(reordered.map((p, index) => ({ id: p.id, sort_order: index })))
  }

  async function handleUpdate(id: string, patch: { unit_type_id?: string | null; alt?: string }) {
    try {
      await updatePhoto.mutateAsync({ id, patch })
      toast.success(t("site_builder.photos.updated"))
    } catch (e) {
      toast.error(errorMessage(e) || t("common.error"))
    }
  }

  async function handleDelete(photo: SitePhoto) {
    try {
      await deletePhoto.mutateAsync(photo)
    } catch (e) {
      toast.error(errorMessage(e) || t("common.error"))
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>{t("site_builder.photos.title")}</CardTitle>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button
            size="sm"
            disabled={uploadPhoto.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            {uploadPhoto.isPending ? t("site_builder.photos.uploading") : t("site_builder.photos.upload")}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !photos || photos.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-12 text-muted-foreground">
            <ImageIcon className="h-8 w-8" />
            <p className="text-sm">{t("site_builder.photos.empty")}</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={photos.map((p) => p.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {photos.map((photo) => (
                  <SortablePhotoCard
                    key={photo.id}
                    photo={photo}
                    unitTypes={unitTypes ?? []}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
    </Card>
  )
}
