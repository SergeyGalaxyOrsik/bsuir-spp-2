import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Filter, Map as MapIcon, RotateCcw, Waves } from "lucide-react"
import { useEffect, useState } from "react"
import { CursorPager, FilterField, PageHeader, SortHeader } from "@/components/app/common"
import { AlertBadge, MagnitudeBadge, SEVERITY_LABELS } from "@/components/app/magnitude"
import { EmptyState, ErrorState, PartialErrors } from "@/components/app/states"
import { WorldMap } from "@/components/app/world-map"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { graphql } from "@/graphql/gen"
import type { EarthquakeFilter, EarthquakeSortField, Severity } from "@/graphql/gen/graphql"
import { fmtDateTime, fmtFixed, fmtNumber, magnitudeColor } from "@/lib/format"
import { executeRaw } from "@/lib/graphql"
import { bool, compact, cursorStack, isOneOf, keyOf, listOf, num, oneOf, pageSize, str } from "@/lib/search"

const EarthquakesQuery = graphql(`
  query Earthquakes($filter: EarthquakeFilter, $sort: EarthquakeSort, $first: Int, $after: String) {
    earthquakes(filter: $filter, sort: $sort, first: $first, after: $after) {
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        time
        magnitude
        magnitudeType
        depthKm
        latitude
        longitude
        place
        severity
        alert
        tsunami
        felt
        significance
        country {
          code
          name
          flag
        }
      }
    }
  }
`)

const SORT_FIELDS = ["TIME", "MAGNITUDE", "DEPTH", "SIGNIFICANCE", "FELT"] as const
const SEVERITIES = ["MICRO", "MINOR", "LIGHT", "MODERATE", "STRONG", "MAJOR", "GREAT"] as const satisfies readonly Severity[]
const severitiesCoverEnum: [Exclude<Severity, (typeof SEVERITIES)[number]>] extends [never] ? true : false = true
void severitiesCoverEnum
const PERIODS = { "7d": 7, "30d": 30, "90d": 90, "1y": 365, all: 0 } as const

export interface EarthquakeSearch {
  q?: string
  minMag?: number
  maxMag?: number
  maxDepth?: number
  period?: keyof typeof PERIODS
  severity?: Severity[]
  country?: string
  tsunami?: boolean
  sort?: (typeof SORT_FIELDS)[number]
  dir?: "ASC" | "DESC"
  size?: number
  cursors?: string[]
}

type Resolved = EarthquakeSearch & Required<Pick<EarthquakeSearch, "sort" | "dir" | "size" | "cursors">>

const resolve = (s: EarthquakeSearch): Resolved => ({ ...s, sort: s.sort ?? "TIME", dir: s.dir ?? "DESC", size: s.size ?? 25, cursors: s.cursors ?? [] })

function toFilter(s: EarthquakeSearch): EarthquakeFilter {
  const days = PERIODS[s.period ?? "all"]
  return compact({
    search: s.q,
    magnitude: s.minMag != null || s.maxMag != null ? { min: s.minMag, max: s.maxMag } : undefined,
    depthKm: s.maxDepth != null ? { max: s.maxDepth } : undefined,
    time: days ? { from: new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 13) + ":00:00Z" } : undefined,
    severities: s.severity,
    countryCodes: s.country ? [s.country.toUpperCase()] : undefined,
    tsunami: s.tsunami,
  })
}

const earthquakesQuery = (search: EarthquakeSearch) => {
  const s = resolve(search)
  const variables = {
    filter: toFilter(s),
    sort: { field: s.sort as EarthquakeSortField, direction: s.dir },
    first: s.size,
    after: s.cursors.at(-1),
  }
  return queryOptions({
    queryKey: ["earthquakes", variables],
    queryFn: () => executeRaw(EarthquakesQuery, variables),
    placeholderData: keepPreviousData,
  })
}

