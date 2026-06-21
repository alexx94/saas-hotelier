import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { fetchMyOrganizations } from "@/features/organizations/api"
import { orgKeys, useMyOrganizations } from "@/features/organizations/hooks"
import { OrgProvider } from "@/features/organizations/context"
import { useProperties } from "@/features/properties/hooks"
import { AppShell } from "@/components/app-shell"

// Layout-ul organizației: garda de membership + shell-ul cu sidebar. Org-ul e
// sursa contextului (OrgProvider derivat din $orgId). La acest nivel nu e nicio
// proprietate activă → nav-ul arată doar home-ul org.
export const Route = createFileRoute("/_app/org/$orgId")({
  beforeLoad: async ({ context, params }) => {
    const orgs = await context.queryClient.ensureQueryData({
      queryKey: orgKeys.all,
      queryFn: fetchMyOrganizations,
    })
    // fără acces la org → înapoi la selector (RLS oricum ar respinge datele)
    if (!orgs.some((o) => o.id === params.orgId)) {
      throw redirect({ to: "/org" })
    }
  },
  component: OrgLayout,
})

function OrgLayout() {
  const { orgId } = Route.useParams()
  const { data: orgs } = useMyOrganizations()
  const { data: properties } = useProperties(orgId)

  return (
    <OrgProvider orgs={orgs ?? []} orgId={orgId}>
      <AppShell orgId={orgId} properties={properties ?? []}>
        <Outlet />
      </AppShell>
    </OrgProvider>
  )
}
