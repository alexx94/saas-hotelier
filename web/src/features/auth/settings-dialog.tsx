import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { useLocation, useNavigate } from "@tanstack/react-router"
import { Shield, User, Users } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { useHasPermission } from "@/features/auth/permissions"
import { useMyProfile, useUpdateMyProfile } from "@/features/auth/profile"
import { MembersSection } from "@/features/members/members-section"
import { RolesSection } from "@/features/roles/roles-section"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"

// ─── hash routing ─────────────────────────────────────────────────────────────
// URL pattern: #settings/<section>  ex: #settings/account
// Folosim hash-ul nativ TanStack Router (useLocation/useNavigate) — reactiv,
// gestionează automat back/forward, fără event listeners manuale.

const HASH_PREFIX = "settings/"

/** hash-ul de deschidere pentru o secțiune; folosit cu <Link hash> sau navigate({ hash }) */
export function settingsHash(section: SectionId = "account") {
  return `${HASH_PREFIX}${section}`
}

function parseSettingsHash(hash: string): { open: boolean; section: string } {
  const match = hash.replace(/^#/, "").match(/^settings\/(.*)$/)
  return { open: !!match, section: match?.[1] ?? "account" }
}

// ─── secțiuni (scalabil) ──────────────────────────────────────────────────────

type SectionId = "account" | "members" | "roles"

type Section = { id: SectionId; label: string; icon: React.ElementType; permission?: string }

const SECTIONS: Section[] = [
  { id: "account", label: t("settings.account"), icon: User },
  { id: "members", label: t("settings.members"), icon: Users, permission: "user.manage" },
  { id: "roles", label: t("settings.roles"), icon: Shield, permission: "user.manage" },
]

// ─── secțiunea Cont ───────────────────────────────────────────────────────────

const pwSchema = z
  .object({
    password: z.string().min(6, "Minim 6 caractere"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Parolele nu se potrivesc",
    path: ["confirm"],
  })
type PwValues = z.infer<typeof pwSchema>

function NameField() {
  const { data: profile } = useMyProfile()
  const update = useUpdateMyProfile()
  const [name, setName] = useState("")
  const [dirty, setDirty] = useState(false)
  const value = dirty ? name : (profile?.full_name ?? "")

  function save() {
    update.mutate(value, {
      onSuccess: () => { toast.success(t("settings.name_saved")); setDirty(false) },
      onError: () => toast.error(t("common.error")),
    })
  }

  return (
    <div className="space-y-1.5">
      <Label>{t("settings.name")}</Label>
      <div className="flex gap-2">
        <Input
          value={value}
          placeholder={t("settings.name_placeholder")}
          onChange={(e) => { setName(e.target.value); setDirty(true) }}
        />
        <Button onClick={save} disabled={!dirty || update.isPending}>{t("common.save")}</Button>
      </div>
    </div>
  )
}

function AccountSection({ email }: { email: string | null }) {
  const form = useForm<PwValues>({
    resolver: zodResolver(pwSchema),
    defaultValues: { password: "", confirm: "" },
  })

  async function onSubmit(values: PwValues) {
    const { error } = await supabase.auth.updateUser({ password: values.password })
    if (error) {
      toast.error(t("common.error"))
      return
    }
    toast.success(t("auth.password_changed"))
    form.reset()
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">{t("settings.account")}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Gestionează datele contului tău.
        </p>
      </div>

      <NameField />

      <div className="space-y-1.5">
        <Label>{t("auth.email")}</Label>
        <Input value={email ?? ""} disabled readOnly className="bg-muted cursor-default" />
        <p className="text-xs text-muted-foreground">
          Emailul nu poate fi schimbat momentan.
        </p>
      </div>

      <Separator />

      <div className="space-y-3">
        <p className="text-sm font-medium">{t("auth.change_password")}</p>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 max-w-sm">
          <div className="space-y-1.5">
            <Label>{t("auth.new_password")}</Label>
            <Input
              type="password"
              autoComplete="new-password"
              {...form.register("password")}
            />
            {form.formState.errors.password && (
              <p className="text-xs text-destructive">
                {form.formState.errors.password.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>{t("auth.confirm_password")}</Label>
            <Input
              type="password"
              autoComplete="new-password"
              {...form.register("confirm")}
            />
            {form.formState.errors.confirm && (
              <p className="text-xs text-destructive">
                {form.formState.errors.confirm.message}
              </p>
            )}
          </div>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {t("auth.change_password")}
          </Button>
        </form>
      </div>
    </div>
  )
}

// ─── dialog principal ─────────────────────────────────────────────────────────

export function SettingsDialog({ email }: { email: string | null }) {
  // useLocation e reactiv — re-randează la orice schimbare de hash (inclusiv back/forward)
  const { hash } = useLocation()
  const navigate = useNavigate()
  const { open, section } = parseSettingsHash(hash)

  // secțiunile de management sunt vizibile doar cu permisiunea aferentă
  const canMembers = useHasPermission("user.manage").allowed
  const canRoles = useHasPermission("user.manage").allowed
  const sections = SECTIONS.filter((s) =>
    s.id === "members" ? canMembers : s.id === "roles" ? canRoles : true
  )

  const activeSection: SectionId = sections.some((s) => s.id === section)
    ? (section as SectionId)
    : "account"

  function goToSection(id: SectionId) {
    navigate({ to: ".", hash: settingsHash(id) })
  }

  function close() {
    // hash gol → TanStack elimină '#' din URL, păstrând pathname-ul curent
    navigate({ to: ".", hash: "" })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent className="max-w-[56rem] p-0 gap-0 overflow-hidden sm:max-w-[56rem]">
        <DialogTitle className="sr-only">{t("nav.settings")}</DialogTitle>

        <div className="flex flex-col sm:flex-row h-[80vh] max-h-[720px]">
          {/* Sidebar — icons pe mobil, text pe sm+ */}
          <aside className="flex flex-row gap-1 border-b p-2 sm:flex-col sm:w-52 sm:border-b-0 sm:border-r sm:p-3 shrink-0">
            <div className="hidden sm:block px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide select-none">
              {t("nav.settings")}
            </div>
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => goToSection(s.id)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors sm:w-full",
                  activeSection === s.id
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <s.icon className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            ))}
          </aside>

          {/* Conținut secțiune — pt mărit ca header-ul (cu butoanele lui din dreapta)
              să înceapă SUB butonul de închidere (X), fără suprapunere */}
          <div className="flex-1 overflow-y-auto px-5 pb-6 pt-12 sm:px-8 sm:pt-14">
            {activeSection === "account" && <AccountSection email={email} />}
            {activeSection === "members" && canMembers && <MembersSection />}
            {activeSection === "roles" && canRoles && <RolesSection />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
