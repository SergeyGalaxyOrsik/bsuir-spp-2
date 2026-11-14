import {
  and,
  assertDays,
  clampFirst,
  DateTimeScalar,
  type Fragment,
  keysetConnection,
  nearFragment,
  type SortOption,
  type Sql,
  TIME_BUCKETS,
  type TimeBucket,
} from "@geopulse/shared";
import DataLoader from "dataloader";

interface NaturalEventFilter {
  search?: string;
  categoryIds?: string[];
  sourceIds?: string[];
  status?: "OPEN" | "CLOSED";
  started?: { from?: Date; to?: Date };
  countryCodes?: string[];
  near?: { latitude: number; longitude: number; radiusKm: number };
  magnitude?: { min?: number; max?: number };
  magnitudeUnit?: string;
  hasCountry?: boolean;
}

interface NaturalEventSort {
  field: "STARTED_AT" | "LAST_OBSERVED_AT" | "MAGNITUDE" | "TITLE" | "DURATION";
  direction: "ASC" | "DESC";
}

interface EventRow {
  id: string;
  latitude: number;
  longitude: number;
  startedAt: Date;
  lastObservedAt: Date;
  closedAt: Date | null;
  magnitudeValue: number | null;
  magnitudeUnit: string | null;
  primaryCategoryId: string;
  countryCode: string | null;
  [key: string]: unknown;
}

const SORTS: Record<NaturalEventSort["field"], SortOption> = {
  STARTED_AT: { expr: "started_at", cast: "timestamptz" },
  LAST_OBSERVED_AT: { expr: "last_observed_at", cast: "timestamptz" },
  MAGNITUDE: { expr: "coalesce(magnitude_value, -1)", cast: "float8" },
  TITLE: { expr: "lower(title)", cast: "text" },
  DURATION: { expr: "extract(epoch from (coalesce(closed_at, last_observed_at) - started_at))", cast: "float8" },
};

const COLUMNS = (sql: Sql) => sql`
  id, title, description, link, closed_at as "closedAt", started_at as "startedAt", last_observed_at as "lastObservedAt",
  latitude, longitude, magnitude_value as "magnitudeValue", magnitude_unit as "magnitudeUnit",
  primary_category_id as "primaryCategoryId", country_code as "countryCode", point_count as "pointCount"`;

function buildWhere(sql: Sql, f: NaturalEventFilter | undefined | null): Fragment {
  if (!f) return sql`true`;
  const parts: Fragment[] = [];
  if (f.search?.trim()) parts.push(sql`(title ilike ${`%${f.search.trim()}%`} or id = ${f.search.trim()})`);
  if (f.categoryIds?.length)
    parts.push(sql`exists (select 1 from hazards.event_categories ec where ec.event_id = id and ec.category_id = any(${f.categoryIds}))`);
  if (f.sourceIds?.length)
    parts.push(sql`exists (select 1 from hazards.event_sources es where es.event_id = id and es.source_id = any(${f.sourceIds}))`);
  if (f.status === "OPEN") parts.push(sql`closed_at is null`);
  if (f.status === "CLOSED") parts.push(sql`closed_at is not null`);
  if (f.started?.from) parts.push(sql`started_at >= ${f.started.from}`);
  if (f.started?.to) parts.push(sql`started_at <= ${f.started.to}`);
  if (f.countryCodes?.length) parts.push(sql`country_code = any(${f.countryCodes.map((c) => c.toUpperCase())})`);
  if (f.magnitude?.min != null) parts.push(sql`magnitude_value >= ${f.magnitude.min}`);
  if (f.magnitude?.max != null) parts.push(sql`magnitude_value <= ${f.magnitude.max}`);
  if (f.magnitudeUnit) parts.push(sql`magnitude_unit = ${f.magnitudeUnit}`);
  if (f.hasCountry != null) parts.push(f.hasCountry ? sql`country_code is not null` : sql`country_code is null`);
  if (f.near) parts.push(nearFragment(sql, f.near.latitude, f.near.longitude, f.near.radiusKm));
  return and(sql, parts);
}

const key = (v: unknown) => JSON.stringify(v ?? null);

