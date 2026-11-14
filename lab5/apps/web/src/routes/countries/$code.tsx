import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import { ArrowLeft, CloudSun, Droplets, Network, Thermometer, Wind } from "lucide-react"
import { useMemo, useState } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { CursorPager, StatCard } from "@/components/app/common"
import { categoryColor } from "@/components/app/hazard"
import { MagnitudeBadge } from "@/components/app/magnitude"
import { EmptyState, ErrorState, PartialErrors } from "@/components/app/states"
import { WorldMap } from "@/components/app/world-map"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { graphql } from "@/graphql/gen"
import { fmtCompact, fmtDate, fmtDateTime, fmtFixed, fmtNumber, magnitudeColor } from "@/lib/format"
import { executeRaw } from "@/lib/graphql"

/** One federated operation: geo + seismic + hazards subgraphs contribute fields to the same Country. */
const CountryQuery = graphql(`
  query CountryDetail($code: ID!) {
    country(code: $code) {
      code
      isoAlpha2
      name
      officialName
      localizedName(lang: "rus")
      capital
      region
      subregion
      flag
      flagUrl
      population
      areaKm2
      density
      gdpPerCapita
      lifeExpectancy
      incomeLevel
      landlocked
      unMember
      independent
      callingCodes
      topLevelDomains
      location {
        latitude
        longitude
      }
      capitalLocation {
        latitude
        longitude
      }
      languages {
        code
        name
        countryCount
      }
      currencies {
        code
        name
        symbol
      }
      weather {
        temperatureC
        apparentTemperatureC
        humidity
        windSpeedKmh
        precipitationMm
        description
        isDay
        observedAt
      }
      indicators(fromYear: 2000) {
        indicator {
          id
          name
          unit
        }
        points {
          year
          value
        }
        latest {
          year
          value
        }
        changePct
      }
      neighbors {
        code
        name
        flag
        seismicStats {
          count
          maxMagnitude
        }
      }
      seismicStats {
        count
        avgMagnitude
        maxMagnitude
        avgDepthKm
        tsunamiCount
        lastAt
        strongest {
          id
          magnitude
          place
          time
        }
      }
      recentEarthquakes(first: 5) {
        id
        magnitude
        place
        time
        latitude
        longitude
      }
      hazardStats {
        count
        open
        avgDurationDays
        byCategory {
          count
          open
          category {
            id
            title
          }
        }
      }
      naturalEvents(first: 10) {
        totalCount
        nodes {
          id
          title
          status
          startedAt
          latitude
          longitude
          primaryCategory {
            id
            title
          }
        }
      }
    }
  }
`)

const CountryQuakesQuery = graphql(`
  query CountryQuakes($code: ID!, $first: Int, $after: String) {
    country(code: $code) {
      code
      earthquakes(first: $first, after: $after, sort: { field: MAGNITUDE, direction: DESC }) {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          magnitude
          place
          time
          depthKm
        }
      }
    }
  }
`)

const countryQuery = (code: string) =>
  queryOptions({ queryKey: ["country", code.toUpperCase()], queryFn: () => executeRaw(CountryQuery, { code: code.toUpperCase() }) })

