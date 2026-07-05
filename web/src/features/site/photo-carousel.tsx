import { useCallback, useEffect, useState } from "react"
import useEmblaCarousel from "embla-carousel-react"
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { sitePhotoUrl, type PublicSitePhoto } from "@/features/site/api"

// Galerie swipe reutilizabilă (embla-carousel-react) — săgeți pe desktop,
// swipe nativ pe mobil, dots de navigare. Fallback temat dacă nu există nicio
// poză (nu ar trebui să se întâmple în UI-ul care o montează, dar rămâne sigur).
export function PhotoCarousel({
  photos,
  alt,
  className,
}: {
  photos: PublicSitePhoto[]
  alt: string
  className?: string
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: photos.length > 1 })
  const [selectedIndex, setSelectedIndex] = useState(0)

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi])
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi])
  const scrollTo = useCallback((i: number) => emblaApi?.scrollTo(i), [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap())
    emblaApi.on("select", onSelect)
    onSelect()
    return () => { emblaApi.off("select", onSelect) }
  }, [emblaApi])

  if (photos.length === 0) {
    return (
      <div
        className={cn("flex aspect-4/3 items-center justify-center rounded-2xl", className)}
        style={{ background: "var(--site-card-fallback)" }}
      >
        <ImageOff className="h-12 w-12" style={{ color: "var(--site-accent)" }} strokeWidth={1.25} />
      </div>
    )
  }

  return (
    <div className={cn("relative", className)}>
      <div className="overflow-hidden rounded-2xl" ref={emblaRef}>
        <div className="flex">
          {photos.map((photo) => (
            <div key={photo.id} className="aspect-4/3 min-w-0 shrink-0 grow-0 basis-full">
              <img
                src={sitePhotoUrl(photo.storage_path)}
                alt={photo.alt ?? alt}
                className="h-full w-full object-cover"
              />
            </div>
          ))}
        </div>
      </div>

      {photos.length > 1 && (
        <>
          <button
            type="button"
            onClick={scrollPrev}
            aria-label="prev"
            className="absolute top-1/2 left-3 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black shadow-sm transition-colors hover:bg-white"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={scrollNext}
            aria-label="next"
            className="absolute top-1/2 right-3 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black shadow-sm transition-colors hover:bg-white"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {photos.map((photo, i) => (
              <button
                key={photo.id}
                type="button"
                aria-label={`slide ${i + 1}`}
                onClick={() => scrollTo(i)}
                className={cn(
                  "h-1.5 w-1.5 rounded-full transition-all",
                  i === selectedIndex ? "w-4 bg-white" : "bg-white/60"
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
