import { useEffect, useRef } from "react"

// Hook DOM legitim (sync cu IntersectionObserver, nu stare derivată — vezi
// HANDOFF §4): adaugă clasa `in` pe elementul referențiat când intră în
// viewport, o singură dată (nu revine la `.reveal` la ieșire — comportament
// identic cu handoff-ul design "Sea Vibes"). Folosit doar de secțiunile
// template-ului `boutique` (`.reveal`/`.reveal-fade`/`.reveal-scale` — vezi
// index.css); `prefers-reduced-motion` e gestionat integral în CSS.
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("in")
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("in")
          observer.disconnect()
        }
      },
      { threshold: 0.12 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return ref
}
