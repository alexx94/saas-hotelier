import { Check, ChevronsUpDown, Home } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import type { Property } from "./api"
import { t } from "@/lib/i18n"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// Comutator de proprietate din sidebar. Lista e deja filtrată pe acces (RLS →
// useProperties), deci vezi doar proprietățile tale. Selecția = navigare la
// panoul proprietății; intrarea „Toate proprietățile" duce la home-ul org.
export function PropertySwitcher({
  orgId,
  properties,
  currentPropertyId,
}: {
  orgId: string
  properties: Property[]
  currentPropertyId: string | undefined
}) {
  const navigate = useNavigate()
  const current = properties.find((p) => p.id === currentPropertyId)

  if (properties.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-sm outline-none hover:bg-sidebar-accent">
        <span className="truncate">
          {current?.name ?? t("properties.select_placeholder")}
        </span>
        <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem
          onClick={() => navigate({ to: "/org/$orgId", params: { orgId } })}
        >
          <Home className="h-4 w-4 text-muted-foreground" />
          <span className="truncate">{t("nav.all_properties")}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {properties.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onClick={() =>
              navigate({
                to: "/property/$propertyId",
                params: { propertyId: p.id },
              })
            }
          >
            <span className="truncate">{p.name}</span>
            {p.id === currentPropertyId && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
