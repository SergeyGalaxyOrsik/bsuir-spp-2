import { and, clampFirst, DateTimeScalar, type Fragment, type Sql } from "@geopulse/shared";
import DataLoader from "dataloader";

export interface CountryRow {
  code: string;
  iso2: string;
  translations: Record<string, string>;
  latitude: number | null;
  longitude: number | null;
  capitalLatitude: number | null;
  capitalLongitude: number | null;
  borders: string[];
  population: number | null;
  areaKm2: number | null;
  [key: string]: unknown;
}

interface CountryFilter {
  search?: string;
  regions?: string[];
  subregions?: string[];
  landlocked?: boolean;
  independent?: boolean;
  unMember?: boolean;
  population?: { min?: number; max?: number };
  areaKm2?: { min?: number; max?: number };
  gdpPerCapita?: { min?: number; max?: number };
  languageCodes?: string[];
  currencyCodes?: string[];
  incomeLevels?: string[];
  codes?: string[];
}

interface CountrySort {
  field: keyof typeof SORT_EXPR;
  direction: "ASC" | "DESC";
}

const SORT_EXPR = {
  NAME: "c.name",
  POPULATION: "f.population",
  AREA: "c.area_km2",
  DENSITY: "f.population / nullif(c.area_km2, 0)",
  GDP_PER_CAPITA: "f.gdp_per_capita",
  LIFE_EXPECTANCY: "f.life_expectancy",
} as const;

const WMO: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Depositing rime fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle", 56: "Freezing drizzle", 57: "Dense freezing drizzle",
  61: "Slight rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Heavy freezing rain",
  71: "Slight snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Rain showers", 81: "Heavy rain showers",
  82: "Violent rain showers", 85: "Snow showers", 86: "Heavy snow showers", 95: "Thunderstorm",
  96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail",
};

const COUNTRY_COLUMNS = (sql: Sql) => sql`
  c.code, c.iso2, c.ccn3 as "numericCode", c.name, c.official_name as "officialName", c.translations, c.capital,
  c.region, c.subregion, c.latitude, c.longitude, c.area_km2 as "areaKm2", c.landlocked, c.independent,
  c.un_member as "unMember", c.flag, c.tld as "topLevelDomains", c.calling_codes as "callingCodes", c.borders,
  f.income_level as "incomeLevel", f.capital_latitude as "capitalLatitude", f.capital_longitude as "capitalLongitude",
  f.population, f.gdp_per_capita as "gdpPerCapita", f.life_expectancy as "lifeExpectancy"`;

const FROM = (sql: Sql) => sql`geo.countries c join geo.country_facts f on f.code = c.code`;

function range(sql: Sql, expr: string, r: { min?: number; max?: number } | undefined): Fragment[] {
  const out: Fragment[] = [];
  if (r?.min != null) out.push(sql`${sql.unsafe(expr)} >= ${r.min}`);
  if (r?.max != null) out.push(sql`${sql.unsafe(expr)} <= ${r.max}`);
  return out;
}

function buildWhere(sql: Sql, f: CountryFilter | undefined): Fragment {
  if (!f) return sql`true`;
  const parts: Fragment[] = [];
  if (f.search?.trim()) {
    const q = `%${f.search.trim()}%`;
    parts.push(sql`(c.name ilike ${q} or c.official_name ilike ${q} or c.name_ru ilike ${q} or c.capital ilike ${q} or c.code ilike ${f.search.trim()})`);
  }
  if (f.regions?.length) parts.push(sql`c.region = any(${f.regions})`);
  if (f.subregions?.length) parts.push(sql`c.subregion = any(${f.subregions})`);
  if (f.landlocked != null) parts.push(sql`c.landlocked = ${f.landlocked}`);
  if (f.independent != null) parts.push(sql`c.independent = ${f.independent}`);
  if (f.unMember != null) parts.push(sql`c.un_member = ${f.unMember}`);
  if (f.incomeLevels?.length) parts.push(sql`f.income_level = any(${f.incomeLevels})`);
  if (f.codes?.length) parts.push(sql`c.code = any(${f.codes.map((c) => c.toUpperCase())})`);
  if (f.languageCodes?.length)
    parts.push(sql`exists (select 1 from geo.country_languages l where l.country_code = c.code and l.language_code = any(${f.languageCodes}))`);
  if (f.currencyCodes?.length)
    parts.push(sql`exists (select 1 from geo.country_currencies x where x.country_code = c.code and x.currency_code = any(${f.currencyCodes.map((c) => c.toUpperCase())}))`);
  parts.push(...range(sql, "f.population", f.population), ...range(sql, "c.area_km2", f.areaKm2), ...range(sql, "f.gdp_per_capita", f.gdpPerCapita));
  return and(sql, parts);
}

