import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  Globe2,
  Hotel,
  Loader2,
  MousePointer2,
  Rocket,
  ShieldCheck,
  Users2,
} from "lucide-react"
import heroImage from "@/assets/hero.png"
import { getSiteSlugFromHostname } from "@/features/site/site-host"

type LandingLocale = "ro" | "en"
type PublishStage = "idle" | "cursor" | "hover" | "clicked" | "publishing" | "published"
type InviteStage = "idle" | "pressed" | "sent"

type LandingCopy = {
  offer: string
  nav: string[]
  getStarted: string
  heroTitle: string
  heroText: string
  startFree: string
  bookDemo: string
  occupancy: string
  live: string
  lastWeek: string
  bookingTitle: string
  bookingText: string
  portfolioTitle: string
  portfolioText: string
  addProperty: string
  occupancyLabel: string
  calendarTitle: string
  calendarText: string
  month: string
  days: string[]
  checkIn: string
  confirmed: string
  teamTitle: string
  teamText: string
  inviteTitle: string
  email: string
  role: string
  selectRole: string
  roles: string[]
  sendInvite: string
  inviteSent: string
  websiteTitle: string
  websiteText: string
  publish: string
  publishing: string
  published: string
  hotelPreviewName: string
  hotelPreviewText: string
  bookNow: string
  pricingTitle: string
  pricingSubtitle: string
  annualPlan: string
  chooseAnnual: string
  lifetimeAccess: string
  bestValue: string
  oneTime: string
  getLifetime: string
  footerLinks: string[]
  copyright: string
}

