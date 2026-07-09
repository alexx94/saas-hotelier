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

// diferența în zile calendaristice între două date ISO (to - from), pe Date.UTC —
// fără drift de fus orar (spre deosebire de addDays, care folosește ora locală)
export function diffDays(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number)
  const [ty, tm, td] = toIso.split("-").map(Number)
  const fromUtc = Date.UTC(fy, fm - 1, fd)
  const toUtc = Date.UTC(ty, tm - 1, td)
  return Math.round((toUtc - fromUtc) / 86_400_000)
}
