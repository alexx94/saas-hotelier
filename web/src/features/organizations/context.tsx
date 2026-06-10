import { createContext, useContext, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import type { Organization } from "./api"

type OrgContextValue = {
  orgs: Organization[]
  currentOrg: Organization
  setCurrentOrgId: (id: string) => void
}

const OrgContext = createContext<OrgContextValue | null>(null)

const STORAGE_KEY = "saas-hotelier.current-org"

export function OrgProvider({
  orgs,
  children,
}: {
  orgs: Organization[]
  children: ReactNode
}) {
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  )

  useEffect(() => {
    if (currentOrgId) localStorage.setItem(STORAGE_KEY, currentOrgId)
  }, [currentOrgId])

  const value = useMemo(() => {
    const currentOrg =
      orgs.find((o) => o.id === currentOrgId) ?? orgs[0]
    return { orgs, currentOrg, setCurrentOrgId }
  }, [orgs, currentOrgId])

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}

export function useCurrentOrg(): OrgContextValue {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error("useCurrentOrg must be used within OrgProvider")
  return ctx
}
