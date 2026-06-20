import { useMemo, useState } from "react"
import { toast } from "sonner"
import { ChevronDown, Pencil, Plus, Shield, Trash2 } from "lucide-react"
import { useCurrentOrg } from "@/features/organizations/context"
import {
  useCreateRole, useDeleteRole, usePermissionCatalog, useRoles, useUpdateRole,
} from "./hooks"
import type { Permission, Role } from "./api"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { rbacErrorMessage } from "@/lib/errors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ConfirmDialog } from "@/components/confirm-dialog"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

export function RolesSection() {
  const { data: roles, isLoading } = useRoles()
  const [editing, setEditing] = useState<Role | null>(null)
  const [creating, setCreating] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  // catalogul de permisiuni se încarcă DOAR când extinzi primul rol (lazy)
  const { data: catalog } = usePermissionCatalog(expanded !== null)

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">{t("roles.title")}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("roles.subtitle")}</p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">{t("roles.new")}</span>
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {(roles ?? []).map((r) => {
            const isOpen = expanded === r.id
            return (
              <li key={r.id}>
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button
                    onClick={() => setExpanded(isOpen ? null : r.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <ChevronDown
                      className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        isOpen && "rotate-180")}
                    />
                    <Shield className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                        {r.name}
                        {r.is_system && <Badge variant="secondary">{t("roles.system")}</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.permission_keys.length} {t("roles.permission_count")}
                      </p>
                    </div>
                  </button>
                  {!r.is_system && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                      onClick={() => setEditing(r)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {isOpen && (
                  <div className="border-t bg-muted/30 px-3 py-3">
                    <RolePermissionView role={r} catalog={catalog} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {creating && <RoleEditor open onOpenChange={(o) => !o && setCreating(false)} />}
      {editing && <RoleEditor role={editing} open onOpenChange={(o) => !o && setEditing(null)} />}
    </div>
  )
}

// vizualizare read-only a permisiunilor unui rol, grupate pe domeniu (ca în editor)
function RolePermissionView({ role, catalog }: { role: Role; catalog?: Permission[] }) {
  const has = new Set(role.permission_keys)
  const groups = useMemo(() => {
    const map = new Map<string, Permission[]>()
    for (const p of catalog ?? []) {
      if (!has.has(p.key)) continue
      const arr = map.get(p.domain) ?? []
      arr.push(p)
      map.set(p.domain, arr)
    }
    return [...map.entries()]
  }, [catalog, role.permission_keys])

  if (!catalog) return <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
  if (role.permission_keys.length === 0)
    return <p className="text-xs text-muted-foreground">{t("roles.no_permissions")}</p>

  return (
    <div className="space-y-2.5">
      {groups.map(([domain, perms]) => (
        <div key={domain} className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{domain}</p>
          <div className="flex flex-wrap gap-1.5">
            {perms.map((p) => (
              <span key={p.key} title={p.key}
                className="rounded-full border bg-background px-2.5 py-1 text-xs">
                {p.description}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function RoleEditor({
  role, open, onOpenChange,
}: { role?: Role; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { currentOrg } = useCurrentOrg()
  const { data: catalog } = usePermissionCatalog()
  const create = useCreateRole(currentOrg.id)
  const update = useUpdateRole()
  const del = useDeleteRole()

  const [name, setName] = useState(role?.name ?? "")
  const [keys, setKeys] = useState<string[]>(role?.permission_keys ?? [])
  const [confirmDelete, setConfirmDelete] = useState(false)

  // permisiuni grupate pe domeniu — rolurile custom NU pot conține permisiuni
  // elevate (administrative), deci nici nu le oferim spre bifare
  const groups = useMemo(() => {
    const map = new Map<string, Permission[]>()
    for (const p of catalog ?? []) {
      if (p.is_elevated) continue
      const arr = map.get(p.domain) ?? []
      arr.push(p)
      map.set(p.domain, arr)
    }
    return [...map.entries()]
  }, [catalog])

  function toggle(key: string) {
    setKeys((cur) => (cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key]))
  }

  function save() {
    const onError = (e: unknown) => toast.error(rbacErrorMessage(e))
    if (role) {
      update.mutate({ roleId: role.id, name: name.trim(), keys }, {
        onSuccess: () => { toast.success(t("roles.updated")); onOpenChange(false) }, onError,
      })
    } else {
      create.mutate({ name: name.trim(), keys }, {
        onSuccess: () => { toast.success(t("roles.created")); onOpenChange(false) }, onError,
      })
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{role ? t("roles.edit_title") : t("roles.new_title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("roles.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)}
              placeholder={t("roles.name_placeholder")} />
          </div>

          <div className="space-y-2">
            <Label>{t("roles.permissions")}</Label>
            <div className="max-h-72 space-y-3 overflow-y-auto rounded-md border p-3">
              {groups.map(([domain, perms]) => (
                <div key={domain} className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {domain}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {perms.map((p) => (
                      <button
                        key={p.key} type="button" onClick={() => toggle(p.key)}
                        title={p.key}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs transition-colors",
                          keys.includes(p.key)
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input bg-background hover:bg-accent"
                        )}
                      >
                        {p.description}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          {role ? (
            <Button variant="ghost" size="sm" className="text-destructive"
              onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" />
              {t("common.delete")}
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button onClick={save} disabled={!name.trim() || create.isPending || update.isPending}>
              {t("common.save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {role && (
      <ConfirmDialog
        open={confirmDelete} onOpenChange={setConfirmDelete}
        title={t("common.delete")} description={t("roles.delete_confirm")}
        confirmLabel={t("common.delete")} destructive
        onConfirm={() => del.mutate(role.id, {
          onSuccess: () => { toast.success(t("roles.deleted")); onOpenChange(false) },
          onError: (e) => toast.error(rbacErrorMessage(e)),
        })}
      />
    )}
    </>
  )
}
