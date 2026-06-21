import { createContext, useContext, useMemo } from "react"
import type { ReactNode } from "react"
import type { Property } from "./api"

// Proprietatea curentă derivă din URL (/property/$propertyId).
// Layout-ul rutei property o injectează din param + lista accesibilă (deja
// filtrată de RLS). Guard-ul garantează accesul, deci currentProperty e
// mereu definită. Switcher-ul navighează (vezi property-switcher.tsx).
type PropertyContextValue = {
  properties: Property[]
  currentProperty: Property
}

const PropertyContext = createContext<PropertyContextValue | null>(null)

export function PropertyProvider({
  properties,
  propertyId,
  children,
}: {
  properties: Property[]
  propertyId: string
  children: ReactNode
}) {
  const value = useMemo(() => {
    const currentProperty =
      properties.find((p) => p.id === propertyId) ?? properties[0]
    return { properties, currentProperty }
  }, [properties, propertyId])

  return (
    <PropertyContext.Provider value={value}>{children}</PropertyContext.Provider>
  )
}

export function useCurrentProperty(): PropertyContextValue {
  const ctx = useContext(PropertyContext)
  if (!ctx) throw new Error("useCurrentProperty must be used within PropertyProvider")
  return ctx
}
