import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { fetchProperty } from "@/features/properties/api"
import { propertyKeys, useProperties, useProperty } from "@/features/properties/hooks"
import { PropertyProvider } from "@/features/properties/context"
import { OrgProvider } from "@/features/organizations/context"
import { useMyOrganizations } from "@/features/organizations/hooks"
import { AppShell } from "@/components/app-shell"
import { Skeleton } from "@/components/ui/skeleton"

// Scope-ul unei proprietăți. URL-ul conține DOAR propertyId — organizația se
// deduce din proprietate (property.org_id), ca să populeze corect switcher-ul de
// org fără a încărca URL-ul. Garda verifică accesul: dacă fetchProperty nu
// întoarce rândul (RLS îl ascunde → „nu a fost găsită"), redirect la /org.
export const Route = createFileRoute("/_app/property/$propertyId")({
  beforeLoad: async ({ context, params }) => {
    // fetchProperty aruncă dacă rândul nu există / e ascuns de RLS (lipsă acces).
    // Datele rămân în cache pentru layout (useProperty). „Nu a fost găsită" =
    // lipsă de acces → selector de organizație (nu știm din ce org face parte).
    try {
      await context.queryClient.ensureQueryData({
        queryKey: propertyKeys.detail(params.propertyId),
        queryFn: () => fetchProperty(params.propertyId),
      })
    } catch {
      throw redirect({ to: "/org" })
    }
  },
  component: PropertyLayout,
})

function PropertyLayout() {
  const { propertyId } = Route.useParams()
  const { data: property } = useProperty(propertyId)
  const { data: orgs } = useMyOrganizations()
  // lista proprietăților org-ului (pt. switcher) — enabled doar după ce știm org-ul
  const { data: properties } = useProperties(property?.org_id ?? "")

  if (!property) return <Skeleton className="h-64 w-full" />

  return (
    <OrgProvider orgs={orgs ?? []} orgId={property.org_id}>
      <AppShell
        orgId={property.org_id}
        properties={properties ?? []}
        currentPropertyId={propertyId}
      >
        <PropertyProvider properties={properties ?? [property]} propertyId={propertyId}>
          <Outlet />
        </PropertyProvider>
      </AppShell>
    </OrgProvider>
  )
}
