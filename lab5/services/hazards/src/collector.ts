import { CircuitBreaker, type Collector, CountryLocator, envInt, fetchJson, type IngestContext, type Logger, type Sql } from "@geopulse/shared";

const EONET = "https://eonet.gsfc.nasa.gov/api/v3";

interface EonetGeometry {
  magnitudeValue: number | null;
  magnitudeUnit: string | null;
  date: string;
  type: "Point" | "Polygon";
  coordinates: [number, number] | [number, number][][];
}

interface EonetEvent {
  id: string;
  title: string;
  description: string | null;
  link: string;
  closed: string | null;
  categories: { id: string; title: string }[];
  sources: { id: string; url: string }[];
  geometry: EonetGeometry[];
}

const breaker = new CircuitBreaker("eonet", 5, 60_000);
let locator: Promise<CountryLocator> | undefined;

function position(g: EonetGeometry): [number, number] {
  if (g.type === "Point") return g.coordinates as [number, number];
  const ring = (g.coordinates as [number, number][][])[0] ?? [];
  const sum = ring.reduce(([x, y], [a, b]) => [x + a, y + b], [0, 0]);
  return [sum[0] / Math.max(ring.length, 1), sum[1] / Math.max(ring.length, 1)];
}

async function syncCatalog(ctx: IngestContext) {
  const opts = { source: "eonet", log: ctx.log, breaker, timeoutMs: 60_000 };
  const { categories } = await fetchJson<{ categories: { id: string; title: string; description: string }[] }>(`${EONET}/categories`, opts);
  const { sources } = await fetchJson<{ sources: { id: string; title: string; source: string }[] }>(`${EONET}/sources`, opts);
  await ctx.sql`insert into hazards.categories ${ctx.sql(categories.map((c) => ({ id: c.id, title: c.title, description: c.description })))}
    on conflict (id) do update set title = excluded.title, description = excluded.description`;
  await ctx.sql`insert into hazards.sources ${ctx.sql(sources.map((s) => ({ id: s.id, title: s.title, url: s.source })))}
    on conflict (id) do update set title = excluded.title, url = excluded.url`;
  ctx.count(categories.length + sources.length, categories.length + sources.length);
}

/** Upserts events; returns the ids that are new or got a newer observation (for live notifications). */
async function store(sql: Sql, geo: CountryLocator, events: EonetEvent[]) {
  const usable = events.filter((e) => e.geometry.length > 0 && e.categories.length > 0);
  const changed: string[] = [];
  for (let i = 0; i < usable.length; i += 500) {
    const chunk = usable.slice(i, i + 500);
    await sql.begin(async (tx) => {
      const before = new Map(
        (await tx`select id, last_observed_at, closed_at from hazards.events where id = any(${chunk.map((e) => e.id)})`).map((r) => [
          r.id as string,
          `${(r.last_observed_at as Date).toISOString()}|${(r.closed_at as Date | null)?.toISOString() ?? ""}`,
        ]),
      );
      const rows = chunk.map((e) => {
        const sorted = [...e.geometry].sort((a, b) => a.date.localeCompare(b.date));
        const last = sorted.at(-1)!;
        const [lon, lat] = position(last);
        const magnitudes = sorted.filter((g) => g.magnitudeValue != null);
        const peak = magnitudes.reduce<EonetGeometry | null>((m, g) => (!m || g.magnitudeValue! > m.magnitudeValue! ? g : m), null);
        return {
          id: e.id,
          title: e.title,
          description: e.description,
          link: e.link,
          closed_at: e.closed ? new Date(e.closed) : null,
          started_at: new Date(sorted[0]!.date),
          last_observed_at: new Date(last.date),
          latitude: lat,
          longitude: lon,
          magnitude_value: peak?.magnitudeValue ?? null,
          magnitude_unit: peak?.magnitudeUnit ?? null,
          primary_category_id: e.categories[0]!.id,
          country_code: geo.locate(lon, lat, e.title),
          point_count: sorted.length,
        };
      });
      for (const r of rows)
        if (before.get(r.id) !== `${r.last_observed_at.toISOString()}|${r.closed_at?.toISOString() ?? ""}`) changed.push(r.id);
      await tx`insert into hazards.events ${tx(rows)}
        on conflict (id) do update set title = excluded.title, description = excluded.description, closed_at = excluded.closed_at,
          started_at = excluded.started_at, last_observed_at = excluded.last_observed_at, latitude = excluded.latitude,
          longitude = excluded.longitude, magnitude_value = excluded.magnitude_value, magnitude_unit = excluded.magnitude_unit,
          primary_category_id = excluded.primary_category_id, country_code = excluded.country_code,
          point_count = excluded.point_count, ingested_at = now()`;

      const ids = chunk.map((e) => e.id);
      await tx`delete from hazards.event_categories where event_id = any(${ids})`;
      await tx`delete from hazards.event_sources where event_id = any(${ids})`;
      await tx`delete from hazards.event_points where event_id = any(${ids})`;
      const cats = chunk.flatMap((e) => [...new Set(e.categories.map((c) => c.id))].map((category_id) => ({ event_id: e.id, category_id })));
      const srcs = chunk.flatMap((e) => {
        const seen = new Map<string, string>();
        for (const s of e.sources) seen.set(s.id, s.url);
        return [...seen].map(([source_id, url]) => ({ event_id: e.id, source_id, url }));
      });
      const points = chunk.flatMap((e) =>
        [...e.geometry]
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((g, seq) => {
            const [lon, lat] = position(g);
            return {
              event_id: e.id, seq, observed_at: new Date(g.date), latitude: lat, longitude: lon,
              geometry_type: g.type, magnitude_value: g.magnitudeValue, magnitude_unit: g.magnitudeUnit,
            };
          }),
      );
      if (cats.length) await tx`insert into hazards.event_categories ${tx(cats)} on conflict do nothing`;
      if (srcs.length) await tx`insert into hazards.event_sources ${tx(srcs)} on conflict do nothing`;
      for (let p = 0; p < points.length; p += 2000) await tx`insert into hazards.event_points ${tx(points.slice(p, p + 2000))}`;
    });
  }
  return { stored: usable.length, changed };
}

