import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Crosshair, Flame, Pause, Play, RotateCcw, Waves, X } from "lucide-react"
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { categoryColor } from "@/components/app/hazard"
import type { HazardItem, LiveGlobeHandle, LiveItem, QuakeItem, Ring, StormTrack } from "@/components/app/live-globe"
import { MagnitudeBadge } from "@/components/app/magnitude"
import { ErrorState } from "@/components/app/states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { graphql } from "@/graphql/gen"
import type { LiveHazardsPageQuery, LiveQuakesPageQuery } from "@/graphql/gen/graphql"
import { useTheme } from "@/hooks/use-theme"
import { fmtFixed, fmtNumber } from "@/lib/format"
import { execute } from "@/lib/graphql"
import { useSubscription } from "@/lib/subscriptions"
import { cn } from "@/lib/utils"

const LiveGlobe = lazy(() => import("@/components/app/live-globe"))

export const Route = createFileRoute("/live")({
  // WebGL page: nothing useful to render on the server.
  ssr: false,
  head: () => ({ meta: [{ title: "Пульс Земли — GeoPulse" }] }),
  component: LivePage,
})

const LiveQuakesPage = graphql(`
  query LiveQuakesPage($from: DateTime!, $min: Float!, $after: String) {
    earthquakes(filter: { time: { from: $from }, magnitude: { min: $min } }, sort: { field: TIME, direction: ASC }, first: 100, after: $after) {
      nodes {
        id
        time
        magnitude
        depthKm
        latitude
        longitude
        place
        alert
        tsunami
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`)

const LiveHazardsPage = graphql(`
  query LiveHazardsPage($after: String) {
    naturalEvents(sort: { field: LAST_OBSERVED_AT, direction: DESC }, first: 100, after: $after) {
      nodes {
        ...LiveHazard
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
  fragment LiveHazard on NaturalEvent {
    id
    title
    status
    startedAt
    lastObservedAt
    latitude
    longitude
    primaryCategory {
      id
      title
    }
  }
`)

const LiveStormTracks = graphql(`
  query LiveStormTracks {
    naturalEvents(filter: { categoryIds: ["severeStorms"] }, sort: { field: LAST_OBSERVED_AT, direction: DESC }, first: 20) {
      nodes {
        id
        title
        lastObservedAt
        track(first: 50) {
          latitude
          longitude
        }
      }
    }
  }
`)

const QuakeFeed = graphql(`
  subscription LiveQuakeFeed {
    earthquakeDetected(minMagnitude: 0) {
      id
      time
      magnitude
      depthKm
      latitude
      longitude
      place
      alert
      tsunami
    }
  }
`)

const HazardFeed = graphql(`
  subscription LiveHazardFeed {
    naturalEventUpdated {
      ...LiveHazard
    }
  }
`)

const HOUR = 3_600_000
const WINDOWS = {
  "24h": { label: "24 часа", span: 24 * HOUR, minMag: 2.5 },
  "7d": { label: "7 дней", span: 7 * 24 * HOUR, minMag: 3 },
  "30d": { label: "30 дней", span: 30 * 24 * HOUR, minMag: 4 },
} as const
type WindowKey = keyof typeof WINDOWS

/** Hazards stay on the globe while they are this recent, even if older than the window. */
const HAZARD_HORIZON = 30 * 24 * HOUR
const MAX_PAGES = 30
const RING_LIFETIME = 2600
const SPEEDS = [30, 60, 120] as const

type QuakeNode = {
  id: string
  time: string
  magnitude?: number | null
  depthKm?: number | null
  latitude: number
  longitude: number
  place?: string | null
  alert?: string | null
  tsunami: boolean
}
type HazardNode = {
  id: string
  title: string
  status: string
  startedAt: string
  lastObservedAt: string
  latitude: number
  longitude: number
  primaryCategory: { id: string; title: string }
}

