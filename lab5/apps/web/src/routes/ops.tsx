import { keepPreviousData, queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Activity, Database, ExternalLink, Play, RefreshCw, Server } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { CursorPager, PageHeader, StatCard } from "@/components/app/common"
import { ErrorState } from "@/components/app/states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { graphql } from "@/graphql/gen"
import type { IngestMode, IngestStatus, OpsRunsQuery as OpsRunsData } from "@/graphql/gen/graphql"
import { fmtDateTime, fmtDuration, fmtNumber, fmtRelative } from "@/lib/format"
import { execute } from "@/lib/graphql"
import { cursorStack, oneOf, pageSize } from "@/lib/search"
import { useSubscription } from "@/lib/subscriptions"
import { cn } from "@/lib/utils"

const RunFields = graphql(`
  fragment RunFields on IngestRun {
    id
    mode
    triggeredBy
    status
    progress
    message
    recordsFetched
    recordsUpserted
    totalRecords
    warnings
    error
    startedAt
    finishedAt
    durationMs
    host
    source {
      id
      name
    }
  }
`)
void RunFields

const OpsOverviewQuery = graphql(`
  query OpsOverview {
    totalRecords
    dataSources {
      id
      name
      description
      homepage
      service
      refreshInterval
      health
      recordCount
      lastSuccessAt
      lastRun {
        ...RunFields
      }
    }
    systemStatus {
      name
      url
      up
      latencyMs
      detail
    }
  }
`)

const OpsRunsQuery = graphql(`
  query OpsRuns($status: IngestStatus, $source: ID, $first: Int, $after: String) {
    ingestRuns(status: $status, source: $source, first: $first, after: $after) {
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ...RunFields
      }
    }
  }
`)

const TriggerIngest = graphql(`
  mutation TriggerIngest($source: ID!, $mode: IngestMode) {
    triggerIngest(source: $source, mode: $mode) {
      accepted
      runId
      message
    }
  }
`)

const RunUpdates = graphql(`
  subscription IngestRunUpdates {
    ingestRunUpdated {
      ...RunFields
    }
  }
`)

const STATUSES = ["RUNNING", "SUCCEEDED", "PARTIAL", "FAILED", "INTERRUPTED"] as const

interface OpsSearch {
  status?: IngestStatus
  size?: number
  cursors?: string[]
}

const resolve = (s: OpsSearch) => ({ status: s.status, size: s.size ?? 10, cursors: s.cursors ?? [] })

const overviewQuery = () =>
  queryOptions({
    queryKey: ["ops", "overview"],
    queryFn: () => execute(OpsOverviewQuery),
    refetchInterval: 10_000,
  })

const runsQuery = (s: ReturnType<typeof resolve>) => {
  const variables = { status: s.status, first: s.size, after: s.cursors.at(-1) }
  return queryOptions({
    queryKey: ["ops", "runs", variables],
    queryFn: () => execute(OpsRunsQuery, variables),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  })
}

export const Route = createFileRoute("/ops")({
  validateSearch: (raw: Record<string, unknown>): OpsSearch => {
    const out: OpsSearch = {}
    if (STATUSES.includes(raw.status as never)) out.status = oneOf(raw.status, STATUSES, "RUNNING")
    if (raw.size != null) out.size = pageSize(raw.size, 10)
    const cursors = cursorStack(raw.cursors)
    if (cursors.length) out.cursors = cursors
    return out
  },
  loaderDeps: ({ search }) => resolve(search),
  loader: ({ context, deps }) =>
    Promise.all([context.queryClient.ensureQueryData(overviewQuery()), context.queryClient.ensureQueryData(runsQuery(deps))]),
  head: () => ({ meta: [{ title: "Сбор и мониторинг — GeoPulse" }] }),
  component: OpsPage,
})

type Run = OpsRunsData["ingestRuns"]["nodes"][number]