const copy: Record<LandingLocale, LandingCopy> = {
  ro: {
    offer:
      "Ofertă de lansare: plan anual la 119 USD (în loc de 199 USD) sau acces pe viață la 297 USD (în loc de 599 USD).",
    nav: ["Proprietăți", "Echipă", "Operațiuni", "Financiar", "Enterprise", "Prețuri"],
    getStarted: "Începe acum",
    heroTitle: "Website-uri hoteliere superbe. Operațiuni puternice. O singură platformă.",
    heroText:
      "Construiește-ți brandul cu un website de rezervări directe, rapid și optimizat SEO. Controlează operațiunile zilnice cu o suită PMS unificată, completată de plăți directe integrate.",
    startFree: "Începe gratuit",
    bookDemo: "Programează demo",
    occupancy: "Ocupare",
    live: "LIVE",
    lastWeek: "+12% față de săptămâna trecută",
    bookingTitle: "O platformă. Fiecare rezervare.",
    bookingText:
      "Sincronizează instant rezervările din Airbnb, Booking.com și noul tău website direct. Fără suprapuneri, fără fricțiune, doar ospitalitate fluentă.",
    portfolioTitle: "Gestionează fiecare locație dintr-un singur loc.",
    portfolioText:
      "Controlează operațiunile pentru toate proprietățile. Monitorizează statusuri, venituri directe și OTA, apoi ia decizii dintr-o vedere unificată a portofoliului.",
    addProperty: "Adaugă proprietate",
    occupancyLabel: "Ocupare",
    calendarTitle: "Timeline-ul principal al businessului tău.",
    calendarText:
      "Urmărește fiecare rezervare, de la vânzări directe până la OTA, într-un calendar construit pentru operațiuni cu volum mare.",
    month: "Septembrie",
    days: ["Lun", "Mar", "Mie", "Joi", "Vin", "Sâm", "Dum"],
    checkIn: "Smith - Check-in",
    confirmed: "Johnson - Confirmată",
    teamTitle: "Scalează operațiunile fără efort.",
    teamText:
      "Invită întreaga echipă, de la manageri de proprietate la housekeeping și concierge, apoi setează permisiuni granulare pe roluri ca toată lumea să lucreze aliniat.",
    inviteTitle: "Invită membru în echipă",
    email: "Adresă email",
    role: "Rol",
    selectRole: "Alege rolul...",
    roles: ["Admin", "Manager proprietate", "Concierge"],
    sendInvite: "Trimite invitația",
    inviteSent: "Invitație trimisă",
    websiteTitle: "Vitrine superbe cu plăți directe integrate.",
    websiteText:
      "Publică website-uri de rezervări directe frumoase, rapide și optimizate SEO. Cu plăți directe integrate, păstrezi venitul și reduci dependența de comisioane OTA.",
    publish: "Publică acum",
    publishing: "Se publică...",
    published: "Publicat",
    hotelPreviewName: "The Heights London",
    hotelPreviewText: "Sejururi de lux în inima orașului.",
    bookNow: "Rezervă acum",
    pricingTitle: "Gata să scalezi? Blochează prețul de lansare.",
    pricingSubtitle: "Ofertă specială de lansare",
    annualPlan: "Plan anual",
    chooseAnnual: "Alege anual",
    lifetimeAccess: "Acces pe viață",
    bestValue: "BEST VALUE",
    oneTime: "plată unică",
    getLifetime: "Alege lifetime",
    footerLinks: ["Politica de confidențialitate", "Termeni", "Cookies", "Contact"],
    copyright: "© 2026 Pilow Technologies. Toate drepturile rezervate.",
  },
  en: {
    offer:
      "Special Launch Offer: Annual Plan for $119 (was $199) or Lifetime Access for $297 (was $599).",
    nav: ["Properties", "Team", "Operations", "Finance", "Enterprise", "Pricing"],
    getStarted: "Get started",
    heroTitle: "Stunning hotel websites. Powerful operations. One platform.",
    heroText:
      "Build your brand with a custom, SEO-optimized direct booking website. Manage the chaos with a unified operations and property management suite, complete with integrated direct payments.",
    startFree: "Start for free",
    bookDemo: "Book a demo",
    occupancy: "Occupancy",
    live: "LIVE",
    lastWeek: "+12% vs last week",
    bookingTitle: "One platform. Every booking.",
    bookingText:
      "Sync reservations instantly from Airbnb, Booking.com, and your new direct website. No double bookings, no friction. Just seamless hospitality.",
    portfolioTitle: "Manage every location from one view.",
    portfolioText:
      "Manage the chaos across every location. Monitor statuses, track direct and OTA revenue, and oversee operations across your entire portfolio from a single, unified view.",
    addProperty: "Add Property",
    occupancyLabel: "Occupancy",
    calendarTitle: "A master timeline for your business.",
    calendarText:
      "Keep track of every booking, from direct website sales to OTA reservations, in a single, unified calendar built for high-volume operations.",
    month: "September",
    days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    checkIn: "Smith - Check-in",
    confirmed: "Johnson - Confirmed",
    teamTitle: "Scale your operations effortlessly.",
    teamText:
      "Scale your operations and website management effortlessly. Invite your entire team, from property managers to cleaning staff, and assign granular, role-based permissions to keep everyone aligned.",
    inviteTitle: "Invite Team Member",
    email: "Email Address",
    role: "Role",
    selectRole: "Select role...",
    roles: ["Admin", "Property Manager", "Concierge"],
    sendInvite: "Send Invitation",
    inviteSent: "Invitation sent",
    websiteTitle: "Stunning storefronts with integrated direct payments.",
    websiteText:
      "Build your brand with beautiful, fast, and SEO-optimized direct booking websites. Featuring integrated direct payments so you keep more revenue with fewer third-party OTA fees attached.",
    publish: "Publish now",
    publishing: "Publishing...",
    published: "Published",
    hotelPreviewName: "The Heights London",
    hotelPreviewText: "Luxury stays in the heart of the city.",
    bookNow: "Book Now",
    pricingTitle: "Ready to scale? Lock in launch pricing.",
    pricingSubtitle: "Special Launch Offer",
    annualPlan: "Annual Plan",
    chooseAnnual: "Choose Annual",
    lifetimeAccess: "Lifetime Access",
    bestValue: "BEST VALUE",
    oneTime: "one-time",
    getLifetime: "Get Lifetime",
    footerLinks: ["Privacy Policy", "Terms of Service", "Cookies", "Contact"],
    copyright: "© 2026 Pilow Technologies. All rights reserved.",
  },
}

