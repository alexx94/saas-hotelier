import { useMemo, useState } from "react"
import { toast } from "sonner"
import { ChevronLeft, ChevronRight, Crown, Plus, Trash2 } from "lucide-react"
import { useCurrentOrg } from "@/features/organizations/context"
import { useSession } from "@/features/auth/hooks"
import { useRoles } from "@/features/roles/hooks"
import { useProperties } from "@/features/properties/hooks"
import { useAuthority } from "./authority"
import {
  useAddMember, useMembers, useRemoveMember, useSetMemberAccess,
  useSetMemberRoles, useTransferOwnership,
} from "./hooks"
import type { OrgMember } from "./api"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { rbacErrorMessage } from "@/lib/errors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { TypedConfirmDialog } from "@/components/typed-confirm-dialog"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

const REST_PAGE_SIZE = 8

/** chip selectabil (toggle) — fără dependență de un component checkbox */
function Chip({
  active, onClick, children, disabled,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-50",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background hover:bg-accent"
      )}
    >
      {children}
    </button>
  )
}

export function MembersSection() {
  const { currentOrg } = useCurrentOrg()
  const { session } = useSession()
  const { data: members, isLoading } = useMembers(currentOrg.id)
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<OrgMember | null>(null)
  const [page, setPage] = useState(0)

  const myId = session?.user.id
  const myMember = members?.find((m) => m.user_id === myId)
  const iAmOwner = !!myMember?.is_owner
  // sunt restrâns la anumite proprietăți? (atunci nu pot acorda „toate")
  const actorRestricted = !iAmOwner && (myMember?.property_ids.length ?? 0) > 0
  const { canManage } = useAuthority(iAmOwner)

  // ordine: owner primul, apoi „tu", apoi restul paginat
  const { owner, me, rest } = useMemo(() => {
    const list = members ?? []
    const owner = list.find((m) => m.is_owner) ?? null
    const me = list.find((m) => m.user_id === myId && !m.is_owner) ?? null
    const rest = list.filter((m) => !m.is_owner && m.user_id !== myId)
    return { owner, me, rest }
  }, [members, myId])

  const pageCount = Math.max(1, Math.ceil(rest.length / REST_PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const restPage = rest.slice(safePage * REST_PAGE_SIZE, safePage * REST_PAGE_SIZE + REST_PAGE_SIZE)

  function row(m: OrgMember, opts: { isMe?: boolean } = {}) {
    const editable = canManage(m)
    return (
      <li key={m.member_id}>
        <button
          onClick={() => editable && setEditing(m)}
          disabled={!editable}
          className={cn(
            "flex w-full items-center gap-3 px-3 py-2.5 text-left",
            editable ? "hover:bg-accent/50" : "cursor-default"
          )}
        >
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-sm font-medium">
              {m.full_name || m.email}
              {m.is_owner && <Crown className="h-3.5 w-3.5 text-amber-500" />}
              {opts.isMe && <Badge variant="secondary">{t("members.you")}</Badge>}
            </p>
            <p className="truncate text-xs text-muted-foreground">{m.email}</p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {m.role_ids.length} {t("members.roles").toLowerCase()}
          </span>
        </button>
      </li>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">{t("members.title")}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("members.subtitle")}</p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">{t("members.add")}</span>
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (
        <>
          <ul className="divide-y rounded-md border">
            {owner && row(owner, { isMe: owner.user_id === myId })}
            {me && row(me, { isMe: true })}
            {restPage.map((m) => row(m))}
          </ul>
          {pageCount > 1 && (
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8"
                disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">{safePage + 1} / {pageCount}</span>
              <Button variant="outline" size="icon" className="h-8 w-8"
                disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      <AddMemberDialog
        open={addOpen} onOpenChange={setAddOpen}
        isOwner={iAmOwner} actorRestricted={actorRestricted}
      />
      {editing && (
        <MemberEditor member={editing} isOwner={iAmOwner} actorRestricted={actorRestricted} open
          onOpenChange={(o) => !o && setEditing(null)} />
      )}
    </div>
  )
}

function AddMemberDialog({
  open, onOpenChange, isOwner, actorRestricted,
}: {
  open: boolean; onOpenChange: (o: boolean) => void
  isOwner: boolean; actorRestricted: boolean
}) {
  const { currentOrg } = useCurrentOrg()
  const { data: roles } = useRoles()
  const { canGrantRole } = useAuthority(isOwner)
  const grantable = (roles ?? []).filter(canGrantRole)
  const { data: properties } = useProperties(currentOrg.id)
  const add = useAddMember(currentOrg.id)
  const [email, setEmail] = useState("")
  const [roleIds, setRoleIds] = useState<string[]>([])
  // acces cerut din start: „toate" (gol) sau subset bifat. Un actor restrâns nu
  // poate acorda „toate" → pornește pe „selected" și nu i se oferă opțiunea.
  const [accessMode, setAccessMode] = useState<"all" | "selected">(
    actorRestricted ? "selected" : "all"
  )
  const [propIds, setPropIds] = useState<string[]>([])

  function toggle(id: string) {
    setRoleIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }
  function toggleProp(id: string) {
    setPropIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }

  // „selected" cu nimic bifat ar fi ambiguu (gol = „toate") → cerem cel puțin una
  const missingProps = accessMode === "selected" && propIds.length === 0

  function reset() {
    setEmail(""); setRoleIds([]); setPropIds([])
    setAccessMode(actorRestricted ? "selected" : "all")
  }

  function submit() {
    const propertyIds = accessMode === "all" ? [] : propIds
    add.mutate(
      { email: email.trim(), roleIds, propertyIds },
      {
        onSuccess: () => {
          toast.success(t("members.added"))
          reset(); onOpenChange(false)
        },
        onError: (e) => toast.error(rbacErrorMessage(e)),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("members.add_title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">{t("members.add_hint")}</p>
          <div className="space-y-1.5">
            <Label>{t("auth.email")}</Label>
            <Input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder={t("members.email_placeholder")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("members.roles")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {grantable.map((r) => (
                <Chip key={r.id} active={roleIds.includes(r.id)} onClick={() => toggle(r.id)}>
                  {r.name}
                </Chip>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t("members.roles_grantable_hint")}</p>
          </div>

          {/* Acces proprietăți cerut din start (oglindă a editorului de acces) */}
          <div className="space-y-2">
            <Label>{t("members.access")}</Label>
            <p className="text-xs text-muted-foreground">{t("members.access_hint")}</p>
            {!actorRestricted && (
              <div className="grid gap-2 sm:grid-cols-2">
                <AccessOption
                  active={accessMode === "all"}
                  title={t("members.access_all")} desc={t("members.access_all_desc")}
                  onClick={() => setAccessMode("all")}
                />
                <AccessOption
                  active={accessMode === "selected"}
                  title={t("members.access_selected")} desc={t("members.access_selected_desc")}
                  onClick={() => setAccessMode("selected")}
                />
              </div>
            )}
            {accessMode === "selected" && (
              <div className="flex flex-wrap gap-1.5 rounded-md border p-2.5">
                {(properties ?? []).map((p) => (
                  <Chip key={p.id} active={propIds.includes(p.id)} onClick={() => toggleProp(p.id)}>
                    {p.name}
                  </Chip>
                ))}
              </div>
            )}
            {missingProps && (
              <p className="text-xs text-destructive">{t("members.access_pick_one")}</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={submit} disabled={!email.trim() || missingProps || add.isPending}>
            {t("members.add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MemberEditor({
  member, open, onOpenChange, isOwner, actorRestricted,
}: {
  member: OrgMember; open: boolean; onOpenChange: (o: boolean) => void
  isOwner: boolean; actorRestricted: boolean
}) {
  const { currentOrg } = useCurrentOrg()
  const { session } = useSession()
  const { data: roles } = useRoles()
  const { canGrantRole } = useAuthority(isOwner)
  const { data: properties } = useProperties(currentOrg.id)
  const setRoles = useSetMemberRoles()
  const setAccess = useSetMemberAccess()
  const remove = useRemoveMember()
  const transfer = useTransferOwnership(currentOrg.id)

  const [roleIds, setRoleIds] = useState<string[]>(member.role_ids)
  const [propIds, setPropIds] = useState<string[]>(member.property_ids)
  // acces: "all" (gol) sau "selected" (subset bifat). Un actor restrâns nu poate
  // acorda „toate" → pornește pe „selected" și nu i se oferă opțiunea „toate".
  const [accessMode, setAccessMode] = useState<"all" | "selected">(
    actorRestricted ? "selected" : member.property_ids.length === 0 ? "all" : "selected"
  )
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [confirmTransfer, setConfirmTransfer] = useState(false)

  const isSelf = session?.user.id === member.user_id

  function save() {
    const finalProps = accessMode === "all" ? [] : propIds
    Promise.all([
      setRoles.mutateAsync({ memberId: member.member_id, roleIds }),
      setAccess.mutateAsync({ memberId: member.member_id, propertyIds: finalProps }),
    ])
      .then(() => { toast.success(t("members.saved")); onOpenChange(false) })
      .catch((e) => toast.error(rbacErrorMessage(e)))
  }

  function toggle(list: string[], set: (v: string[]) => void, id: string) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            {member.full_name || member.email}
            {member.is_owner && <Badge variant="secondary">{t("members.owner")}</Badge>}
            {isSelf && <span className="text-xs text-muted-foreground">({t("members.you")})</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Roluri */}
          <div className="space-y-1.5">
            <Label>{t("members.roles")}</Label>
            {isSelf ? (
              <p className="text-xs text-muted-foreground">{t("members.roles_self")}</p>
            ) : (
              <p className="text-xs text-muted-foreground">{t("members.roles_grantable_hint")}</p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {(roles ?? []).map((r) => {
                const selected = roleIds.includes(r.id)
                // pot comuta doar rolurile pe care le pot acorda, și niciodată pe ale mele
                const locked = isSelf || (!canGrantRole(r) && !selected)
                return (
                  <Chip key={r.id} active={selected} disabled={locked}
                    onClick={() => !locked && toggle(roleIds, setRoleIds, r.id)}>
                    {r.name}
                  </Chip>
                )
              })}
            </div>
          </div>

          {/* Acces proprietăți — segmentat: Toate vs Anumite. Un actor restrâns
              la anumite proprietăți nu poate acorda „toate" (oglindă a backend-ului). */}
          <div className="space-y-2">
            <Label>{t("members.access")}</Label>
            <p className="text-xs text-muted-foreground">{t("members.access_hint")}</p>
            {!actorRestricted && (
              <div className="grid gap-2 sm:grid-cols-2">
                <AccessOption
                  active={accessMode === "all"} disabled={isSelf}
                  title={t("members.access_all")} desc={t("members.access_all_desc")}
                  onClick={() => setAccessMode("all")}
                />
                <AccessOption
                  active={accessMode === "selected"} disabled={isSelf}
                  title={t("members.access_selected")} desc={t("members.access_selected_desc")}
                  onClick={() => setAccessMode("selected")}
                />
              </div>
            )}
            {accessMode === "selected" && (
              <div className="flex flex-wrap gap-1.5 rounded-md border p-2.5">
                {(properties ?? []).map((p) => (
                  <Chip key={p.id} active={propIds.includes(p.id)} disabled={isSelf}
                    onClick={() => !isSelf && toggle(propIds, setPropIds, p.id)}>
                    {p.name}
                  </Chip>
                ))}
              </div>
            )}
          </div>

          {!isSelf && !member.is_owner && (
            <>
              <Separator />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfirmTransfer(true)}>
                  <Crown className="h-3.5 w-3.5" />
                  {t("members.transfer")}
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive"
                  onClick={() => setConfirmRemove(true)}>
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("members.remove")}
                </Button>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={save} disabled={isSelf || setRoles.isPending || setAccess.isPending}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      <TypedConfirmDialog
        open={confirmRemove} onOpenChange={setConfirmRemove}
        title={t("members.remove")} description={t("members.remove_typed")}
        phrase={member.email ?? ""} confirmLabel={t("members.remove")} destructive
        onConfirm={() => remove.mutate(member.member_id, {
          onSuccess: () => { toast.success(t("members.removed")); onOpenChange(false) },
          onError: (e) => toast.error(rbacErrorMessage(e)),
        })}
      />
      <TypedConfirmDialog
        open={confirmTransfer} onOpenChange={setConfirmTransfer}
        title={t("members.transfer")} description={t("members.transfer_typed")}
        phrase={member.email ?? ""} confirmLabel={t("members.transfer")}
        onConfirm={() => transfer.mutate(member.user_id, {
          onSuccess: () => { toast.success(t("members.transferred")); onOpenChange(false) },
          onError: (e) => toast.error(rbacErrorMessage(e)),
        })}
      />
    </>
  )
}

// opțiune de acces (card selectabil) — mai clar decât chip-uri „gol = toate"
function AccessOption({
  active, disabled, title, desc, onClick,
}: { active: boolean; disabled?: boolean; title: string; desc: string; onClick: () => void }) {
  return (
    <button
      type="button" disabled={disabled} onClick={onClick}
      className={cn(
        "rounded-md border p-3 text-left transition-colors disabled:opacity-60",
        active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent"
      )}
    >
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
    </button>
  )
}