const HEALTH: Record<string, { label: string; className: string }> = {
  HEALTHY: { label: "Работает", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  STALE: { label: "Устарели", className: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400" },
  FAILING: { label: "Сбой", className: "bg-red-500/15 text-red-600 dark:text-red-400" },
  UNKNOWN: { label: "Нет данных", className: "bg-muted text-muted-foreground" },
}

const STATUS: Record<string, { label: string; className: string }> = {
  RUNNING: { label: "Выполняется", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  SUCCEEDED: { label: "Успешно", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  PARTIAL: { label: "Частично", className: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400" },
  FAILED: { label: "Ошибка", className: "bg-red-500/15 text-red-600 dark:text-red-400" },
  INTERRUPTED: { label: "Прерван", className: "bg-muted text-muted-foreground" },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, className: "" }
  return (
    <Badge variant="outline" className={s.className}>
      {s.label}
    </Badge>
  )
}

const LINKS = [
  { name: "Grafana", url: "http://localhost:3001", hint: "дашборд метрик шлюза и сервисов" },
  { name: "Jaeger", url: "http://localhost:16686", hint: "распределённая трассировка запросов" },
  { name: "Prometheus", url: "http://localhost:9090", hint: "сырые метрики и алерты" },
  { name: "GraphiQL", url: "http://localhost:4000/graphql", hint: "интерактивная консоль шлюза" },
]

function OpsPage() {
  const search = resolve(Route.useSearch())
  const navigate = useNavigate({ from: Route.fullPath })
  const queryClient = useQueryClient()
  const overview = useQuery(overviewQuery())
  const runs = useQuery(runsQuery(search))
  // Live run state pushed by the ops subgraph (Postgres LISTEN/NOTIFY → SSE through the gateway).
  const [live, setLive] = useState<Record<string, Run>>({})

  useSubscription(RunUpdates, {}, (data) => {
    const run = data.ingestRunUpdated
    setLive((prev) => ({ ...prev, [run.source.id]: run }))
    if (run.status !== "RUNNING") {
      const msg = `${run.source.name}: ${fmtNumber(run.recordsUpserted)} записей за ${fmtDuration(run.durationMs)}`
      if (run.status === "SUCCEEDED") toast.success(`Сбор завершён — ${msg}`)
      else if (run.status === "PARTIAL") toast.warning(`Сбор завершён с предупреждениями — ${msg}`)
      else toast.error(`Сбор ${run.source.name}: ${run.error ?? run.status}`)
      void queryClient.invalidateQueries({ queryKey: ["ops"] })
    }
  })

  const trigger = useMutation({
    mutationFn: (v: { source: string; mode: IngestMode }) => execute(TriggerIngest, v),
    onSuccess: (res) => {
      const r = res.triggerIngest
      if (r.accepted) toast.info(r.message)
      else toast.warning(r.message)
      void queryClient.invalidateQueries({ queryKey: ["ops"] })
    },
    onError: (e) => toast.error(e.message),
  })

  const update = (patch: OpsSearch) =>
    navigate({ search: (prev) => ({ ...prev, ...patch, cursors: undefined }), replace: true })

  const data = overview.data
  const conn = runs.data?.ingestRuns
  const healthy = data?.dataSources.filter((s) => s.health === "HEALTHY").length ?? 0
  const up = data?.systemStatus.filter((s) => s.up).length ?? 0

  return (
    <>
      <PageHeader
        title="Сбор данных и мониторинг"
        description="Коллекторы живут внутри subgraph-ов и работают по расписанию под advisory-lock в Postgres (одна реплика собирает источник). Ручной запуск — мутация triggerIngest, прогресс приходит подпиской ingestRunUpdated."
        actions={
          <Button variant="outline" size="sm" onClick={() => void queryClient.invalidateQueries({ queryKey: ["ops"] })}>
            <RefreshCw className={cn(overview.isFetching && "animate-spin")} /> Обновить
          </Button>
        }
      />

      {overview.error && !data ? (
        <ErrorState error={overview.error} onRetry={() => overview.refetch()} />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Всего записей" value={fmtNumber(data?.totalRecords)} icon={<Database className="size-4" />} hint="по последним успешным запускам" />
            <StatCard label="Источников" value={data?.dataSources.length ?? "—"} hint={`${healthy} в норме`} icon={<Activity className="size-4" />} />
            <StatCard label="Сервисов доступно" value={data ? `${up} / ${data.systemStatus.length}` : "—"} icon={<Server className="size-4" />} />
            <StatCard label="Запусков сбора" value={fmtNumber(conn?.totalCount)} hint={search.status ? STATUS[search.status]?.label : "все статусы"} />
          </div>

          <Card className="mb-4 gap-0 overflow-hidden py-0">
            <CardHeader className="border-b py-4">
              <CardTitle className="text-base">Источники данных</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Источник</TableHead>
                    <TableHead>Сервис</TableHead>
                    <TableHead>Состояние</TableHead>
                    <TableHead className="text-right">Записей</TableHead>
                    <TableHead className="min-w-[220px]">Последний запуск</TableHead>
                    <TableHead>Успех</TableHead>
                    <TableHead className="text-right">Запуск</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.dataSources.map((s) => {
                    const run = live[s.id] && (!s.lastRun || Number(live[s.id]!.id) >= Number(s.lastRun.id)) ? live[s.id]! : s.lastRun
                    const health = HEALTH[s.health] ?? HEALTH.UNKNOWN!
                    const running = run?.status === "RUNNING"
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="max-w-[280px]">
                          <a href={s.homepage} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline">
                            {s.name} <ExternalLink className="size-3" />
                          </a>
                          <div className="line-clamp-2 text-xs text-muted-foreground">{s.description}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-mono">{s.service}</Badge>
                          <div className="mt-1 text-xs text-muted-foreground">каждые {s.refreshInterval}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={health.className}>{health.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNumber(s.recordCount)}</TableCell>
                        <TableCell>
                          {run ? (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <StatusBadge status={run.status} />
                                <span className="text-xs text-muted-foreground">#{run.id} · {run.mode === "FULL" ? "полный" : "инкремент"}</span>
                              </div>
                              {running && <Progress value={run.progress * 100} className="h-1.5" />}
                              <div className="truncate text-xs text-muted-foreground" title={run.message ?? ""}>
                                {running ? run.message : `${fmtNumber(run.recordsUpserted)} записей · ${fmtDuration(run.durationMs)}`}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">ещё не запускался</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{fmtRelative(s.lastSuccessAt)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={running || trigger.isPending}
                              onClick={() => trigger.mutate({ source: s.id, mode: "INCREMENTAL" })}
                            >
                              <Play /> Обновить
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              disabled={running || trigger.isPending}
                              onClick={() => trigger.mutate({ source: s.id, mode: "FULL" })}
                            >
                              Полный
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
            <Card className="gap-0 overflow-hidden py-0">
              <CardHeader className="flex flex-row items-center justify-between border-b py-3">
                <CardTitle className="text-base">История запусков</CardTitle>
                <Select value={search.status ?? "all"} onValueChange={(v) => update({ status: v === "all" ? undefined : (v as IngestStatus) })}>
                  <SelectTrigger size="sm" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все статусы</SelectItem>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{STATUS[s]?.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardHeader>
              <div className="overflow-x-auto">
                <Table className={cn(runs.isFetching && "opacity-70")}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Источник</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Режим</TableHead>
                      <TableHead className="text-right">Записей</TableHead>
                      <TableHead className="text-right">Длительность</TableHead>
                      <TableHead>Начало</TableHead>
                      <TableHead>Хост</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conn?.nodes.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{r.id}</TableCell>
                        <TableCell>{r.source.name}</TableCell>
                        <TableCell>
                          <StatusBadge status={r.status} />
                          {(r.error || r.warnings.length > 0) && (
                            <div className="mt-1 max-w-[240px] truncate text-xs text-muted-foreground" title={r.error ?? r.warnings.join("\n")}>
                              {r.error ?? r.warnings[0]}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.mode === "FULL" ? "полный" : "инкремент"}
                          <div className="text-muted-foreground">{r.triggeredBy === "manual" ? "вручную" : "по расписанию"}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNumber(r.recordsUpserted)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtDuration(r.durationMs)}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{fmtDateTime(r.startedAt)}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{r.host}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <CursorPager
                total={conn?.totalCount}
                pageSize={search.size}
                page={search.cursors.length + 1}
                hasNext={!!conn?.pageInfo.hasNextPage}
                loading={runs.isFetching}
                onNext={() =>
                  conn?.pageInfo.endCursor &&
                  navigate({ search: (prev) => ({ ...prev, cursors: [...(prev.cursors ?? []), conn.pageInfo.endCursor!] }) })
                }
                onPrev={() => navigate({ search: (prev) => ({ ...prev, cursors: (prev.cursors ?? []).slice(0, -1) }) })}
                onPageSize={(size) => update({ size })}
              />
            </Card>

            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Состояние сервисов</CardTitle>
                  <CardDescription>Проверка /ready каждого сервиса из ops-subgraph</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {data?.systemStatus.map((s) => (
                    <div key={s.name} className="flex items-center gap-2 text-sm">
                      <span className={cn("size-2 rounded-full", s.up ? "bg-emerald-500" : "bg-red-500")} />
                      <span className="font-medium">{s.name}</span>
                      <span className="truncate text-xs text-muted-foreground" title={s.url}>{s.up ? s.detail : s.detail?.slice(0, 40)}</span>
                      <span className="ml-auto font-mono text-xs tabular-nums">{s.latencyMs != null ? `${s.latencyMs} мс` : "—"}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Наблюдаемость</CardTitle>
                  <CardDescription>Метрики, трассировка и консоль GraphQL</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {LINKS.map((l) => (
                    <a key={l.name} href={l.url} target="_blank" rel="noreferrer" className="group flex items-center gap-2 rounded-md p-1.5 text-sm hover:bg-accent">
                      <ExternalLink className="size-4 text-muted-foreground" />
                      <span className="font-medium">{l.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{l.hint}</span>
                    </a>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  )
}
