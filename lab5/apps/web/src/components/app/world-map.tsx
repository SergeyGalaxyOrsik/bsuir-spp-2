import { geoCircle, geoEqualEarth, geoGraticule10, geoPath } from "d3-geo"
import { feature } from "topojson-client"
import type { GeometryCollection, Topology } from "topojson-specification"
import landTopo from "world-atlas/land-110m.json"
import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"

export interface MapPoint {
  id: string
  latitude: number
  longitude: number
  /** Radius in px. */
  size?: number
  color?: string
  label?: string
  onClick?: () => void
}

export interface MapCircle {
  id: string
  latitude: number
  longitude: number
  radiusKm: number
  color: string
  label?: string
}

const WIDTH = 960
const HEIGHT = 470

const topo = landTopo as unknown as Topology<{ land: GeometryCollection }>
const land = feature(topo, topo.objects.land)

/**
 * Static basemap (bundled Natural Earth land outline) with data points from the GraphQL API
 * projected on top. Only the overlay comes from the backend.
 */
export function WorldMap({
  points = [],
  circles = [],
  className,
  onMapClick,
  fit = false,
}: {
  points?: MapPoint[]
  circles?: MapCircle[]
  className?: string
  /** Zoom to the data instead of showing the whole globe. */
  fit?: boolean
  onMapClick?: (coords: { latitude: number; longitude: number }) => void
}) {
  const [hover, setHover] = useState<MapPoint | null>(null)
  const coords: [number, number][] = fit
    ? [
        ...points.map((p): [number, number] => [p.longitude, p.latitude]),
        ...circles.map((c): [number, number] => [c.longitude, c.latitude]),
      ]
    : []
  const coordsKey = JSON.stringify(coords)
  const { projection, landPath, graticule } = useMemo(() => {
    const projection = geoEqualEarth()
    if (coords.length > 0) {
      const lons = coords.map((c) => c[0])
      const lats = coords.map((c) => c[1])
      const pad = 6
      const [w, e] = [Math.max(-180, Math.min(...lons) - pad), Math.min(180, Math.max(...lons) + pad)]
      const [s2, n] = [Math.max(-85, Math.min(...lats) - pad), Math.min(85, Math.max(...lats) + pad)]
      projection.fitExtent(
        [
          [20, 20],
          [WIDTH - 20, HEIGHT - 20],
        ],
        { type: "MultiPoint", coordinates: [[w, s2], [e, s2], [e, n], [w, n]] },
      )
    } else {
      projection.fitSize([WIDTH, HEIGHT], { type: "Sphere" })
    }
    const path = geoPath(projection)
    return { projection, landPath: path(land) ?? "", graticule: path(geoGraticule10()) ?? "" }
    // Refit only when the set of locations changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordsKey])

  const circlePaths = useMemo(() => {
    const path = geoPath(projection)
    // geoCircle yields a correctly wound geodesic polygon (radius in degrees of arc).
    return circles.map((c) => ({
      ...c,
      d: path(geoCircle().center([c.longitude, c.latitude]).radius(c.radiusKm / 111.195).precision(2)()) ?? "",
    }))
  }, [circles, projection])

  return (
    <div className={cn("relative overflow-hidden rounded-xl border bg-muted/30", className)}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className={cn("block h-auto w-full", onMapClick && "cursor-crosshair")}
        role="img"
        aria-label="Карта мира"
        onClick={(e) => {
          if (!onMapClick) return
          const svg = e.currentTarget
          const rect = svg.getBoundingClientRect()
          const x = ((e.clientX - rect.left) / rect.width) * WIDTH
          const y = ((e.clientY - rect.top) / rect.height) * HEIGHT
          const inverted = projection.invert?.([x, y])
          if (inverted) onMapClick({ longitude: inverted[0], latitude: inverted[1] })
        }}
      >
        <path d={projection && geoPath(projection)({ type: "Sphere" }) || ""} className="fill-background/40 stroke-border" />
        <path d={graticule} className="fill-none stroke-border/50" strokeWidth={0.5} />
        <path d={landPath} className="fill-muted-foreground/15 stroke-muted-foreground/30" strokeWidth={0.6} />
        {circlePaths.map((c) => (
          <path key={c.id} d={c.d} fill={c.color} fillOpacity={0.15} stroke={c.color} strokeWidth={1.2} />
        ))}
        {points.map((p) => {
          const xy = projection([p.longitude, p.latitude])
          if (!xy) return null
          return (
            <circle
              key={p.id}
              cx={xy[0]}
              cy={xy[1]}
              r={p.size ?? 3}
              fill={p.color ?? "#f97316"}
              fillOpacity={0.7}
              stroke="white"
              strokeOpacity={0.5}
              strokeWidth={0.5}
              className={cn("transition-[r]", p.onClick && "cursor-pointer hover:fill-opacity-100")}
              onMouseEnter={() => setHover(p)}
              onMouseLeave={() => setHover((h) => (h?.id === p.id ? null : h))}
              onClick={(e) => {
                if (!p.onClick) return
                e.stopPropagation()
                p.onClick()
              }}
            />
          )
        })}
      </svg>
      {hover?.label && (
        <div className="pointer-events-none absolute top-2 left-2 max-w-[70%] rounded-md border bg-popover px-2 py-1 text-xs shadow">
          {hover.label}
        </div>
      )}
    </div>
  )
}
