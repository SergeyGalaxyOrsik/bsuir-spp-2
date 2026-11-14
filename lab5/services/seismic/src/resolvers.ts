import { assertDays, clampFirst, createAggregateCache, DateTimeScalar, keysetConnection, nearFragment, type PgChannel, type Sql, TIME_BUCKETS } from "@geopulse/shared";
import DataLoader from "dataloader";
import { argsKey, buildWhere, COLUMNS, type EarthquakeFilter, type EarthquakeSort, severityOf, SORTS } from "./filters.ts";

export interface EarthquakeRow {
  id: string;
  time: Date;
  magnitude: number | null;
  latitude: number;
  longitude: number;
  countryCode: string | null;
  [key: string]: unknown;
}

/** What an EarthquakeStats object aggregates over; `strongest` re-queries the same scope. */
interface StatsScope {
  filter: EarthquakeFilter | null | undefined;
  countryCode: string | null;
}

const DEFAULT_SORT: EarthquakeSort = { field: "TIME", direction: "DESC" };
/** Shared across requests: root-level aggregates (dashboard) are memoized for a few seconds. */
const aggregates = createAggregateCache();

export function createContext(sql: Sql) {
  const byId = new DataLoader<string, EarthquakeRow | null>(async (ids) => {
    const rows = await sql<EarthquakeRow[]>`select ${COLUMNS(sql)} from seismic.earthquakes where id = any(${ids as string[]})`;
    const map = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => map.get(id) ?? null);
  });

  // Loaders keyed by serialized arguments: one SQL query per (args) for all countries in a response.
  const statsLoaders = new Map<string, DataLoader<string, Record<string, unknown>>>();
  const recentLoaders = new Map<string, DataLoader<string, EarthquakeRow[]>>();

  const statsFor = (filter: EarthquakeFilter | null | undefined) => {
    const key = argsKey(filter);
    let loader = statsLoaders.get(key);
    if (!loader) {
      loader = new DataLoader(async (codes) => {
        const rows = await sql`
          select country_code as code, ${statsColumns(sql)}
          from seismic.earthquakes
          where country_code = any(${codes as string[]}) and ${buildWhere(sql, filter)}
          group by country_code`;
        const map = new Map(rows.map((r) => [r.code as string, r]));
        return codes.map((code) => ({ ...(map.get(code) ?? emptyStats()), scope: { filter, countryCode: code } }));
      });
      statsLoaders.set(key, loader);
    }
    return loader;
  };

  const recentFor = (first: number, minMagnitude: number | null | undefined) => {
    const key = argsKey([first, minMagnitude]);
    let loader = recentLoaders.get(key);
    if (!loader) {
      loader = new DataLoader(async (codes) => {
        const rows = await sql<EarthquakeRow[]>`
          select ${COLUMNS(sql)}
          from unnest(${codes as string[]}::text[]) as c(code)
          cross join lateral (
            select * from seismic.earthquakes
            where country_code = c.code ${minMagnitude != null ? sql`and magnitude >= ${minMagnitude}` : sql``}
            order by time desc limit ${first}
          ) e
          order by time desc`;
        const grouped = new Map<string, EarthquakeRow[]>();
        for (const row of rows) {
          const list = grouped.get(row.countryCode!) ?? [];
          list.push(row);
          grouped.set(row.countryCode!, list);
        }
        return codes.map((code) => grouped.get(code) ?? []);
      });
      recentLoaders.set(key, loader);
    }
    return loader;
  };

  const strongestLoaders = new Map<string, DataLoader<string, EarthquakeRow | null>>();
  const strongestIn = (filter: EarthquakeFilter | null | undefined) => {
    const key = argsKey(filter);
    let loader = strongestLoaders.get(key);
    if (!loader) {
      loader = new DataLoader(async (codes) => {
        const rows = await sql<EarthquakeRow[]>`
          select ${COLUMNS(sql)}
          from unnest(${codes as string[]}::text[]) as c(code)
          cross join lateral (
            select * from seismic.earthquakes
            where country_code = c.code and ${buildWhere(sql, filter)}
            order by ${STRONGEST_ORDER(sql)} limit 1
          ) e`;
        const map = new Map(rows.map((r) => [r.countryCode!, r]));
        return codes.map((code) => map.get(code) ?? null);
      });
      strongestLoaders.set(key, loader);
    }
    return loader;
  };

  const strongest = ({ filter, countryCode }: StatsScope) =>
    countryCode
      ? strongestIn(filter).load(countryCode)
      : aggregates(`strongest:${argsKey(filter)}`, () =>
          sql<EarthquakeRow[]>`
            select ${COLUMNS(sql)} from seismic.earthquakes where ${buildWhere(sql, filter)}
            order by ${STRONGEST_ORDER(sql)} limit 1`.then((rows) => rows[0] ?? null),
        );

  return { sql, byId, statsFor, recentFor, strongest };
}

