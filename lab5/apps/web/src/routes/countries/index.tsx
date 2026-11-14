import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ChevronLeft, ChevronRight, Filter, RotateCcw } from "lucide-react"
import { useEffect, useState } from "react"
import { FilterField, PageHeader, SortHeader } from "@/components/app/common"
import { MagnitudeBadge } from "@/components/app/magnitude"
import { EmptyState, ErrorState } from "@/components/app/states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { graphql } from "@/graphql/gen"
import type { CountryFilter, CountrySortField } from "@/graphql/gen/graphql"
import { fmtCompact, fmtFixed, fmtNumber } from "@/lib/format"
import { execute } from "@/lib/graphql"
import { bool, compact, num, oneOf, pageSize, str } from "@/lib/search"

const CountriesQuery = graphql(`
  query Countries($filter: CountryFilter, $sort: CountrySort, $limit: Int, $offset: Int) {
    countries(filter: $filter, sort: $sort, limit: $limit, offset: $offset) {
      total
      limit
      offset
      hasMore
      items {
        code
        name
        localizedName(lang: "rus")
        flag
        region
        subregion
        population
        gdpPerCapita
        lifeExpectancy
        density
        incomeLevel
        seismicStats {
          count
          maxMagnitude
        }
        hazardStats {
          count
          open
        }
      }
    }
  }
`)

const CountryFacetsQuery = graphql(`
  query CountryFacets {
    regions {
      name
      countryCount
      subregions
    }
    incomeLevels
  }
`)

const SORT_FIELDS = ["NAME", "POPULATION", "AREA", "DENSITY", "GDP_PER_CAPITA", "LIFE_EXPECTANCY"] as const
const SORT_LABELS: Record<(typeof SORT_FIELDS)[number], string> = {
  NAME: "Название",
  POPULATION: "Население",
  AREA: "Площадь",
  DENSITY: "Плотность",
  GDP_PER_CAPITA: "ВВП на душу",
  LIFE_EXPECTANCY: "Продолжительность жизни",
}
const POPULATION_BANDS = {
  small: { max: 1_000_000 },
  medium: { min: 1_000_000, max: 50_000_000 },
  large: { min: 50_000_000 },
} as const

interface CountrySearch {
  q?: string
  region?: string
  subregion?: string
  income?: string
  landlocked?: boolean
  un?: boolean
  pop?: keyof typeof POPULATION_BANDS
  sort?: (typeof SORT_FIELDS)[number]
  dir?: "ASC" | "DESC"
  size?: number
  page?: number
}

type Resolved = Required<Pick<CountrySearch, "sort" | "dir" | "size" | "page">> & CountrySearch

const resolve = (s: CountrySearch): Resolved => ({
  ...s,
  sort: s.sort ?? "POPULATION",
  dir: s.dir ?? "DESC",
  size: s.size ?? 25,
  page: s.page ?? 1,
})

function toFilter(s: Resolved): CountryFilter {
  return compact({
    search: s.q,
    regions: s.region ? [s.region] : undefined,
    subregions: s.subregion ? [s.subregion] : undefined,
    incomeLevels: s.income ? [s.income] : undefined,
    landlocked: s.landlocked,
    unMember: s.un,
    population: s.pop ? POPULATION_BANDS[s.pop] : undefined,
  })
}

const countriesQuery = (search: CountrySearch) => {
  const s = resolve(search)
  const variables = {
    filter: toFilter(s),
    sort: { field: s.sort as CountrySortField, direction: s.dir },
    limit: s.size,
    offset: (s.page - 1) * s.size,
  }
  return queryOptions({
    queryKey: ["countries", variables],
    queryFn: () => execute(CountriesQuery, variables),
    placeholderData: keepPreviousData,
  })
}

const facetsQuery = queryOptions({ queryKey: ["countryFacets"], queryFn: () => execute(CountryFacetsQuery), staleTime: 10 * 60_000 })

