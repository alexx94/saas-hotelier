import type { ReactNode } from "react"
import { toast } from "sonner"
import { CalendarOff } from "lucide-react"
import { useSetUnitStatus } from "./hooks"
import type { UnitStatus } from "./api"
import {
  UNIT_STATUS_DOT_CLASS, UNIT_STATUS_LABEL, UNIT_STATUSES,
} from "./unit-status"
import { t } from "@/lib/i18n"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// Meniu de acțiuni rapide pe o cameră (folosit în calendar): schimbare status
// permanent + gestionare blocaje — aceleași mutații ca pe pagina proprietății.
export function UnitActionsMenu({
  unitId, unitName, unitStatus, propertyId, onManageBlocks, children,
}: {
  unitId: string
  unitName: string
  unitStatus: UnitStatus
  propertyId: string
  onManageBlocks: () => void
  children: ReactNode
}) {
  const setStatus = useSetUnitStatus(propertyId)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{unitName}</DropdownMenuLabel>
        {UNIT_STATUSES.map((s) => (
          <DropdownMenuItem
            key={s}
            disabled={s === unitStatus}
            onClick={async () => {
              const result = await setStatus.mutateAsync({ id: unitId, status: s })
              if (result === "has_future_bookings") {
                toast.error(t("unit.has_future_bookings"))
              } else if (s === "archived") {
                toast.info(t("unit.archived_warning"))
              }
            }}
          >
            <span className={`mr-2 inline-block h-2 w-2 rounded-full ${UNIT_STATUS_DOT_CLASS[s]}`} />
            {t(UNIT_STATUS_LABEL[s])}
          </DropdownMenuItem>
        ))}
        {unitStatus === "active" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onManageBlocks}>
              <CalendarOff className="mr-2 h-3.5 w-3.5" />
              {t("blocks.manage")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