const toQuake = (n: QuakeNode): QuakeItem => ({
  kind: "quake",
  id: n.id,
  t: Date.parse(n.time),
  lat: n.latitude,
  lng: n.longitude,
  mag: n.magnitude ?? 0,
  depth: n.depthKm ?? null,
  place: n.place ?? null,
  alert: n.alert ?? null,
  tsunami: n.tsunami,
})

const toHazard = (n: HazardNode, from: number): HazardItem => ({
  kind: "hazard",
  id: n.id,
  // In replay an event "appears" when it started, or at the start of the window if it was already going on.
  t: Math.max(Date.parse(n.startedAt), from),
  lat: n.latitude,
  lng: n.longitude,
  title: n.title,
  category: n.primaryCategory.id,
  categoryTitle: n.primaryCategory.title,
  open: n.status === "OPEN",
  lastObservedAt: Date.parse(n.lastObservedAt),
})

/** Pulls the whole window page by page (keyset cursors), oldest quake first. */
async function loadSnapshot(windowKey: WindowKey, minMag: number) {
  const now = Date.now()
  const from = now - WINDOWS[windowKey].span
  const quakes: QuakeItem[] = []
  let after: string | null | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const { earthquakes }: LiveQuakesPageQuery = await execute(LiveQuakesPage, { from: new Date(from).toISOString(), min: minMag, after })
    quakes.push(...earthquakes.nodes.map(toQuake))
    if (!earthquakes.pageInfo.hasNextPage) break
    after = earthquakes.pageInfo.endCursor
  }

  const horizon = Math.min(from, now - HAZARD_HORIZON)
  const hazards: HazardItem[] = []
  after = undefined
  for (let page = 0; page < 10; page++) {
    const { naturalEvents }: LiveHazardsPageQuery = await execute(LiveHazardsPage, { after })
    const nodes = naturalEvents.nodes.filter((n) => Date.parse(n.lastObservedAt) >= horizon)
    hazards.push(...nodes.map((n) => toHazard(n, from)))
    if (nodes.length < naturalEvents.nodes.length || !naturalEvents.pageInfo.hasNextPage) break
    after = naturalEvents.pageInfo.endCursor
  }

  const { naturalEvents: storms } = await execute(LiveStormTracks, {})
  const tracks: StormTrack[] = storms.nodes
    .filter((s) => Date.parse(s.lastObservedAt) >= horizon && s.track.length > 1)
    .map((s) => ({ id: s.id, title: s.title, points: s.track.map((p) => ({ lat: p.latitude, lng: p.longitude })) }))

  hazards.sort((a, b) => a.t - b.t)
  return { from, to: now, quakes, hazards, tracks }
}

/** Index of the first element with t > clock (items are sorted by t). */
function upperBound(items: { t: number }[], clock: number) {
  let lo = 0
  let hi = items.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (items[mid]!.t <= clock) lo = mid + 1
    else hi = mid
  }
  return lo
}

function useMounted() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted
}

