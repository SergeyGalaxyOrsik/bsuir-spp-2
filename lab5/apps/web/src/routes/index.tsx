import { queryOptions, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Database, Flame, Globe2, Waves, Zap } from "lucide-react"
import { useState } from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { PageHeader, StatCard } from "@/components/app/common"
import { MagnitudeBadge } from "@/components/app/magnitude"
import { ErrorState, PartialErrors } from "@/components/app/states"
import { WorldMap } from "@/components/app/world-map"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { graphql } from "@/graphql/gen"
import type { DashboardQuery } from "@/graphql/gen/graphql"
import { fmtCompact, fmtDate, fmtFixed, fmtNumber, fmtRelative, magnitudeColor } from "@/lib/format"
import { executeRaw } from "@/lib/graphql"
import { useSubscription } from "@/lib/subscriptions"

/**
 * One operation, four subgraphs: the gateway plans it into parallel fetches
 * (seismic + hazards + geo + ops) and entity lookups for nested countries.
 */
const DashboardDoc = graphql(`
  query Dashboard($since: DateTime!, $yearAgo: DateTime!) {
    totalRecords
    dataSources {
      id
      name
      health
      recordCount
    }
    allQuakes: earthquakeStats {
      count
      maxMagnitude
      lastAt
    }
    recentStats: earthquakeStats(filter: { time: { from: $since } }) {
      count
      avgMagnitude
      tsunamiCount
      totalEnergyJoules
      strongest {
        id
        magnitude
        place
        time
      }
    }
    timeline: earthquakeTimeline(filter: { time: { from: $yearAgo } }, bucket: WEEK) {
      bucket
      count
      maxMagnitude
    }
    magnitudeHistogram(filter: { time: { from: $yearAgo } }) {
      from
      count
    }
    topSeismicCountries(filter: { time: { from: $yearAgo } }, limit: 8) {
      count
      maxMagnitude
      country {
        code
        name
        flag
        population
      }
    }
    hazardStats {
      count
      open
      byCategory {
        count
        open
        category {
          id
          title
        }
      }
    }
    strongQuakes: earthquakes(filter: { magnitude: { min: 5.5 }, time: { from: $since } }, sort: { field: TIME, direction: DESC }, first: 60) {
      nodes {
        id
        magnitude
        place
        time
        latitude
        longitude
        country {
          code
          flag
        }
      }
    }
    openEvents: naturalEvents(filter: { status: OPEN }, sort: { field: LAST_OBSERVED_AT, direction: DESC }, first: 6) {
      totalCount
      nodes {
        id
        title
        lastObservedAt
        primaryCategory {
          title
        }
        country {
          code
          flag
        }
      }
    }
    countries(limit: 1) {
      total
    }
  }
`)

const LiveFeed = graphql(`
  subscription DashboardLiveFeed {
    earthquakeDetected(minMagnitude: 2.5) {
      id
      magnitude
      place
      time
      country {
        flag
      }
    }
  }
`)

function dashboardQuery() {
  // Rounded to the hour so the SSR loader and the client share the same cache key.
  const hour = Math.floor(Date.now() / 3_600_000) * 3_600_000
  const variables = {
    since: new Date(hour - 30 * 86_400_000).toISOString(),
    yearAgo: new Date(hour - 365 * 86_400_000).toISOString(),
  }
  return queryOptions({
    queryKey: ["dashboard", variables],
    queryFn: () => executeRaw(DashboardDoc, variables),
    refetchInterval: 60_000,
  })
}

export const Route = createFileRoute("/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardQuery()),
  component: Dashboard,
})

const timelineConfig = { count: { label: "Событий", color: "var(--chart-1)" } } satisfies ChartConfig
const histConfig = { count: { label: "Событий", color: "var(--chart-2)" } } satisfies ChartConfig

type Live = { id: string; magnitude?: number | null; place?: string | null; time: string; flag?: string | null }

