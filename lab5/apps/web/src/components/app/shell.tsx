import { Link, Outlet, useRouterState } from "@tanstack/react-router"
import {
  Activity,
  Braces,
  Earth,
  Flame,
  Globe2,
  LayoutDashboard,
  Menu,
  Moon,
  Radar,
  Server,
  Sun,
  Waves,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { QueryInspector } from "./query-inspector"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useTheme } from "@/hooks/use-theme"
import { graphql } from "@/graphql/gen"
import { useSubscription } from "@/lib/subscriptions"
import { fmtFixed } from "@/lib/format"
import { cn } from "@/lib/utils"

const NAV = [
  { to: "/", label: "Обзор", icon: LayoutDashboard },
  { to: "/live", label: "Пульс Земли", icon: Earth },
  { to: "/earthquakes", label: "Землетрясения", icon: Waves },
  { to: "/events", label: "Природные события", icon: Flame },
  { to: "/countries", label: "Страны", icon: Globe2 },
  { to: "/watch", label: "Зоны наблюдения", icon: Radar },
  { to: "/explorer", label: "Конструктор запросов", icon: Braces },
  { to: "/ops", label: "Сбор и мониторинг", icon: Server },
] as const

const LiveQuakes = graphql(`
  subscription LiveQuakes($min: Float) {
    earthquakeDetected(minMagnitude: $min) {
      id
      magnitude
      place
    }
  }
`)

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname })
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active = item.to === "/" ? path === "/" : path.startsWith(item.to)
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
              active ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2 px-2.5 font-semibold tracking-tight">
      <span className="grid size-7 place-items-center rounded-lg bg-orange-500 text-white">
        <Activity className="size-4" />
      </span>
      GeoPulse
    </Link>
  )
}

export function AppShell() {
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const fullBleed = useRouterState({ select: (s) => s.location.pathname === "/live" })

  // Global live feed: toast for every new significant earthquake the collector stores.
  useSubscription(LiveQuakes, { min: 4.5 }, (data) => {
    const q = data.earthquakeDetected
    toast.warning(`M${fmtFixed(q.magnitude)} — ${q.place ?? "неизвестное место"}`, {
      description: "Новое землетрясение зафиксировано USGS",
      action: { label: "Открыть", onClick: () => (window.location.href = `/earthquakes/${q.id}`) },
    })
  })

  return (
    <div className="flex min-h-svh">
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col gap-6 border-r bg-sidebar px-3 py-5 lg:flex">
        <Brand />
        <Nav />
        <div className="mt-auto px-2.5 text-xs leading-relaxed text-muted-foreground">
          USGS · NASA EONET · World Bank · Open-Meteo · mledoze/countries
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur lg:px-8">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Меню">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-4">
              <SheetTitle className="sr-only">Навигация</SheetTitle>
              <div className="flex flex-col gap-6 pt-2">
                <Brand />
                <Nav onNavigate={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
          <div className="lg:hidden">
            <Brand />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <span className="mr-2 hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              live
            </span>
            <QueryInspector />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Сменить тему"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun /> : <Moon />}
            </Button>
          </div>
        </header>
        <main className={cn("w-full flex-1", fullBleed ? "min-h-0" : "mx-auto max-w-[1400px] px-4 py-6 lg:px-8")}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
