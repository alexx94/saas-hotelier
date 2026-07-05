// Rezolvor de hostname → slug de site public. Pur și testabil, fără nicio
// dependință de React/router — planul de scalare pe 3 trepte (vezi
// docs/backend/rpc/sites.md „Scalare viitoare"):
//
//   1. Azi: path `/s/{slug}` — acest fișier nu produce niciun slug (hostname-ul
//      aplicației principale, localhost, sau orice IP → null, ruta `/s/$siteSlug`
//      e accesată direct din URL).
//   2. Subdomeniu (viitor apropiat): `{slug}.pilow.app` — DNS wildcard peste
//      `VITE_APP_HOSTS`; hostname-ul devine `{label}.{unApHost}` → label = slug,
//      fără tabel suplimentar (deja implementat mai jos).
//   3. Domeniu custom (viitor, tabel `site_domains`): hostname care nu se
//      potrivește cu niciun `appHost` ar necesita un lookup server-side
//      (`domain → property_site_id`) — nu poate fi rezolvat pur client-side;
//      punctul de extensie e aici (adaugi un fallback care apelează un RPC).

const LOCALHOST_NAMES = new Set(["localhost", "127.0.0.1", "::1"])

function isIpAddress(hostname: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":")
}

/**
 * Determină slug-ul de site public dintr-un hostname, dat setul de hosturi
 * „aplicație principală" (`VITE_APP_HOSTS`, CSV). Întoarce `null` dacă
 * hostname-ul e chiar aplicația (sau localhost/IP de development) — în acest
 * caz rutarea normală (path-based) rămâne activă.
 */
export function getSiteSlugFromHostname(
  hostname: string,
  appHosts: string[]
): string | null {
  const host = hostname.trim().toLowerCase()
  if (!host) return null
  if (LOCALHOST_NAMES.has(host) || isIpAddress(host)) return null

  const normalizedAppHosts = appHosts.map((h) => h.trim().toLowerCase()).filter(Boolean)
  if (normalizedAppHosts.length === 0) return null
  if (normalizedAppHosts.includes(host)) return null

  for (const appHost of normalizedAppHosts) {
    const suffix = `.${appHost}`
    if (host.endsWith(suffix)) {
      const label = host.slice(0, -suffix.length)
      // subdomeniu simplu (fără punct suplimentar) — "hotel.pilow.app" da,
      // "a.b.pilow.app" nu (rezervat unei viitoare nevoi, nu un slug valid azi)
      if (label && !label.includes(".")) return label
    }
  }

  // treapta 3 (domeniu custom, site_domains) — necesită lookup server-side,
  // nu poate fi rezolvat pur aici; viitor: fallback la o funcție soră.
  return null
}