function orderBy(sql: Sql, sort: CountrySort | undefined): Fragment {
  const s = sort ?? { field: "NAME", direction: "ASC" };
  return sql`order by ${sql.unsafe(SORT_EXPR[s.field])} ${sql.unsafe(s.direction === "DESC" ? "desc" : "asc")} nulls last, c.code`;
}

type SeriesKey = { code: string; id: string; fromYear: number | null; toYear: number | null };

export function createContext(sql: Sql) {
  const country = new DataLoader<string, CountryRow | null>(async (codes) => {
    const rows = await sql<CountryRow[]>`select ${COUNTRY_COLUMNS(sql)} from ${FROM(sql)} where c.code = any(${codes as string[]})`;
    const map = new Map(rows.map((r) => [r.code, r]));
    return codes.map((code) => map.get(code.toUpperCase()) ?? null);
  });

  const languagesOf = new DataLoader<string, Record<string, unknown>[]>(async (codes) => {
    const rows = await sql`
      select cl.country_code, l.code, l.name,
        (select count(*)::int from geo.country_languages x where x.language_code = l.code) as "countryCount"
      from geo.country_languages cl join geo.languages l on l.code = cl.language_code
      where cl.country_code = any(${codes as string[]}) order by l.name`;
    return codes.map((code) => rows.filter((r) => r.country_code === code));
  });

  const currenciesOf = new DataLoader<string, Record<string, unknown>[]>(async (codes) => {
    const rows = await sql`
      select cc.country_code, x.code, x.name, x.symbol from geo.country_currencies cc join geo.currencies x on x.code = cc.currency_code
      where cc.country_code = any(${codes as string[]}) order by x.code`;
    return codes.map((code) => rows.filter((r) => r.country_code === code));
  });

  const weather = new DataLoader<string, Record<string, unknown> | null>(async (codes) => {
    const rows = await sql`
      select country_code, latitude, longitude, temperature_c as "temperatureC", apparent_temperature_c as "apparentTemperatureC",
        humidity, wind_speed_kmh as "windSpeedKmh", wind_direction as "windDirection", precipitation_mm as "precipitationMm",
        weather_code as "weatherCode", is_day as "isDay", observed_at as "observedAt"
      from geo.weather where country_code = any(${codes as string[]})`;
    const map = new Map(rows.map((r) => [r.country_code as string, r]));
    return codes.map((code) => map.get(code) ?? null);
  });

  const series = new DataLoader<SeriesKey, { year: number; value: number | null }[], string>(
    async (keys) => {
      const codes = [...new Set(keys.map((k) => k.code))];
      const ids = [...new Set(keys.map((k) => k.id))];
      const rows = await sql`
        select country_code, indicator_id, year::int, value from geo.indicator_values
        where country_code = any(${codes}) and indicator_id = any(${ids}) order by year`;
      return keys.map((k) =>
        rows
          .filter((r) => r.country_code === k.code && r.indicator_id === k.id)
          .filter((r) => (k.fromYear == null || r.year >= k.fromYear) && (k.toYear == null || r.year <= k.toYear))
          .map((r) => ({ year: r.year as number, value: r.value as number | null })),
      );
    },
    { cacheKeyFn: (k) => `${k.code}:${k.id}:${k.fromYear}:${k.toYear}` },
  );

  const indicatorDefs = new DataLoader<string, Record<string, unknown> | null>(async (ids) => {
    const rows = await sql`select id, wb_code as "worldBankCode", name, unit, description from geo.indicators where id = any(${ids as string[]})`;
    const map = new Map(rows.map((r) => [r.id as string, r]));
    return ids.map((id) => map.get(id) ?? { id, worldBankCode: id, name: id });
  });

  return { sql, country, languagesOf, currenciesOf, weather, series, indicatorDefs };
}

export type Context = ReturnType<typeof createContext>;

