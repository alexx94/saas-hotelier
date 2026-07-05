import {
  Coffee, ConciergeBell, Dog, Dumbbell, Flower2, Palmtree, Snowflake,
  SquareParking, Utensils, Waves, Wifi, Wine, type LucideIcon,
} from "lucide-react"
import type { TranslationKey } from "@/lib/i18n"

// Set curat de ~12 iconițe relevante hotelier. Cheile sunt SEMANTICE (parking,
// breakfast...), nu nume de icon lucide — sensul serviciului rămâne stabil în
// jsonb chiar dacă schimbăm iconul. Contract partajat cu site-ul public
// (`features/site/service-icons.ts` mapează aceleași chei la aceleași iconuri).
export const SERVICE_ICONS: { key: string; icon: LucideIcon; labelKey: TranslationKey }[] = [
  { key: "wifi", icon: Wifi, labelKey: "site_builder.icon.wifi" },
  { key: "parking", icon: SquareParking, labelKey: "site_builder.icon.parking" },
  { key: "breakfast", icon: Coffee, labelKey: "site_builder.icon.breakfast" },
  { key: "pool", icon: Waves, labelKey: "site_builder.icon.pool" },
  { key: "spa", icon: Flower2, labelKey: "site_builder.icon.spa" },
  { key: "restaurant", icon: Utensils, labelKey: "site_builder.icon.restaurant" },
  { key: "bar", icon: Wine, labelKey: "site_builder.icon.bar" },
  { key: "ac", icon: Snowflake, labelKey: "site_builder.icon.ac" },
  { key: "pets", icon: Dog, labelKey: "site_builder.icon.pets" },
  { key: "room_service", icon: ConciergeBell, labelKey: "site_builder.icon.room_service" },
  { key: "fitness", icon: Dumbbell, labelKey: "site_builder.icon.fitness" },
  { key: "beach", icon: Palmtree, labelKey: "site_builder.icon.beach" },
]

export const SERVICE_ICON_MAP = new Map(SERVICE_ICONS.map((i) => [i.key, i.icon]))
export const DEFAULT_SERVICE_ICON: LucideIcon = Wifi
