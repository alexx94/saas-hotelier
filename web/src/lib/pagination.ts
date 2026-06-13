import { useState } from "react"

// Offset pagination: pagina N cere rândurile [N*pageSize, N*pageSize + pageSize];
// rândul în plus semnalează că există pagina următoare, fără count(*) separat.
// Filtrele se aplică în query înaintea range-ului — offsetul sare doar
// peste rândurile deja filtrate.

export type Page<TItem> = {
  items: TItem[]
  hasMore: boolean
}

// Intervalul pentru .range(from, to) — "to" e inclusiv în PostgREST,
// deci cerem intenționat un rând în plus
export function pageRange(page: number, pageSize: number): [number, number] {
  const from = page * pageSize
  return [from, from + pageSize]
}

export function toPage<TItem>(rows: TItem[], pageSize: number): Page<TItem> {
  return {
    items: rows.slice(0, pageSize),
    hasMore: rows.length > pageSize,
  }
}

// Offset pagination poate repeta un rând dacă apare o inserare nouă între două
// pagini (offsetul alunecă). Mutațiile proprii invalidează query-ul, dar scrierile
// concurente ale altui user nu — dedupe pe id la randare, ieftin și suficient
// pentru listele "Afișează mai mult" (infinite query).
export function dedupeById<T extends { id: string }>(items: T[] | undefined): T[] | undefined {
  if (!items) return items
  const seen = new Set<string>()
  return items.filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)))
}

// Pagină curentă (0-based) + navigare înainte/înapoi.
// reset() la schimbarea filtrelor (search, proprietate etc.).
export function usePagination() {
  const [page, setPage] = useState(0)
  return {
    page,
    hasPrev: page > 0,
    next: () => setPage((p) => p + 1),
    prev: () => setPage((p) => Math.max(0, p - 1)),
    reset: () => setPage(0),
  }
}
