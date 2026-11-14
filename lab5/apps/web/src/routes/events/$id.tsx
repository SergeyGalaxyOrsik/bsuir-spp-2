import { queryOptions, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import { ArrowLeft, ExternalLink, Network } from "lucide-react"
import { PageHeader, StatCard } from "@/components/app/common"
import { categoryColor } from "@/components/app/hazard"
import { MagnitudeBadge } from "@/components/app/magnitude"
import { EmptyState, ErrorState, PartialErrors } from "@/components/app/states"
import { WorldMap } from "@/components/app/world-map"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { graphql } from "@/graphql/gen"
import { fmtDate, fmtDateTime, fmtFixed, fmtNumber } from "@/lib/format"
import { executeRaw } from "@/lib/graphql"

const EventQuery = graphql(`
  query NaturalEventDetail($id: ID!) {
    naturalEvent(id: $id) {
      id
      title
      description
      link
      status
      startedAt
      lastObservedAt
      closedAt
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
      categories {
        id
        title
        description
      }
      sources {
        url
        source {
          id
          title
        }
      }
      track(first: 100) {
        observedAt
        latitude
        longitude
        geometryType
        magnitude {
          value
          unit
        }
      }
      country {
        code
        name
        flag
        localizedName
        region
      }
      related(radiusKm: 300, first: 6) {
        id
        title
        startedAt
        status
        primaryCategory {
          id
          title
        }
      }
      nearbyEarthquakes(radiusKm: 250, days: 30, first: 10) {
        id
        magnitude
        place
        time
        depthKm
      }
    }
  }
`)

const eventQuery = (id: string) =>
  queryOptions({
    queryKey: ["naturalEvent", id],
    queryFn: () => executeRaw(EventQuery, { id }),
  })

export const Route = createFileRoute("/events/$id")({
  loader: async ({ context, params }) => {
    const result = await context.queryClient.ensureQueryData(eventQuery(params.id))
    if (!result.data.naturalEvent) throw notFound()
    return { title: result.data.naturalEvent.title }
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.title ?? "Событие"} — GeoPulse` }] }),
  component: EventPage,
})

function EventPage() {
  const { id } = Route.useParams()
  const { data, error, refetch } = useQuery(eventQuery(id))
  if (error && !data) return <ErrorState error={error} onRetry={() => refetch()} />
  const e = data?.data.naturalEvent
  if (!e) return null
  const color = categoryColor(e.primaryCategory.id)

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link to="/events">
          <ArrowLeft /> Все события
        </Link>
      </Button>
      <PageHeader
        title={e.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={e.status === "OPEN" ? "default" : "outline"}>{e.status === "OPEN" ? "активно" : "завершено"}</Badge>
            {e.categories.map((c) => (
              <Badge key={c.id} variant="outline" className="gap-1.5">
                <span className="size-2 rounded-full" style={{ backgroundColor: categoryColor(c.id) }} />
                {c.title}
              </Badge>
            ))}
            <span className="font-mono text-xs">{e.id}</span>
          </span>
        }
        actions={
          e.link && (
            <Button asChild variant="outline" size="sm">
              <a href={e.link} target="_blank" rel="noreferrer">
                EONET API <ExternalLink />
              </a>
            </Button>
          )
        }
      />
      <div className="mb-4">
        <PartialErrors errors={data?.errors ?? []} />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Начало" value={fmtDate(e.startedAt)} hint={fmtDateTime(e.startedAt)} />
        <StatCard label="Последнее наблюдение" value={fmtDate(e.lastObservedAt)} hint={e.closedAt ? `закрыто ${fmtDate(e.closedAt)}` : "событие продолжается"} />
        <StatCard label="Длительность" value={`${fmtFixed(e.durationDays)} дн`} hint={`${e.pointCount} наблюдений`} />
        <StatCard
          label="Масштаб (пик)"
          value={e.magnitude ? fmtNumber(e.magnitude.value) : "—"}
          hint={e.magnitude?.unit ?? "не указан источником"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <WorldMap fit
            points={[
              ...e.track.map((p, i) => ({
                id: `t${i}`,
                latitude: p.latitude,
                longitude: p.longitude,
                size: 2.5,
                color,
                label: `${fmtDateTime(p.observedAt)}${p.magnitude ? ` · ${p.magnitude.value} ${p.magnitude.unit ?? ""}` : ""}`,
              })),
              { id: "current", latitude: e.latitude, longitude: e.longitude, size: 6, color, label: "Последняя позиция" },
            ]}
          />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="size-4" /> Землетрясения рядом
              </CardTitle>
              <CardDescription>
                Поле <code>NaturalEvent.nearbyEarthquakes</code> разрешает seismic-subgraph: шлюз передаёт ему координаты и дату
                события из hazards-subgraph через <code>@requires</code>. Радиус 250 км, ±30 дней.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {!e.nearbyEarthquakes?.length ? (
                <EmptyState title="Сейсмической активности рядом не найдено" />
              ) : (
                <Table>
                  <TableBody>
                    {(e.nearbyEarthquakes ?? []).map((q) => (
                      <TableRow key={q.id}>
                        <TableCell className="w-20 pl-6">
                          <MagnitudeBadge value={q.magnitude} />
                        </TableCell>
                        <TableCell>
                          <Link to="/earthquakes/$id" params={{ id: q.id }} className="hover:underline">
                            {q.place ?? q.id}
                          </Link>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{fmtDateTime(q.time)}</TableCell>
                        <TableCell className="pr-6 text-right tabular-nums">{fmtFixed(q.depthKm)} км</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Траектория и наблюдения</CardTitle>
              <CardDescription>Позиции события во времени (треки штормов, периметры пожаров)</CardDescription>
            </CardHeader>
            <CardContent className="max-h-96 overflow-auto px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Время</TableHead>
                    <TableHead>Координаты</TableHead>
                    <TableHead>Геометрия</TableHead>
                    <TableHead className="pr-6 text-right">Величина</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {e.track.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell className="pl-6 whitespace-nowrap">{fmtDateTime(p.observedAt)}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {p.latitude.toFixed(3)}, {p.longitude.toFixed(3)}
                      </TableCell>
                      <TableCell>{p.geometryType}</TableCell>
                      <TableCell className="pr-6 text-right tabular-nums">
                        {p.magnitude ? `${fmtNumber(p.magnitude.value)} ${p.magnitude.unit ?? ""}` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Страна</CardTitle>
              <CardDescription>Определена по координатам, данные — geo-subgraph</CardDescription>
            </CardHeader>
            <CardContent>
              {e.country ? (
                <Link to="/countries/$code" params={{ code: e.country.code }} className="flex items-center gap-3 hover:underline">
                  <span className="text-3xl">{e.country.flag}</span>
                  <span>
                    <span className="block font-medium">{e.country.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {e.country.localizedName} · {e.country.region}
                    </span>
                  </span>
                </Link>
              ) : (
                <span className="text-sm text-muted-foreground">Вне территории государств (океан, Антарктида)</span>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Источники</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {e.sources.map((s) => (
                <a key={s.source.id} href={s.url ?? "#"} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 text-sm hover:underline">
                  <span>{s.source.title}</span>
                  <ExternalLink className="size-3.5 text-muted-foreground" />
                </a>
              ))}
              {e.description && <p className="mt-2 text-sm text-muted-foreground">{e.description}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Связанные события</CardTitle>
              <CardDescription>В радиусе 300 км в пересекающийся период</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {e.related.length === 0 && <span className="text-sm text-muted-foreground">Нет</span>}
              {e.related.map((r) => (
                <Link key={r.id} to="/events/$id" params={{ id: r.id }} className="group flex items-start gap-2 text-sm">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(r.primaryCategory.id) }} />
                  <span>
                    <span className="block group-hover:underline">{r.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.primaryCategory.title} · {fmtDate(r.startedAt)}
                    </span>
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
