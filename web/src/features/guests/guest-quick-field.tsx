import { useEffect, useState, type KeyboardEvent } from "react"
import { Plus, UserRound } from "lucide-react"
import { useGuests } from "./hooks"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

// Selecția rezultată din câmpul de oaspete inline. Un oaspete "new" NU e scris în DB
// aici — consumatorul îl creează efectiv la salvare, prin useFindOrCreateGuest
// (dedupe pe email/telefon, server-side).
export type GuestSelection =
  | { kind: "existing"; guestId: string; label: string }
  | { kind: "new"; fullName: string; email?: string; phone?: string }

type Props = {
  orgId: string
  value: GuestSelection | null
  onChange: (v: GuestSelection | null) => void
  autoFocus?: boolean
}

// Câmp de oaspete fără modal, pentru quick-create din calendar: un singur Input care
// caută pe măsură ce se tastează (debounce 300ms, ca în GuestCombobox) și oferă
// „Creează «text»" ca primă opțiune a listei. Editarea textului după o selecție
// anulează selecția — se revine în modul căutare.
export function GuestQuickField({ orgId, value, onChange, autoFocus }: Props) {
  const [text, setText] = useState(
    value?.kind === "existing" ? value.label : value?.kind === "new" ? value.fullName : ""
  )
  const [debounced, setDebounced] = useState(text)
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(text), 300)
    return () => clearTimeout(timer)
  }, [text])

  const { data, isLoading } = useGuests(orgId, { search: debounced || undefined })
  const matches = data?.items ?? []
  const showCreate = text.trim().length >= 2
  const showDropdown = open && !value && text.trim().length > 0

  // listă plată create-option (dacă apare) + rezultate, ca să putem indexa uniform
  // cu tastatura (săgeți/Enter) fără să distingem sursele
  type Option = { kind: "create" } | { kind: "existing"; id: string; label: string }
  const options: Option[] = [
    ...(showCreate ? [{ kind: "create" } as const] : []),
    ...matches.map((g) => ({ kind: "existing" as const, id: g.id, label: g.full_name })),
  ]

  // prima opțiune e mereu pre-evidențiată la orice schimbare de text/rezultate —
  // Enter funcționează imediat fără să atingi săgețile. Ajustare de state „în timpul
  // randării" (pattern React recomandat), nu într-un efect — evită un render suplimentar
  // și cascada setState-în-effect.
  const resetKey = `${text}:${matches.map((g) => g.id).join(",")}`
  const [prevResetKey, setPrevResetKey] = useState(resetKey)
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey)
    setHighlightedIndex(0)
  }

  function selectExisting(id: string, label: string) {
    onChange({ kind: "existing", guestId: id, label })
    setText(label)
    setOpen(false)
  }

  function selectCreate() {
    onChange({ kind: "new", fullName: text.trim() })
    setOpen(false)
  }

  function selectOption(opt: Option) {
    if (opt.kind === "create") selectCreate()
    else selectExisting(opt.id, opt.label)
  }

  function handleTextChange(v: string) {
    setText(v)
    if (value) onChange(null) // editarea după o selecție o anulează, înapoi la căutare
    // redeschide dropdown-ul explicit — la selecție (click sau Enter) input-ul rămâne
    // focusat, deci `onFocus` nu se mai declanșează la următoarea tastare; fără asta,
    // dropdown-ul rămânea ascuns până la un blur+focus accidental
    setOpen(true)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!open && text.trim().length > 0) setOpen(true)
      if (options.length === 0) return
      e.preventDefault()
      const delta = e.key === "ArrowDown" ? 1 : -1
      setHighlightedIndex((i) => Math.min(options.length - 1, Math.max(0, i + delta)))
      return
    }
    if (e.key === "Enter") {
      if (!showDropdown || options.length === 0) return
      e.preventDefault()
      selectOption(options[Math.min(highlightedIndex, options.length - 1)])
      return
    }
    if (e.key === "Escape") {
      setOpen(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          value={text}
          placeholder={t("guests.quick_placeholder")}
          autoFocus={autoFocus}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {showDropdown && (
          <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md">
            {isLoading ? (
              <Skeleton className="h-8 w-full" />
            ) : (
              <>
                {showCreate && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={selectCreate}
                    onMouseEnter={() => setHighlightedIndex(0)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-primary hover:bg-accent",
                      highlightedIndex === 0 && "bg-accent"
                    )}
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0" />
                    <span>{t("guests.quick_create")} „{text.trim()}”</span>
                  </button>
                )}
                {matches.map((g, i) => {
                  const optIndex = showCreate ? i + 1 : i
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectExisting(g.id, g.full_name)}
                      onMouseEnter={() => setHighlightedIndex(optIndex)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent",
                        highlightedIndex === optIndex && "bg-accent"
                      )}
                    >
                      <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium">{g.full_name}</span>
                        {g.email && <span className="ml-1 text-xs text-muted-foreground">{g.email}</span>}
                        {g.phone && <span className="ml-1 text-xs text-muted-foreground">· {g.phone}</span>}
                      </span>
                    </button>
                  )
                })}
                {!showCreate && matches.length === 0 && (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">{t("guests.quick_hint")}</p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {value?.kind === "new" && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            className="h-8 text-xs"
            placeholder={t("guests.quick_phone_placeholder")}
            value={value.phone ?? ""}
            onChange={(e) => onChange({ ...value, phone: e.target.value || undefined })}
          />
          <Input
            type="email"
            className="h-8 text-xs"
            placeholder={t("guests.quick_email_placeholder")}
            value={value.email ?? ""}
            onChange={(e) => onChange({ ...value, email: e.target.value || undefined })}
          />
        </div>
      )}
    </div>
  )
}