export type Context = ReturnType<typeof createContext>;

const statsColumns = (sql: Sql) => sql`
  count(*)::int as count,
  avg(magnitude)::float8 as "avgMagnitude",
  max(magnitude)::float8 as "maxMagnitude",
  avg(depth_km)::float8 as "avgDepthKm",
  count(*) filter (where tsunami)::int as "tsunamiCount",
  coalesce(sum(felt), 0)::int as "feltReports",
  sum(power(10, 1.5 * magnitude + 4.8))::float8 as "totalEnergyJoules",
  min(time) as "firstAt",
  max(time) as "lastAt"`;

/** Matches the `earthquakes_mag_idx` expression, so the unfiltered case is a single index probe. */
const STRONGEST_ORDER = (sql: Sql) => sql`coalesce(magnitude, -10) desc, id desc`;

const emptyStats = () => ({ count: 0, tsunamiCount: 0, feltReports: 0 });

async function connection(ctx: Context, where: ReturnType<typeof buildWhere>, sort: EarthquakeSort | null | undefined, args: { first?: number; after?: string }) {
  const s = sort ?? DEFAULT_SORT;
  return keysetConnection<EarthquakeRow>({
    sql: ctx.sql,
    from: ctx.sql`seismic.earthquakes`,
    where,
    select: COLUMNS(ctx.sql),
    sort: SORTS[s.field],
    idColumn: "id",
    descending: s.direction === "DESC",
    args,
  });
}

async function stats(ctx: Context, filter: EarthquakeFilter | null | undefined) {
  const [row] = await ctx.sql`select ${statsColumns(ctx.sql)} from seismic.earthquakes where ${buildWhere(ctx.sql, filter)}`;
  return { ...row, scope: { filter, countryCode: null } };
}

function within(sql: Sql, z: { latitude: number; longitude: number; radiusKm: number; minMagnitude: number }, days: number) {
  assertDays(days);
  return sql`${nearFragment(sql, z.latitude, z.longitude, z.radiusKm)}
    and magnitude >= ${z.minMagnitude} and time >= now() - make_interval(days => ${days})`;
}

