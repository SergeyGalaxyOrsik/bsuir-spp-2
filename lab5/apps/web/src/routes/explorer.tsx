import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Check, ChevronRight, Copy, Play, Zap } from "lucide-react"
import { useMemo, useState } from "react"
import { FilterField, PageHeader, StatCard } from "@/components/app/common"
import { EmptyState, ErrorState } from "@/components/app/states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { executeRaw, type GraphQLErrorShape } from "@/lib/graphql"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Field catalog: what the builder can select. Paths are dotted ("country.neighbors.name").
// ---------------------------------------------------------------------------

interface FieldDef {
  name: string
  label: string
  /** Literal argument list appended to the field, may reference variables. */
  args?: string
  /** Variables the args reference: name → GraphQL type. */
  vars?: Record<string, string>
  children?: FieldDef[]
  /** Owning subgraph — shown to make federation visible. */
  subgraph?: string
}

interface EntityDef {
  key: "earthquakes" | "naturalEvents" | "countries"
  label: string
  subgraph: string
  /** Root field call; receives the variable names defined in `rootVars`. */
  rootCall: string
  rootVars: Record<string, string>
  /** Wrapper around the selection of a single item. */
  listField: "nodes" | "items"
  totalField: "totalCount" | "total"
  sortFields: { value: string; label: string }[]
  fields: FieldDef[]
  defaults: string[]
}

const COUNTRY_BRIEF: FieldDef = {
  name: "country",
  label: "Страна",
  subgraph: "geo",
  children: [
    { name: "code", label: "Код" },
    { name: "name", label: "Название" },
    { name: "flag", label: "Флаг" },
    { name: "region", label: "Регион" },
    { name: "population", label: "Население" },
    { name: "capital", label: "Столица" },
    { name: "incomeLevel", label: "Уровень дохода" },
    {
      name: "neighbors",
      label: "Соседи",
      children: [
        { name: "name", label: "Название" },
        { name: "code", label: "Код" },
      ],
    },
    {
      name: "weather",
      label: "Погода (Open-Meteo)",
      children: [
        { name: "temperatureC", label: "Температура" },
        { name: "description", label: "Описание" },
      ],
    },
  ],
}

