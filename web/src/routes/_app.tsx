import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { requireSession } from "@/features/auth/hooks"

// Shell autentificat (pathless). Doar garda de sesiune; sidebar-ul + contextul
// de organizație trăiesc sub /org/$orgId (au nevoie de o org selectată).
export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const session = await requireSession()
    if (!session) throw redirect({ to: "/login" })
  },
  component: () => <Outlet />,
})
