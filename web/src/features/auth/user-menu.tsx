import { useEffect, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { LogOut, Settings, User } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { t } from "@/lib/i18n"
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { useMyProfile } from "./profile"
import { SettingsDialog, settingsHash } from "./settings-dialog"

export function UserMenu({ onLogout }: { onLogout: () => void }) {
  const [email, setEmail] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()
  const { data: profile } = useMyProfile()
  const displayName = profile?.full_name || email

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null))
  }, [])

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
              <User className="h-4 w-4" />
            </div>
            <span className="min-w-0 flex-1 truncate text-left text-xs">
              {displayName ?? "…"}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" sideOffset={4} className="w-56 p-1">
          {email && (
            <>
              <p className="px-2 py-1.5 text-xs text-muted-foreground truncate select-none">
                {email}
              </p>
              <Separator className="my-1" />
            </>
          )}
          <button
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
            onClick={() => { setMenuOpen(false); navigate({ to: ".", hash: settingsHash("account") }) }}
          >
            <Settings className="h-4 w-4 shrink-0" />
            {t("nav.settings")}
          </button>
          <Separator className="my-1" />
          <button
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
            onClick={() => { setMenuOpen(false); onLogout() }}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {t("auth.logout")}
          </button>
        </PopoverContent>
      </Popover>

      <SettingsDialog email={email} />
    </>
  )
}
