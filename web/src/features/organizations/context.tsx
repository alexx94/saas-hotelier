import { createContext, useContext, useMemo } from "react"
import type { ReactNode } from "react"
import type { Organization } from "./api"

// Organizația curentă derivă acum din URL (/org/$orgId), nu din localStorage.
// Layout-ul rutei o injectează din param; switcher-ul navighează (vezi
// org-switcher.tsx). Guard-ul rutei garantează că orgId e una accesibilă,
// deci currentOrg e mereu definită aici.
type OrgContextValue = {
  orgs: Organization[]
  currentOrg: Organization
}

const OrgContext = createContext<OrgContextValue | null>(null)

export function OrgProvider({
  orgs,
  orgId,
  children,
}: {
  orgs: Organization[]
  orgId: string
  children: ReactNode
}) {
  const value = useMemo(() => {
    const currentOrg = orgs.find((o) => o.id === orgId) ?? orgs[0]
    return { orgs, currentOrg }
  }, [orgs, orgId])

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}

export function useCurrentOrg(): OrgContextValue {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error("useCurrentOrg must be used within OrgProvider")
  return ctx
}