function toSeries(ctx: Context, code: string, id: string, fromYear?: number | null, toYear?: number | null) {
  return ctx.series.load({ code, id, fromYear: fromYear ?? null, toYear: toYear ?? null }).then((points) => {
    const nonNull = points.filter((p) => p.value != null);
    const first = nonNull[0]?.value;
    const last = nonNull.at(-1)?.value;
    return {
      indicatorId: id,
      points,
      latest: nonNull.at(-1) ?? null,
      changePct: first && last != null && nonNull.length > 1 ? ((last - first) / Math.abs(first)) * 100 : null,
    };
  });
}

const ALL_INDICATORS = ["POPULATION", "GDP", "GDP_PER_CAPITA", "LIFE_EXPECTANCY", "URBAN_POPULATION_PCT", "ELECTRICITY_ACCESS_PCT", "FOREST_AREA_PCT", "CO2_PER_CAPITA"];

export const resolvers = {
  DateTime: DateTimeScalar,
  Query: {
    country: (_: unknown, { code }: { code: string }, ctx: Context) => ctx.country.load(code.toUpperCase()),
    countries: async (_: unknown, args: { filter?: CountryFilter; sort?: CountrySort; limit: number; offset: number }, ctx: Context) => {
      const limit = clampFirst(args.limit, 20);
      const offset = Math.max(0, args.offset ?? 0);
      const where = buildWhere(ctx.sql, args.filter);
      const [items, [count]] = await Promise.all([
        ctx.sql<CountryRow[]>`select ${COUNTRY_COLUMNS(ctx.sql)} from ${FROM(ctx.sql)} where ${where} ${orderBy(ctx.sql, args.sort)} limit ${limit} offset ${offset}`,
        ctx.sql`select count(*)::int as n from ${FROM(ctx.sql)} where ${where}`,
      ]);
      for (const item of items) ctx.country.prime(item.code, item);
      return { items, total: count!.n, limit, offset, hasMore: offset + items.length < count!.n };
    },
    regions: (_: unknown, __: unknown, ctx: Context) =>
      ctx.sql`
        select c.region as name, count(*)::int as "countryCount", sum(f.population)::float8 as population,
          sum(c.area_km2)::float8 as "areaKm2", array_remove(array_agg(distinct c.subregion), null) as subregions
        from ${FROM(ctx.sql)} group by c.region order by c.region`,
    languages: (_: unknown, { search, limit }: { search?: string; limit: number }, ctx: Context) =>
      ctx.sql`
        select l.code, l.name, count(cl.country_code)::int as "countryCount"
        from geo.languages l left join geo.country_languages cl on cl.language_code = l.code
        where ${search ? ctx.sql`l.name ilike ${`%${search}%`}` : ctx.sql`true`}
        group by l.code order by "countryCount" desc, l.name limit ${clampFirst(limit, 50)}`,
    currencies: (_: unknown, { search, limit }: { search?: string; limit: number }, ctx: Context) =>
      ctx.sql`
        select code, name, symbol from geo.currencies
        where ${search ? ctx.sql`(name ilike ${`%${search}%`} or code ilike ${search})` : ctx.sql`true`}
        order by code limit ${clampFirst(limit, 50)}`,
    indicators: (_: unknown, __: unknown, ctx: Context) =>
      ctx.sql`select id, wb_code as "worldBankCode", name, unit, description from geo.indicators order by id`,
    indicatorRanking: async (
      _: unknown,
      args: { id: string; year?: number; limit: number; direction: "ASC" | "DESC"; region?: string },
      ctx: Context,
    ) => {
      const year =
        args.year ??
        (await ctx.sql`
          select v.year::int as y from geo.indicator_values v
          where v.indicator_id = ${args.id} and v.value is not null
            and exists (select 1 from geo.countries c where c.code = v.country_code)
          order by v.year desc limit 1`)[0]?.y;
      if (!year) return [];
      const rows = await ctx.sql`
        select v.country_code as code, v.year::int, v.value
        from geo.indicator_values v join geo.countries c on c.code = v.country_code
        where v.indicator_id = ${args.id} and v.year = ${year} and v.value is not null
          ${args.region ? ctx.sql`and c.region = ${args.region}` : ctx.sql``}
        order by v.value ${ctx.sql.unsafe(args.direction === "ASC" ? "asc" : "desc")} limit ${clampFirst(args.limit, 10)}`;
      return rows.map((r, i) => ({ rank: i + 1, year: r.year, value: r.value, countryCode: r.code }));
    },
    incomeLevels: (_: unknown, __: unknown, ctx: Context) =>
      ctx.sql`select distinct income_level from geo.country_facts where income_level is not null order by 1`.then((r) =>
        r.map((x) => x.income_level),
      ),
  },
  Country: {
    __resolveReference: (ref: { code: string }, ctx: Context) => ctx.country.load(ref.code),
    localizedName: (c: CountryRow, { lang }: { lang: string }) => c.translations?.[lang] ?? null,
    capitalLocation: (c: CountryRow) =>
      c.capitalLatitude != null && c.capitalLongitude != null ? { latitude: c.capitalLatitude, longitude: c.capitalLongitude } : null,
    location: (c: CountryRow) => (c.latitude != null && c.longitude != null ? { latitude: c.latitude, longitude: c.longitude } : null),
    isoAlpha2: (c: CountryRow) => c.iso2,
    flagUrl: (c: CountryRow) => `https://flagcdn.com/w160/${c.iso2.toLowerCase()}.png`,
    density: (c: CountryRow) => (c.population && c.areaKm2 ? c.population / c.areaKm2 : null),
    neighbors: async (c: CountryRow, _: unknown, ctx: Context) =>
      (await ctx.country.loadMany(c.borders ?? [])).filter((x): x is CountryRow => !!x && !(x instanceof Error)),
    languages: (c: CountryRow, _: unknown, ctx: Context) => ctx.languagesOf.load(c.code),
    currencies: (c: CountryRow, _: unknown, ctx: Context) => ctx.currenciesOf.load(c.code),
    weather: (c: CountryRow, _: unknown, ctx: Context) => ctx.weather.load(c.code),
    indicator: (c: CountryRow, args: { id: string; fromYear?: number; toYear?: number }, ctx: Context) =>
      toSeries(ctx, c.code, args.id, args.fromYear, args.toYear),
    indicators: (c: CountryRow, args: { ids?: string[]; fromYear?: number; toYear?: number }, ctx: Context) =>
      Promise.all((args.ids?.length ? args.ids : ALL_INDICATORS).map((id) => toSeries(ctx, c.code, id, args.fromYear, args.toYear))),
  },
  IndicatorSeries: {
    indicator: (s: { indicatorId: string }, _: unknown, ctx: Context) => ctx.indicatorDefs.load(s.indicatorId),
  },
  IndicatorRank: {
    country: (r: { countryCode: string }, _: unknown, ctx: Context) => ctx.country.load(r.countryCode),
  },
  Weather: {
    description: (w: { weatherCode: number | null }) => (w.weatherCode == null ? "Unknown" : (WMO[w.weatherCode] ?? `WMO code ${w.weatherCode}`)),
    location: (w: { latitude: number; longitude: number }) => ({ latitude: w.latitude, longitude: w.longitude }),
  },
  Region: {
    countries: (r: { name: string }, { sort }: { sort?: CountrySort }, ctx: Context) =>
      ctx.sql`select ${COUNTRY_COLUMNS(ctx.sql)} from ${FROM(ctx.sql)} where c.region = ${r.name} ${orderBy(ctx.sql, sort)}`,
  },
  Language: {
    __resolveReference: async (ref: { code: string }, ctx: Context) =>
      (await ctx.sql`select l.code, l.name, (select count(*)::int from geo.country_languages where language_code = l.code) as "countryCount" from geo.languages l where l.code = ${ref.code}`)[0] ?? null,
    countries: (l: { code: string }, _: unknown, ctx: Context) =>
      ctx.sql`select ${COUNTRY_COLUMNS(ctx.sql)} from ${FROM(ctx.sql)} join geo.country_languages cl on cl.country_code = c.code where cl.language_code = ${l.code} order by c.name`,
  },
  Currency: {
    __resolveReference: async (ref: { code: string }, ctx: Context) =>
      (await ctx.sql`select code, name, symbol from geo.currencies where code = ${ref.code}`)[0] ?? null,
    countries: (x: { code: string }, _: unknown, ctx: Context) =>
      ctx.sql`select ${COUNTRY_COLUMNS(ctx.sql)} from ${FROM(ctx.sql)} join geo.country_currencies cc on cc.country_code = c.code where cc.currency_code = ${x.code} order by c.name`,
  },
};