const CATALOG: Record<EntityDef["key"], EntityDef> = {
  earthquakes: {
    key: "earthquakes",
    label: "Землетрясения",
    subgraph: "seismic",
    rootCall: "earthquakes(filter: $filter, sort: $sort, first: $first)",
    rootVars: { filter: "EarthquakeFilter", sort: "EarthquakeSort", first: "Int" },
    listField: "nodes",
    totalField: "totalCount",
    sortFields: [
      { value: "TIME", label: "Время" },
      { value: "MAGNITUDE", label: "Магнитуда" },
      { value: "DEPTH", label: "Глубина" },
      { value: "SIGNIFICANCE", label: "Значимость" },
    ],
    defaults: ["id", "time", "magnitude", "place", "country", "country.name"],
    fields: [
      { name: "id", label: "ID" },
      { name: "time", label: "Время" },
      { name: "magnitude", label: "Магнитуда" },
      { name: "magnitudeType", label: "Тип магнитуды" },
      { name: "depthKm", label: "Глубина, км" },
      { name: "latitude", label: "Широта" },
      { name: "longitude", label: "Долгота" },
      { name: "place", label: "Место" },
      { name: "severity", label: "Класс силы" },
      { name: "tsunami", label: "Цунами" },
      { name: "alert", label: "PAGER" },
      { name: "felt", label: "Ощутили" },
      { name: "significance", label: "Значимость" },
      { name: "energyJoules", label: "Энергия, Дж" },
      COUNTRY_BRIEF,
      {
        name: "nearby",
        label: "Соседние толчки",
        args: "(first: 3)",
        children: [
          { name: "id", label: "ID" },
          { name: "magnitude", label: "Магнитуда" },
          { name: "place", label: "Место" },
        ],
      },
    ],
  },
  naturalEvents: {
    key: "naturalEvents",
    label: "Природные события",
    subgraph: "hazards",
    rootCall: "naturalEvents(filter: $filter, sort: $sort, first: $first)",
    rootVars: { filter: "NaturalEventFilter", sort: "NaturalEventSort", first: "Int" },
    listField: "nodes",
    totalField: "totalCount",
    sortFields: [
      { value: "STARTED_AT", label: "Начало" },
      { value: "LAST_OBSERVED_AT", label: "Последнее наблюдение" },
      { value: "MAGNITUDE", label: "Магнитуда" },
      { value: "DURATION", label: "Длительность" },
      { value: "TITLE", label: "Название" },
    ],
    defaults: ["id", "title", "status", "startedAt", "primaryCategory", "primaryCategory.title"],
    fields: [
      { name: "id", label: "ID" },
      { name: "title", label: "Название" },
      { name: "status", label: "Статус" },
      { name: "startedAt", label: "Начало" },
      { name: "closedAt", label: "Завершено" },
      { name: "durationDays", label: "Длительность, дн" },
      { name: "latitude", label: "Широта" },
      { name: "longitude", label: "Долгота" },
      { name: "pointCount", label: "Точек трека" },
      {
        name: "magnitude",
        label: "Магнитуда",
        children: [
          { name: "value", label: "Значение" },
          { name: "unit", label: "Единица" },
        ],
      },
      { name: "primaryCategory", label: "Категория", children: [{ name: "id", label: "ID" }, { name: "title", label: "Название" }] },
      {
        name: "sources",
        label: "Источники",
        children: [
          { name: "url", label: "Ссылка" },
          { name: "source", label: "Источник", children: [{ name: "title", label: "Название" }] },
        ],
      },
      COUNTRY_BRIEF,
      {
        name: "nearbyEarthquakes",
        label: "Землетрясения рядом",
        subgraph: "seismic",
        args: "(first: 3)",
        children: [
          { name: "magnitude", label: "Магнитуда" },
          { name: "place", label: "Место" },
          { name: "time", label: "Время" },
        ],
      },
    ],
  },
  countries: {
    key: "countries",
    label: "Страны",
    subgraph: "geo",
    rootCall: "countries(filter: $filter, sort: $sort, limit: $first)",
    rootVars: { filter: "CountryFilter", sort: "CountrySort", first: "Int" },
    listField: "items",
    totalField: "total",
    sortFields: [
      { value: "NAME", label: "Название" },
      { value: "POPULATION", label: "Население" },
      { value: "AREA", label: "Площадь" },
      { value: "DENSITY", label: "Плотность" },
      { value: "GDP_PER_CAPITA", label: "ВВП на душу" },
      { value: "LIFE_EXPECTANCY", label: "Продолжительность жизни" },
    ],
    defaults: ["code", "name", "region", "population", "seismicStats", "seismicStats.count"],
    fields: [
      { name: "code", label: "Код" },
      { name: "name", label: "Название" },
      { name: "localizedName", label: "Название (рус.)" },
      { name: "flag", label: "Флаг" },
      { name: "capital", label: "Столица" },
      { name: "region", label: "Регион" },
      { name: "subregion", label: "Субрегион" },
      { name: "population", label: "Население" },
      { name: "areaKm2", label: "Площадь" },
      { name: "density", label: "Плотность" },
      { name: "gdpPerCapita", label: "ВВП на душу" },
      { name: "lifeExpectancy", label: "Продолжит. жизни" },
      { name: "incomeLevel", label: "Уровень дохода" },
      { name: "landlocked", label: "Без выхода к морю" },
      { name: "languages", label: "Языки", children: [{ name: "name", label: "Название" }, { name: "code", label: "Код" }] },
      { name: "currencies", label: "Валюты", children: [{ name: "code", label: "Код" }, { name: "name", label: "Название" }] },
      { name: "neighbors", label: "Соседи", children: [{ name: "name", label: "Название" }, { name: "population", label: "Население" }] },
      {
        name: "weather",
        label: "Погода",
        children: [
          { name: "temperatureC", label: "Температура" },
          { name: "windSpeedKmh", label: "Ветер" },
          { name: "description", label: "Описание" },
        ],
      },
      {
        name: "indicator",
        label: "Показатель World Bank",
        args: "(id: $indicatorId)",
        vars: { indicatorId: "IndicatorId!" },
        children: [
          { name: "latest", label: "Последнее", children: [{ name: "year", label: "Год" }, { name: "value", label: "Значение" }] },
          { name: "changePct", label: "Изменение, %" },
        ],
      },
      {
        name: "seismicStats",
        label: "Сейсмичность",
        subgraph: "seismic",
        children: [
          { name: "count", label: "Кол-во" },
          { name: "maxMagnitude", label: "Макс. M" },
          { name: "avgMagnitude", label: "Средн. M" },
          { name: "lastAt", label: "Последнее" },
        ],
      },
      {
        name: "hazardStats",
        label: "Природные события",
        subgraph: "hazards",
        children: [
          { name: "count", label: "Всего" },
          { name: "open", label: "Активных" },
        ],
      },
    ],
  },
}

