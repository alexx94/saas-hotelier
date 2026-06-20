import { Building2, Check, ChevronsUpDown } from "lucide-react"
import { useCurrentOrg } from "./context"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// Comutator de organizație (doar org-urile la care ai acces — useMyOrganizations
// întoarce membership-urile tale). Cu o singură org afișează doar numele.
export function OrgSwitcher() {
  const { orgs, currentOrg, setCurrentOrgId } = useCurrentOrg()

  if (orgs.length <= 1) {
    return <p className="min-w-0 truncate font-semibold">{currentOrg.name}</p>
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 outline-none hover:bg-sidebar-accent">
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate font-semibold">{currentOrg.name}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {orgs.map((o) => (
          <DropdownMenuItem key={o.id} onClick={() => setCurrentOrgId(o.id)}>
            <span className="truncate">{o.name}</span>
            {o.id === currentOrg.id && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
