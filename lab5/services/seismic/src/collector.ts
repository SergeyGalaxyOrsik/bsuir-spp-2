import { CircuitBreaker, type Collector, CountryLocator, envInt, fetchJson, type IngestContext, type Logger, type Sql } from "@geopulse/shared";

const USGS = "https://earthquake.usgs.gov/fdsnws/event/1/query";

interface UsgsFeature {
  id: string;
  properties: {
    mag: number | null;
    place: string | null;
    time: number;
    updated: number;
    url: string | null;
    felt: number | null;
    cdi: number | null;
    mmi: number | null;
    alert: string | null;
    status: string | null;
    tsunami: number;
    sig: number | null;
    net: string | null;
    magType: string | null;
    type: string;
  };
  geometry: { coordinates: [number, number, number | null] };
}

const breaker = new CircuitBreaker("usgs", 5, 60_000);
let locator: Promise<CountryLocator> | undefined;

function monthStart(date: Date, offsetMonths: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offsetMonths, 1));
}

async function fetchRange(ctx: IngestContext, start: Date, end: Date, minMagnitude: number) {
  const url = `${USGS}?format=geojson&orderby=time-asc&limit=20000&minmagnitude=${minMagnitude}&starttime=${start.toISOString()}&endtime=${end.toISOString()}`;
  const data = await fetchJson<{ features: UsgsFeature[] }>(url, { source: "usgs", log: ctx.log, breaker, timeoutMs: 90_000 });
  return data.features;
}

/** Upserts features; returns ids that were inserted for the first time. */
async function upsert(sql: Sql, geo: CountryLocator, features: UsgsFeature[]): Promise<string[]> {
  const inserted: string[] = [];
  for (let i = 0; i < features.length; i += 1000) {
    const rows = features.slice(i, i + 1000).map((f) => {
      const [lon, lat, depth] = f.geometry.coordinates;
      const p = f.properties;
      return {
        id: f.id,
        time: new Date(p.time),
        updated_at: new Date(p.updated),
        magnitude: p.mag,
        magnitude_type: p.magType,
        depth_km: depth,
        latitude: lat,
        longitude: lon,
        place: p.place,
        type: p.type,
        status: p.status,
        tsunami: p.tsunami === 1,
        alert: p.alert,
        felt: p.felt,
        cdi: p.cdi,
        mmi: p.mmi,
        significance: p.sig,
        network: p.net,
        url: p.url,
        country_code: geo.locate(lon, lat, p.place),
      };
    });
    const result = await sql`
      insert into seismic.earthquakes ${sql(rows)}
      on conflict (id) do update set
        updated_at = excluded.updated_at, magnitude = excluded.magnitude, magnitude_type = excluded.magnitude_type,
        depth_km = excluded.depth_km, place = excluded.place, status = excluded.status, tsunami = excluded.tsunami,
        alert = excluded.alert, felt = excluded.felt, cdi = excluded.cdi, mmi = excluded.mmi,
        significance = excluded.significance, country_code = excluded.country_code, ingested_at = now()
      where seismic.earthquakes.updated_at < excluded.updated_at
      returning id, (xmax = 0) as inserted`;
    for (const r of result) if (r.inserted) inserted.push(r.id as string);
  }
  return inserted;
}

export function usgsCollector(log: Logger): Collector {
  const months = envInt("SEISMIC_BACKFILL_MONTHS", 24);
  const minMagnitude = Number(process.env.SEISMIC_MIN_MAGNITUDE ?? 2.5);

  return {
    source: "usgs",
    intervalMs: envInt("SEISMIC_INTERVAL_MS", 5 * 60_000),
    total: async (sql) => (await sql`select count(*)::int as n from seismic.earthquakes`)[0]!.n,
    async run(ctx) {
      locator ??= CountryLocator.load(log).catch((error) => {
        locator = undefined;
        throw error;
      });
      const geo = await locator;
      const now = new Date();

      if (ctx.mode === "incremental") {
        // Re-read the last two days so revised magnitudes/locations are picked up too.
        const features = await fetchRange(ctx, new Date(now.getTime() - 2 * 86_400_000), now, minMagnitude);
        const inserted = await upsert(ctx.sql, geo, features);
        ctx.count(features.length, features.length);
        for (const id of inserted) await ctx.sql`select pg_notify('earthquakes', ${id})`;
        await ctx.progress(1, `${features.length} fetched, ${inserted.length} new`);
        return;
      }

      // Full backfill, month by month, resumable via checkpoint.
      const done = new Set((await ctx.getCheckpoint<string[]>("months")) ?? []);
      const chunks = Array.from({ length: months + 1 }, (_, i) => monthStart(now, -months + i));
      for (const [index, start] of chunks.entries()) {
        const key = start.toISOString().slice(0, 7);
        const end = index === chunks.length - 1 ? now : (chunks[index + 1] as Date);
        const isCurrent = index === chunks.length - 1;
        if (done.has(key) && !isCurrent) continue;
        try {
          const features = await fetchRange(ctx, start, end, minMagnitude);
          await upsert(ctx.sql, geo, features);
          ctx.count(features.length, features.length);
          if (!isCurrent) {
            done.add(key);
            await ctx.setCheckpoint("months", [...done]);
          }
          await ctx.progress((index + 1) / chunks.length, `month ${key}: ${features.length} events`);
        } catch (error) {
          ctx.warn(`month ${key} failed: ${(error as Error).message}`);
        }
      }
    },
  };
}
