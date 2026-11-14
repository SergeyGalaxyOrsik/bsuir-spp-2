import { queryOptions, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import { ArrowLeft, ExternalLink, Waves } from "lucide-react"
import { useState } from "react"
import { PageHeader, StatCard } from "@/components/app/common"
import { AlertBadge, MagnitudeBadge, SEVERITY_LABELS } from "@/components/app/magnitude"
import { EmptyState, ErrorState, PartialErrors } from "@/components/app/states"
import { WorldMap } from "@/components/app/world-map"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { graphql } from "@/graphql/gen"
import { fmtCompact, fmtDateTime, fmtFixed, fmtNumber, magnitudeColor } from "@/lib/format"
import { executeRaw } from "@/lib/graphql"

const EarthquakeDoc = graphql(`
  query EarthquakeDetail($id: ID!, $radiusKm: Float!) {
    earthquake(id: $id) {
      id
      time
      updatedAt
      magnitude
      magnitudeType
      depthKm
      latitude
      longitude
      place
      type
      status
      tsunami
      alert
      felt
      cdi
      mmi
      significance
      network
      url
      severity
      energyJoules
      country {
        code
        name
        localizedName(lang: "rus")
        flag
        capital
        population
        region
        weather {
          temperatureC
          description
        }
        seismicStats {
          count
          maxMagnitude
        }
      }
      nearby(radiusKm: $radiusKm, first: 8) {
        id
        magnitude
        place
        time
        latitude
        longitude
      }
      aftershocks(radiusKm: $radiusKm, hours: 168, first: 15) {
        id
        magnitude
        place
        time
        latitude
        longitude
      }
    }
  }
`)

const detailQuery = (id: string, radiusKm: number) =>
  queryOptions({
    queryKey: ["earthquake", id, radiusKm],
    queryFn: () => executeRaw(EarthquakeDoc, { id, radiusKm }),
  })

export const Route = createFileRoute("/earthquakes/$id")({
  loader: async ({ context, params }) => {
    const result = await context.queryClient.ensureQueryData(detailQuery(params.id, 150))
    if (!result.data.earthquake) throw notFound()
    return { title: result.data.earthquake.place }
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.title ?? "Землетрясение"} — GeoPulse` }] }),
  component: EarthquakePage,
})

function EarthquakePage() {
  const { id } = Route.useParams()
  const [radius, setRadius] = useState(150)
  const { data: result, error, refetch, isFetching } = useQuery(detailQuery(id, radius))

  if (error && !result) return <ErrorState error={error} onRetry={() => refetch()} />
  const q = result?.data.earthquake
  if (!q) return <Skeleton className="h-96" />

  const related = [
    ...q.nearby.map((n) => ({ ...n, kind: "nearby" as const })),
    ...q.aftershocks.map((n) => ({ ...n, kind: "after" as const })),
  ]

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link to="/earthquakes">
          <ArrowLeft /> Каталог
        </Link>
      </Button>
      <PageHeader
        title={q.place ?? q.id}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <MagnitudeBadge value={q.magnitude} />
            <span>{SEVERITY_LABELS[q.severity]}</span>
            <span>·</span>
            <span>{fmtDateTime(q.time)}</span>
            {q.tsunami && (
              <Badge variant="outline">
                <Waves /> цунами
              </Badge>
            )}
            <AlertBadge level={q.alert} />
          </span>
        }
        actions={
          q.url && (
            <Button asChild variant="outline" size="sm">
              <a href={q.url} target="_blank" rel="noreferrer">
                USGS <ExternalLink />
              </a>
            </Button>
          )
        }
      />
      <PartialErrors errors={result.errors} />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Магнитуда" value={`${fmtFixed(q.magnitude, 1)} ${q.magnitudeType ?? ""}`} hint={`значимость ${fmtNumber(q.significance)}`} />
        <StatCard label="Глубина" value={`${fmtFixed(q.depthKm)} км`} hint={`${q.latitude.toFixed(3)}°, ${q.longitude.toFixed(3)}°`} />
        <StatCard label="Энергия" value={`${fmtCompact(q.energyJoules)} Дж`} hint="log₁₀E = 1.5M + 4.8" />
        <StatCard label="Ощутили" value={fmtNumber(q.felt)} hint={`CDI ${fmtFixed(q.cdi)} · MMI ${fmtFixed(q.mmi)}`} />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle>Эпицентр и окрестности</CardTitle>
              <CardDescription>Соседние события и возможные афтершоки (7 суток) в радиусе</CardDescription>
            </div>
            <Select value={String(radius)} onValueChange={(v) => setRadius(Number(v))}>
              <SelectTrigger size="sm" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[50, 150, 300, 600].map((r) => (
                  <SelectItem key={r} value={String(r)}>
                    {r} км
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className={isFetching ? "opacity-70" : ""}>
            <WorldMap
              circles={[{ id: "r", latitude: q.latitude, longitude: q.longitude, radiusKm: radius, color: magnitudeColor(q.magnitude) }]}
              points={[
                ...related.map((r) => ({
                  id: `${r.kind}-${r.id}`,
                  latitude: r.latitude,
                  longitude: r.longitude,
                  size: 3,
                  color: r.kind === "after" ? "#8b5cf6" : "#64748b",
                  label: `M${fmtFixed(r.magnitude)} · ${r.place ?? ""}`,
                })),
                { id: q.id, latitude: q.latitude, longitude: q.longitude, size: 7, color: magnitudeColor(q.magnitude), label: q.place ?? "" },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Страна</CardTitle>
            <CardDescription>Из geo-subgraph через федеративную ссылку Country</CardDescription>
          </CardHeader>
          <CardContent>
            {q.country ? (
              <div className="flex flex-col gap-2 text-sm">
                <Link to="/countries/$code" params={{ code: q.country.code }} className="text-lg font-medium hover:underline">
                  {q.country.flag} {q.country.name}
                </Link>
                <div className="text-muted-foreground">{q.country.localizedName} · {q.country.region}</div>
                <div>Столица: {q.country.capital ?? "—"}</div>
                <div>Население: {fmtNumber(q.country.population)}</div>
                {q.country.weather && (
                  <div>
                    Погода в столице: {fmtFixed(q.country.weather.temperatureC)} °C, {q.country.weather.description}
                  </div>
                )}
                <div className="mt-2 rounded-lg bg-muted p-3">
                  Всего землетрясений в стране: <b>{fmtNumber(q.country.seismicStats?.count)}</b>, максимум M
                  {fmtFixed(q.country.seismicStats?.maxMagnitude)}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Эпицентр в океане или вне территорий стран.</p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <span>Сеть: {q.network?.toUpperCase()}</span>
              <span>Тип: {q.type}</span>
              <span>Статус: {q.status}</span>
              <span>Обновлено: {fmtDateTime(q.updatedAt)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RelatedList title="Афтершоки (до 7 суток)" items={q.aftershocks} empty="Последующих толчков в радиусе не найдено" />
        <RelatedList title="Ближайшие по времени события" items={q.nearby} empty="Соседних событий нет" />
      </div>
    </>
  )
}

function RelatedList({
  title,
  items,
  empty,
}: {
  title: string
  items: { id: string; magnitude?: number | null; place?: string | null; time: string }[]
  empty: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        {items.length === 0 && <EmptyState title={empty} />}
        {items.map((r) => (
          <Link key={r.id} to="/earthquakes/$id" params={{ id: r.id }} className="flex items-center gap-2 rounded-md p-1 text-sm hover:bg-accent">
            <MagnitudeBadge value={r.magnitude} />
            <span className="line-clamp-1 flex-1">{r.place}</span>
            <span className="text-xs whitespace-nowrap text-muted-foreground">{fmtDateTime(r.time)}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}
