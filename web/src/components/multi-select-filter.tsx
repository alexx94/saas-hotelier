import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export type MultiSelectOption = { value: string; label: string }

// Dropdown generic cu checkbox-uri pentru filtre multi-select (ex. tip entitate,
// tip eveniment) — rămâne deschis la fiecare click, ca userul să bifeze mai multe
// dintr-o singură deschidere. Construit peste primitivele shadcn/Radix din
// components/ui/dropdown-menu.tsx — reutilizabil în orice listă cu filtre similare.
export function MultiSelectFilter({
  label, options, selected, onToggle,
}: {
  label: string
  options: MultiSelectOption[]
  selected: string[]
  onToggle: (value: string) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="justify-between">
          {label}
          {selected.length > 0 && (
            <span className="rounded-full bg-primary/10 px-1.5 text-xs text-primary">
              {selected.length}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        {options.map((opt) => (
          <DropdownMenuCheckboxItem
            key={opt.value}
            checked={selected.includes(opt.value)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => onToggle(opt.value)}
          >
            {opt.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
