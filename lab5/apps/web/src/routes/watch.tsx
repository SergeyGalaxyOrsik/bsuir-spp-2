import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Flame, MapPin, Pencil, Plus, Radar, Trash2, Waves } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/app/common"
import { MagnitudeBadge } from "@/components/app/magnitude"
import { EmptyState, ErrorState, PartialErrors } from "@/components/app/states"
import { WorldMap } from "@/components/app/world-map"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { graphql } from "@/graphql/gen"
import type { WatchZonesQuery as WatchZonesData } from "@/graphql/gen/graphql"
import { fmtDate, fmtDateTime, fmtFixed, fmtNumber } from "@/lib/format"
import { execute, executeRaw } from "@/lib/graphql"
import { cn } from "@/lib/utils"

const WatchZonesQuery = graphql(`
  query WatchZones($days: Int!) {
    watchZones {
      id
      name
      description
      latitude
      longitude
      radiusKm
      minMagnitude
      color
      createdAt
      updatedAt
      earthquakeCount(days: $days)
      naturalEventCount(days: $days)
      earthquakes(first: 5, days: $days) {
        id
        magnitude
        place
        time
      }
      naturalEvents(first: 3, days: $days) {
        id
        title
        status
        lastObservedAt
        primaryCategory {
          title
        }
      }
    }
  }
`)

const CreateZone = graphql(`
  mutation CreateWatchZone($input: WatchZoneInput!) {
    createWatchZone(input: $input) {
      zone {
        id
        name
      }
      errors {
        field
        message
      }
    }
  }
`)

const UpdateZone = graphql(`
  mutation UpdateWatchZone($id: ID!, $patch: WatchZonePatch!) {
    updateWatchZone(id: $id, patch: $patch) {
      zone {
        id
        name
      }
      errors {
        field
        message
      }
    }
  }
`)

const DeleteZone = graphql(`
  mutation DeleteWatchZone($id: ID!) {
    deleteWatchZone(id: $id) {
      id
      deleted
    }
  }
`)

const DAYS = [7, 30, 90, 365] as const

const zonesQuery = (days: number) =>
  queryOptions({
    queryKey: ["watchZones", days],
    queryFn: () => executeRaw(WatchZonesQuery, { days }),
  })