const INDICATORS = ["POPULATION", "GDP", "GDP_PER_CAPITA", "LIFE_EXPECTANCY", "URBAN_POPULATION_PCT", "ELECTRICITY_ACCESS_PCT", "FOREST_AREA_PCT", "CO2_PER_CAPITA"]
const CATEGORIES = ["wildfires", "severeStorms", "volcanoes", "seaLakeIce", "floods", "earthquakes", "landslides", "drought", "snow", "tempExtremes", "dustHaze", "manmade", "waterColor"]
const REGIONS = ["Africa", "Americas", "Antarctic", "Asia", "Europe", "Oceania"]

// ---------------------------------------------------------------------------
// Document builder
// ---------------------------------------------------------------------------

interface BuilderState {
  entity: EntityDef["key"]
  selected: Set<string>
  /** Paths of object fields wrapped in @include(if: $…). */
  conditional: Set<string>
  includeFlags: Record<string, boolean>
  search: string
  minMagnitude: string
  country: string
  category: string
  status: string
  region: string
  indicatorId: string
  sortField: string
  sortDir: "ASC" | "DESC"
  limit: number
}

const varName = (path: string) => `with_${path.replace(/\./g, "_")}`

function isActive(path: string, selected: Set<string>) {
  if (selected.has(path)) return true
  for (const p of selected) if (p.startsWith(`${path}.`)) return true
  return false
}

function buildSelection(fields: FieldDef[], prefix: string, state: BuilderState, vars: Map<string, string>, depth: number): string[] {
  const pad = "  ".repeat(depth)
  const lines: string[] = []
  for (const f of fields) {
    const path = prefix ? `${prefix}.${f.name}` : f.name
    if (!isActive(path, state.selected)) continue
    if (f.vars) for (const [k, v] of Object.entries(f.vars)) vars.set(k, v)
    const directive = state.conditional.has(path) ? ` @include(if: $${varName(path)})` : ""
    if (directive) vars.set(varName(path), "Boolean!")
    if (f.children) {
      const inner = buildSelection(f.children, path, state, vars, depth + 1)
      // An object picked without sub-fields gets its first scalar so the document stays valid.
      if (inner.length === 0) {
        const first = f.children.find((c) => !c.children)
        inner.push(`${"  ".repeat(depth + 1)}${first?.name ?? "__typename"}`)
      }
      lines.push(`${pad}${f.name}${f.args ?? ""}${directive} {`, ...inner, `${pad}}`)
    } else {
      lines.push(`${pad}${f.name}${f.args ?? ""}`)
    }
  }
  return lines
}

function buildVariables(state: BuilderState, vars: Map<string, string>) {
  const entity = CATALOG[state.entity]
  const filter: Record<string, unknown> = {}
  if (state.search.trim()) filter.search = state.search.trim()
  if (state.entity === "earthquakes") {
    if (state.minMagnitude) filter.magnitude = { min: Number(state.minMagnitude) }
    if (state.country.trim()) filter.countryCodes = [state.country.trim().toUpperCase()]
  }
  if (state.entity === "naturalEvents") {
    if (state.category !== "any") filter.categoryIds = [state.category]
    if (state.status !== "any") filter.status = state.status
    if (state.country.trim()) filter.countryCodes = [state.country.trim().toUpperCase()]
  }
  if (state.entity === "countries" && state.region !== "any") filter.regions = [state.region]
  const variables: Record<string, unknown> = {
    filter,
    sort: { field: state.sortField || entity.sortFields[0]!.value, direction: state.sortDir },
    first: state.limit,
  }
  for (const [name, type] of vars) {
    if (name === "indicatorId") variables[name] = state.indicatorId
    else if (type === "Boolean!") variables[name] = state.includeFlags[name] ?? true
  }
  return variables
}

