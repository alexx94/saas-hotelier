import type { ReactNode } from "react"
import { usePermissions } from "./permissions"

// Gate declarativ pentru acțiuni UI. Ascunde (sau înlocuiește cu `fallback`)
// copiii dacă userul nu are CEL PUȚIN una dintre permisiuni.
// Backend-ul rămâne autoritatea — asta e doar pentru UX.
export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: string | string[]
  children: ReactNode
  fallback?: ReactNode
}) {
  const { has, isLoading } = usePermissions()
  if (isLoading) return null
  const keys = Array.isArray(permission) ? permission : [permission]
  return <>{keys.some(has) ? children : fallback}</>
}
