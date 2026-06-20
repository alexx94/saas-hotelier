import { usePermissions } from "@/features/auth/permissions"
import { useRoles } from "@/features/roles/hooks"
import type { Role } from "@/features/roles/api"
import type { OrgMember } from "./api"

// Oglinda în frontend a modelului de autoritate din backend (tier-uri din
// permisiuni elevate). Doar pentru UX (ascundere/dezactivare); backend-ul rămâne
// autoritatea. Vezi docs/backend/rbac.md.
//   OWNER(3) > ADMIN(2, role.manage) > MANAGER(1, user.manage) > BASE(0)
function tierOfKeys(keys: string[]): number {
  if (keys.includes("role.manage")) return 2
  if (keys.includes("user.manage")) return 1
  return 0
}

export function useAuthority(isOwner: boolean) {
  const { has } = usePermissions()
  const { data: roles } = useRoles()
  const roleById = new Map((roles ?? []).map((r) => [r.id, r]))

  const actorTier = isOwner ? 3 : has("role.manage") ? 2 : has("user.manage") ? 1 : 0

  const roleTier = (r: Role) => tierOfKeys(r.permission_keys)
  // poți acorda un rol doar dacă e de tier mai mic ȘI îi deții toate permisiunile
  const canGrantRole = (r: Role) => roleTier(r) < actorTier && r.permission_keys.every(has)

  const memberTier = (m: OrgMember) =>
    m.is_owner
      ? 3
      : m.role_ids.reduce((max, id) => {
          const r = roleById.get(id)
          return Math.max(max, r ? roleTier(r) : 0)
        }, 0)

  // gestionezi doar pe cine domini strict (verificarea pe proprietăți e în backend)
  const canManage = (m: OrgMember) => actorTier > memberTier(m)

  return { actorTier, roleTier, canGrantRole, memberTier, canManage }
}
