/**
 * Interactive 3D globe for the live page, built on react-globe.gl (three.js + OrbitControls):
 * drag to rotate, wheel/pinch to zoom, click a marker for details. Browser-only — the route
 * loads this module lazily after mount, so three.js never runs during SSR.
 */
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react"
import Globe, { type GlobeMethods } from "react-globe.gl"
import { categoryColor } from "./hazard"
import { magnitudeColor } from "@/lib/format"

export interface QuakeItem {
  kind: "quake"
  id: string
  t: number
  lat: number
  lng: number
  mag: number
  depth: number | null
  place: string | null
  alert: string | null
  tsunami: boolean
}

export interface HazardItem {
  kind: "hazard"
  id: string
  t: number
  lat: number
  lng: number
  title: string
  category: string
  categoryTitle: string
  open: boolean
  lastObservedAt: number
}

export type LiveItem = QuakeItem | HazardItem

export interface StormTrack {
  id: string
  title: string
  points: { lat: number; lng: number }[]
}

export interface Ring {
  key: string
  lat: number
  lng: number
  mag: number
  repeat: boolean
}

export interface LiveGlobeHandle {
  flyTo(lat: number, lng: number, altitude?: number): void
  reset(): void
}

interface Props {
  quakes: { item: QuakeItem; alpha: number }[]
  hazards: HazardItem[]
  tracks: StormTrack[]
  rings: Ring[]
  dark: boolean
  autoRotate: boolean
  onSelect: (item: LiveItem) => void
  handle?: Ref<LiveGlobeHandle>
}

function rgba(hex: string, alpha: number) {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha.toFixed(2)})`
}

const tooltip = (title: string, lines: string[]) =>
  `<div style="background:rgba(9,9,11,.88);color:#fafafa;padding:6px 9px;border-radius:6px;font:12px/1.4 system-ui;max-width:260px">
     <div style="font-weight:600">${title.replace(/</g, "&lt;")}</div>
     ${lines.map((l) => `<div style="opacity:.75">${l.replace(/</g, "&lt;")}</div>`).join("")}
   </div>`

export default function LiveGlobe({ quakes, hazards, tracks, rings, dark, autoRotate, onSelect, handle }: Props) {
  const globe = useRef<GlobeMethods | undefined>(undefined)
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const select = useRef(onSelect)
  select.current = onSelect

  // Fill the parent box and follow its size.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect
      setSize({ width: Math.round(width), height: Math.round(height) })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Spare the GPU/CPU while the tab is in the background.
  useEffect(() => {
    const onVisibility = () => (document.hidden ? globe.current?.pauseAnimation() : globe.current?.resumeAnimation())
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [])

  useEffect(() => {
    const controls = globe.current?.controls()
    if (!controls) return
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    controls.autoRotate = autoRotate && !reduced
    controls.autoRotateSpeed = 0.35
  }, [autoRotate, size.width])

  useImperativeHandle(handle, () => ({
    flyTo: (lat, lng, altitude = 1.4) => {
      globe.current?.controls() && (globe.current.controls().autoRotate = false)
      globe.current?.pointOfView({ lat, lng, altitude }, 1200)
    },
    reset: () => globe.current?.pointOfView({ lat: 15, lng: 30, altitude: 2.4 }, 1000),
  }))

  const onReady = () => {
    const g = globe.current
    if (!g) return
    g.pointOfView({ lat: 15, lng: 30, altitude: 2.4 })
    const controls = g.controls()
    controls.minDistance = 120
    controls.maxDistance = 900
    controls.zoomSpeed = 0.8
    controls.autoRotate = autoRotate
    controls.autoRotateSpeed = 0.35
  }

  // Hazard markers are DOM nodes (pulsing dots), so they read differently from the quake discs.
  const hazardElement = useMemo(
    () => (d: object) => {
      const h = d as HazardItem
      const el = document.createElement("button")
      el.type = "button"
      el.className = "live-hazard"
      el.style.setProperty("--c", categoryColor(h.category))
      el.dataset.open = String(h.open)
      el.title = `${h.categoryTitle}: ${h.title}`
      el.onclick = (event) => {
        event.stopPropagation()
        select.current(h)
      }
      return el
    },
    [],
  )

  return (
    <div ref={box} className="absolute inset-0">
      {size.width > 0 && (
        <Globe
          ref={globe}
          width={size.width}
          height={size.height}
          onGlobeReady={onReady}
          backgroundColor="rgba(0,0,0,0)"
          backgroundImageUrl={dark ? "/globe/night-sky.png" : null}
          globeImageUrl={dark ? "/globe/earth-night.jpg" : "/globe/earth-day.jpg"}
          bumpImageUrl="/globe/earth-topology.png"
          showAtmosphere
          atmosphereColor={dark ? "#60a5fa" : "#93c5fd"}
          atmosphereAltitude={0.18}
          // Earthquakes: columns whose height and width grow with magnitude, fading with age.
          pointsData={quakes}
          pointLat={(d) => (d as { item: QuakeItem }).item.lat}
          pointLng={(d) => (d as { item: QuakeItem }).item.lng}
          pointAltitude={(d) => Math.min(0.08, Math.max(0.004, ((d as { item: QuakeItem }).item.mag - 2.5) ** 2 * 0.004))}
          pointRadius={(d) => 0.1 + Math.max(0, (d as { item: QuakeItem }).item.mag - 2.5) * 0.07}
          pointColor={(d) => {
            const { item, alpha } = d as { item: QuakeItem; alpha: number }
            return rgba(magnitudeColor(item.mag), alpha)
          }}
          pointResolution={8}
          pointsTransitionDuration={0}
          pointLabel={(d) => {
            const q = (d as { item: QuakeItem }).item
            return tooltip(`M${q.mag.toFixed(1)} — ${q.place ?? "неизвестное место"}`, [
              new Date(q.t).toLocaleString("ru-RU", { timeZone: "UTC" }) + " UTC",
              q.depth == null ? "" : `глубина ${q.depth.toFixed(0)} км`,
            ])
          }}
          onPointClick={(d) => select.current((d as { item: QuakeItem }).item)}
          // Seismic waves: rings spreading from fresh epicentres.
          ringsData={rings}
          ringLat="lat"
          ringLng="lng"
          ringColor={(d: object) => {
            const color = magnitudeColor((d as Ring).mag)
            return (t: number) => rgba(color, Math.max(0, 1 - t))
          }}
          ringMaxRadius={(d) => 1.5 + Math.max(0, (d as Ring).mag - 2.5) * 1.6}
          ringPropagationSpeed={(d) => 1.5 + (d as Ring).mag * 0.4}
          ringRepeatPeriod={(d) => ((d as Ring).repeat ? 1400 : 700)}
          ringResolution={48}
          // Natural events (NASA EONET).
          htmlElementsData={hazards}
          htmlLat="lat"
          htmlLng="lng"
          htmlAltitude={0.01}
          htmlElement={hazardElement}
          htmlTransitionDuration={0}
          // Storm tracks with a flowing dash showing the direction of travel.
          pathsData={tracks}
          pathPoints="points"
          pathPointLat="lat"
          pathPointLng="lng"
          pathPointAlt={0.004}
          pathColor={() => ["rgba(59,130,246,0.15)", "rgba(96,165,250,0.95)"]}
          pathStroke={1.6}
          pathDashLength={0.25}
          pathDashGap={0.08}
          pathDashAnimateTime={4000}
          pathTransitionDuration={0}
          pathLabel={(d) => tooltip((d as StormTrack).title, ["трек шторма"])}
        />
      )}
    </div>
  )
}