function quarters(fromYear: number, now: Date): [Date, Date][] {
  const out: [Date, Date][] = [];
  for (let d = new Date(Date.UTC(fromYear, 0, 1)); d < now; ) {
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1));
    out.push([d, next < now ? next : now]);
    d = next;
  }
  return out;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

export function eonetCollector(log: Logger): Collector {
  const fromYear = envInt("HAZARDS_FROM_YEAR", 2019);
  return {
    source: "eonet",
    intervalMs: envInt("HAZARDS_INTERVAL_MS", 15 * 60_000),
    total: async (sql) =>
      (await sql`select ((select count(*) from hazards.events) + (select count(*) from hazards.event_points))::int as n`)[0]!.n as number,
    async run(ctx) {
      locator ??= CountryLocator.load(log).catch((error) => {
        locator = undefined;
        throw error;
      });
      const geo = await locator;
      await syncCatalog(ctx);
      const now = new Date();
      const opts = { source: "eonet", log: ctx.log, breaker, timeoutMs: 120_000 };

      if (ctx.mode === "incremental") {
        const start = new Date(now.getTime() - 30 * 86_400_000);
        const { events } = await fetchJson<{ events: EonetEvent[] }>(`${EONET}/events?status=all&start=${day(start)}&end=${day(now)}`, opts);
        const { stored, changed } = await store(ctx.sql, geo, events);
        ctx.count(events.length, stored);
        // Live globe: every replica LISTENs on this channel (only incremental runs, a backfill would flood it).
        for (const id of changed) await ctx.sql`select pg_notify('natural_events', ${id})`;
        await ctx.progress(1, `${stored} events refreshed, ${changed.length} changed`);
        return;
      }

      const done = new Set((await ctx.getCheckpoint<string[]>("quarters")) ?? []);
      const ranges = quarters(fromYear, now);
      for (const [index, [start, end]] of ranges.entries()) {
        const key = day(start);
        const isCurrent = index === ranges.length - 1;
        if (done.has(key) && !isCurrent) continue;
        try {
          const { events } = await fetchJson<{ events: EonetEvent[] }>(`${EONET}/events?status=all&start=${key}&end=${day(end)}`, opts);
          const { stored } = await store(ctx.sql, geo, events);
          ctx.count(events.length, stored);
          if (!isCurrent) {
            done.add(key);
            await ctx.setCheckpoint("quarters", [...done]);
          }
          await ctx.progress((index + 1) / ranges.length, `${key}: ${stored} events`);
        } catch (error) {
          ctx.warn(`quarter ${key} failed: ${(error as Error).message}`);
        }
      }
    },
  };
}
