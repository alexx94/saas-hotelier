import { useState } from "react"
import {
  createFileRoute, Link, Navigate, Outlet, redirect, useNavigate,
} from "@tanstack/react-router"
import {
  BookOpenCheck, Building2, CalendarDays, LayoutDashboard, Menu, Users, X,
} from "lucide-react"
import { requireSession } from "@/features/auth/hooks"
import { UserMenu } from "@/features/auth/user-menu"
import { useMyOrganizations } from "@/features/organizations/hooks"
import { OrgProvider } from "@/features/organizations/context"
import { supabase } from "@/lib/supabase"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const session = await requireSession()
    if (!session) throw redirect({ to: "/login" })
  },
  component: AppLayout,
})

const navItems = [
  { to: "/app", label: t("nav.dashboard"), icon: LayoutDashboard, exact: true },
  { to: "/app/properties", label: t("nav.properties"), icon: Building2 },
  { to: "/app/calendar", label: t("nav.calendar"), icon: CalendarDays },
  { to: "/app/bookings", label: t("nav.bookings"), icon: BookOpenCheck },
  { to: "/app/guests", label: t("nav.guests"), icon: Users },
] as const

function AppLayout() {
  const navigate = useNavigate()
  const { data: orgs, isLoading } = useMyOrganizations()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!orgs || orgs.length === 0) {
    return <Navigate to="/onboarding" />
  }

  async function logout() {
    await supabase.auth.signOut()
    navigate({ to: "/login" })
  }

  return (
    <OrgProvider orgs={orgs}>
      <div className="flex min-h-screen">
        {/* Backdrop mobil */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r bg-sidebar transition-transform duration-200",
          "md:static md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          <div className="flex items-center justify-between border-b p-4">
            <p className="font-semibold truncate">{orgs[0].name}</p>
            <Button
              variant="ghost" size="icon"
              className="md:hidden h-8 w-8 shrink-0 -mr-1"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <nav className="flex-1 space-y-1 p-2">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: "exact" in item && item.exact }}
                onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent [&.active]:bg-sidebar-accent [&.active]:font-medium"
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="border-t p-2">
            <UserMenu onLogout={logout} />
          </div>
        </aside>

        {/* Conținut principal */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header mobil */}
          <header className="flex items-center gap-3 border-b bg-background px-4 py-3 md:hidden">
            <Button
              variant="ghost" size="icon"
              className="shrink-0"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <p className="font-semibold truncate">{orgs[0].name}</p>
          </header>
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </OrgProvider>
  )
}
