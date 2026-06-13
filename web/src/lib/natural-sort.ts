// Comparator natural pentru nume cu numere: "Camera 9" < "Camera 10" < "Camera 101".
// Ordinea alfabetică simplă (DB order by name) pune "Camera 10" înaintea lui "Camera 9" —
// listele de camere se sortează în frontend cu acest comparator.
const collator = new Intl.Collator("ro", { numeric: true, sensitivity: "base" })

export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b)
}