function Dashboard() {
  const { data: result, error, refetch } = useQuery(dashboardQuery())
  const [live, setLive] = useState<Live[]>([])
  useSubscription(LiveFeed, {}, (d) => {
    const q = d.earthquakeDetected
    setLive((prev) => [{ id: q.id, magnitude: q.magnitude, place: q.place, time: q.time, flag: q.country?.flag }, ...prev].slice(0, 8))
  })

  if (error && !result) return <ErrorState error={error} onRetry={() => refetch()} />
  if (!result) return <DashboardSkeleton />
  const data: DashboardQuery = result.data

  return (
    <>
      <PageHeader
        title="Обзор планеты"
        description="Сводка по всем источникам. Страница загружается одним GraphQL-запросом, который шлюз федерации распределяет по четырём subgraph-сервисам."
      />
      <PartialErrors errors={result.errors} />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Записей собрано" value={fmtCompact(data.totalRecords)} hint={`${data.dataSources.length} внешних источников`} icon={<Database className="size-5" />} />
        <StatCard label="Землетрясений в каталоге" value={fmtNumber(data.allQuakes.count)} hint={`обновлено ${fmtRelative(data.allQuakes.lastAt)}`} icon={<Waves className="size-5" />} />
        <StatCard
          label="За 30 дней"
          value={fmtNumber(data.recentStats.count)}
          hint={`средняя M${fmtFixed(data.recentStats.avgMagnitude, 2)} · цунами: ${data.recentStats.tsunamiCount}`}
          icon={<Zap className="size-5" />}
        />
        <StatCard label="Природных событий" value={fmtNumber(data.hazardStats.count)} hint={`${fmtNumber(data.hazardStats.open)} активны сейчас`} icon={<Flame className="size-5" />} />
        <StatCard label="Стран" value={data.countries.total} hint="границы, языки, индикаторы WB" icon={<Globe2 className="size-5" />} />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Сильные землетрясения за 30 дней</CardTitle>
            <CardDescription>M5.5+ · размер и цвет точки зависят от магнитуды</CardDescription>
          </CardHeader>
          <CardContent>
            <WorldMap
              points={data.strongQuakes.nodes.map((q) => ({
                id: q.id,
                latitude: q.latitude,
                longitude: q.longitude,
                size: Math.max(3, ((q.magnitude ?? 5) - 4.5) * 4),
                color: magnitudeColor(q.magnitude),
                label: `M${fmtFixed(q.magnitude)} · ${q.place ?? ""} · ${fmtDate(q.time)}`,
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Живая лента
              <Badge variant="secondary" className="font-normal">
                subscription
              </Badge>
            </CardTitle>
            <CardDescription>Новые события USGS приходят через SSE без перезагрузки</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {live.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Ожидание новых землетрясений… Сборщик опрашивает USGS каждые 5 минут.
              </p>
            )}
            {live.map((q) => (
              <Link key={q.id} to="/earthquakes/$id" params={{ id: q.id }} className="flex items-center gap-2 rounded-md p-1 text-sm hover:bg-accent">
                <MagnitudeBadge value={q.magnitude} />
                <span className="line-clamp-1 flex-1">
                  {q.flag} {q.place}
                </span>
                <span className="text-xs whitespace-nowrap text-muted-foreground">{fmtRelative(q.time)}</span>
              </Link>
            ))}
            <div className="mt-2 border-t pt-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">Сильнейшее за 30 дней</div>
              {data.recentStats.strongest && (
                <Link to="/earthquakes/$id" params={{ id: data.recentStats.strongest.id }} className="flex items-center gap-2 text-sm hover:underline">
                  <MagnitudeBadge value={data.recentStats.strongest.magnitude} />
                  <span className="line-clamp-1">{data.recentStats.strongest.place}</span>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Сейсмическая активность за год</CardTitle>
            <CardDescription>Число событий M2.5+ по неделям (earthquakeTimeline)</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={timelineConfig} className="h-56 w-full">
              <AreaChart data={data.timeline.map((p) => ({ ...p, label: fmtDate(p.bucket) }))}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={40} />
                <YAxis tickLine={false} axisLine={false} width={36} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area dataKey="count" type="monotone" fill="var(--color-count)" fillOpacity={0.25} stroke="var(--color-count)" />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Распределение магнитуд</CardTitle>
            <CardDescription>Закон Гутенберга–Рихтера в действии</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={histConfig} className="h-56 w-full">
              <BarChart data={data.magnitudeHistogram.map((b) => ({ ...b, label: b.from.toFixed(1) }))}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={44} scale="log" domain={[1, "auto"]} allowDataOverflow />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={3} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Самые сейсмичные страны</CardTitle>
            <CardDescription>seismic → geo: счётчики и население в одном ответе</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {data.topSeismicCountries.map((c) => {
              const max = data.topSeismicCountries[0]?.count ?? 1
              return (
                <Link key={c.country.code} to="/countries/$code" params={{ code: c.country.code }} className="group text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="group-hover:underline">
                      {c.country.flag} {c.country.name}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {fmtNumber(c.count)} · max M{fmtFixed(c.maxMagnitude)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted">
                    <div className="h-full rounded-full bg-chart-1" style={{ width: `${(c.count / max) * 100}%` }} />
                  </div>
                </Link>
              )
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Природные события по категориям</CardTitle>
            <CardDescription>NASA EONET · активные / всего</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {data.hazardStats.byCategory.map((c) => (
              <Link key={c.category.id} to="/events" search={{ categories: [c.category.id] } as never} className="flex items-center justify-between text-sm hover:underline">
                <span>{c.category.title}</span>
                <span className="tabular-nums text-muted-foreground">
                  <span className="text-foreground">{fmtNumber(c.open)}</span> / {fmtNumber(c.count)}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Активные события</CardTitle>
            <CardDescription>{fmtNumber(data.openEvents.totalCount)} открытых событий</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {data.openEvents.nodes.map((e) => (
              <Link key={e.id} to="/events/$id" params={{ id: e.id }} className="text-sm hover:underline">
                <div className="line-clamp-1">
                  {e.country?.flag} {e.title}
                </div>
                <div className="text-xs text-muted-foreground">
                  {e.primaryCategory.title} · {fmtRelative(e.lastObservedAt)}
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-10 w-72" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  )
}
