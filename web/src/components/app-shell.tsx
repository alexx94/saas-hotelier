import { useState } from "react"
import type { ReactNode } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  Activity, BookOpenCheck, Building2, CalendarDays, LayoutDashboard, Menu,
  PanelLeftClose, PanelLeftOpen, Settings2, SprayCan, Users, X,
} from "lucide-react"
import { OrgSwitcher } from "@/features/organizations/org-switcher"
import { PropertySwitcher } from "@/features/properties/property-switcher"
import type { Property } from "@/features/properties/api"
import { UserMenu } from "@/features/auth/user-menu"
import { usePermissions } from "@/features/auth/permissions"
import { supabase } from "@/lib/supabase"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

// Shell-ul aplicației (sidebar + zonă de conținut), partajat între layout-ul de
// organizație (/org/$orgId) și cel de proprietate (/property/$propertyId).
// Trebuie randat SUB OrgProvider — OrgSwitcher și nav-ul au nevoie de org curentă.
// `currentPropertyId` e opțional; nav-ul operațional apare doar când există o proprietate activă.
//
// Sidebar-ul poate fi restrâns pe desktop (persist în localStorage). Când e restrâns
// afișează doar iconițe + tooltip on-hover; comportamentul mobil (overlay) rămâne neschimbat.

// nav operațional, scoped pe proprietatea activă (gate pe permisiuni de view)
const propertyNav = [
  { to: "/property/$propertyId", label: t("nav.dashboard"), icon: LayoutDashboard, exact: true, permission: "dashboard.view" },
  { to: "/property/$propertyId/calendar", label: t("nav.calendar"), icon: CalendarDays, permission: "calendar.view" },
  { to: "/property/$propertyId/bookings", label: t("nav.bookings"), icon: BookOpenCheck, permission: "booking.view" },
  { to: "/property/$propertyId/housekeeping", label: t("nav.housekeeping"), icon: SprayCan, permission: "unit.manage" },
  { to: "/property/$propertyId/guests", label: t("nav.guests"), icon: Users, permission: "guest.view" },
  { to: "/property/$propertyId/activity", label: t("nav.activity"), icon: Activity, permission: "audit.view" },
] as const

const settingsNav = {
  to: "/property/$propertyId/settings",
  label: t("nav.property_settings"),
  icon: Settings2,
  permission: "property.view",
} as const

const SIDEBAR_STORAGE_KEY = "sidebar:collapsed"

const linkExpanded =
  "flex items-center gap-3 rounded-md px-3 py-2 text-[15px] text-sidebar-foreground hover:bg-sidebar-accent [&.active]:bg-sidebar-accent [&.active]:font-medium"
const linkCollapsed =
  "flex items-center justify-center rounded-md p-2 text-sidebar-foreground hover:bg-sidebar-accent [&.active]:bg-sidebar-accent"

function NavLink({
  to,
  params,
  icon: Icon,
  label,
  collapsed,
  onClick,
  exact,
}: {
  to: string
  params: Record<string, string>
  icon: React.ElementType
  label: string
  collapsed: boolean
  onClick: () => void
  exact?: boolean
}) {
  const inner = (
    <Link
      to={to}
      params={params}
      activeOptions={{ exact }}
      onClick={onClick}
      className={collapsed ? linkCollapsed : linkExpanded}
    >
      <Icon className="h-5 w-5 shrink-0" />
      {!collapsed && label}
    </Link>
  )

  if (!collapsed) return inner

  return (
    <Tooltip>
      <TooltipTrigger asChild>{inner}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

function SidebarNav({
  orgId,
  propertyId,
  collapsed,
  onNavigate,
  onLogout,
}: {
  orgId: string
  propertyId: string | undefined
  collapsed: boolean
  onNavigate: () => void
  onLogout: () => void
}) {
  const { has, isLoading } = usePermissions()
  const mainItems = isLoading ? propertyNav : propertyNav.filter((i) => has(i.permission))
  const showSettings = propertyId && (isLoading || has(settingsNav.permission))

  const propertiesInner = (
    <Link
      to="/org/$orgId"
      params={{ orgId }}
      activeOptions={{ exact: true }}
      onClick={onNavigate}
      className={collapsed ? linkCollapsed : linkExpanded}
    >
      <Building2 className="h-5 w-5 shrink-0" />
      {!collapsed && t("nav.properties")}
    </Link>
  )

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* main nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>{propertiesInner}</TooltipTrigger>
            <TooltipContent side="right">{t("nav.properties")}</TooltipContent>
          </Tooltip>
        ) : propertiesInner}

        {propertyId &&
          mainItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              params={{ propertyId }}
              icon={item.icon}
              label={item.label}
              collapsed={collapsed}
              onClick={onNavigate}
              exact={"exact" in item ? item.exact : undefined}
            />
          ))}
      </nav>

      {/* settings (jos, deasupra user) + user menu */}
      <div className="space-y-1 border-t p-2">
        {showSettings && (
          <>
            <NavLink
              to={settingsNav.to}
              params={{ propertyId: propertyId! }}
              icon={settingsNav.icon}
              label={settingsNav.label}
              collapsed={collapsed}
              onClick={onNavigate}
            />
            <Separator className="my-1" />
          </>
        )}
        <UserMenu onLogout={onLogout} collapsed={collapsed} />
      </div>
    </div>
  )
}

export function AppShell({
  orgId,
  properties,
  currentPropertyId,
  children,
}: {
  orgId: string
  properties: Property[]
  currentPropertyId?: string
  children: ReactNode
}) {
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true"
  )

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next))
  }

  async function logout() {
    await supabase.auth.signOut()
    navigate({ to: "/login" })
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex flex-col border-r bg-sidebar transition-all duration-200",
        "md:static md:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
        collapsed ? "md:w-14" : "md:w-60",
        "w-60"
      )}>
        {/* header */}
        <div className={cn(
          "flex items-center border-b",
          collapsed ? "justify-center p-2" : "justify-between p-4"
        )}>
          {!collapsed && <OrgSwitcher />}

          {/* mobile: X button */}
          <Button
            variant="ghost" size="icon"
            className="md:hidden h-8 w-8 shrink-0"
            onClick={() => setMobileOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>

          {/* desktop: collapse/expand toggle */}
          <Button
            variant="ghost" size="icon"
            className="hidden md:flex h-8 w-8 shrink-0"
            onClick={toggleCollapsed}
            title={collapsed ? t("nav.expand_sidebar") : t("nav.collapse_sidebar")}
          >
            {collapsed
              ? <PanelLeftOpen className="h-4 w-4" />
              : <PanelLeftClose className="h-4 w-4" />
            }
          </Button>
        </div>

        {/* property switcher (hidden when collapsed) */}
        {!collapsed && properties.length > 0 && (
          <div className="border-b p-2">
            <PropertySwitcher
              orgId={orgId}
              properties={properties}
              currentPropertyId={currentPropertyId}
            />
          </div>
        )}

        <SidebarNav
          orgId={orgId}
          propertyId={currentPropertyId}
          collapsed={collapsed}
          onNavigate={() => setMobileOpen(false)}
          onLogout={logout}
        />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b bg-background px-4 py-3 md:hidden">
          <Button
            variant="ghost" size="icon"
            className="shrink-0"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <OrgSwitcher />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