export const Route = createFileRoute("/watch")({
  validateSearch: (raw: Record<string, unknown>): { days?: number; zone?: string } => {
    const days = Number(raw.days)
    return {
      days: DAYS.includes(days as (typeof DAYS)[number]) ? days : undefined,
      zone: typeof raw.zone === "string" ? raw.zone : undefined,
    }
  },
  loaderDeps: ({ search }) => ({ days: search.days ?? 30 }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(zonesQuery(deps.days)),
  head: () => ({ meta: [{ title: "Зоны наблюдения — GeoPulse" }] }),
  component: WatchPage,
})

type Zone = WatchZonesData["watchZones"][number]

interface FormState {
  id?: string
  name: string
  description: string
  latitude: string
  longitude: string
  radiusKm: string
  minMagnitude: string
  color: string
}

const emptyForm = (lat?: number, lon?: number): FormState => ({
  name: "",
  description: "",
  latitude: lat != null ? lat.toFixed(2) : "",
  longitude: lon != null ? lon.toFixed(2) : "",
  radiusKm: "300",
  minMagnitude: "4",
  color: "#f97316",
})

function WatchPage() {
  const search = Route.useSearch()
  const days = search.days ?? 30
  const navigate = useNavigate({ from: Route.fullPath })
  const queryClient = useQueryClient()
  const { data: result, error, refetch, isFetching } = useQuery(zonesQuery(days))
  const data = result?.data
  const [form, setForm] = useState<FormState | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const zones = data?.watchZones ?? []
  const selected = zones.find((z) => z.id === search.zone) ?? zones[0]

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["watchZones"] })

  const save = useMutation({
    mutationFn: async (f: FormState) => {
      const values = {
        name: f.name,
        description: f.description || null,
        latitude: Number(f.latitude),
        longitude: Number(f.longitude),
        radiusKm: Number(f.radiusKm),
        minMagnitude: Number(f.minMagnitude),
        color: f.color,
      }
      if (f.id) {
        const res = await execute(UpdateZone, { id: f.id, patch: values })
        return res.updateWatchZone
      }
      const res = await execute(CreateZone, { input: values })
      return res.createWatchZone
    },
    onSuccess: (payload, f) => {
      if (payload.errors.length) {
        setFieldErrors(Object.fromEntries(payload.errors.map((e) => [e.field, e.message])))
        return
      }
      toast.success(f.id ? `Зона «${payload.zone?.name}» обновлена` : `Зона «${payload.zone?.name}» создана`)
      setForm(null)
      setFieldErrors({})
      if (payload.zone) navigate({ search: (prev) => ({ ...prev, zone: payload.zone!.id }), replace: true })
      void invalidate()
    },
    onError: (e) => toast.error(e.message),
  })

  const remove = useMutation({
    mutationFn: (id: string) => execute(DeleteZone, { id }),
    onSuccess: (res) => {
      if (res.deleteWatchZone.deleted) toast.success("Зона удалена")
      else toast.error("Зона не найдена")
      navigate({ search: (prev) => ({ ...prev, zone: undefined }), replace: true })
      void invalidate()
    },
    onError: (e) => toast.error(e.message),
  })

  const openCreate = (lat?: number, lon?: number) => {
    setFieldErrors({})
    setForm(emptyForm(lat, lon))
  }

  const openEdit = (z: Zone) => {
    setFieldErrors({})
    setForm({
      id: z.id,
      name: z.name,
      description: z.description ?? "",
      latitude: String(z.latitude),
      longitude: String(z.longitude),
      radiusKm: String(z.radiusKm),
      minMagnitude: String(z.minMagnitude),
      color: z.color,
    })
  }

  return (
    <>
      <PageHeader
        title="Зоны наблюдения"
        description="Пользовательские области интереса хранятся в ops-subgraph. Землетрясения и природные события в радиусе каждой зоны добавляют seismic- и hazards-subgraph через @requires (координаты, радиус и порог магнитуды приходят из ops)."
        actions={
          <>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={String(days)}
              onValueChange={(v) => v && navigate({ search: (prev) => ({ ...prev, days: Number(v) === 30 ? undefined : Number(v) }), replace: true })}
            >
              {DAYS.map((d) => (
                <ToggleGroupItem key={d} value={String(d)} className="text-xs">
                  {d === 365 ? "год" : `${d} дн`}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Button size="sm" onClick={() => openCreate()}>
              <Plus /> Новая зона
            </Button>
          </>
        }
      />

      <PartialErrors errors={result?.errors ?? []} />
      {error && !data ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
          <div className="flex flex-col gap-4">
            <div>
              <WorldMap
                className={cn(isFetching && "opacity-80")}
                circles={zones.map((z) => ({
                  id: z.id,
                  latitude: z.latitude,
                  longitude: z.longitude,
                  radiusKm: z.radiusKm,
                  color: z.color,
                  label: z.name,
                }))}
                points={zones.map((z) => ({
                  id: `zone-${z.id}`,
                  latitude: z.latitude,
                  longitude: z.longitude,
                  size: z.id === selected?.id ? 6 : 4,
                  color: z.color,
                  label: `${z.name} · ${z.earthquakeCount} землетр. · ${z.naturalEventCount} событий`,
                  onClick: () => navigate({ search: (prev) => ({ ...prev, zone: z.id }), replace: true }),
                }))}
                onMapClick={({ latitude, longitude }) => openCreate(latitude, longitude)}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                <MapPin className="mr-1 inline size-3" />
                Кликните по карте, чтобы создать зону в этой точке; по центру зоны — чтобы выбрать её.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {!data &&
                Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
              {zones.map((z) => (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => navigate({ search: (prev) => ({ ...prev, zone: z.id }), replace: true })}
                  className={cn(
                    "rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent/40",
                    z.id === selected?.id && "ring-2 ring-ring",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: z.color }} />
                    <span className="truncate font-medium">{z.name}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {fmtFixed(z.latitude, 2)}°, {fmtFixed(z.longitude, 2)}° · R {fmtNumber(z.radiusKm)} км · M≥{fmtFixed(z.minMagnitude)}
                  </div>
                  <div className="mt-3 flex gap-4 text-sm">
                    <span className="flex items-center gap-1">
                      <Waves className="size-4 text-orange-500" />
                      <b className="tabular-nums">{fmtNumber(z.earthquakeCount)}</b>
                    </span>
                    <span className="flex items-center gap-1">
                      <Flame className="size-4 text-red-500" />
                      <b className="tabular-nums">{fmtNumber(z.naturalEventCount)}</b>
                    </span>
                  </div>
                </button>
              ))}
            </div>
            {data && zones.length === 0 && <EmptyState title="Зон пока нет" hint="Создайте первую зону кнопкой «Новая зона»" />}
          </div>

          <div>
            {selected ? (
              <Card className="sticky top-20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Radar className="size-4" style={{ color: selected.color }} />
                    {selected.name}
                  </CardTitle>
                  <CardDescription>
                    {selected.description || "Без описания"} · обновлена {fmtDate(selected.updatedAt)}
                  </CardDescription>
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(selected)}>
                      <Pencil /> Изменить
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm(`Удалить зону «${selected.name}»?`)) remove.mutate(selected.id)
                      }}
                    >
                      <Trash2 /> Удалить
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                  <section>
                    <div className="mb-2 flex items-center justify-between text-sm font-medium">
                      Землетрясения за {days} дн
                      <Badge variant="secondary">{fmtNumber(selected.earthquakeCount)}</Badge>
                    </div>
                    <div className="flex flex-col gap-2">
                      {(selected.earthquakes ?? []).map((q) => (
                        <Link key={q.id} to="/earthquakes/$id" params={{ id: q.id }} className="flex items-center gap-2 text-sm hover:underline">
                          <MagnitudeBadge value={q.magnitude} />
                          <span className="min-w-0 flex-1 truncate">{q.place}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{fmtDate(q.time)}</span>
                        </Link>
                      ))}
                      {(selected.earthquakes ?? []).length === 0 && <p className="text-xs text-muted-foreground">Нет событий выше порога</p>}
                    </div>
                  </section>
                  <section>
                    <div className="mb-2 flex items-center justify-between text-sm font-medium">
                      Природные события
                      <Badge variant="secondary">{fmtNumber(selected.naturalEventCount)}</Badge>
                    </div>
                    <div className="flex flex-col gap-2">
                      {(selected.naturalEvents ?? []).map((e) => (
                        <Link key={e.id} to="/events/$id" params={{ id: e.id }} className="text-sm hover:underline">
                          <div className="truncate">{e.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {e.primaryCategory.title} · {e.status === "OPEN" ? "активно" : "завершено"} · {fmtDateTime(e.lastObservedAt)}
                          </div>
                        </Link>
                      ))}
                      {(selected.naturalEvents ?? []).length === 0 && <p className="text-xs text-muted-foreground">Нет событий в радиусе</p>}
                    </div>
                  </section>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      )}

      <Dialog open={form !== null} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form?.id ? "Изменить зону" : "Новая зона наблюдения"}</DialogTitle>
            <DialogDescription>Валидация выполняется на сервере: ошибки возвращаются в поле `errors` ответа мутации.</DialogDescription>
          </DialogHeader>
          {form && (
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                save.mutate(form)
              }}
            >
              <Field label="Название" error={fieldErrors.name}>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
              </Field>
              <Field label="Описание" error={fieldErrors.description}>
                <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Широта" error={fieldErrors.latitude}>
                  <Input type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} />
                </Field>
                <Field label="Долгота" error={fieldErrors.longitude}>
                  <Input type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} />
                </Field>
                <Field label="Радиус, км" error={fieldErrors.radiusKm}>
                  <Input type="number" step="any" value={form.radiusKm} onChange={(e) => setForm({ ...form, radiusKm: e.target.value })} />
                </Field>
                <Field label="Мин. магнитуда" error={fieldErrors.minMagnitude}>
                  <Input type="number" step="0.1" value={form.minMagnitude} onChange={(e) => setForm({ ...form, minMagnitude: e.target.value })} />
                </Field>
              </div>
              <Field label="Цвет" error={fieldErrors.color}>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Цвет"
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    className="h-8 w-12 cursor-pointer rounded border bg-transparent"
                  />
                  <code className="text-xs text-muted-foreground">{form.color}</code>
                </div>
              </Field>
              {fieldErrors.id && <p className="text-sm text-destructive">{fieldErrors.id}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setForm(null)}>
                  Отмена
                </Button>
                <Button type="submit" disabled={save.isPending}>
                  {form.id ? "Сохранить" : "Создать"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className={cn(error && "text-destructive")}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
