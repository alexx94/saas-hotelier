import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Map as MapIcon } from "lucide-react"
import {
  extractMapEmbedSrc, siteContentSchema, type PropertySite, type SiteContent,
} from "./api"
import { useUpdatePropertySite } from "./hooks"
import { ServicesEditor } from "./services-editor"
import { OccupancyStepper } from "@/features/pricing/occupancy-stepper"
import { errorMessage } from "@/lib/errors"
import { t } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

function SectionCard({
  title,
  enabled,
  onToggleEnabled,
  children,
}: {
  title: string
  enabled?: boolean
  onToggleEnabled?: (v: boolean) => void
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>{title}</CardTitle>
        {onToggleEnabled && (
          <Switch checked={enabled} onCheckedChange={onToggleEnabled} />
        )}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

export function SiteContentForm({
  site,
  propertyName,
}: {
  site: PropertySite
  propertyName: string
}) {
  const updateSite = useUpdatePropertySite(site.property_id)

  const form = useForm<SiteContent>({
    resolver: zodResolver(siteContentSchema),
    defaultValues: site.content as SiteContent,
  })

  const hero = form.watch("hero")
  const about = form.watch("about")
  const roomsTeaser = form.watch("rooms_teaser")
  const services = form.watch("services")
  const map = form.watch("map")
  const contact = form.watch("contact")
  const pages = form.watch("pages")

  // contact + hartă nu fac parte din `content` jsonb (coloane dedicate pe
  // property_sites) — le ținem ca state simplu, separat de RHF/content.
  const [contactPhoneValue, setContactPhoneValue] = useState(site.contact_phone ?? "")
  const [contactEmailValue, setContactEmailValue] = useState(site.contact_email ?? "")
  const [mapEmbedInput, setMapEmbedInput] = useState(site.map_embed_url ?? "")

  async function onSubmit(values: SiteContent) {
    try {
      await updateSite.mutateAsync({
        id: site.id,
        patch: {
          content: values,
          contact_phone: contact.enabled ? (contactPhoneValue || null) : site.contact_phone,
          contact_email: contact.enabled ? (contactEmailValue || null) : site.contact_email,
          map_embed_url: mapEmbedInput ? extractMapEmbedSrc(mapEmbedInput) : null,
        },
      })
      toast.success(t("site_builder.content.saved"))
    } catch (e) {
      toast.error(errorMessage(e) || t("common.error"))
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <SectionCard title={t("site_builder.content.hero.title")}>
        <div className="space-y-2">
          <Label>{t("site_builder.content.hero.title_label")}</Label>
          <Input
            placeholder={propertyName}
            value={hero.title ?? ""}
            onChange={(e) => form.setValue("hero.title", e.target.value || null)}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("site_builder.content.hero.subtitle_label")}</Label>
          <Input
            value={hero.subtitle ?? ""}
            onChange={(e) => form.setValue("hero.subtitle", e.target.value || null)}
          />
        </div>
      </SectionCard>

      <SectionCard
        title={t("site_builder.content.about.title")}
        enabled={about.enabled}
        onToggleEnabled={(v) => form.setValue("about.enabled", v)}
      >
        <div className="space-y-2">
          <Label>{t("site_builder.content.about.text_label")}</Label>
          <Textarea
            rows={4}
            value={about.text ?? ""}
            onChange={(e) => form.setValue("about.text", e.target.value || null)}
          />
        </div>
      </SectionCard>

      <SectionCard
        title={t("site_builder.content.rooms_teaser.title")}
        enabled={roomsTeaser.enabled}
        onToggleEnabled={(v) => form.setValue("rooms_teaser.enabled", v)}
      >
        <OccupancyStepper
          label={t("site_builder.content.rooms_teaser.count_label")}
          value={roomsTeaser.count}
          onChange={(v) => form.setValue("rooms_teaser.count", v)}
          min={2}
          max={4}
        />
      </SectionCard>

      <SectionCard
        title={t("site_builder.content.services.title")}
        enabled={services.enabled}
        onToggleEnabled={(v) => form.setValue("services.enabled", v)}
      >
        <ServicesEditor
          items={services.items}
          onChange={(items) => form.setValue("services.items", items)}
        />
      </SectionCard>

      <SectionCard
        title={t("site_builder.content.map.title")}
        enabled={map.enabled}
        onToggleEnabled={(v) => form.setValue("map.enabled", v)}
      >
        <div className="space-y-2">
          <Label>{t("site_builder.content.map.embed_label")}</Label>
          <Textarea
            rows={3}
            value={mapEmbedInput}
            onChange={(e) => setMapEmbedInput(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("site_builder.content.map.embed_hint")}</p>
          {mapEmbedInput.trim() && !extractMapEmbedSrc(mapEmbedInput) && (
            <p className="text-xs text-destructive">{t("site_builder.content.map.embed_invalid")}</p>
          )}
        </div>
        {extractMapEmbedSrc(mapEmbedInput) && (
          <div className="space-y-2">
            <Label className="flex items-center gap-1 text-xs">
              <MapIcon className="h-3 w-3" />{t("site_builder.content.map.preview")}
            </Label>
            <iframe
              src={extractMapEmbedSrc(mapEmbedInput)!}
              className="h-40 w-full rounded-md border"
              loading="lazy"
              title="map-preview"
            />
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={t("site_builder.content.contact.title")}
        enabled={contact.enabled}
        onToggleEnabled={(v) => form.setValue("contact.enabled", v)}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("site_builder.content.contact.phone_label")}</Label>
            <Input value={contactPhoneValue} onChange={(e) => setContactPhoneValue(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("site_builder.content.contact.email_label")}</Label>
            <Input
              type="email"
              value={contactEmailValue}
              onChange={(e) => setContactEmailValue(e.target.value)}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title={t("site_builder.content.pages.title")}>
        <div className="flex items-center justify-between">
          <Label>{t("site_builder.content.pages.rooms_label")}</Label>
          <Switch checked={pages.rooms} onCheckedChange={(v) => form.setValue("pages.rooms", v)} />
        </div>
        <div className="flex items-center justify-between">
          <Label>{t("site_builder.content.pages.book_label")}</Label>
          <Switch checked={pages.book} onCheckedChange={(v) => form.setValue("pages.book", v)} />
        </div>
      </SectionCard>

      <Button type="submit" disabled={form.formState.isSubmitting || updateSite.isPending}>
        {t("site_builder.content.save")}
      </Button>
    </form>
  )
}
