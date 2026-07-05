import {
  Coffee, ConciergeBell, Dog, Dumbbell, Flower2, Palmtree, Snowflake,
  Sparkles, SquareParking, Utensils, Waves, Wifi, Wine, type LucideIcon,
} from "lucide-react"

// Registry „cheie serviciu → icon lucide". Aceleași chei semantice pe care
// PMS-ul le persistă în `content.services.items[].icon` (contract partajat cu
// `features/site-builder/service-icons.ts` — aceleași iconuri, ca alegerea din
// PMS să coincidă vizual cu site-ul). Cheie necunoscută → fallback `Sparkles`
// (icon generic temat, nu gol).
export const SERVICE_ICONS: Record<string, LucideIcon> = {
  wifi: Wifi,
  parking: SquareParking,
  breakfast: Coffee,
  pool: Waves,
  spa: Flower2,
  restaurant: Utensils,
  bar: Wine,
  ac: Snowflake,
  pets: Dog,
  room_service: ConciergeBell,
  fitness: Dumbbell,
  beach: Palmtree,
}

export function resolveServiceIcon(key: string): LucideIcon {
  return SERVICE_ICONS[key] ?? Sparkles
}
