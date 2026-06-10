import { useEffect, useState } from "react"
import { useCurrentOrg } from "@/features/organizations/context"
import { useProperties } from "./hooks"
import type { Property } from "./api"
import { cn } from "@/lib/utils"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

const STORAGE_KEY = "saas-hotelier.current-property"

/** proprietatea selectată curent (persistată în localStorage) */
export function usePropertySelection() {
  const { currentOrg } = useCurrentOrg()
  const { data: properties, isLoading } = useProperties(currentOrg.id)
  const [propertyId, setPropertyId] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  )

  useEffect(() => {
    if (propertyId) localStorage.setItem(STORAGE_KEY, propertyId)
  }, [propertyId])

  const property: Property | undefined =
    properties?.find((p) => p.id === propertyId) ?? properties?.[0]

  return { properties: properties ?? [], property, setPropertyId, isLoading }
}

export function PropertySelect({
  properties,
  value,
  onChange,
  triggerClassName,
}: {
  properties: Property[]
  value?: string
  onChange: (id: string) => void
  triggerClassName?: string
}) {
  if (properties.length === 0) return null
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("w-56", triggerClassName)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {properties.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
