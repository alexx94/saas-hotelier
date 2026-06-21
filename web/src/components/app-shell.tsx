import { useState } from "react"
import type { ReactNode } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  BookOpenCheck, Building2, CalendarDays, LayoutDashboard, Menu, Settings2,
  Users, X,
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

// Shell-ul aplicației (sidebar + zonă de conținut), partajat între layout-ul de
// organizație (/org/$orgId) și cel de proprietate (/property/$propertyId).
// Trebuie randat SUB OrgProvider (OrgSwitcher + nav au nevoie de org curentă).
// Proprietatea nu mai apare în URL la nivel de org → `currentPropertyId` e
// opțional; nav-ul operațional apare doar când e o proprietate activă.

// nav operațional, scoped pe proprietatea activă (gate pe permisiuni de view)
const propertyNav = [
  { to: "/property/$propertyId", label: t("nav.dashboard"), icon: LayoutDashboard, exact: true, permission: "dashboard.view" },
  { to: "/property/$propertyId/calendar", label: t("nav.calendar"), icon: CalendarDays, permission: "calendar.view" },
  { to: "/property/$propertyId/bookings", label: t("nav.bookings"), icon: BookOpenCheck, permission: "booking.view" },
  { to: "/property/$propertyId/guests", label: t("nav.guests"), icon: Users, permission: "guest.view" },
  { to: "/property/$propertyId/settings", label: t("nav.property_settings"), icon: Settings2, permission: "property.view" },
] as const

const linkClass =
  "flex items-center gap-3 rounded-md px-3 py-2 text-[15px] text-sidebar-foreground hover:bg-sidebar-accent [&.active]:bg-sidebar-accent [&.active]:font-medium"

function SidebarNav({
  orgId,
  propertyId,
  onNavigate,
}: {
  orgId: string
  propertyId: string | undefined
  onNavigate: () => void
}) {
  const { has, isLoading } = usePermissions()
  const items = isLoading ? propertyNav : propertyNav.filter((i) => has(i.permission))

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto p-2">
      {/* home-ul organizației: listă proprietăți + vizualizare în ansamblu */}
      <Link
        to="/org/$orgId"
        params={{ orgId }}
        activeOptions={{ exact: true }}
        onClick={onNavigate}
        className={linkClass}
      >
        <Building2 className="h-5 w-5 shrink-0" />
        {t("nav.properties")}
      </Link>

      {propertyId &&
        items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            params={{ propertyId }}
            activeOptions={{ exact: "exact" in item && item.exact }}
            onClick={onNavigate}
            className={linkClass}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {item.label}
          </Link>
        ))}
    </nav>
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
  const [sidebarOpen, setSidebarOpen] = useState(false)

  async function logout() {
    await supabase.auth.signOut()
    navigate({ to: "/login" })
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r bg-sidebar transition-transform duration-200",
        "md:static md:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex items-center justify-between border-b p-4">
          <OrgSwitcher />
          <Button
            variant="ghost" size="icon"
            className="md:hidden h-8 w-8 shrink-0 -mr-1"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        {/* selector proprietate (deja filtrat pe acces) */}
        {properties.length > 0 && (
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
          onNavigate={() => setSidebarOpen(false)}
        />
        <div className="border-t p-2">
          <UserMenu onLogout={logout} />
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b bg-background px-4 py-3 md:hidden">
          <Button
            variant="ghost" size="icon"
            className="shrink-0"
            onClick={() => setSidebarOpen(true)}
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