export function createResolvers(earthquakeChannel: PgChannel) {
  return {
    DateTime: DateTimeScalar,
    Query: {
      earthquake: (_: unknown, { id }: { id: string }, ctx: Context) => ctx.byId.load(id),
      earthquakes: (_: unknown, args: { filter?: EarthquakeFilter; sort?: EarthquakeSort; first?: number; after?: string }, ctx: Context) =>
        connection(ctx, buildWhere(ctx.sql, args.filter), args.sort, args),
      earthquakeStats: (_: unknown, { filter }: { filter?: EarthquakeFilter }, ctx: Context) =>
        aggregates(`stats:${argsKey(filter)}`, () => stats(ctx, filter)),
      earthquakeTimeline: (_: unknown, { filter, bucket }: { filter?: EarthquakeFilter; bucket: keyof typeof TIME_BUCKETS }, ctx: Context) =>
        aggregates(`timeline:${bucket}:${argsKey(filter)}`, () =>
          ctx.sql`
            select date_trunc(${TIME_BUCKETS[bucket]}, time) as bucket, count(*)::int as count, max(magnitude)::float8 as "maxMagnitude"
            from seismic.earthquakes where ${buildWhere(ctx.sql, filter)}
            group by 1 order by 1 desc limit 400`.then((rows) => rows.reverse()),
        ),
      magnitudeHistogram: (_: unknown, { filter }: { filter?: EarthquakeFilter }, ctx: Context) =>
        aggregates(`histogram:${argsKey(filter)}`, () =>
          ctx.sql`
            select floor(magnitude * 2) / 2 as "from", floor(magnitude * 2) / 2 + 0.5 as "to", count(*)::int as count
            from seismic.earthquakes where magnitude is not null and ${buildWhere(ctx.sql, filter)}
            group by 1 order by 1`.then((rows) => rows),
        ),
      topSeismicCountries: (_: unknown, { filter, limit }: { filter?: EarthquakeFilter; limit: number }, ctx: Context) =>
        aggregates(`top:${limit}:${argsKey(filter)}`, () =>
          ctx.sql`
            select country_code as code, count(*)::int as count, max(magnitude)::float8 as "maxMagnitude", avg(magnitude)::float8 as "avgMagnitude"
            from seismic.earthquakes where country_code is not null and ${buildWhere(ctx.sql, filter)}
            group by country_code order by count desc limit ${clampFirst(limit, 10)}`.then((rows) =>
            rows.map((r) => ({ ...r, country: { __typename: "Country", code: r.code } })),
          ),
        ),
      // Loose index scan on earthquakes_type_idx: one probe per distinct type instead of a full scan.
      earthquakeTypes: (_: unknown, __: unknown, ctx: Context) =>
        ctx.sql`
          with recursive t as (
            select min(type) as type from seismic.earthquakes
            union all
            select (select min(type) from seismic.earthquakes where type > t.type) from t where t.type is not null
          )
          select type from t where type is not null`.then((rows) => rows.map((r) => r.type)),
    },
    Subscription: {
      earthquakeDetected: {
        subscribe: async function* (_: unknown, { minMagnitude }: { minMagnitude: number }, ctx: Context) {
          for await (const id of earthquakeChannel.subscribe()) {
            ctx.byId.clear(id);
            const quake = await ctx.byId.load(id);
            if (quake && (quake.magnitude ?? 0) >= minMagnitude) yield quake;
          }
        },
        resolve: (payload: EarthquakeRow) => payload,
      },
    },
    Earthquake: {
      __resolveReference: (ref: { id: string }, ctx: Context) => ctx.byId.load(ref.id),
      severity: (q: EarthquakeRow) => severityOf(q.magnitude),
      energyJoules: (q: EarthquakeRow) => (q.magnitude == null ? null : 10 ** (1.5 * q.magnitude + 4.8)),
      country: (q: EarthquakeRow) => (q.countryCode ? { __typename: "Country", code: q.countryCode } : null),
      nearby: (q: EarthquakeRow, { radiusKm, first }: { radiusKm: number; first: number }, ctx: Context) =>
        ctx.sql`
          select ${COLUMNS(ctx.sql)} from seismic.earthquakes
          where id <> ${q.id} and ${nearFragment(ctx.sql, q.latitude, q.longitude, radiusKm)}
          order by abs(extract(epoch from time - ${q.time})) limit ${clampFirst(first, 5)}`,
      aftershocks: (q: EarthquakeRow, { radiusKm, hours, first }: { radiusKm: number; hours: number; first: number }, ctx: Context) =>
        ctx.sql`
          select ${COLUMNS(ctx.sql)} from seismic.earthquakes
          where id <> ${q.id} and time > ${q.time} and time <= ${q.time}::timestamptz + make_interval(hours => ${Math.min(hours, 24 * 60)})
            and ${nearFragment(ctx.sql, q.latitude, q.longitude, radiusKm)}
          order by time limit ${clampFirst(first, 20)}`,
    },
    EarthquakeStats: {
      strongest: (s: { scope: StatsScope }, _: unknown, ctx: Context) => ctx.strongest(s.scope),
    },
    Country: {
      __resolveReference: (ref: { code: string }) => ({ code: ref.code }),
      earthquakes: (c: { code: string }, args: { filter?: EarthquakeFilter; sort?: EarthquakeSort; first?: number; after?: string }, ctx: Context) =>
        connection(ctx, buildWhere(ctx.sql, { ...args.filter, countryCodes: [c.code] }), args.sort, args),
      recentEarthquakes: (c: { code: string }, { first, minMagnitude }: { first: number; minMagnitude?: number }, ctx: Context) =>
        ctx.recentFor(clampFirst(first, 5), minMagnitude).load(c.code),
      seismicStats: (c: { code: string }, { filter }: { filter?: EarthquakeFilter }, ctx: Context) => ctx.statsFor(filter).load(c.code),
    },
    NaturalEvent: {
      __resolveReference: (ref: Record<string, unknown>) => ref,
      nearbyEarthquakes: (
        e: { latitude: number; longitude: number; startedAt: string },
        { radiusKm, days, first }: { radiusKm: number; days: number; first: number },
        ctx: Context,
      ) => {
        assertDays(days, 365);
        const start = new Date(e.startedAt);
        return ctx.sql`
          select ${COLUMNS(ctx.sql)} from seismic.earthquakes
          where ${nearFragment(ctx.sql, e.latitude, e.longitude, radiusKm)}
            and time between ${start}::timestamptz - make_interval(days => ${days}) and ${start}::timestamptz + make_interval(days => ${days})
          order by magnitude desc nulls last limit ${clampFirst(first, 10)}`;
      },
    },
    WatchZone: {
      __resolveReference: (ref: Record<string, unknown>) => ref,
      earthquakes: (z: { latitude: number; longitude: number; radiusKm: number; minMagnitude: number }, { first, days }: { first: number; days: number }, ctx: Context) =>
        ctx.sql`select ${COLUMNS(ctx.sql)} from seismic.earthquakes where ${within(ctx.sql, z, days)} order by time desc limit ${clampFirst(first, 10)}`,
      earthquakeCount: (z: { latitude: number; longitude: number; radiusKm: number; minMagnitude: number }, { days }: { days: number }, ctx: Context) =>
        ctx.sql`select count(*)::int as n from seismic.earthquakes where ${within(ctx.sql, z, days)}`.then((r) => r[0]!.n),
    },
  };
}
