import { useState } from "react"
import { toast } from "sonner"
import { Check, X } from "lucide-react"
import type { Property } from "@/features/properties/api"
import { isDuplicateSlugError, isSiteSlugValid, slugify } from "./api"
import { useCreatePropertySite, useSlugAvailability } from "./hooks"
import { errorMessage } from "@/lib/errors"
import { t } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function CreateSiteCard({ property }: { property: Property }) {
  const [slug, setSlug] = useState(() => slugify(property.name))
  const createSite = useCreatePropertySite(property.id)

  const syntacticallyValid = isSiteSlugValid(slug)
  const { data: available, isFetching: checkingAvailability } = useSlugAvailability(slug)

  const canSubmit = syntacticallyValid && available === true && !createSite.isPending

  async function onSubmit() {
    if (!canSubmit) return
    try {
      await createSite.mutateAsync({ orgId: property.org_id, slug })
      toast.success(t("site_builder.create.success"))
    } catch (e) {
      if (isDuplicateSlugError(e)) {
        toast.error(t("site_builder.create.duplicate_slug"))
      } else {
        toast.error(errorMessage(e) || t("common.error"))
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("site_builder.create.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("site_builder.create.description")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>{t("site_builder.create.slug_label")}</Label>
          <div className="relative">
            <Input
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              className="pr-9"
            />
            {syntacticallyValid && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {checkingAvailability ? (
                  <span className="text-xs text-muted-foreground">...</span>
                ) : available === true ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : available === false ? (
                  <X className="h-4 w-4 text-destructive" />
                ) : null}
              </div>
            )}
          </div>
          {!syntacticallyValid && slug.length > 0 && (
            <p className="text-xs text-destructive">{t("site_builder.create.slug_invalid")}</p>
          )}
          {syntacticallyValid && available === false && (
            <p className="text-xs text-destructive">{t("site_builder.create.slug_taken")}</p>
          )}
          {syntacticallyValid && available === true && (
            <p className="text-xs text-green-600">{t("site_builder.create.slug_available")}</p>
          )}
          <p className="text-xs text-muted-foreground">{t("site_builder.create.slug_hint")}</p>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("site_builder.create.preview")}</Label>
          <p className="font-mono text-sm">/s/{slug || "..."}</p>
        </div>

        <Button onClick={onSubmit} disabled={!canSubmit}>
          {t("site_builder.create.submit")}
        </Button>
      </CardContent>
    </Card>
  )
}