export const Route = createFileRoute("/earthquakes/")({
  validateSearch: (raw: Record<string, unknown>): EarthquakeSearch => ({
    q: str(raw.q),
    minMag: num(raw.minMag),
    maxMag: num(raw.maxMag),
    maxDepth: num(raw.maxDepth),
    period: keyOf(raw.period, PERIODS),
    severity: listOf(raw.severity, SEVERITIES),
    country: str(raw.country),
    tsunami: bool(raw.tsunami),
    sort: raw.sort ? oneOf(raw.sort, SORT_FIELDS, "TIME") : undefined,
    dir: raw.dir ? oneOf(raw.dir, ["ASC", "DESC"] as const, "DESC") : undefined,
    size: raw.size ? pageSize(raw.size) : undefined,
    cursors: raw.cursors ? cursorStack(raw.cursors) : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(earthquakesQuery(deps)),
  head: () => ({ meta: [{ title: "Землетрясения — GeoPulse" }] }),
  component: EarthquakesPage,
})

function EarthquakesPage() {
  const search = resolve(Route.useSearch())
  const navigate = useNavigate({ from: Route.fullPath })
  const { data: result, error, isFetching, refetch } = useQuery(earthquakesQuery(search))
  const data = result?.data
  const [showMap, setShowMap] = useState(true)
  const [q, setQ] = useState(search.q ?? "")
  const [mag, setMag] = useState<[number, number]>([search.minMag ?? 0, search.maxMag ?? 10])

  // Every filter change resets pagination: cursors are only valid for the query that produced them.
  const update = (patch: Partial<EarthquakeSearch>) =>
    navigate({ search: (prev) => compact({ ...prev, ...patch, cursors: [] }) as EarthquakeSearch, replace: true })

  useEffect(() => {
    const t = setTimeout(() => {
      if ((search.q ?? "") !== q) update({ q: q || undefined })
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const conn = data?.earthquakes
  const page = search.cursors.length + 1

  return (
    <>
      <PageHeader
        title="Землетрясения"
        description="Глобальный каталог USGS (M2.5+). Фильтры, сортировка и курсорная пагинация выполняются на стороне seismic-subgraph; страна приходит из geo-subgraph через федерацию."
        actions={
          <Button variant="outline" size="sm" onClick={() => setShowMap((v) => !v)}>
            <MapIcon /> {showMap ? "Скрыть карту" : "Показать карту"}
          </Button>
        }
      />

      <Card className="mb-4 gap-4 p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Filter className="size-4" /> Фильтры
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto"
            onClick={() => {
              setQ("")
              setMag([0, 10])
              navigate({ search: {} })
            }}
          >
            <RotateCcw /> Сбросить
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FilterField label="Поиск по месту или ID">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Japan, Alaska, us7000…" />
          </FilterField>
          <FilterField label={`Магнитуда: ${mag[0].toFixed(1)} – ${mag[1].toFixed(1)}`}>
            <Slider
              className="py-2"
              min={0}
              max={10}
              step={0.1}
              value={mag}
              onValueChange={(v) => setMag([v[0] ?? 0, v[1] ?? 10])}
              onValueCommit={(v) =>
                update({ minMag: v[0] && v[0] > 0 ? v[0] : undefined, maxMag: v[1] != null && v[1] < 10 ? v[1] : undefined })
              }
            />
          </FilterField>
          <FilterField label="Период">
            <Select value={search.period ?? "all"} onValueChange={(v) => update({ period: v === "all" ? undefined : (v as EarthquakeSearch["period"]) })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">7 дней</SelectItem>
                <SelectItem value="30d">30 дней</SelectItem>
                <SelectItem value="90d">90 дней</SelectItem>
                <SelectItem value="1y">Год</SelectItem>
                <SelectItem value="all">Всё время</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Макс. глубина, км">
            <Select value={search.maxDepth != null ? String(search.maxDepth) : "any"} onValueChange={(v) => update({ maxDepth: v === "any" ? undefined : Number(v) })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Любая</SelectItem>
                <SelectItem value="10">≤ 10 (очень мелкие)</SelectItem>
                <SelectItem value="70">≤ 70 (мелкофокусные)</SelectItem>
                <SelectItem value="300">≤ 300 (промежуточные)</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <ToggleGroup
            type="multiple"
            variant="outline"
            size="sm"
            value={search.severity ?? []}
            onValueChange={(v) => {
              const severity = v.filter((s) => isOneOf(s, SEVERITIES))
              update({ severity: severity.length ? severity : undefined })
            }}
            className="flex-wrap"
          >
            {SEVERITIES.map((s) => (
              <ToggleGroupItem key={s} value={s} className="text-xs">
                {SEVERITY_LABELS[s]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={search.tsunami === true} onCheckedChange={(c) => update({ tsunami: c ? true : undefined })} />
            Только с угрозой цунами
          </label>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Страна (ISO3)</span>
            <Input
              className="h-8 w-20 uppercase"
              maxLength={3}
              defaultValue={search.country ?? ""}
              onBlur={(e) => update({ country: e.target.value || undefined })}
              onKeyDown={(e) => e.key === "Enter" && update({ country: e.currentTarget.value || undefined })}
              placeholder="JPN"
            />
          </div>
        </div>
      </Card>

      {showMap && conn && (
        <WorldMap
          className="mb-4"
          points={conn.nodes.map((q) => ({
            id: q.id,
            latitude: q.latitude,
            longitude: q.longitude,
            size: Math.max(2.5, ((q.magnitude ?? 2) - 1.5) * 1.6),
            color: magnitudeColor(q.magnitude),
            label: `M${fmtFixed(q.magnitude)} · ${q.place ?? ""}`,
            onClick: () => navigate({ to: "/earthquakes/$id", params: { id: q.id } }),
          }))}
        />
      )}

      <PartialErrors errors={result?.errors ?? []} />
      <Card className="gap-0 overflow-hidden py-0">
        {error && !data ? (
          <div className="p-4">
            <ErrorState error={error} onRetry={() => refetch()} />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table className={isFetching ? "opacity-60 transition-opacity" : ""}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">
                      <SortHeader field="MAGNITUDE" label="Маг." sort={{ field: search.sort, direction: search.dir }} onSort={(s) => update({ sort: s.field, dir: s.direction })} />
                    </TableHead>
                    <TableHead>Место</TableHead>
                    <TableHead>Страна</TableHead>
                    <TableHead>
                      <SortHeader field="TIME" label="Время" sort={{ field: search.sort, direction: search.dir }} onSort={(s) => update({ sort: s.field, dir: s.direction })} />
                    </TableHead>
                    <TableHead className="text-right">
                      <SortHeader field="DEPTH" label="Глубина" sort={{ field: search.sort, direction: search.dir }} onSort={(s) => update({ sort: s.field, dir: s.direction })} />
                    </TableHead>
                    <TableHead className="text-right">
                      <SortHeader field="SIGNIFICANCE" label="Значимость" sort={{ field: search.sort, direction: search.dir }} onSort={(s) => update({ sort: s.field, dir: s.direction })} />
                    </TableHead>
                    <TableHead className="text-right">
                      <SortHeader field="FELT" label="Ощутили" sort={{ field: search.sort, direction: search.dir }} onSort={(s) => update({ sort: s.field, dir: s.direction })} />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!conn &&
                    Array.from({ length: 8 }, (_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={7}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      </TableRow>
                    ))}
                  {conn?.nodes.map((q) => (
                    <TableRow key={q.id} className="cursor-pointer" onClick={() => navigate({ to: "/earthquakes/$id", params: { id: q.id } })}>
                      <TableCell>
                        <MagnitudeBadge value={q.magnitude} />
                      </TableCell>
                      <TableCell className="max-w-[340px]">
                        <Link to="/earthquakes/$id" params={{ id: q.id }} className="line-clamp-1 font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                          {q.place ?? "Неизвестно"}
                        </Link>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          <span className="text-xs text-muted-foreground">{SEVERITY_LABELS[q.severity]}</span>
                          {q.tsunami && <Badge variant="outline" className="h-4 text-[10px]"><Waves className="size-3" />цунами</Badge>}
                          <AlertBadge level={q.alert} />
                        </div>
                      </TableCell>
                      <TableCell>
                        {q.country ? (
                          <Link to="/countries/$code" params={{ code: q.country.code }} className="whitespace-nowrap hover:underline" onClick={(e) => e.stopPropagation()}>
                            {q.country.flag} {q.country.name}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Океан</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{fmtDateTime(q.time)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtFixed(q.depthKm)} км</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNumber(q.significance)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNumber(q.felt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {conn && conn.nodes.length === 0 && <EmptyState title="Ничего не найдено" hint="Ослабьте фильтры или выберите другой период" />}
            </div>
            <CursorPager
              total={conn?.totalCount}
              pageSize={search.size}
              page={page}
              hasNext={!!conn?.pageInfo.hasNextPage}
              loading={isFetching}
              onNext={() =>
                conn?.pageInfo.endCursor &&
                navigate({ search: (prev) => ({ ...prev, cursors: [...(prev.cursors ?? []), conn.pageInfo.endCursor!] }) })
              }
              onPrev={() => navigate({ search: (prev) => compact({ ...prev, cursors: (prev.cursors ?? []).slice(0, -1) }) })}
              onPageSize={(size) => update({ size })}
            />
          </>
        )}
      </Card>
    </>
  )
}