export const Route = createFileRoute("/countries/")({
  validateSearch: (raw: Record<string, unknown>): CountrySearch => ({
    q: str(raw.q),
    region: str(raw.region),
    subregion: str(raw.subregion),
    income: str(raw.income),
    landlocked: bool(raw.landlocked),
    un: bool(raw.un),
    pop: typeof raw.pop === "string" && raw.pop in POPULATION_BANDS ? (raw.pop as keyof typeof POPULATION_BANDS) : undefined,
    sort: raw.sort ? oneOf(raw.sort, SORT_FIELDS, "POPULATION") : undefined,
    dir: raw.dir ? oneOf(raw.dir, ["ASC", "DESC"] as const, "DESC") : undefined,
    size: raw.size ? pageSize(raw.size) : undefined,
    page: num(raw.page) && num(raw.page)! > 1 ? Math.floor(num(raw.page)!) : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    Promise.all([context.queryClient.ensureQueryData(countriesQuery(deps)), context.queryClient.ensureQueryData(facetsQuery)]),
  head: () => ({ meta: [{ title: "Страны — GeoPulse" }] }),
  component: CountriesPage,
})

function OffsetPager({
  page,
  pages,
  total,
  size,
  loading,
  onPage,
  onSize,
}: {
  page: number
  pages: number
  total: number
  size: number
  loading?: boolean
  onPage: (page: number) => void
  onSize: (size: number) => void
}) {
  // Compact window of page numbers around the current page.
  const window = Array.from(new Set([1, page - 1, page, page + 1, pages])).filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
      <div className="text-muted-foreground">
        {total === 0 ? "0" : `${fmtNumber((page - 1) * size + 1)}–${fmtNumber(Math.min(page * size, total))}`} из {fmtNumber(total)}
      </div>
      <div className="flex items-center gap-1.5">
        <Select value={String(size)} onValueChange={(v) => onSize(Number(v))}>
          <SelectTrigger size="sm" className="mr-2 w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[10, 25, 50, 100].map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon-sm" disabled={page <= 1 || loading} onClick={() => onPage(page - 1)} aria-label="Назад">
          <ChevronLeft />
        </Button>
        {window.map((p, i) => (
          <span key={p} className="flex items-center gap-1.5">
            {i > 0 && window[i - 1]! < p - 1 && <span className="text-muted-foreground">…</span>}
            <Button variant={p === page ? "default" : "outline"} size="icon-sm" disabled={loading} onClick={() => onPage(p)}>
              {p}
            </Button>
          </span>
        ))}
        <Button variant="outline" size="icon-sm" disabled={page >= pages || loading} onClick={() => onPage(page + 1)} aria-label="Вперёд">
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}

function CountriesPage() {
  const search = resolve(Route.useSearch())
  const navigate = useNavigate({ from: Route.fullPath })
  const { data, error, isFetching, refetch } = useQuery(countriesQuery(search))
  const { data: facets } = useQuery(facetsQuery)
  const [q, setQ] = useState(search.q ?? "")

  const update = (patch: Partial<CountrySearch>) =>
    navigate({ search: (prev) => compact({ ...prev, page: undefined, ...patch }) as CountrySearch, replace: true })

  useEffect(() => {
    const t = setTimeout(() => {
      if ((search.q ?? "") !== q) update({ q: q || undefined })
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const page = data?.countries
  const pages = page ? Math.max(1, Math.ceil(page.total / search.size)) : 1
  const subregions = facets?.regions.find((r) => r.name === search.region)?.subregions ?? []
  const sortProps = {
    sort: { field: search.sort, direction: search.dir },
    onSort: (s: { field: Resolved["sort"]; direction: "ASC" | "DESC" }) => update({ sort: s.field, dir: s.direction }),
  }

  return (
    <>
      <PageHeader
        title="Страны"
        description={
          <>
            250 стран (mledoze/countries + World Bank). Колонки «Землетрясения» и «События» вычисляют seismic- и hazards-subgraph:
            шлюз федерации дополняет каждую страну их полями <b>в одном GraphQL-запросе</b>, а сервисы отвечают батчами через
            DataLoader. Здесь используется offset-пагинация, в отличие от курсорной в каталогах событий.
          </>
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
              navigate({ search: {} })
            }}
          >
            <RotateCcw /> Сбросить
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <FilterField label="Поиск (название, столица, код)">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Япония, Paris, DEU…" />
          </FilterField>
          <FilterField label="Регион">
            <Select value={search.region ?? "all"} onValueChange={(v) => update({ region: v === "all" ? undefined : v, subregion: undefined })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все регионы</SelectItem>
                {facets?.regions.map((r) => (
                  <SelectItem key={r.name} value={r.name}>
                    {r.name} ({r.countryCount})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Субрегион">
            <Select
              value={search.subregion ?? "all"}
              disabled={subregions.length === 0}
              onValueChange={(v) => update({ subregion: v === "all" ? undefined : v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Сначала регион" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                {subregions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Уровень дохода (World Bank)">
            <Select value={search.income ?? "all"} onValueChange={(v) => update({ income: v === "all" ? undefined : v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Любой</SelectItem>
                {facets?.incomeLevels.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Население">
            <Select value={search.pop ?? "all"} onValueChange={(v) => update({ pop: v === "all" ? undefined : (v as CountrySearch["pop"]) })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Любое</SelectItem>
                <SelectItem value="small">До 1 млн</SelectItem>
                <SelectItem value="medium">1–50 млн</SelectItem>
                <SelectItem value="large">Более 50 млн</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={search.landlocked === true} onCheckedChange={(c) => update({ landlocked: c ? true : undefined })} />
            Без выхода к морю
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={search.un === true} onCheckedChange={(c) => update({ un: c ? true : undefined })} />
            Члены ООН
          </label>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Сортировка</span>
            <Select value={search.sort} onValueChange={(v) => update({ sort: v as Resolved["sort"] })}>
              <SelectTrigger size="sm" className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_FIELDS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {SORT_LABELS[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => update({ dir: search.dir === "DESC" ? "ASC" : "DESC" })}>
              {search.dir === "DESC" ? "по убыванию" : "по возрастанию"}
            </Button>
          </div>
        </div>
      </Card>

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
                      <SortHeader field="NAME" label="Страна" {...sortProps} />
                    </TableHead>
                    <TableHead>Регион</TableHead>
                    <TableHead className="text-right">
                      <SortHeader field="POPULATION" label="Население" {...sortProps} />
                    </TableHead>
                    <TableHead className="text-right">
                      <SortHeader field="DENSITY" label="чел/км²" {...sortProps} />
                    </TableHead>
                    <TableHead className="text-right">
                      <SortHeader field="GDP_PER_CAPITA" label="ВВП/чел, $" {...sortProps} />
                    </TableHead>
                    <TableHead className="text-right">
                      <SortHeader field="LIFE_EXPECTANCY" label="Жизнь, лет" {...sortProps} />
                    </TableHead>
                    <TableHead className="text-right">Землетрясения</TableHead>
                    <TableHead className="text-right">События</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!page &&
                    Array.from({ length: 10 }, (_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={8}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      </TableRow>
                    ))}
                  {page?.items.map((c) => (
                    <TableRow key={c.code} className="cursor-pointer" onClick={() => navigate({ to: "/countries/$code", params: { code: c.code } })}>
                      <TableCell>
                        <Link to="/countries/$code" params={{ code: c.code }} className="flex items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
                          <span className="text-2xl leading-none">{c.flag}</span>
                          <span>
                            <span className="block font-medium hover:underline">{c.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {c.localizedName} · {c.code}
                            </span>
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{c.region}</div>
                        <div className="text-xs text-muted-foreground">{c.subregion}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtCompact(c.population)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtFixed(c.density, 0)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNumber(c.gdpPerCapita == null ? null : Math.round(c.gdpPerCapita))}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtFixed(c.lifeExpectancy)}</TableCell>
                      <TableCell className="text-right">
                        {(c.seismicStats?.count ?? 0) > 0 ? (
                          <span className="inline-flex items-center gap-2 tabular-nums">
                            {fmtNumber(c.seismicStats?.count)}
                            <MagnitudeBadge value={c.seismicStats?.maxMagnitude} />
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {(c.hazardStats?.count ?? 0) > 0 ? (
                          <span className="inline-flex items-center gap-1.5">
                            {fmtNumber(c.hazardStats?.count)}
                            {(c.hazardStats?.open ?? 0) > 0 && <Badge variant="secondary">{c.hazardStats?.open} акт.</Badge>}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {page && page.items.length === 0 && <EmptyState title="Страны не найдены" hint="Измените фильтры" />}
            </div>
            {page && (
              <OffsetPager
                page={search.page}
                pages={pages}
                total={page.total}
                size={search.size}
                loading={isFetching}
                onPage={(p) => navigate({ search: (prev) => compact({ ...prev, page: p > 1 ? p : undefined }) })}
                onSize={(size) => update({ size })}
              />
            )}
          </>
        )}
      </Card>
    </>
  )
}