function buildDocument(state: BuilderState) {
  const entity = CATALOG[state.entity]
  const vars = new Map<string, string>(Object.entries(entity.rootVars))
  const selection = buildSelection(entity.fields, "", state, vars, 3)
  if (selection.length === 0) selection.push("      __typename")
  const opName = `Explore${entity.key[0]!.toUpperCase()}${entity.key.slice(1)}`
  const header = [...vars].map(([k, v]) => `$${k}: ${v}`).join(", ")
  const document = [
    `query ${opName}(${header}) {`,
    `  ${entity.rootCall} {`,
    `    ${entity.totalField}`,
    `    ${entity.listField} {`,
    ...selection,
    "    }",
    "  }",
    "}",
  ].join("\n")
  return { document, variables: buildVariables(state, vars), vars }
}

// ---------------------------------------------------------------------------
// Result flattening: nested objects → dotted columns; lists → joined values.
// ---------------------------------------------------------------------------

type Flat = Record<string, string>

function flatten(value: unknown, prefix = "", out: Flat = {}): Flat {
  if (Array.isArray(value)) {
    const parts = value.map((v) => flatten(v, prefix))
    const keys = new Set(parts.flatMap((p) => Object.keys(p)))
    for (const k of keys) out[k] = parts.map((p) => p[k] ?? "").filter(Boolean).join(", ")
    if (value.length === 0 && prefix) out[prefix] = "[]"
    return out
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out)
    return out
  }
  out[prefix] = value == null ? "—" : typeof value === "number" && !Number.isInteger(value) ? value.toFixed(2) : String(value)
  return out
}

// ---------------------------------------------------------------------------

export const Route = createFileRoute("/explorer")({
  head: () => ({ meta: [{ title: "Конструктор запросов — GeoPulse" }] }),
  component: ExplorerPage,
})

const initialState = (entity: EntityDef["key"]): BuilderState => ({
  entity,
  selected: new Set(CATALOG[entity].defaults),
  conditional: new Set(),
  includeFlags: {},
  search: "",
  minMagnitude: entity === "earthquakes" ? "5" : "",
  country: "",
  category: "any",
  status: "any",
  region: "any",
  indicatorId: "GDP_PER_CAPITA",
  sortField: CATALOG[entity].sortFields[0]!.value,
  sortDir: entity === "countries" ? "ASC" : "DESC",
  limit: 10,
})

