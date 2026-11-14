import { and, DateTimeScalar, type Fragment, INTERNAL_TOKEN, keysetConnection, type PgChannel, type Sql } from "@geopulse/shared";
import DataLoader from "dataloader";

export const SOURCES = [
  {
    id: "usgs",
    name: "USGS Earthquake Catalog",
    description: "FDSN event web service of the U.S. Geological Survey: global earthquakes M2.5+.",
    homepage: "https://earthquake.usgs.gov/fdsnws/event/1/",
    service: "seismic",
    refreshInterval: "5 min",
    staleAfterMs: 30 * 60_000,
  },
  {
    id: "eonet",
    name: "NASA EONET v3",
    description: "Earth Observatory Natural Event Tracker: wildfires, storms, volcanoes, floods, sea ice.",
    homepage: "https://eonet.gsfc.nasa.gov/",
    service: "hazards",
    refreshInterval: "15 min",
    staleAfterMs: 2 * 3600_000,
  },
  {
    id: "countries",
    name: "mledoze/countries",
    description: "Open dataset of 250 countries: names, borders, languages, currencies, translations.",
    homepage: "https://github.com/mledoze/countries",
    service: "geo",
    refreshInterval: "24 h",
    staleAfterMs: 3 * 86_400_000,
  },
  {
    id: "worldbank",
    name: "World Bank WDI",
    description: "World Development Indicators API: population, GDP, life expectancy, CO2 and more since 1995.",
    homepage: "https://datahelpdesk.worldbank.org/knowledgebase/articles/889392",
    service: "geo",
    refreshInterval: "24 h",
    staleAfterMs: 3 * 86_400_000,
  },
  {
    id: "openmeteo",
    name: "Open-Meteo",
    description: "Current weather conditions at every capital.",
    homepage: "https://open-meteo.com/",
    service: "geo",
    refreshInterval: "30 min",
    staleAfterMs: 3 * 3600_000,
  },
] as const;

type Source = (typeof SOURCES)[number];

function serviceUrls(): Record<string, string> {
  const raw = process.env.SERVICE_URLS ?? "geo=http://localhost:4001,seismic=http://localhost:4002,hazards=http://localhost:4003,ops=http://localhost:4004,gateway=http://localhost:4000";
  return Object.fromEntries(raw.split(",").map((pair) => pair.split("=") as [string, string]));
}

const RUN_COLUMNS = (sql: Sql) => sql`
  id::text, source, upper(mode) as mode, triggered_by as "triggeredBy", upper(status) as status, progress, message,
  records_fetched as "recordsFetched", records_upserted as "recordsUpserted", total_records as "totalRecords",
  warnings, error, started_at as "startedAt", finished_at as "finishedAt", host,
  (extract(epoch from (coalesce(finished_at, now()) - started_at)) * 1000)::int as "durationMs"`;

const ZONE_COLUMNS = (sql: Sql) => sql`
  id, name, description, latitude, longitude, radius_km as "radiusKm", min_magnitude as "minMagnitude", color,
  created_at as "createdAt", updated_at as "updatedAt"`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(id: string): boolean {
  return UUID.test(id);
}

