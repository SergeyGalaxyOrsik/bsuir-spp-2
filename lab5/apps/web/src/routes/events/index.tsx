import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Filter, Map as MapIcon, RotateCcw } from "lucide-react"
import { useEffect, useState } from "react"
import { CursorPager, FilterField, PageHeader, SortHeader } from "@/components/app/common"
import { EmptyState, ErrorState, PartialErrors } from "@/components/app/states"
import { categoryColor } from "@/components/app/hazard"
import { WorldMap } from "@/components/app/world-map"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { graphql } from "@/graphql/gen"
import type { EventStatus, NaturalEventFilter, NaturalEventSortField } from "@/graphql/gen/graphql"
import { fmtDate, fmtFixed, fmtNumber } from "@/lib/format"
import { execute, executeRaw } from "@/lib/graphql"
import { compact, cursorStack, keyOf, oneOf, pageSize, str, strList } from "@/lib/search"

const EventsQuery = graphql(`
  query NaturalEvents($filter: NaturalEventFilter, $sort: NaturalEventSort, $first: Int, $after: String) {
    naturalEvents(filter: $filter, sort: $sort, first: $first, after: $after) {
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        status
        startedAt
        lastObservedAt
        durationDays
        latitude
        longitude
        pointCount
        magnitude {
          value
          unit
        }
        primaryCategory {
          id
          title
        }
        country {
          code
          name
          flag
        }
      }
    }
    hazardStats(filter: $filter) {
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
  }
`)

const CategoriesQuery = graphql(`
  query HazardCategories {
    hazardCategories {
      id
      title
    }
  }
`)

const SORT_FIELDS = ["STARTED_AT", "LAST_OBSERVED_AT", "MAGNITUDE", "TITLE", "DURATION"] as const
const PERIODS = { "30d": 30, "90d": 90, "1y": 365, "3y": 1095, all: 0 } as const

interface EventSearch {
  q?: string
  categories?: string[]
  status?: EventStatus
  period?: keyof typeof PERIODS
  country?: string
  sort?: (typeof SORT_FIELDS)[number]
  dir?: "ASC" | "DESC"
  size?: number
  cursors?: string[]
}

type Resolved = Required<Pick<EventSearch, "sort" | "dir" | "size" | "cursors">> & EventSearch

const resolve = (s: EventSearch): Resolved => ({
  ...s,
  sort: s.sort ?? "STARTED_AT",
  dir: s.dir ?? "DESC",
  size: s.size ?? 25,
  cursors: s.cursors ?? [],
})

function toFilter(s: Resolved): NaturalEventFilter {
  const days = PERIODS[s.period ?? "all"]
  return compact({
    search: s.q,
    categoryIds: s.categories,
    status: s.status,
    started: days ? { from: new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10) + "T00:00:00Z" } : undefined,
    countryCodes: s.country ? [s.country.toUpperCase()] : undefined,
  })
}

const eventsQuery = (search: EventSearch) => {
  const s = resolve(search)
  const variables = {
    filter: toFilter(s),
    sort: { field: s.sort as NaturalEventSortField, direction: s.dir },
    first: s.size,
    after: s.cursors.at(-1),
  }
  return queryOptions({
    queryKey: ["naturalEvents", variables],
    queryFn: () => executeRaw(EventsQuery, variables),
    placeholderData: keepPreviousData,
  })
}

const categoriesQuery = queryOptions({
  queryKey: ["hazardCategories"],
  queryFn: () => execute(CategoriesQuery),
  staleTime: 10 * 60_000,
})

