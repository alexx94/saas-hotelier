import { useState } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Building2, Plus } from "lucide-react"
import { useCurrentOrg } from "@/features/organizations/context"
import { usePermissions } from "@/features/auth/permissions"
import { Can } from "@/features/auth/can"
import { useCreateProperty, useProperties } from "@/features/properties/hooks"
import { DashboardOrgOverview } from "@/features/dashboard/dashboard-org-overview"
import { t } from "@/lib/i18n"
import { slugify } from "@/lib/slugify"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

export const Route = createFileRoute("/_app/org/$orgId/")({
  component: OrgHomePage,
})

const propertyTypes = ["hotel", "villa", "apartment", "hostel", "guesthouse"] as const

const schema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  type: z.enum(propertyTypes),
  city: z.string().optional(),
  currency: z.string().length(3),
})
type FormValues = z.infer<typeof schema>

function OrgHomePage() {
  const { orgId } = Route.useParams()
  const { currentOrg } = useCurrentOrg()
  const { has } = usePermissions()
  const { data: properties, isLoading } = useProperties(orgId)
  const createProperty = useCreateProperty()
  const [open, setOpen] = useState(false)

  // vizualizare în ansamblu = doar owner/admin (nerestrânși la proprietăți);
  // RPC-ul agregat dă oricum FORBIDDEN pe roluri restrânse (defense in depth)
  const canSeeOverview = currentOrg.role === "owner" || has("role.manage")

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { type: "hotel", currency: "RON" },
  })

  async function onSubmit(values: FormValues) {
    try {
      await createProperty.mutateAsync({
        ...values,
        currency: values.currency.toUpperCase(),
        org_id: orgId,
      })
      setOpen(false)
      form.reset({ type: "hotel", currency: "RON" })
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{currentOrg.name}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <Can permission="property.create">
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                {t("properties.add")}
              </Button>
            </DialogTrigger>
          </Can>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("properties.add")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t("properties.name")}</Label>
                <Input
                  id="name"
                  {...form.register("name", {
                    onChange: (e) => form.setValue("slug", slugify(e.target.value)),
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">{t("properties.slug")}</Label>
                <Input id="slug" {...form.register("slug")} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("properties.type")}</Label>
                  <Select
                    defaultValue="hotel"
                    onValueChange={(v) => form.setValue("type", v as FormValues["type"])}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {propertyTypes.map((pt) => (
                        <SelectItem key={pt} value={pt}>
                          {t(`properties.type.${pt}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">{t("properties.currency")}</Label>
                  <Input id="currency" maxLength={3} {...form.register("currency")} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">{t("properties.city")}</Label>
                <Input id="city" {...form.register("city")} />
              </div>
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {t("common.save")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* vizualizare în ansamblu (owner/admin) — agregat pe toate proprietățile */}
      {canSeeOverview && (properties?.length ?? 0) > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            {t("dashboard.org_overview")}
          </h2>
          <DashboardOrgOverview orgId={orgId} enabled={canSeeOverview} />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t("properties.title")}</h2>
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        ) : !properties || properties.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Building2 className="h-8 w-8" />
              {t("properties.empty")}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((p) => (
              <Link
                key={p.id}
                to="/property/$propertyId"
                params={{ propertyId: p.id }}
              >
                <Card className="transition-colors hover:bg-accent/50">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between text-lg">
                      {p.name}
                      <Badge variant={p.is_published ? "default" : "secondary"}>
                        {p.is_published
                          ? t("properties.published")
                          : t("properties.unpublished")}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {t(`properties.type.${p.type as (typeof propertyTypes)[number]}`)}
                    {p.city ? ` · ${p.city}` : ""} · {p.currency}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
