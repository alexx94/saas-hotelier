export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function formatDateShort(isoDate: string): string {
  return new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "short" }).format(
    new Date(isoDate)
  )
}