const portfolioItems = [
  { name: "The Heights", city: "London, UK", occupancy: "92%", active: true },
  { name: "Azure Villa", city: "Mykonos, GR", occupancy: "100%", active: true },
  { name: "Alpine Retreat", city: "Chamonix, FR", occupancy: "45%", active: false },
]

const metricBars = [42, 58, 44, 72, 64, 88, 74, 92, 78, 84, 95, 87]

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const appHosts = (import.meta.env.VITE_APP_HOSTS ?? "")
      .split(",")
      .map((h: string) => h.trim())
      .filter(Boolean)
    const siteSlug = getSiteSlugFromHostname(window.location.hostname, appHosts)
    if (siteSlug) {
      throw redirect({ to: "/s/$siteSlug", params: { siteSlug } })
    }
  },
  component: HomePage,
})

function HomePage() {
  const [locale, setLocale] = useState<LandingLocale>(() => {
    if (typeof navigator === "undefined") return "ro"
    return navigator.language.toLowerCase().startsWith("en") ? "en" : "ro"
  })
  const [activeSections, setActiveSections] = useState<Set<string>>(new Set())
  const [inviteEmailText, setInviteEmailText] = useState("")
  const [selectedRole, setSelectedRole] = useState<string | null>(null)
  const [roleMenuOpen, setRoleMenuOpen] = useState(false)
  const [inviteStage, setInviteStage] = useState<InviteStage>("idle")
  const [publishStage, setPublishStage] = useState<PublishStage>("idle")
  const c = copy[locale]

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-home-reveal]"))
    const timers: number[] = []
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          const target = entry.target as HTMLElement
          observer.unobserve(target)
          const timer = window.setTimeout(() => {
            target.classList.add("is-visible")
            const section = target.dataset.homeSection
            if (section) {
              setActiveSections((current) => {
                if (current.has(section)) return current
                const next = new Set(current)
                next.add(section)
                return next
              })
            }
          }, 180)
          timers.push(timer)
        })
      },
      { threshold: 0.2, rootMargin: "-12% 0px -12% 0px" }
    )

    elements.forEach((element) => observer.observe(element))
    return () => {
      observer.disconnect()
      timers.forEach(window.clearTimeout)
    }
  }, [])

  const heroActive = activeSections.has("hero")
  const teamActive = activeSections.has("team")
  const financeActive = activeSections.has("finance")

  const [occupancyValue, setOccupancyValue] = useState(0)

  useEffect(() => {
    if (!heroActive) return
    const target = 87
    const duration = 1400
    const start = performance.now()
    let raf = 0

    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setOccupancyValue(Math.round(eased * target))
      if (progress < 1) raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [heroActive])

  const inviteEmail = useMemo(
    () => (locale === "ro" ? "ana.ionescu@example.com" : "sarah.jenkins@example.com"),
    [locale]
  )

  useEffect(() => {
    setInviteEmailText("")
    setSelectedRole(null)
    setRoleMenuOpen(false)
    setInviteStage("idle")
    if (!teamActive) return

    const timers: number[] = []
    let index = 0

    function queue(callback: () => void, delay: number) {
      timers.push(window.setTimeout(callback, delay))
    }

    function typeNextCharacter() {
      setInviteEmailText(inviteEmail.slice(0, index + 1))
      index += 1
      if (index < inviteEmail.length) {
        queue(typeNextCharacter, 50)
        return
      }

      queue(() => setRoleMenuOpen(true), 500)
      queue(() => {
        setSelectedRole(c.roles.at(-1) ?? null)
        setRoleMenuOpen(false)
      }, 1300)
      queue(() => setInviteStage("pressed"), 1900)
      queue(() => setInviteStage("sent"), 2100)
    }

    queue(typeNextCharacter, 800)
    return () => {
      timers.forEach(window.clearTimeout)
    }
  }, [teamActive, c.roles, inviteEmail])

  useEffect(() => {
    setPublishStage("idle")
    if (!financeActive) return

    const timers = [
      window.setTimeout(() => setPublishStage("cursor"), 400),
      window.setTimeout(() => setPublishStage("hover"), 1650),
      window.setTimeout(() => setPublishStage("clicked"), 1850),
      window.setTimeout(() => setPublishStage("publishing"), 2100),
      window.setTimeout(() => setPublishStage("published"), 2950),
    ]

    return () => timers.forEach(window.clearTimeout)
  }, [financeActive, locale])

  function publishManually() {
    setPublishStage("publishing")
    window.setTimeout(() => setPublishStage("published"), 650)
  }

  return (
    <div className="home-page min-h-screen bg-[#f9f9f7] text-[#1b1b1b]">
      <div className="relative z-50 bg-black px-4 py-2 text-center text-sm text-white">
        {c.offer}
      </div>

      <header className="sticky top-0 z-40 border-b border-black/5 bg-[#f9f9f7]/82 px-5 py-4 backdrop-blur-2xl md:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Link to="/" className="text-2xl font-semibold tracking-tight text-black md:text-3xl">
            Pilow
          </Link>

          <nav className="hidden items-center gap-7 md:flex">
            {c.nav.map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase().replaceAll(" ", "-")}`}
                className="text-sm text-[#5e5e5e] transition-colors hover:text-black"
              >
                {item}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <div className="grid grid-cols-2 rounded-full border border-black/10 bg-white p-1 text-xs font-medium shadow-sm">
              {(["ro", "en"] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLocale(lang)}
                  className={`rounded-full px-2.5 py-1 transition-colors ${
                    locale === lang ? "bg-black text-white" : "text-[#626262] hover:text-black"
                  }`}
                  aria-pressed={locale === lang}
                >
                  {lang.toUpperCase()}
                </button>
              ))}
            </div>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition-transform hover:-translate-y-0.5 md:px-6"
            >
              <span className="hidden sm:inline">{c.getStarted}</span>
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl overflow-x-hidden px-5 md:px-8">
        <section className="grid min-h-[calc(100vh-104px)] grid-cols-1 items-center gap-10 py-16 md:grid-cols-12 md:py-20">
          <div className="relative z-10 flex flex-col gap-6 text-left md:col-span-6" data-home-reveal>
            <h1 className="max-w-2xl text-4xl font-semibold leading-[1.08] tracking-normal text-black md:text-5xl lg:text-6xl">
              {c.heroTitle}
            </h1>
            <p className="max-w-xl text-lg leading-8 text-[#5e5e5e]">{c.heroText}</p>
            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-black px-8 py-3 font-medium text-white transition-transform hover:-translate-y-0.5"
              >
                {c.startFree}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center justify-center rounded-full border border-black/20 bg-transparent px-8 py-3 font-medium text-black transition-colors hover:bg-white"
              >
                {c.bookDemo}
              </Link>
            </div>
          </div>

          <div
            className="relative flex min-h-[460px] items-center justify-center md:col-span-6"
            data-home-reveal
            data-home-section="hero"
          >
            <div className="absolute inset-x-10 top-10 h-64 rounded-[48px] bg-[linear-gradient(135deg,rgba(59,130,246,0.18),rgba(139,92,246,0.16),rgba(16,185,129,0.12))] blur-3xl" />
            <div className="home-glass relative z-10 flex h-[430px] w-full max-w-md flex-col gap-4 overflow-hidden rounded-2xl p-6">
              <div className="flex items-center justify-between border-b border-black/10 pb-4">
                <div>
                  <p className="text-sm text-[#626262]">Dashboard</p>
                  <h2 className="text-2xl font-semibold text-black">{c.occupancy}</h2>
                </div>
                <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {c.live}
                </div>
              </div>
              <div className="flex flex-1 flex-col justify-center">
                <p className="text-[84px] font-semibold leading-none text-black">{occupancyValue}%</p>
                <p className="mt-2 text-[#5e5e5e]">{c.lastWeek}</p>
              </div>
              <div className="flex h-28 items-end gap-2 rounded-xl bg-white/60 p-4">
                {metricBars.map((height, index) => (
                  <div
                    key={`${height}-${index}`}
                    className="home-metric-bar flex-1 rounded-t-md bg-[linear-gradient(180deg,#8b5cf6,#3b82f6)] opacity-75"
                    style={
                      {
                        "--bar-height": `${height}%`,
                        transitionDelay: `${260 + index * 45}ms`,
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        <FeatureSection
          id="properties"
          title={c.bookingTitle}
          text={c.bookingText}
          visual={<BookingEngineVisual locale={locale} />}
        />

        <FeatureSection
          id="portfolio"
          title={c.portfolioTitle}
          text={c.portfolioText}
          visual={<PortfolioVisual copy={c} />}
        />

        <FeatureSection
          id="operations"
          reverse
          title={c.calendarTitle}
          text={c.calendarText}
          visual={<CalendarVisual copy={c} />}
        />

        <FeatureSection
          id="team"
          title={c.teamTitle}
          text={c.teamText}
          visual={
            <InviteVisual
              copy={c}
              inviteEmail={inviteEmailText}
              selectedRole={selectedRole}
              roleMenuOpen={roleMenuOpen}
              inviteStage={inviteStage}
              onRoleSelect={setSelectedRole}
            />
          }
        />

        <FeatureSection
          id="finance"
          reverse
          title={c.websiteTitle}
          text={c.websiteText}
          visual={<WebsitePreviewVisual copy={c} stage={publishStage} onPublish={publishManually} />}
        />

        <section
          id="pricing"
          className="mb-28 rounded-[28px] bg-[#eeeeee] px-5 py-14 text-center md:mb-40 md:px-8 md:py-16"
          data-home-reveal
        >
          <h2 className="mx-auto max-w-3xl text-4xl font-semibold leading-tight text-black md:text-6xl">
            {c.pricingTitle}
          </h2>
          <p className="mt-4 text-lg text-[#5e5e5e]">{c.pricingSubtitle}</p>

          <div className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
            <PricingCard
              title={c.annualPlan}
              price="$119"
              oldPrice="$199"
              period="/yr"
              cta={c.chooseAnnual}
              to="/login"
            />
            <PricingCard
              featured
              badge={c.bestValue}
              title={c.lifetimeAccess}
              price="$297"
              oldPrice="$599"
              period={c.oneTime}
              cta={c.getLifetime}
              to="/login"
            />
          </div>
        </section>
      </main>

      <footer className="border-t border-black/10 px-5 py-14 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 md:flex-row">
          <Link to="/" className="text-3xl font-semibold text-black">
            Pilow
          </Link>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            {c.footerLinks.map((link) => (
              <a key={link} href="#" className="text-sm text-[#5e5e5e] transition-colors hover:text-black">
                {link}
              </a>
            ))}
          </div>
          <p className="text-center text-sm text-[#5e5e5e] md:text-right">{c.copyright}</p>
        </div>
      </footer>
    </div>
  )
}

function FeatureSection({
  id,
  title,
  text,
  visual,
  reverse = false,
}: {
  id: string
  title: string
  text: string
  visual: ReactNode
  reverse?: boolean
}) {
  return (
    <section
      id={id}
      className="grid grid-cols-1 items-center gap-12 py-16 md:grid-cols-12 md:gap-16 md:py-24"
      data-home-reveal
      data-home-section={id}
    >
      <div
        className={`flex flex-col gap-5 text-left md:col-span-5 ${
          reverse ? "md:order-2" : ""
        }`}
      >
        <h2 className="text-4xl font-semibold leading-tight text-black md:text-6xl">{title}</h2>
        <p className="text-lg leading-8 text-[#5e5e5e]">{text}</p>
      </div>
      <div className={`relative md:col-span-7 ${reverse ? "md:order-1" : ""}`}>{visual}</div>
    </section>
  )
}

function BookingEngineVisual({ locale }: { locale: LandingLocale }) {
  return (
    <div className="home-visual-shell min-h-[460px]">
      <div className="home-glass relative z-10 w-full overflow-hidden rounded-2xl border border-white/60 p-3 shadow-xl">
        <div className="flex items-center justify-between border-b border-black/10 px-3 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-black">
            <Hotel className="h-4 w-4" aria-hidden />
            Booking Engine
          </div>
          <div className="flex items-center gap-2 text-xs text-[#5e5e5e]">
            <Globe2 className="h-3.5 w-3.5" aria-hidden />
            Direct + OTA
          </div>
        </div>
        <div className="grid gap-3 p-3 md:grid-cols-[1.1fr_0.9fr]">
          <div className="overflow-hidden rounded-xl bg-white">
            <img
              src={heroImage}
              alt={locale === "ro" ? "Website hotelier și rezervări directe" : "Hotel website and direct booking"}
              className="h-64 w-full object-cover"
            />
          </div>
          <div className="space-y-3">
            {[
              ["Airbnb", "12", "#ff5a5f"],
              ["Booking.com", "28", "#003580"],
              ["Direct", "34", "#10b981"],
            ].map(([source, count, color], index) => (
              <div key={source} className="rounded-xl border border-black/10 bg-white/80 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                    <span className="font-medium text-black">{source}</span>
                  </div>
                  <span className="text-2xl font-semibold text-black">{count}</span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-[#eeeeee]">
                  <div
                    className="home-metric-fill h-2 rounded-full bg-black"
                    style={
                      {
                        "--fill-width": `${Number(count) * 2}%`,
                        transitionDelay: `${180 + index * 140}ms`,
                      } as CSSProperties
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function PortfolioVisual({ copy: c }: { copy: LandingCopy }) {
  return (
    <div className="home-visual-shell min-h-[460px]">
      <div className="home-glass relative z-10 w-full max-w-2xl rounded-2xl p-5">
        <div className="mb-3 flex items-center justify-between border-b border-black/10 pb-4">
          <div className="flex items-center gap-2 text-2xl font-semibold text-black">
            <Building2 className="h-5 w-5" aria-hidden />
            Portfolio
          </div>
          <Link to="/login" className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
            {c.addProperty}
          </Link>
        </div>
        <div className="space-y-3">
          {portfolioItems.map((item, index) => (
            <div
              key={item.name}
              className={`home-row flex items-center justify-between rounded-xl border border-black/10 bg-white/80 p-4 shadow-sm ${
                item.active ? "" : "opacity-65"
              }`}
              style={{ animationDelay: `${index * 140}ms` }}
            >
              <div className="flex items-center gap-4">
                <div className="grid h-12 w-12 place-items-center rounded-lg bg-[#eeeeee] text-black">
                  <Hotel className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <p className="font-semibold text-black">{item.name}</p>
                  <p className="text-sm text-[#5e5e5e]">{item.city}</p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-sm text-[#5e5e5e]">{c.occupancyLabel}</p>
                  <p className="font-semibold text-black">{item.occupancy}</p>
                </div>
                <span className={`h-3 w-3 rounded-full ${item.active ? "bg-emerald-500" : "bg-[#dadada]"}`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CalendarVisual({ copy: c }: { copy: LandingCopy }) {
  return (
    <div className="home-visual-shell min-h-[460px] justify-start">
      <div className="home-glass relative z-10 w-full max-w-2xl rounded-2xl p-5">
        <div className="mb-4 flex items-center justify-between border-b border-black/10 pb-4">
          <div className="flex items-center gap-2 text-2xl font-semibold text-black">
            <CalendarDays className="h-5 w-5" aria-hidden />
            {c.month}
          </div>
          <div className="flex gap-2">
            <button className="grid h-8 w-8 place-items-center rounded-lg bg-white text-sm text-black" type="button">
              &lt;
            </button>
            <button className="grid h-8 w-8 place-items-center rounded-lg bg-white text-sm text-black" type="button">
              &gt;
            </button>
          </div>
        </div>
        <div className="mb-2 grid grid-cols-7 gap-2 text-center text-xs font-medium text-[#626262]">
          {c.days.map((day) => (
            <div key={day}>{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 14 }, (_, index) => {
            const day = index + 1
            return (
              <div key={day} className="calendar-cell relative h-16 rounded-lg border border-black/10 bg-white/55 p-1">
                <span className="absolute left-2 top-1 text-xs text-[#626262]">{day}</span>
                {day === 2 ? (
                  <div className="home-booking-bar home-booking-bar-blue absolute left-1 top-6 z-10 truncate rounded-md border border-blue-400/30 bg-blue-500/15 px-2 py-1 text-left text-xs font-semibold text-blue-600">
                    {c.checkIn}
                  </div>
                ) : null}
                {day === 11 ? (
                  <div className="home-booking-bar home-booking-bar-purple absolute left-1 top-6 z-10 truncate rounded-md border border-violet-400/30 bg-violet-500/15 px-2 py-1 text-left text-xs font-semibold text-violet-600">
                    {c.confirmed}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function InviteVisual({
  copy: c,
  inviteEmail,
  selectedRole,
  roleMenuOpen,
  inviteStage,
  onRoleSelect,
}: {
  copy: LandingCopy
  inviteEmail: string
  selectedRole: string | null
  roleMenuOpen: boolean
  inviteStage: InviteStage
  onRoleSelect: (role: string) => void
}) {
  const invitePressed = inviteStage === "pressed"
  const inviteSent = inviteStage === "sent"
  return (
    <div className="home-visual-shell min-h-[460px]">
      <div className="home-glass relative z-10 w-full max-w-xl rounded-2xl p-7">
        <div className="mb-6 flex items-center gap-2 text-2xl font-semibold text-black">
          <Users2 className="h-5 w-5" aria-hidden />
          {c.inviteTitle}
        </div>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-[#626262]">{c.email}</span>
            <input
              readOnly
              value={inviteEmail}
              className="w-full rounded-lg border border-black/10 bg-white/80 px-4 py-3 text-black outline-none"
            />
          </label>
          <div>
            <span className="mb-1 block text-sm font-medium text-[#626262]">{c.role}</span>
            <div className="relative">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-lg border border-black/10 bg-white/80 px-4 py-3 text-left text-black"
              >
                {selectedRole ?? c.selectRole}
                <ChevronDown
                  className={`h-4 w-4 text-[#626262] transition-transform ${roleMenuOpen ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
              <div className={`home-dropdown-menu ${roleMenuOpen ? "open" : ""}`}>
                {c.roles.map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => onRoleSelect(role)}
                    className="block w-full px-4 py-2 text-left text-sm text-black transition-colors hover:bg-[#f3f3f3]"
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button
            type="button"
            disabled
            aria-hidden="true"
            className={`home-invite-button inline-flex w-full items-center justify-center gap-2 rounded-lg py-3 font-medium text-white disabled:cursor-default ${
              inviteSent ? "home-invite-sent bg-emerald-500" : "bg-black"
            } ${invitePressed ? "home-invite-pressed" : ""}`}
          >
            {inviteSent ? <Check className="h-4 w-4" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
            {inviteSent ? c.inviteSent : c.sendInvite}
          </button>
        </div>
      </div>
    </div>
  )
}

function WebsitePreviewVisual({
  copy: c,
  stage,
  onPublish,
}: {
  copy: LandingCopy
  stage: PublishStage
  onPublish: () => void
}) {
  const published = stage === "published"
  const publishing = stage === "publishing"
  const clicked = stage === "clicked"
  const cursorActive = stage === "cursor" || stage === "hover" || clicked || publishing
  const buttonHover = stage === "hover" || clicked || publishing

  return (
    <div className="home-visual-shell min-h-[460px] justify-start">
      <div className="home-glass relative z-10 flex h-[410px] w-full max-w-2xl flex-col overflow-hidden rounded-2xl p-2">
        <div className="flex items-center justify-between border-b border-black/10 bg-white/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-red-500" />
            <span className="h-3 w-3 rounded-full bg-emerald-500" />
            <span className="h-3 w-3 rounded-full bg-[#c7c6c6]" />
          </div>
          <div className="rounded-full border border-black/10 bg-white/70 px-6 py-1 text-xs text-[#626262]">
            theheightslondon.com
          </div>
          <MousePointer2 className="h-4 w-4 text-[#626262]" aria-hidden />
        </div>
        <div
          className={`home-browser-content relative flex flex-1 flex-col items-center justify-center overflow-hidden rounded-b-xl bg-white p-6 text-center ${
            published ? "published" : publishing ? "publishing" : ""
          }`}
        >
          {published ? (
            <div className="home-published">
              <h3 className="text-3xl font-semibold text-black">{c.hotelPreviewName}</h3>
              <p className="mt-2 text-sm text-[#5e5e5e]">{c.hotelPreviewText}</p>
              <button type="button" className="mt-6 rounded-full bg-black px-6 py-2 text-sm font-medium text-white">
                {c.bookNow}
              </button>
            </div>
          ) : (
            <div className="home-empty-site w-full">
              <div className="home-build-item mb-4 h-24 rounded-xl bg-[linear-gradient(135deg,rgba(139,92,246,0.16),rgba(16,185,129,0.12))]" />
              <div className="home-build-item mx-auto mb-2 h-8 w-3/4 rounded-md bg-[#eeeeee]" />
              <div className="home-build-item mx-auto mb-6 h-4 w-1/2 rounded-md bg-[#eeeeee]" />
              <div className="grid grid-cols-3 gap-4">
                <div className="home-build-item h-16 rounded-lg bg-[#eeeeee]" />
                <div className="home-build-item h-16 rounded-lg bg-[#eeeeee]" />
                <div className="home-build-item h-16 rounded-lg bg-[#eeeeee]" />
              </div>
            </div>
          )}
          {!published ? (
            <>
              <div className="home-publish-stage">
                <button
                  type="button"
                  onClick={onPublish}
                  className={`home-publish-button inline-flex items-center gap-2 rounded-full bg-black px-8 py-3 font-medium text-white shadow-lg transition-all ${
                    buttonHover ? "home-btn-hover" : ""
                  } ${clicked ? "home-btn-clicked" : ""} ${publishing ? "home-shimmer" : ""}`}
                >
                  {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                  {publishing ? c.publishing : c.publish}
                </button>
              </div>
              <div className={`home-mac-cursor ${cursorActive ? "cursor-animate" : ""}`} />
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function PricingCard({
  title,
  price,
  oldPrice,
  period,
  cta,
  to,
  featured = false,
  badge,
}: {
  title: string
  price: string
  oldPrice: string
  period: string
  cta: string
  to: "/login"
  featured?: boolean
  badge?: string
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl p-8 text-left shadow-sm ${
        featured ? "bg-black text-white" : "border border-black/10 bg-white text-black"
      }`}
    >
      {badge ? (
        <div className="absolute right-0 top-0 rounded-bl-lg bg-emerald-500 px-3 py-1 text-xs font-bold text-white">
          {badge}
        </div>
      ) : null}
      <h3 className="mb-3 text-2xl font-semibold">{title}</h3>
      <div className="mb-6 flex items-baseline gap-2">
        <span className="text-4xl font-semibold">{price}</span>
        <span className={featured ? "text-white/55 line-through" : "text-[#5e5e5e] line-through"}>{oldPrice}</span>
        <span className={featured ? "text-sm text-white/65" : "text-sm text-[#5e5e5e]"}>{period}</span>
      </div>
      <Link
        to={to}
        className={`inline-flex w-full items-center justify-center rounded-full py-3 font-medium ${
          featured ? "bg-white text-black hover:bg-[#eeeeee]" : "bg-black text-white hover:bg-black/90"
        }`}
      >
        {cta}
      </Link>
    </div>
  )
}