export const Route = createFileRoute("/countries/$code")({
  loader: async ({ context, params }) => {
    const result = await context.queryClient.ensureQueryData(countryQuery(params.code))
    if (!result.data.country) throw notFound()
    return { title: result.data.country.name }
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.title ?? "Страна"} — GeoPulse` }] }),
  component: CountryPage,
})

const chartConfig = { value: { label: "Значение", color: "var(--chart-1)" } } satisfies ChartConfig

function IndicatorChart({ series }: { series: { indicator: { id: string; name: string; unit?: string | null }; points: { year: number; value?: number | null }[]; latest?: { year: number; value?: number | null } | null; changePct?: number | null }[] }) {
  const available = series.filter((s) => s.points.some((p) => p.value != null))
  const [selected, setSelected] = useState(available[0]?.indicator.id ?? "")
  const current = available.find((s) => s.indicator.id === selected) ?? available[0]
  const data = useMemo(() => current?.points.filter((p) => p.value != null).map((p) => ({ year: p.year, value: p.value })) ?? [], [current])
  if (!current) return <EmptyState title="Нет данных World Bank" />
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle>Показатели World Bank</CardTitle>
          <CardDescription>
            {current.indicator.name}
            {current.latest && ` · ${current.latest.year}: ${fmtCompact(current.latest.value)} ${current.indicator.unit ?? ""}`}
            {current.changePct != null && ` · ${current.changePct > 0 ? "+" : ""}${current.changePct.toFixed(1)}% с 2000 г.`}
          </CardDescription>
        </div>
        <Select value={current.indicator.id} onValueChange={setSelected}>
          <SelectTrigger size="sm" className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {available.map((s) => (
              <SelectItem key={s.indicator.id} value={s.indicator.id}>
                {s.indicator.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
          <LineChart data={data} margin={{ left: 8, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="year" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => fmtCompact(v)} />
            <ChartTooltip content={<ChartTooltipContent formatter={(v) => fmtNumber(Number(v))} />} />
            <Line dataKey="value" type="monotone" stroke="var(--color-value)" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

function CountryEarthquakes({ code }: { code: string }) {
  const [cursors, setCursors] = useState<string[]>([])
  const [size, setSize] = useState(10)
  const { data, isFetching } = useQuery({
    queryKey: ["countryQuakes", code, size, cursors.at(-1)],
    queryFn: () => executeRaw(CountryQuakesQuery, { code, first: size, after: cursors.at(-1) }),
    placeholderData: keepPreviousData,
  })
  const conn = data?.data.country?.earthquakes
  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="pb-4">
        <CardTitle>Сильнейшие землетрясения</CardTitle>
        <CardDescription>Вложенное поле Country.earthquakes с собственной курсорной пагинацией (seismic-subgraph)</CardDescription>
      </CardHeader>
      <Table className={isFetching ? "opacity-60" : ""}>
        <TableBody>
          {conn?.nodes.map((q) => (
            <TableRow key={q.id}>
              <TableCell className="w-20 pl-6">
                <MagnitudeBadge value={q.magnitude} />
              </TableCell>
              <TableCell>
                <Link to="/earthquakes/$id" params={{ id: q.id }} className="hover:underline">
                  {q.place ?? q.id}
                </Link>
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{fmtDate(q.time)}</TableCell>
              <TableCell className="pr-6 text-right tabular-nums">{fmtFixed(q.depthKm)} км</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {conn && conn.nodes.length === 0 && <EmptyState title="Землетрясений не зафиксировано" />}
      <CursorPager
        total={conn?.totalCount}
        pageSize={size}
        pageSizes={[5, 10, 25]}
        page={cursors.length + 1}
        hasNext={!!conn?.pageInfo.hasNextPage}
        loading={isFetching}
        onNext={() => conn?.pageInfo.endCursor && setCursors((c) => [...c, conn.pageInfo.endCursor!])}
        onPrev={() => setCursors((c) => c.slice(0, -1))}
        onPageSize={(s) => {
          setSize(s)
          setCursors([])
        }}
      />
    </Card>
  )
}

function CountryPage() {
  const { code } = Route.useParams()
  const { data, error, refetch } = useQuery(countryQuery(code))
  if (error && !data) return <ErrorState error={error} onRetry={() => refetch()} />
  const c = data?.data.country
  if (!c) return null
  const w = c.weather
  const center = c.capitalLocation ?? c.location

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link to="/countries">
          <ArrowLeft /> Все страны
        </Link>
      </Button>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        {c.flagUrl && <img src={c.flagUrl} alt={`Флаг: ${c.name}`} className="h-12 rounded border object-cover shadow-sm" />}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {c.name} <span className="font-normal text-muted-foreground">· {c.localizedName}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {c.officialName} · {c.region}
            {c.subregion && ` / ${c.subregion}`} · столица {c.capital ?? "—"} · {c.code}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {c.unMember && <Badge variant="secondary">Член ООН</Badge>}
          {c.landlocked && <Badge variant="outline">Без выхода к морю</Badge>}
          {c.incomeLevel && <Badge variant="outline">{c.incomeLevel}</Badge>}
        </div>
      </div>

      <div className="mb-4">
        <PartialErrors errors={data?.errors ?? []} />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Население" value={fmtCompact(c.population)} hint={`${fmtFixed(c.density, 1)} чел/км²`} />
        <StatCard label="Площадь" value={`${fmtCompact(c.areaKm2)} км²`} />
        <StatCard label="ВВП на душу" value={c.gdpPerCapita ? `$${fmtNumber(Math.round(c.gdpPerCapita))}` : "—"} />
        <StatCard label="Продолжительность жизни" value={c.lifeExpectancy ? `${fmtFixed(c.lifeExpectancy)} лет` : "—"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <WorldMap fit
            points={[
              ...(c.recentEarthquakes ?? []).map((q) => ({
                id: q.id,
                latitude: q.latitude,
                longitude: q.longitude,
                size: 4,
                color: magnitudeColor(q.magnitude),
                label: `M${fmtFixed(q.magnitude)} · ${q.place ?? ""}`,
              })),
              ...(c.naturalEvents?.nodes ?? []).map((e) => ({
                id: e.id,
                latitude: e.latitude,
                longitude: e.longitude,
                size: 3.5,
                color: categoryColor(e.primaryCategory.id),
                label: e.title,
              })),
              ...(center ? [{ id: "capital", latitude: center.latitude, longitude: center.longitude, size: 5, color: "#3b82f6", label: `Столица: ${c.capital}` }] : []),
            ]}
          />
          <IndicatorChart series={c.indicators} />
          <CountryEarthquakes code={c.code} />
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CloudSun className="size-4" /> Погода в столице
              </CardTitle>
              <CardDescription>Open-Meteo · {w ? fmtDateTime(w.observedAt) : "нет данных"}</CardDescription>
            </CardHeader>
            {w && (
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <div className="col-span-2 flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tabular-nums">{fmtFixed(w.temperatureC)}°</span>
                  <span className="text-muted-foreground">{w.description}</span>
                </div>
                <span className="flex items-center gap-1.5">
                  <Thermometer className="size-4 text-muted-foreground" /> ощущ. {fmtFixed(w.apparentTemperatureC)}°
                </span>
                <span className="flex items-center gap-1.5">
                  <Droplets className="size-4 text-muted-foreground" /> {fmtFixed(w.humidity, 0)}%
                </span>
                <span className="flex items-center gap-1.5">
                  <Wind className="size-4 text-muted-foreground" /> {fmtFixed(w.windSpeedKmh)} км/ч
                </span>
                <span className="text-muted-foreground">осадки {fmtFixed(w.precipitationMm)} мм</span>
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Справка</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Языки</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {c.languages.map((l) => (
                    <Badge key={l.code} variant="outline" title={`Официальный язык в ${l.countryCount} странах`}>
                      {l.name}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Валюты</div>
                <div className="mt-1">{c.currencies.map((x) => `${x.name} (${x.code}${x.symbol ? `, ${x.symbol}` : ""})`).join(", ") || "—"}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">Телефонный код</div>
                  <div className="font-mono">{c.callingCodes.slice(0, 3).join(", ") || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Домен</div>
                  <div className="font-mono">{c.topLevelDomains.join(", ") || "—"}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Сейсмичность</CardTitle>
              <CardDescription>seismic-subgraph · Country.seismicStats</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-xl font-semibold tabular-nums">{fmtNumber(c.seismicStats?.count)}</div>
                  <div className="text-xs text-muted-foreground">событий</div>
                </div>
                <div>
                  <div className="text-xl font-semibold tabular-nums">{fmtFixed(c.seismicStats?.avgMagnitude, 2)}</div>
                  <div className="text-xs text-muted-foreground">ср. магн.</div>
                </div>
                <div>
                  <div className="text-xl font-semibold tabular-nums">{fmtNumber(c.seismicStats?.tsunamiCount)}</div>
                  <div className="text-xs text-muted-foreground">цунами</div>
                </div>
              </div>
              {c.seismicStats?.strongest && (
                <Link to="/earthquakes/$id" params={{ id: c.seismicStats?.strongest.id }} className="flex items-center gap-2 hover:underline">
                  <MagnitudeBadge value={c.seismicStats?.strongest.magnitude} />
                  <span className="line-clamp-1">Сильнейшее: {c.seismicStats?.strongest.place}</span>
                </Link>
              )}
              <div className="text-xs text-muted-foreground">Последние</div>
              {(c.recentEarthquakes ?? []).map((q) => (
                <Link key={q.id} to="/earthquakes/$id" params={{ id: q.id }} className="flex items-center gap-2 hover:underline">
                  <MagnitudeBadge value={q.magnitude} />
                  <span className="line-clamp-1 flex-1">{q.place}</span>
                  <span className="text-xs whitespace-nowrap text-muted-foreground">{fmtDate(q.time)}</span>
                </Link>
              ))}
              {(c.recentEarthquakes ?? []).length === 0 && <span className="text-muted-foreground">Нет данных</span>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="size-4" /> Соседи
              </CardTitle>
              <CardDescription>geo → seismic: вложенная федерация на втором уровне</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {c.neighbors.length === 0 && <span className="text-muted-foreground">Нет сухопутных границ</span>}
              {c.neighbors.map((n) => (
                <Link key={n.code} to="/countries/$code" params={{ code: n.code }} className="flex items-center gap-2 hover:underline">
                  <span className="text-lg leading-none">{n.flag}</span>
                  <span className="flex-1">{n.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{fmtNumber(n.seismicStats?.count)} землетр.</span>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Природные события</CardTitle>
              <CardDescription>
                hazards-subgraph · всего {fmtNumber(c.hazardStats?.count)}, активных {fmtNumber(c.hazardStats?.open)}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div className="flex flex-wrap gap-1.5">
                {(c.hazardStats?.byCategory ?? []).map((b) => (
                  <Badge key={b.category.id} variant="outline" className="gap-1.5">
                    <span className="size-2 rounded-full" style={{ backgroundColor: categoryColor(b.category.id) }} />
                    {b.category.title}: {b.count}
                  </Badge>
                ))}
              </div>
              {(c.naturalEvents?.nodes ?? []).map((e) => (
                <Link key={e.id} to="/events/$id" params={{ id: e.id }} className="group flex items-start gap-2">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(e.primaryCategory.id) }} />
                  <span className="flex-1">
                    <span className="line-clamp-1 group-hover:underline">{e.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {fmtDate(e.startedAt)} · {e.status === "OPEN" ? "активно" : "завершено"}
                    </span>
                  </span>
                </Link>
              ))}
              {(c.naturalEvents?.totalCount ?? 0) > (c.naturalEvents?.nodes ?? []).length && (
                <Button asChild variant="outline" size="sm">
                  <Link to="/events" search={{ country: c.code }}>
                    Все {fmtNumber((c.naturalEvents?.totalCount ?? 0))} событий
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
