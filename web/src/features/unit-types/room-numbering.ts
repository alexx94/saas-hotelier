// Parsează specificația de numerotare pentru generarea bulk de camere.
// Acceptă două formate (ambele mapate pe RPC-ul generate_units):
//   "101-120"          → interval inclusiv  → { start: 101, count: 20 }
//   "20" (+ start opț.) → număr de camere    → { start: startAt ?? 1, count: 20 }
export type RoomNumbering = { count: number; start: number }

export const MAX_BULK_ROOMS = 500

export function parseRoomNumbering(
  spec: string,
  startAt?: number
): RoomNumbering | null {
  const s = spec.trim()

  const range = s.match(/^(\d+)\s*-\s*(\d+)$/)
  if (range) {
    const start = Number(range[1])
    const end = Number(range[2])
    if (start < 1 || end < start) return null
    const count = end - start + 1
    if (count > MAX_BULK_ROOMS) return null
    return { count, start }
  }

  if (/^\d+$/.test(s)) {
    const count = Number(s)
    if (count < 1 || count > MAX_BULK_ROOMS) return null
    const start = startAt && startAt >= 1 ? Math.floor(startAt) : 1
    return { count, start }
  }

  return null
}
