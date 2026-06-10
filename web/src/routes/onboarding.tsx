import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { requireSession } from "@/features/auth/hooks"
import { useCreateOrganization } from "@/features/organizations/hooks"
import { t } from "@/lib/i18n"
import { slugify } from "@/lib/slugify"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card"

const schema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
})
type FormValues = z.infer<typeof schema>

export const Route = createFileRoute("/onboarding")({
  beforeLoad: async () => {
    const session = await requireSession()
    if (!session) throw redirect({ to: "/login" })
  },
  component: OnboardingPage,
})

function OnboardingPage() {
  const navigate = useNavigate()
  const createOrg = useCreateOrganization()
  const form = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    try {
      await createOrg.mutateAsync(values)
      navigate({ to: "/app" })
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">{t("onboarding.title")}</CardTitle>
          <CardDescription>{t("onboarding.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t("onboarding.org_name")}</Label>
              <Input
                id="name"
                {...form.register("name", {
                  onChange: (e) =>
                    form.setValue("slug", slugify(e.target.value)),
                })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">{t("onboarding.org_slug")}</Label>
              <Input id="slug" {...form.register("slug")} />
            </div>
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {t("onboarding.create")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