export function createContext(sql: Sql) {
  const byId = new DataLoader<string, EventRow | null>(async (ids) => {
    const rows = await sql<EventRow[]>`select ${COLUMNS(sql)} from hazards.events where id = any(${ids as string[]})`;
    const map = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const category = new DataLoader<string, Record<string, unknown> | null>(async (ids) => {
    const rows = await sql`select id, title, description from hazards.categories where id = any(${ids as string[]})`;
    const map = new Map(rows.map((r) => [r.id as string, r]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const categoriesOf = new DataLoader<string, string[]>(async (ids) => {
    const rows = await sql`select event_id, category_id from hazards.event_categories where event_id = any(${ids as string[]})`;
    return ids.map((id) => rows.filter((r) => r.event_id === id).map((r) => r.category_id as string));
  });
  const sourcesOf = new DataLoader<string, Record<string, unknown>[]>(async (ids) => {
    const rows = await sql`
      select es.event_id, es.url, s.id, s.title, s.url as "sourceUrl"
      from hazards.event_sources es join hazards.sources s on s.id = es.source_id where es.event_id = any(${ids as string[]})`;
    return ids.map((id) =>
      rows.filter((r) => r.event_id === id).map((r) => ({ url: r.url, source: { id: r.id, title: r.title, url: r.sourceUrl } })),
    );
  });
  const statsLoaders = new Map<string, DataLoader<string, Record<string, unknown>>>();
  const statsFor = (filter: NaturalEventFilter | undefined) => {
    const k = key(filter);
    let loader = statsLoaders.get(k);
    if (!loader) {
      loader = new DataLoader(async (codes) => {
        const rows = await sql`
          select country_code as code, ${statsColumns(sql)}
          from hazards.events where country_code = any(${codes as string[]}) and ${buildWhere(sql, filter)}
          group by country_code`;
        const map = new Map(rows.map((r) => [r.code as string, r]));
        return codes.map((code) => ({ ...(map.get(code) ?? { count: 0, open: 0, closed: 0 }), filter, countryCode: code }));
      });
      statsLoaders.set(k, loader);
    }
    return loader;
  };
  return { sql, byId, category, categoriesOf, sourcesOf, statsFor };
}

type Context = ReturnType<typeof createContext>;

const statsColumns = (sql: Sql) => sql`
  count(*)::int as count,
  count(*) filter (where closed_at is null)::int as open,
  count(*) filter (where closed_at is not null)::int as closed,
  avg(extract(epoch from (coalesce(closed_at, last_observed_at) - started_at)) / 86400)::float8 as "avgDurationDays",
  min(started_at) as "firstAt",
  max(started_at) as "lastAt"`;

function connection(ctx: Context, where: Fragment, sort: NaturalEventSort | undefined, args: { first?: number; after?: string }) {
  const s = sort ?? { field: "STARTED_AT", direction: "DESC" };
  return keysetConnection<EventRow>({
    sql: ctx.sql,
    from: ctx.sql`hazards.events`,
    where,
    select: COLUMNS(ctx.sql),
    sort: SORTS[s.field],
    idColumn: "id",
    descending: s.direction === "DESC",
    args,
  });
}

async function stats(ctx: Context, filter: NaturalEventFilter | undefined, countryCode?: string) {
  const where = and(ctx.sql, [buildWhere(ctx.sql, filter), countryCode ? ctx.sql`country_code = ${countryCode}` : ctx.sql`true`]);
  const [row] = await ctx.sql`select ${statsColumns(ctx.sql)} from hazards.events where ${where}`;
  return { ...row, filter, countryCode };
}

type ConnArgs = { filter?: NaturalEventFilter; sort?: NaturalEventSort; first?: number; after?: string };

export const resolvers = {
  DateTime: DateTimeScalar,
  Query: {
    naturalEvent: (_: unknown, { id }: { id: string }, ctx: Context) => ctx.byId.load(id),
    naturalEvents: (_: unknown, args: ConnArgs, ctx: Context) => connection(ctx, buildWhere(ctx.sql, args.filter), args.sort, args),
    hazardCategories: (_: unknown, __: unknown, ctx: Context) =>
      ctx.sql`select id, title, description from hazards.categories order by title`,
    hazardSources: (_: unknown, __: unknown, ctx: Context) =>
      ctx.sql`
        select s.id, s.title, s.url, count(es.event_id)::int as "eventCount"
        from hazards.sources s left join hazards.event_sources es on es.source_id = s.id
        group by s.id order by "eventCount" desc, s.title`,
    hazardStats: (_: unknown, { filter }: { filter?: NaturalEventFilter }, ctx: Context) => stats(ctx, filter),
    hazardTimeline: (_: unknown, { filter, bucket }: { filter?: NaturalEventFilter; bucket: TimeBucket }, ctx: Context) =>
      ctx.sql`
        select date_trunc(${TIME_BUCKETS[bucket]}, started_at) as bucket, count(*)::int as count
        from hazards.events where ${buildWhere(ctx.sql, filter)}
        group by 1 order by 1 desc limit 400`.then((rows) => rows.reverse()),
  },
  HazardStats: {
    byCategory: async (s: { filter?: NaturalEventFilter; countryCode?: string }, _: unknown, ctx: Context) => {
      const where = and(ctx.sql, [buildWhere(ctx.sql, s.filter), s.countryCode ? ctx.sql`country_code = ${s.countryCode}` : ctx.sql`true`]);
      const rows = await ctx.sql`
        select primary_category_id as id, count(*)::int as count, count(*) filter (where closed_at is null)::int as open
        from hazards.events where ${where} group by 1 order by count desc`;
      return rows.map((r) => ({ categoryId: r.id, count: r.count, open: r.open }));
    },
  },
  CategoryCount: {
    category: (c: { categoryId: string }, _: unknown, ctx: Context) => ctx.category.load(c.categoryId),
  },
  HazardCategory: {
    __resolveReference: (ref: { id: string }, ctx: Context) => ctx.category.load(ref.id),
    eventCount: (c: { id: string }, { status }: { status?: "OPEN" | "CLOSED" }, ctx: Context) =>
      ctx.sql`
        select count(*)::int as n from hazards.event_categories ec join hazards.events e on e.id = ec.event_id
        where ec.category_id = ${c.id}
          ${status === "OPEN" ? ctx.sql`and e.closed_at is null` : status === "CLOSED" ? ctx.sql`and e.closed_at is not null` : ctx.sql``}`.then(
        (r) => r[0]!.n,
      ),
    events: (c: { id: string }, args: ConnArgs, ctx: Context) =>
      connection(ctx, buildWhere(ctx.sql, { ...args.filter, categoryIds: [c.id] }), args.sort, args),
  },
  NaturalEvent: {
    __resolveReference: (ref: { id: string }, ctx: Context) => ctx.byId.load(ref.id),
    status: (e: EventRow) => (e.closedAt ? "CLOSED" : "OPEN"),
    durationDays: (e: EventRow) => ((e.closedAt ?? e.lastObservedAt).getTime() - e.startedAt.getTime()) / 86_400_000,
    magnitude: (e: EventRow) => (e.magnitudeValue == null ? null : { value: e.magnitudeValue, unit: e.magnitudeUnit }),
    primaryCategory: (e: EventRow, _: unknown, ctx: Context) => ctx.category.load(e.primaryCategoryId),
    categories: async (e: EventRow, _: unknown, ctx: Context) => {
      const ids = await ctx.categoriesOf.load(e.id);
      return (await ctx.category.loadMany(ids)).filter(Boolean);
    },
    sources: (e: EventRow, _: unknown, ctx: Context) => ctx.sourcesOf.load(e.id),
    track: (e: EventRow, { first }: { first: number }, ctx: Context) =>
      ctx.sql`
        select observed_at as "observedAt", latitude, longitude, geometry_type as "geometryType",
          case when magnitude_value is null then null else json_build_object('value', magnitude_value, 'unit', magnitude_unit) end as magnitude
        from hazards.event_points where event_id = ${e.id} order by seq limit ${clampFirst(first, 50)}`,
    country: (e: EventRow) => (e.countryCode ? { __typename: "Country", code: e.countryCode } : null),
    related: (e: EventRow, { radiusKm, first }: { radiusKm: number; first: number }, ctx: Context) =>
      ctx.sql`
        select ${COLUMNS(ctx.sql)} from hazards.events
        where id <> ${e.id} and ${nearFragment(ctx.sql, e.latitude, e.longitude, radiusKm)}
          and started_at <= ${e.closedAt ?? e.lastObservedAt}::timestamptz + interval '30 days'
          and coalesce(closed_at, last_observed_at) >= ${e.startedAt}::timestamptz - interval '30 days'
        order by abs(extract(epoch from started_at - ${e.startedAt})) limit ${clampFirst(first, 5)}`,
  },
  Country: {
    __resolveReference: (ref: { code: string }) => ({ code: ref.code }),
    naturalEvents: (c: { code: string }, args: ConnArgs, ctx: Context) =>
      connection(ctx, buildWhere(ctx.sql, { ...args.filter, countryCodes: [c.code] }), args.sort, args),
    hazardStats: (c: { code: string }, { filter }: { filter?: NaturalEventFilter }, ctx: Context) => ctx.statsFor(filter).load(c.code),
  },
  WatchZone: {
    __resolveReference: (ref: Record<string, unknown>) => ref,
    naturalEvents: (z: { latitude: number; longitude: number; radiusKm: number }, { first, days }: { first: number; days: number }, ctx: Context) => {
      assertDays(days);
      return ctx.sql`
        select ${COLUMNS(ctx.sql)} from hazards.events
        where ${nearFragment(ctx.sql, z.latitude, z.longitude, z.radiusKm)} and last_observed_at >= now() - make_interval(days => ${days})
        order by last_observed_at desc limit ${clampFirst(first, 10)}`;
    },
    naturalEventCount: (z: { latitude: number; longitude: number; radiusKm: number }, { days }: { days: number }, ctx: Context) => {
      assertDays(days);
      return ctx.sql`
        select count(*)::int as n from hazards.events
        where ${nearFragment(ctx.sql, z.latitude, z.longitude, z.radiusKm)} and last_observed_at >= now() - make_interval(days => ${days})`.then(
        (r) => r[0]!.n,
      );
    },
  },
};