export function createContext(sql: Sql) {
  const zone = new DataLoader<string, Record<string, unknown> | null>(async (ids) => {
    const valid = ids.filter(isUuid);
    const rows = valid.length ? await sql`select ${ZONE_COLUMNS(sql)} from ops.watch_zones where id = any(${valid}::uuid[])` : [];
    const map = new Map(rows.map((r) => [r.id as string, r]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const lastRun = new DataLoader<string, Record<string, unknown> | null>(async (sources) => {
    const rows = await sql`
      select ${RUN_COLUMNS(sql)}
      from unnest(${sources as string[]}::text[]) as s(src)
      cross join lateral (select * from ops.ingest_runs r where r.source = s.src order by r.started_at desc limit 1) ingest_runs`;
    const map = new Map(rows.map((r) => [r.source as string, r]));
    return sources.map((s) => map.get(s) ?? null);
  });
  const lastSuccess = new DataLoader<string, Record<string, unknown> | null>(async (sources) => {
    const rows = await sql`
      select s.source, r.finished_at as "finishedAt", r.total_records as "totalRecords"
      from unnest(${sources as string[]}::text[]) as s(source)
      cross join lateral (
        select finished_at, total_records from ops.ingest_runs r
        where r.source = s.source and r.status in ('succeeded', 'partial') order by r.started_at desc limit 1
      ) r`;
    const map = new Map(rows.map((r) => [r.source as string, r]));
    return sources.map((s) => map.get(s) ?? null);
  });
  return { sql, zone, lastRun, lastSuccess };
}

type Context = ReturnType<typeof createContext>;

interface WatchZoneInput {
  name: string;
  description?: string | null;
  latitude: number;
  longitude: number;
  radiusKm: number;
  minMagnitude?: number | null;
  color?: string | null;
}

type WatchZonePatch = { [K in keyof WatchZoneInput]?: WatchZoneInput[K] | null };

function validate(input: WatchZonePatch) {
  const errors: { field: string; message: string }[] = [];
  if (input.name != null && (input.name.trim().length < 2 || input.name.length > 80))
    errors.push({ field: "name", message: "Name must be 2–80 characters" });
  if (input.latitude != null && Math.abs(input.latitude) > 90) errors.push({ field: "latitude", message: "Latitude must be within ±90°" });
  if (input.longitude != null && Math.abs(input.longitude) > 180) errors.push({ field: "longitude", message: "Longitude must be within ±180°" });
  if (input.radiusKm != null && !(input.radiusKm > 0 && input.radiusKm <= 5000))
    errors.push({ field: "radiusKm", message: "Radius must be in (0, 5000] km" });
  if (input.minMagnitude != null && !(input.minMagnitude >= 0 && input.minMagnitude <= 10))
    errors.push({ field: "minMagnitude", message: "Magnitude must be in [0, 10]" });
  if (input.color != null && !/^#[0-9a-f]{6}$/i.test(input.color)) errors.push({ field: "color", message: "Color must be a hex value like #ff8800" });
  return errors;
}

function ingestRunId(body: unknown): number | null {
  return typeof body === "object" && body !== null && "runId" in body && typeof body.runId === "number" && Number.isSafeInteger(body.runId)
    ? body.runId
    : null;
}

function ingestError(body: unknown): string | null {
  return typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : null;
}

function runsWhere(sql: Sql, source?: string, status?: string): Fragment {
  return and(sql, [source ? sql`source = ${source}` : sql`true`, status ? sql`status = ${status.toLowerCase()}` : sql`true`]);
}

function runsConnection(ctx: Context, args: { source?: string; status?: string; first?: number; after?: string }) {
  return keysetConnection({
    sql: ctx.sql,
    from: ctx.sql`ops.ingest_runs`,
    where: runsWhere(ctx.sql, args.source, args.status),
    select: RUN_COLUMNS(ctx.sql),
    // Qualified on purpose: RUN_COLUMNS outputs `id::text as id`, and a bare `order by id` would
    // pick that text alias and sort "9" after "71".
    sort: { expr: "ingest_runs.id", cast: "int8" },
    idColumn: "ingest_runs.id",
    descending: true,
    args,
  });
}

function health(source: Source, last: Record<string, unknown> | null, success: Record<string, unknown> | null) {
  if (!last) return "UNKNOWN";
  if (last.status === "FAILED" && (!success || last.status === "FAILED")) {
    const lastOk = success?.finishedAt as Date | undefined;
    if (!lastOk || Date.now() - lastOk.getTime() > source.staleAfterMs) return "FAILING";
  }
  const finished = success?.finishedAt as Date | undefined;
  if (!finished) return last.status === "RUNNING" ? "UNKNOWN" : "FAILING";
  return Date.now() - finished.getTime() > source.staleAfterMs ? "STALE" : "HEALTHY";
}

export function createResolvers(channel: PgChannel) {
  return {
    DateTime: DateTimeScalar,
    Query: {
      watchZones: (_: unknown, __: unknown, ctx: Context) =>
        ctx.sql`select ${ZONE_COLUMNS(ctx.sql)} from ops.watch_zones order by created_at`,
      watchZone: (_: unknown, { id }: { id: string }, ctx: Context) => ctx.zone.load(id),
      dataSources: () => SOURCES,
      dataSource: (_: unknown, { id }: { id: string }) => SOURCES.find((s) => s.id === id) ?? null,
      ingestRuns: (_: unknown, args: { source?: string; status?: string; first?: number; after?: string }, ctx: Context) =>
        runsConnection(ctx, args),
      ingestRun: async (_: unknown, { id }: { id: string }, ctx: Context) =>
        /^\d+$/.test(id) ? ((await ctx.sql`select ${RUN_COLUMNS(ctx.sql)} from ops.ingest_runs where id = ${id}`)[0] ?? null) : null,
      totalRecords: async (_: unknown, __: unknown, ctx: Context) => {
        const rows = await Promise.all(SOURCES.map((s) => ctx.lastSuccess.load(s.id)));
        return rows.reduce((sum, r) => sum + Number(r?.totalRecords ?? 0), 0);
      },
      systemStatus: async () =>
        Promise.all(
          Object.entries(serviceUrls()).map(async ([name, url]) => {
            const started = performance.now();
            try {
              const res = await fetch(`${url}/ready`, { signal: AbortSignal.timeout(2000) });
              return { name, url, up: res.ok, latencyMs: Math.round(performance.now() - started), detail: res.ok ? "ready" : `HTTP ${res.status}` };
            } catch (error) {
              return { name, url, up: false, latencyMs: null, detail: (error as Error).message };
            }
          }),
        ),
    },
    Mutation: {
      createWatchZone: async (_: unknown, { input }: { input: WatchZoneInput }, ctx: Context) => {
        const errors = validate(input);
        if (errors.length) return { zone: null, errors };
        const [zone] = await ctx.sql`
          insert into ops.watch_zones (name, description, latitude, longitude, radius_km, min_magnitude, color)
          values (${input.name.trim()}, ${input.description ?? null}, ${input.latitude}, ${input.longitude}, ${input.radiusKm},
                  ${input.minMagnitude ?? 4}, ${input.color ?? "#f97316"})
          returning ${ZONE_COLUMNS(ctx.sql)}`;
        return { zone, errors: [] };
      },
      updateWatchZone: async (_: unknown, { id, patch }: { id: string; patch: WatchZonePatch }, ctx: Context) => {
        const errors = validate(patch);
        if (errors.length) return { zone: null, errors };
        const existing = await ctx.zone.load(id);
        if (!existing) return { zone: null, errors: [{ field: "id", message: "Watch zone not found" }] };
        const columns: Record<string, unknown> = {};
        if (patch.name != null) columns.name = patch.name.trim();
        if (patch.description !== undefined) columns.description = patch.description;
        if (patch.latitude != null) columns.latitude = patch.latitude;
        if (patch.longitude != null) columns.longitude = patch.longitude;
        if (patch.radiusKm != null) columns.radius_km = patch.radiusKm;
        if (patch.minMagnitude != null) columns.min_magnitude = patch.minMagnitude;
        if (patch.color != null) columns.color = patch.color;
        if (Object.keys(columns).length === 0) return { zone: existing, errors: [] };
        const [zone] = await ctx.sql`
          update ops.watch_zones set ${ctx.sql(columns)}, updated_at = now() where id = ${id}
          returning ${ZONE_COLUMNS(ctx.sql)}`;
        return { zone, errors: [] };
      },
      deleteWatchZone: async (_: unknown, { id }: { id: string }, ctx: Context) => {
        if (!isUuid(id)) return { id, deleted: false };
        const result = await ctx.sql`delete from ops.watch_zones where id = ${id}`;
        return { id, deleted: result.count > 0 };
      },
      triggerIngest: async (_: unknown, { source, mode }: { source: string; mode: "FULL" | "INCREMENTAL" }) => {
        const def = SOURCES.find((s) => s.id === source);
        if (!def) return { accepted: false, runId: null, message: `Unknown source "${source}"` };
        const base = serviceUrls()[def.service];
        if (!base) return { accepted: false, runId: null, message: `No URL configured for service ${def.service}` };
        let res: Response;
        try {
          res = await fetch(`${base}/internal/ingest/${source}`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-internal-token": INTERNAL_TOKEN() },
            body: JSON.stringify({ mode: mode.toLowerCase(), triggeredBy: "manual" }),
            signal: AbortSignal.timeout(5000),
          });
        } catch (error) {
          return { accepted: false, runId: null, message: `Service ${def.service} unreachable: ${error instanceof Error ? error.message : String(error)}` };
        }
        if (res.status === 409) return { accepted: false, runId: null, message: "A run for this source is already in progress" };
        const body: unknown = await res.json().catch(() => null);
        if (!res.ok) return { accepted: false, runId: null, message: ingestError(body) ?? `HTTP ${res.status}` };
        const runId = ingestRunId(body);
        if (runId === null) return { accepted: false, runId: null, message: `Service ${def.service} returned HTTP ${res.status} without a run id` };
        return { accepted: true, runId: String(runId), message: `Run #${runId} started on ${def.service}` };
      },
    },
    Subscription: {
      ingestRunUpdated: {
        subscribe: async function* (_: unknown, { source }: { source?: string }, ctx: Context) {
          for await (const id of channel.subscribe()) {
            const [run] = await ctx.sql`select ${RUN_COLUMNS(ctx.sql)} from ops.ingest_runs where id = ${id}`;
            if (run && (!source || run.source === source)) yield run;
          }
        },
        resolve: (run: unknown) => run,
      },
    },
    WatchZone: {
      __resolveReference: (ref: { id: string }, ctx: Context) => ctx.zone.load(ref.id),
    },
    IngestRun: {
      source: (run: { source: string }) => SOURCES.find((s) => s.id === run.source) ?? { id: run.source, name: run.source },
    },
    DataSource: {
      lastRun: (s: Source, _: unknown, ctx: Context) => ctx.lastRun.load(s.id),
      lastSuccessAt: async (s: Source, _: unknown, ctx: Context) => (await ctx.lastSuccess.load(s.id))?.finishedAt ?? null,
      recordCount: async (s: Source, _: unknown, ctx: Context) => (await ctx.lastSuccess.load(s.id))?.totalRecords ?? null,
      health: async (s: Source, _: unknown, ctx: Context) => health(s, await ctx.lastRun.load(s.id), await ctx.lastSuccess.load(s.id)),
      runs: (s: Source, args: { first?: number; after?: string; status?: string }, ctx: Context) => runsConnection(ctx, { ...args, source: s.id }),
    },
  };
}
