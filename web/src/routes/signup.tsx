import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { t } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card"

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})
type FormValues = z.infer<typeof schema>

export const Route = createFileRoute("/signup")({
  component: SignupPage,
})

function SignupPage() {
  const navigate = useNavigate()
  const form = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    const { data, error } = await supabase.auth.signUp(values)
    if (error) {
      toast.error(error.message)
      return
    }
    if (data.session) {
      navigate({ to: "/onboarding" })
    } else {
      toast.success(t("auth.signup_success"))
      navigate({ to: "/login" })
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">{t("auth.signup")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input id="email" type="email" {...form.register("email")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input id="password" type="password" {...form.register("password")} />
            </div>
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {t("auth.signup")}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {t("auth.have_account")}{" "}
              <Link to="/login" className="underline">{t("auth.login")}</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