export const Route = createFileRoute("/events/")({
  validateSearch: (raw: Record<string, unknown>): EventSearch => ({
    q: str(raw.q),
    categories: strList(raw.categories),
    status: raw.status === "OPEN" || raw.status === "CLOSED" ? raw.status : undefined,
    period: keyOf(raw.period, PERIODS),
    country: str(raw.country),
    sort: raw.sort ? oneOf(raw.sort, SORT_FIELDS, "STARTED_AT") : undefined,
    dir: raw.dir ? oneOf(raw.dir, ["ASC", "DESC"] as const, "DESC") : undefined,
    size: raw.size ? pageSize(raw.size) : undefined,
    cursors: raw.cursors ? cursorStack(raw.cursors) : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    Promise.all([context.queryClient.ensureQueryData(eventsQuery(deps)), context.queryClient.ensureQueryData(categoriesQuery)]),
  head: () => ({ meta: [{ title: "Природные события — GeoPulse" }] }),
  component: EventsPage,
})

function EventsPage() {
  const search = resolve(Route.useSearch())
  const navigate = useNavigate({ from: Route.fullPath })
  const { data: result, error, isFetching, refetch } = useQuery(eventsQuery(search))
  const data = result?.data
  const { data: cats } = useQuery(categoriesQuery)
  const [showMap, setShowMap] = useState(true)
  const [q, setQ] = useState(search.q ?? "")

  const update = (patch: Partial<EventSearch>) =>
    navigate({ search: (prev) => compact({ ...prev, ...patch, cursors: [] }) as EventSearch, replace: true })

  useEffect(() => {
    const t = setTimeout(() => {
      if ((search.q ?? "") !== q) update({ q: q || undefined })
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const conn = data?.naturalEvents
  const stats = data?.hazardStats
  const page = search.cursors.length + 1
  const sortProps = {
    sort: { field: search.sort, direction: search.dir },
    onSort: (s: { field: Resolved["sort"]; direction: "ASC" | "DESC" }) => update({ sort: s.field, dir: s.direction }),
  }

  return (
    <>
      <PageHeader
        title="Природные события"
        description="NASA EONET: пожары, штормы, вулканы, ледовые явления. Список обслуживает hazards-subgraph с курсорной пагинацией, страна подтягивается из geo-subgraph."
        actions={
          <Button variant="outline" size="sm" onClick={() => setShowMap((v) => !v)}>
            <MapIcon /> {showMap ? "Скрыть карту" : "Показать карту"}
          </Button>
        }
      />

      {stats && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Badge variant="secondary" className="tabular-nums">
            Всего: {fmtNumber(stats.count)} · активных: {fmtNumber(stats.open)}
          </Badge>
          {stats.byCategory.map((c) => {
            const active = search.categories?.includes(c.category.id)
            return (
              <button
                key={c.category.id}
                type="button"
                onClick={() =>
                  update({
                    categories: active
                      ? search.categories?.filter((x) => x !== c.category.id)
                      : [...(search.categories ?? []), c.category.id],
                  })
                }
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs tabular-nums transition-colors ${active ? "bg-accent" : "hover:bg-accent/60"}`}
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: categoryColor(c.category.id) }} />
                {c.category.title}: {fmtNumber(c.count)}
              </button>
            )
          })}
        </div>
      )}

      <Card className="mb-4 gap-4 p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Filter className="size-4" /> Фильтры
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto"
            onClick={() => {
              setQ("")
              navigate({ search: {} })
            }}
          >
            <RotateCcw /> Сбросить
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FilterField label="Поиск по названию или ID">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Wildfire, Etna, EONET_…" />
          </FilterField>
          <FilterField label="Категория">
            <Select
              value={search.categories?.length === 1 ? search.categories[0] : "all"}
              onValueChange={(v) => update({ categories: v === "all" ? undefined : [v] })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={search.categories && search.categories.length > 1 ? `${search.categories.length} выбрано` : "Все"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все категории</SelectItem>
                {cats?.hazardCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Начало события">
            <Select value={search.period ?? "all"} onValueChange={(v) => update({ period: v === "all" ? undefined : (v as EventSearch["period"]) })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30d">30 дней</SelectItem>
                <SelectItem value="90d">90 дней</SelectItem>
                <SelectItem value="1y">Год</SelectItem>
                <SelectItem value="3y">3 года</SelectItem>
                <SelectItem value="all">Всё время</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Страна (ISO3)">
            <Input
              className="uppercase"
              maxLength={3}
              defaultValue={search.country ?? ""}
              onBlur={(e) => update({ country: e.target.value || undefined })}
              onKeyDown={(e) => e.key === "Enter" && update({ country: e.currentTarget.value || undefined })}
              placeholder="USA"
            />
          </FilterField>
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={search.status ?? "ALL"}
          onValueChange={(v) => update({ status: v === "OPEN" || v === "CLOSED" ? v : undefined })}
        >
          <ToggleGroupItem value="ALL" className="text-xs">Все</ToggleGroupItem>
          <ToggleGroupItem value="OPEN" className="text-xs">Активные</ToggleGroupItem>
          <ToggleGroupItem value="CLOSED" className="text-xs">Завершённые</ToggleGroupItem>
        </ToggleGroup>
      </Card>

      {showMap && conn && (
        <WorldMap
          className="mb-4"
          points={conn.nodes.map((e) => ({
            id: e.id,
            latitude: e.latitude,
            longitude: e.longitude,
            size: 3.5,
            color: categoryColor(e.primaryCategory.id),
            label: `${e.primaryCategory.title} · ${e.title}`,
            onClick: () => navigate({ to: "/events/$id", params: { id: e.id } }),
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
                    <TableHead>
                      <SortHeader field="TITLE" label="Событие" {...sortProps} />
                    </TableHead>
                    <TableHead>Категория</TableHead>
                    <TableHead>Страна</TableHead>
                    <TableHead>
                      <SortHeader field="STARTED_AT" label="Начало" {...sortProps} />
                    </TableHead>
                    <TableHead>
                      <SortHeader field="LAST_OBSERVED_AT" label="Последнее наблюдение" {...sortProps} />
                    </TableHead>
                    <TableHead className="text-right">
                      <SortHeader field="DURATION" label="Длительность" {...sortProps} />
                    </TableHead>
                    <TableHead className="text-right">
                      <SortHeader field="MAGNITUDE" label="Масштаб" {...sortProps} />
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
                  {conn?.nodes.map((e) => (
                    <TableRow key={e.id} className="cursor-pointer" onClick={() => navigate({ to: "/events/$id", params: { id: e.id } })}>
                      <TableCell className="max-w-[360px]">
                        <Link to="/events/$id" params={{ id: e.id }} className="line-clamp-1 font-medium hover:underline" onClick={(ev) => ev.stopPropagation()}>
                          {e.title}
                        </Link>
                        <div className="mt-0.5 flex gap-1">
                          <Badge variant={e.status === "OPEN" ? "default" : "outline"} className="h-4 text-[10px]">
                            {e.status === "OPEN" ? "активно" : "завершено"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{e.pointCount} набл.</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm">
                          <span className="size-2 rounded-full" style={{ backgroundColor: categoryColor(e.primaryCategory.id) }} />
                          {e.primaryCategory.title}
                        </span>
                      </TableCell>
                      <TableCell>
                        {e.country ? (
                          <Link to="/countries/$code" params={{ code: e.country.code }} className="whitespace-nowrap hover:underline" onClick={(ev) => ev.stopPropagation()}>
                            {e.country.flag} {e.country.name}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{fmtDate(e.startedAt)}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{fmtDate(e.lastObservedAt)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtFixed(e.durationDays)} дн</TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {e.magnitude ? `${fmtNumber(e.magnitude.value)} ${e.magnitude.unit ?? ""}` : "—"}
                      </TableCell>
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
