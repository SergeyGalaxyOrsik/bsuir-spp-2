import { geoEqualEarth, geoGraticule10, geoPath } from "d3-geo"
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
}: {
  points?: MapPoint[]
  circles?: MapCircle[]
  className?: string
  onMapClick?: (coords: { latitude: number; longitude: number }) => void
}) {
  const [hover, setHover] = useState<MapPoint | null>(null)
  const { projection, landPath, graticule } = useMemo(() => {
    const projection = geoEqualEarth().fitSize([WIDTH, HEIGHT], { type: "Sphere" })
    const path = geoPath(projection)
    return { projection, landPath: path(land) ?? "", graticule: path(geoGraticule10()) ?? "" }
  }, [])

  const circlePaths = useMemo(() => {
    const path = geoPath(projection)
    return circles.map((c) => {
      // Geodesic circle as a polygon so it is distorted correctly by the projection.
      const steps = 64
      const R = 6371
      const lat1 = (c.latitude * Math.PI) / 180
      const lon1 = (c.longitude * Math.PI) / 180
      const d = c.radiusKm / R
      const coords: [number, number][] = []
      for (let i = 0; i <= steps; i++) {
        const brng = (2 * Math.PI * i) / steps
        const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng))
        const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
        coords.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI])
      }
      coords.reverse()
      return { ...c, d: path({ type: "Polygon", coordinates: [coords] }) ?? "" }
    })
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
