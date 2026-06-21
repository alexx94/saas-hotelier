import { Building2, Check, ChevronsUpDown, Grid2x2 } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { useCurrentOrg } from "./context"
import { t } from "@/lib/i18n"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// Comutator de organizație. Mereu un dropdown (chiar și cu o singură org) ca să
// existe mereu calea subtilă „Toate organizațiile" → /org (stil Supabase).
// Schimbarea organizației = navigare la home-ul ei; proprietatea curentă nu se
// mai aplică la altă org.
export function OrgSwitcher() {
  const { orgs, currentOrg } = useCurrentOrg()
  const navigate = useNavigate()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 outline-none hover:bg-sidebar-accent">
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate font-semibold">{currentOrg.name}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {orgs.map((o) => (
          <DropdownMenuItem
            key={o.id}
            onClick={() => navigate({ to: "/org/$orgId", params: { orgId: o.id } })}
          >
            <span className="truncate">{o.name}</span>
            {o.id === currentOrg.id && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate({ to: "/org" })}>
          <Grid2x2 className="h-4 w-4 text-muted-foreground" />
          <span className="truncate">{t("nav.all_organizations")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