function LivePage() {
  const mounted = useMounted()
  const { theme } = useTheme()
  const globe = useRef<LiveGlobeHandle>(null)

  const [mode, setMode] = useState<"live" | "replay">("live")
  const [windowKey, setWindowKey] = useState<WindowKey>("24h")
  const [minMag, setMinMag] = useState<number>(WINDOWS["24h"].minMag)
  const [layers, setLayers] = useState({ quakes: true, hazards: true, tracks: true, rotate: true })
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(60)
  const [playing, setPlaying] = useState(false)
  const [selected, setSelected] = useState<LiveItem | null>(null)

  const snapshot = useQuery({
    queryKey: ["live-snapshot", windowKey, minMag],
    queryFn: () => loadSnapshot(windowKey, minMag),
    staleTime: 5 * 60_000,
    enabled: mounted,
  })

  // Live additions from the SSE subscriptions, merged over the snapshot by id.
  const [liveQuakes, setLiveQuakes] = useState<Map<string, QuakeItem>>(new Map())
  const [liveHazards, setLiveHazards] = useState<Map<string, HazardItem>>(new Map())
  const [rings, setRings] = useState<(Ring & { born: number })[]>([])
  const pulse = useCallback((item: QuakeItem) => {
    setRings((prev) => [...prev.slice(-59), { key: `${item.id}:${Date.now()}`, lat: item.lat, lng: item.lng, mag: item.mag, repeat: false, born: Date.now() }])
  }, [])

  useSubscription(QuakeFeed, {}, (data) => {
    const q = toQuake(data.earthquakeDetected)
    if (q.mag < minMag) return
    setLiveQuakes((prev) => new Map(prev).set(q.id, q))
    if (mode === "live") pulse(q)
  }, mounted)
  useSubscription(HazardFeed, {}, (data) => {
    const h = toHazard(data.naturalEventUpdated, snapshot.data?.from ?? Date.now())
    setLiveHazards((prev) => new Map(prev).set(h.id, h))
  }, mounted)

  const quakes = useMemo(() => {
    const base = snapshot.data?.quakes ?? []
    if (!liveQuakes.size) return base
    const ids = new Set(base.map((q) => q.id))
    return [...base, ...[...liveQuakes.values()].filter((q) => !ids.has(q.id))].sort((a, b) => a.t - b.t)
  }, [snapshot.data, liveQuakes])
  const hazards = useMemo(() => {
    const merged = new Map((snapshot.data?.hazards ?? []).map((h) => [h.id, h]))
    for (const [id, h] of liveHazards) merged.set(id, h)
    return [...merged.values()].sort((a, b) => a.t - b.t)
  }, [snapshot.data, liveHazards])

  // The clock: wall time in live mode, compressed simulated time in replay.
  const [clock, setClock] = useState(() => Date.now())
  const span = WINDOWS[windowKey].span
  const from = snapshot.data?.from ?? clock - span

  useEffect(() => {
    if (mode !== "live") return
    setClock(Date.now())
    const id = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(id)
  }, [mode])

  const prevClock = useRef(clock)
  useEffect(() => {
    if (mode !== "replay" || !playing || !snapshot.data) return
    let last = performance.now()
    const id = setInterval(() => {
      const now = performance.now()
      const step = ((now - last) / (speed * 1000)) * (snapshot.data.to - snapshot.data.from)
      last = now
      setClock((c) => {
        const next = Math.min(c + step, snapshot.data.to)
        if (next >= snapshot.data.to) setPlaying(false)
        return next
      })
    }, 100)
    return () => clearInterval(id)
  }, [mode, playing, speed, snapshot.data])

  // Replay: every quake the clock passed during this tick sends out a seismic wave.
  useEffect(() => {
    const before = prevClock.current
    prevClock.current = clock
    if (mode !== "replay" || clock <= before || clock - before > span / 20) return
    const passed = quakes.slice(upperBound(quakes, before), upperBound(quakes, clock))
    for (const q of passed.slice(-12)) pulse(q)
  }, [clock, mode, quakes, pulse, span])

  // Expire finished waves.
  useEffect(() => {
    if (!rings.length) return
    const id = setTimeout(() => setRings((prev) => prev.filter((r) => Date.now() - r.born < RING_LIFETIME)), 400)
    return () => clearTimeout(id)
  }, [rings])

  const switchMode = (next: "live" | "replay") => {
    setMode(next)
    setRings([])
    if (next === "replay" && snapshot.data) {
      setClock(snapshot.data.from)
      prevClock.current = snapshot.data.from
      setPlaying(true)
    } else setPlaying(false)
  }

  // What is on the globe at the current clock. Recomputed in coarse steps so the
  // WebGL layer is not rebuilt on every 100 ms tick.
  const step = Math.max(1, Math.floor((clock - from) / (span / 200)))
  const visibleQuakes = useMemo(() => {
    if (!layers.quakes) return []
    const end = upperBound(quakes, clock)
    const out: { item: QuakeItem; alpha: number }[] = []
    for (let i = 0; i < end; i++) {
      const q = quakes[i]!
      if (q.t < from) continue
      out.push({ item: q, alpha: 0.3 + 0.7 * Math.max(0, 1 - (clock - q.t) / span) })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quakes, layers.quakes, from, span, step, mode === "replay" ? Math.floor(clock / (span / 400)) : 0])
  const visibleHazards = useMemo(
    () => (layers.hazards ? hazards.slice(0, upperBound(hazards, clock)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hazards, layers.hazards, upperBound(hazards, clock)],
  )
  const tracks = useMemo(() => (layers.tracks ? (snapshot.data?.tracks ?? []) : []), [layers.tracks, snapshot.data])

  // Live mode keeps the strongest quakes of the window pulsing.
  const ringData = useMemo(() => {
    const standing: Ring[] =
      mode === "live" && layers.quakes
        ? visibleQuakes
            .filter(({ item }) => item.mag >= 5 || clock - item.t < HOUR)
            .slice(-15)
            .map(({ item }) => ({ key: `standing:${item.id}`, lat: item.lat, lng: item.lng, mag: item.mag, repeat: true }))
        : []
    return [...standing, ...rings]
  }, [mode, layers.quakes, visibleQuakes, rings, clock])

  const feed = useMemo(() => {
    const items: LiveItem[] = [
      ...visibleQuakes.slice(-40).map((v) => v.item),
      ...visibleHazards.filter((h) => h.t > from).slice(-20),
    ]
    return items.sort((a, b) => b.t - a.t).slice(0, 40)
  }, [visibleQuakes, visibleHazards, from])

  const stats = useMemo(() => {
    let max: QuakeItem | null = null
    for (const { item } of visibleQuakes) if (!max || item.mag > max.mag) max = item
    const lastHour = visibleQuakes.filter(({ item }) => clock - item.t < HOUR).length
    const byCategory = new Map<string, { title: string; count: number }>()
    for (const h of visibleHazards) {
      const entry = byCategory.get(h.category) ?? { title: h.categoryTitle, count: 0 }
      entry.count++
      byCategory.set(h.category, entry)
    }
    return { count: visibleQuakes.length, max, lastHour, byCategory: [...byCategory.entries()].sort((a, b) => b[1].count - a[1].count) }
  }, [visibleQuakes, visibleHazards, clock])

  const focus = (item: LiveItem) => {
    setSelected(item)
    globe.current?.flyTo(item.lat, item.lng)
  }

  return (
    <div className="grid h-[calc(100svh-3.5rem)] grid-cols-1 grid-rows-[minmax(420px,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-1">
      <div className="relative min-h-[420px] overflow-hidden bg-gradient-to-b from-slate-100 to-slate-200 dark:from-zinc-950 dark:to-black">
        {mounted && (
          <Suspense fallback={<GlobeLoading />}>
            <LiveGlobe
              handle={globe}
              quakes={visibleQuakes}
              hazards={visibleHazards}
              tracks={tracks}
              rings={ringData}
              dark={theme === "dark"}
              autoRotate={layers.rotate}
              onSelect={focus}
            />
          </Suspense>
        )}
        {snapshot.isPending && <GlobeLoading label="Загружаем события за выбранный период…" />}

        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-4">
          <div className="pointer-events-auto rounded-lg border bg-background/75 px-3 py-2 backdrop-blur">
            <div className="flex items-center gap-2 text-sm font-semibold">
              {mode === "live" ? (
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-70" />
                  <span className="relative inline-flex size-2 rounded-full bg-red-500" />
                </span>
              ) : (
                <RotateCcw className="size-3.5" />
              )}
              Пульс Земли
            </div>
            <div className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
              {new Date(clock).toLocaleString("ru-RU", { timeZone: "UTC" })} UTC
            </div>
          </div>
          <div className="pointer-events-auto flex gap-1 rounded-lg border bg-background/75 p-1 backdrop-blur">
            <Button size="icon" variant="ghost" className="size-8" aria-label="Сбросить вид" onClick={() => globe.current?.reset()}>
              <Crosshair />
            </Button>
          </div>
        </div>

        {mode === "replay" && snapshot.data && (
          <div className="absolute inset-x-4 bottom-4 flex items-center gap-3 rounded-lg border bg-background/80 px-3 py-2 backdrop-blur">
            <Button
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              aria-label={playing ? "Пауза" : "Воспроизвести"}
              onClick={() => {
                if (!playing && clock >= snapshot.data.to) setClock(snapshot.data.from)
                setPlaying((p) => !p)
              }}
            >
              {playing ? <Pause /> : <Play />}
            </Button>
            <Slider
              min={snapshot.data.from}
              max={snapshot.data.to}
              step={(snapshot.data.to - snapshot.data.from) / 1000}
              value={[clock]}
              onValueChange={([v]) => {
                prevClock.current = v!
                setClock(v!)
              }}
              aria-label="Время воспроизведения"
            />
            <span className="hidden shrink-0 font-mono text-xs text-muted-foreground tabular-nums sm:block">
              {Math.round(((clock - snapshot.data.from) / (snapshot.data.to - snapshot.data.from)) * 100)}%
            </span>
          </div>
        )}
        <Legend />
      </div>

      <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-l bg-background p-4">
        <section className="space-y-3">
          <ToggleGroup type="single" variant="outline" value={mode} onValueChange={(v) => v && switchMode(v as "live" | "replay")} className="w-full">
            <ToggleGroupItem value="live" className="flex-1">
              Live
            </ToggleGroupItem>
            <ToggleGroupItem value="replay" className="flex-1" disabled={!snapshot.data}>
              Replay
            </ToggleGroupItem>
          </ToggleGroup>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Период</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={windowKey}
              onValueChange={(v) => {
                if (!v) return
                setWindowKey(v as WindowKey)
                setMinMag(WINDOWS[v as WindowKey].minMag)
                setPlaying(false)
                setMode("live")
              }}
              className="w-full"
            >
              {(Object.keys(WINDOWS) as WindowKey[]).map((k) => (
                <ToggleGroupItem key={k} value={k} className="flex-1">
                  {WINDOWS[k].label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Магнитуда от</Label>
            <ToggleGroup type="single" variant="outline" size="sm" value={String(minMag)} onValueChange={(v) => v && setMinMag(Number(v))} className="w-full">
              {[2.5, 3, 4, 5].map((m) => (
                <ToggleGroupItem key={m} value={String(m)} className="flex-1">
                  M{m}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          {mode === "replay" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Длительность воспроизведения</Label>
              <ToggleGroup type="single" variant="outline" size="sm" value={String(speed)} onValueChange={(v) => v && setSpeed(Number(v) as (typeof SPEEDS)[number])} className="w-full">
                {SPEEDS.map((s) => (
                  <ToggleGroupItem key={s} value={String(s)} className="flex-1">
                    {s} с
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-1">
            {(
              [
                ["quakes", "Землетрясения"],
                ["hazards", "Природные события"],
                ["tracks", "Треки штормов"],
                ["rotate", "Автовращение"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <Switch size="sm" checked={layers[key]} onCheckedChange={(v) => setLayers((l) => ({ ...l, [key]: v }))} />
                {label}
              </label>
            ))}
          </div>
        </section>

        {snapshot.isError ? (
          <ErrorState error={snapshot.error} onRetry={() => snapshot.refetch()} />
        ) : (
          <section className="grid grid-cols-3 gap-2">
            <Metric label="Толчков" value={fmtNumber(stats.count)} />
            <Metric label="За час" value={fmtNumber(stats.lastHour)} />
            <Metric label="Макс." value={stats.max ? `M${fmtFixed(stats.max.mag)}` : "—"} />
          </section>
        )}

        {stats.byCategory.length > 0 && (
          <section className="flex flex-wrap gap-1.5">
            {stats.byCategory.map(([id, c]) => (
              <Badge key={id} variant="outline" className="gap-1.5">
                <span className="size-2 rounded-full" style={{ backgroundColor: categoryColor(id) }} />
                {c.title} · {c.count}
              </Badge>
            ))}
          </section>
        )}

        {selected && <Selected item={selected} onClose={() => setSelected(null)} />}

        <section className="min-h-0 flex-1">
          <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {mode === "live" ? "Последние события" : "Лента воспроизведения"}
          </h2>
          <ul className="space-y-0.5">
            {feed.map((item) => (
              <li key={`${item.kind}:${item.id}`} className="animate-in fade-in slide-in-from-top-1 duration-300">
                <button
                  type="button"
                  onClick={() => focus(item)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-accent",
                    selected?.id === item.id && "bg-accent",
                  )}
                >
                  {item.kind === "quake" ? (
                    <MagnitudeBadge value={item.mag} />
                  ) : (
                    <span className="grid min-w-11 place-items-center">
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: categoryColor(item.category) }} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{item.kind === "quake" ? (item.place ?? "Неизвестное место") : item.title}</span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">{ago(clock - item.t)}</span>
                </button>
              </li>
            ))}
            {!feed.length && !snapshot.isPending && <li className="text-sm text-muted-foreground">Пока ничего не произошло.</li>}
          </ul>
        </section>
      </aside>
    </div>
  )
}

function ago(ms: number) {
  const m = Math.max(0, Math.round(ms / 60_000))
  if (m < 60) return `${m} мин`
  if (m < 48 * 60) return `${Math.round(m / 60)} ч`
  return `${Math.round(m / 1440)} дн`
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="gap-0 px-3 py-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </Card>
  )
}

function Selected({ item, onClose }: { item: LiveItem; onClose: () => void }) {
  return (
    <Card className="relative gap-2 p-3">
      <Button size="icon" variant="ghost" className="absolute top-1.5 right-1.5 size-7" aria-label="Закрыть" onClick={onClose}>
        <X />
      </Button>
      {item.kind === "quake" ? (
        <>
          <div className="flex items-center gap-2 pr-8">
            <MagnitudeBadge value={item.mag} />
            <Waves className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Землетрясение</span>
          </div>
          <div className="text-sm">{item.place ?? "Неизвестное место"}</div>
          <div className="text-xs text-muted-foreground">
            {new Date(item.t).toLocaleString("ru-RU", { timeZone: "UTC" })} UTC
            {item.depth != null && ` · глубина ${item.depth.toFixed(0)} км`}
            {item.tsunami && " · угроза цунами"}
          </div>
          <Button asChild size="sm" variant="outline" className="mt-1 w-fit">
            <Link to="/earthquakes/$id" params={{ id: item.id }}>
              Подробнее
            </Link>
          </Button>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 pr-8">
            <Flame className="size-4" style={{ color: categoryColor(item.category) }} />
            <span className="text-sm font-medium">{item.categoryTitle}</span>
            {item.open && <Badge variant="outline">активно</Badge>}
          </div>
          <div className="text-sm">{item.title}</div>
          <div className="text-xs text-muted-foreground">
            последнее наблюдение {new Date(item.lastObservedAt).toLocaleDateString("ru-RU", { timeZone: "UTC" })}
          </div>
          <Button asChild size="sm" variant="outline" className="mt-1 w-fit">
            <Link to="/events/$id" params={{ id: item.id }}>
              Подробнее
            </Link>
          </Button>
        </>
      )}
    </Card>
  )
}

function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-20 left-4 hidden rounded-lg border bg-background/70 px-3 py-2 text-[11px] text-muted-foreground backdrop-blur md:block">
      <div className="mb-1 font-medium text-foreground">Магнитуда</div>
      <div className="flex items-center gap-2">
        {[
          ["<4", "#22c55e"],
          ["4+", "#eab308"],
          ["5+", "#f59e0b"],
          ["6+", "#ea580c"],
          ["7+", "#dc2626"],
        ].map(([label, color]) => (
          <span key={label} className="flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
            {label}
          </span>
        ))}
      </div>
      <div className="mt-1.5">ЛКМ — вращать · колесо — масштаб · ПКМ — сдвиг</div>
    </div>
  )
}

function GlobeLoading({ label = "Загружаем 3D-глобус…" }: { label?: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="flex items-center gap-2 rounded-lg border bg-background/80 px-3 py-2 text-sm text-muted-foreground backdrop-blur">
        <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
        {label}
      </div>
    </div>
  )
}