function ExplorerPage() {
  const [state, setState] = useState<BuilderState>(() => initialState("earthquakes"))
  const [copied, setCopied] = useState(false)
  const entity = CATALOG[state.entity]
  const { document, variables, vars } = useMemo(() => buildDocument(state), [state])

  const result = useQuery({
    queryKey: ["explorer", document, variables],
    queryFn: async () => {
      const started = performance.now()
      const res = await executeRaw<Record<string, unknown>, Record<string, unknown>>(document, variables)
      return { ...res, durationMs: Math.round(performance.now() - started) }
    },
    placeholderData: keepPreviousData,
    retry: false,
  })

  const root = result.data?.data?.[entity.key] as Record<string, unknown> | undefined
  const items = (root?.[entity.listField] as unknown[] | undefined) ?? []
  const rows = items.map((i) => flatten(i))
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  const ext = result.data?.extensions as { cost?: { estimated?: number }; responseCache?: { hit?: boolean } } | undefined
  const errors: GraphQLErrorShape[] = result.data?.errors ?? []

  const toggle = (path: string, on: boolean) => {
    setState((s) => {
      const selected = new Set(s.selected)
      if (on) {
        selected.add(path)
      } else {
        for (const p of [...selected]) if (p === path || p.startsWith(`${path}.`)) selected.delete(p)
      }
      // A conditional marker only makes sense for active object fields.
      const conditional = new Set([...s.conditional].filter((p) => isActive(p, selected)))
      return { ...s, selected, conditional }
    })
  }

  const setField = <K extends keyof BuilderState>(key: K, value: BuilderState[K]) => setState((s) => ({ ...s, [key]: value }))

  return (
    <>
      <PageHeader
        title="Конструктор запросов"
        description="GraphQL-документ формируется динамически из выбранных полей: вложенные объекты разрешаются разными subgraph-ами, @include управляет частью выборки через переменные, а шлюз оценивает стоимость запроса (demand control)."
      />

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <Card className="h-fit gap-4">
          <CardHeader>
            <CardTitle className="text-base">Сущность и поля</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Select value={state.entity} onValueChange={(v) => setState(initialState(v as EntityDef["key"]))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(CATALOG).map((e) => (
                  <SelectItem key={e.key} value={e.key}>
                    {e.label} <span className="text-muted-foreground">· {e.subgraph}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ScrollArea className="h-[460px] pr-3">
              <FieldTree fields={entity.fields} prefix="" state={state} onToggle={toggle} onConditional={(path, on) =>
                setState((s) => {
                  const conditional = new Set(s.conditional)
                  if (on) conditional.add(path)
                  else conditional.delete(path)
                  return { ...s, conditional }
                })
              } />
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card className="gap-4">
            <CardHeader>
              <CardTitle className="text-base">Аргументы и переменные</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <FilterField label="Поиск">
                <Input value={state.search} onChange={(e) => setField("search", e.target.value)} placeholder="подстрока" />
              </FilterField>
              {state.entity === "earthquakes" && (
                <FilterField label="Мин. магнитуда">
                  <Input type="number" step="0.1" value={state.minMagnitude} onChange={(e) => setField("minMagnitude", e.target.value)} />
                </FilterField>
              )}
              {state.entity !== "countries" && (
                <FilterField label="Страна (ISO3)">
                  <Input className="uppercase" maxLength={3} value={state.country} onChange={(e) => setField("country", e.target.value)} placeholder="JPN" />
                </FilterField>
              )}
              {state.entity === "naturalEvents" && (
                <>
                  <FilterField label="Категория">
                    <Select value={state.category} onValueChange={(v) => setField("category", v)}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Любая</SelectItem>
                        {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FilterField>
                  <FilterField label="Статус">
                    <Select value={state.status} onValueChange={(v) => setField("status", v)}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Любой</SelectItem>
                        <SelectItem value="OPEN">Активные</SelectItem>
                        <SelectItem value="CLOSED">Завершённые</SelectItem>
                      </SelectContent>
                    </Select>
                  </FilterField>
                </>
              )}
              {state.entity === "countries" && (
                <FilterField label="Регион">
                  <Select value={state.region} onValueChange={(v) => setField("region", v)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Любой</SelectItem>
                      {REGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FilterField>
              )}
              {vars.has("indicatorId") && (
                <FilterField label="$indicatorId">
                  <Select value={state.indicatorId} onValueChange={(v) => setField("indicatorId", v)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INDICATORS.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FilterField>
              )}
              <FilterField label="Сортировка">
                <div className="flex gap-2">
                  <Select value={state.sortField} onValueChange={(v) => setField("sortField", v)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {entity.sortFields.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={state.sortDir} onValueChange={(v) => setField("sortDir", v as "ASC" | "DESC")}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DESC">↓ DESC</SelectItem>
                      <SelectItem value="ASC">↑ ASC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </FilterField>
              <FilterField label="Лимит">
                <Select value={String(state.limit)} onValueChange={(v) => setField("limit", Number(v))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[5, 10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FilterField>
              {[...vars].filter(([, t]) => t === "Boolean!").map(([name]) => (
                <FilterField key={name} label={`$${name}`}>
                  <label className="flex h-8 items-center gap-2 text-sm">
                    <Switch
                      checked={state.includeFlags[name] ?? true}
                      onCheckedChange={(c) => setState((s) => ({ ...s, includeFlags: { ...s.includeFlags, [name]: c } }))}
                    />
                    {(state.includeFlags[name] ?? true) ? "включено" : "исключено"}
                  </label>
                </FilterField>
              ))}
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard label="Время ответа" value={result.data ? `${result.data.durationMs} мс` : "…"} icon={<Zap className="size-4" />} />
            <StatCard label="Оценка стоимости" value={ext?.cost?.estimated ?? "—"} hint="лимит шлюза 20 000" />
            <StatCard label="Кеш ответов" value={ext?.responseCache?.hit ? "hit" : "miss"} />
            <StatCard
              label="Найдено"
              value={(root?.[entity.totalField] as number | undefined)?.toLocaleString("ru-RU") ?? "—"}
              hint={errors.length ? `${errors.length} ошибок` : "без ошибок"}
            />
          </div>

          <Tabs defaultValue="table">
            <div className="flex flex-wrap items-center gap-2">
              <TabsList>
                <TabsTrigger value="table">Таблица</TabsTrigger>
                <TabsTrigger value="json">JSON</TabsTrigger>
                <TabsTrigger value="query">Запрос</TabsTrigger>
              </TabsList>
              <Button variant="outline" size="sm" className="ml-auto" onClick={() => result.refetch()} disabled={result.isFetching}>
                <Play /> Выполнить снова
              </Button>
            </div>
            <TabsContent value="table">
              <Card className="gap-0 overflow-hidden py-0">
                {result.error ? (
                  <div className="p-4"><ErrorState error={result.error} onRetry={() => result.refetch()} /></div>
                ) : rows.length === 0 ? (
                  <EmptyState title={result.isFetching ? "Выполняется…" : "Нет строк"} />
                ) : (
                  <div className={cn("max-h-[560px] overflow-auto", result.isFetching && "opacity-60")}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {columns.map((c) => <TableHead key={c} className="font-mono text-xs whitespace-nowrap">{c}</TableHead>)}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r, i) => (
                          <TableRow key={i}>
                            {columns.map((c) => (
                              <TableCell key={c} className="max-w-[260px] truncate text-xs" title={r[c]}>{r[c] ?? ""}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {errors.length > 0 && (
                  <div className="border-t p-3 text-xs text-destructive">
                    {errors.map((e, i) => <div key={i}>{e.path?.join(".")}: {e.message}</div>)}
                  </div>
                )}
              </Card>
            </TabsContent>
            <TabsContent value="json">
              <pre className="max-h-[560px] overflow-auto rounded-xl border bg-muted/40 p-4 text-xs">
                {JSON.stringify(result.data ? { data: result.data.data, errors: result.data.errors, extensions: result.data.extensions } : null, null, 2)}
              </pre>
            </TabsContent>
            <TabsContent value="query">
              <div className="grid gap-3 xl:grid-cols-[1fr_320px]">
                <div className="relative">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="absolute top-2 right-2"
                    aria-label="Скопировать"
                    onClick={() => {
                      void navigator.clipboard.writeText(document)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1500)
                    }}
                  >
                    {copied ? <Check /> : <Copy />}
                  </Button>
                  <pre className="overflow-auto rounded-xl border bg-muted/40 p-4 font-mono text-xs leading-relaxed">{document}</pre>
                </div>
                <pre className="overflow-auto rounded-xl border bg-muted/40 p-4 font-mono text-xs">{JSON.stringify(variables, null, 2)}</pre>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  )
}

function FieldTree({
  fields,
  prefix,
  state,
  onToggle,
  onConditional,
  depth = 0,
}: {
  fields: FieldDef[]
  prefix: string
  state: BuilderState
  onToggle: (path: string, on: boolean) => void
  onConditional: (path: string, on: boolean) => void
  depth?: number
}) {
  return (
    <ul className={cn("flex flex-col gap-1", depth > 0 && "mt-1 ml-3 border-l pl-3")}>
      {fields.map((f) => {
        const path = prefix ? `${prefix}.${f.name}` : f.name
        const active = isActive(path, state.selected)
        return (
          <li key={path}>
            <div className="flex items-center gap-2 text-sm">
              <Checkbox id={`f-${path}`} checked={active} onCheckedChange={(c) => onToggle(path, c === true)} />
              <label htmlFor={`f-${path}`} className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5">
                {f.children && <ChevronRight className={cn("size-3 shrink-0 transition-transform", active && "rotate-90")} />}
                <span className="truncate">{f.label}</span>
                <code className="truncate text-[11px] text-muted-foreground">{f.name}</code>
                {f.subgraph && <Badge variant="outline" className="h-4 px-1 text-[10px]">{f.subgraph}</Badge>}
              </label>
              {f.children && active && depth === 0 && (
                <button
                  type="button"
                  title="Обернуть в @include(if: $переменная)"
                  onClick={() => onConditional(path, !state.conditional.has(path))}
                  className={cn(
                    "rounded px-1 font-mono text-[10px]",
                    state.conditional.has(path) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  @include
                </button>
              )}
            </div>
            {f.children && active && (
              <FieldTree fields={f.children} prefix={path} state={state} onToggle={onToggle} onConditional={onConditional} depth={depth + 1} />
            )}
          </li>
        )
      })}
    </ul>
  )
}

