import { CircuitBreaker, type Collector, envInt, fetchJson, mapLimit, type Sql } from "@geopulse/shared";

const COUNTRIES_URL = process.env.COUNTRIES_URL ?? "https://raw.githubusercontent.com/mledoze/countries/master/countries.json";
const WB = "https://api.worldbank.org/v2";

export const INDICATORS = [
  { id: "POPULATION", wbCode: "SP.POP.TOTL", unit: "people" },
  { id: "GDP", wbCode: "NY.GDP.MKTP.CD", unit: "current US$" },
  { id: "GDP_PER_CAPITA", wbCode: "NY.GDP.PCAP.CD", unit: "current US$" },
  { id: "LIFE_EXPECTANCY", wbCode: "SP.DYN.LE00.IN", unit: "years" },
  { id: "URBAN_POPULATION_PCT", wbCode: "SP.URB.TOTL.IN.ZS", unit: "%" },
  { id: "ELECTRICITY_ACCESS_PCT", wbCode: "EG.ELC.ACCS.ZS", unit: "%" },
  { id: "FOREST_AREA_PCT", wbCode: "AG.LND.FRST.ZS", unit: "%" },
  { id: "CO2_PER_CAPITA", wbCode: "EN.GHG.CO2.PC.CE.AR5", unit: "t CO2e" },
] as const;

export async function refreshFacts(sql: Sql) {
  await sql`refresh materialized view concurrently geo.country_facts`;
}

interface MledozeCountry {
  name: { common: string; official: string };
  cca2: string;
  cca3: string;
  ccn3: string;
  capital: string[];
  region: string;
  subregion: string;
  latlng: [number, number];
  area: number;
  landlocked: boolean;
  independent: boolean | null;
  unMember: boolean;
  flag: string;
  tld: string[];
  idd: { root: string; suffixes: string[] };
  borders: string[];
  languages: Record<string, string>;
  currencies: Record<string, { name: string; symbol?: string }>;
  translations: Record<string, { common: string; official: string }>;
}

const githubBreaker = new CircuitBreaker("github-countries", 3, 60_000);
const wbBreaker = new CircuitBreaker("worldbank", 5, 60_000);
const meteoBreaker = new CircuitBreaker("open-meteo", 5, 60_000);

export function countriesCollector(): Collector {
  return {
    source: "countries",
    intervalMs: envInt("COUNTRIES_INTERVAL_MS", 24 * 3600_000),
    total: async (sql) => (await sql`select count(*)::int as n from geo.countries`)[0]!.n,
    async run(ctx) {
      const data = await fetchJson<MledozeCountry[]>(COUNTRIES_URL, { source: "countries", log: ctx.log, breaker: githubBreaker, timeoutMs: 60_000 });
      await ctx.progress(0.3, `${data.length} countries downloaded`);
      await ctx.sql.begin(async (tx) => {
        const rows = data.map((c) => ({
          code: c.cca3,
          iso2: c.cca2,
          ccn3: c.ccn3 || null,
          name: c.name.common,
          official_name: c.name.official,
          name_ru: c.translations.rus?.common ?? null,
          translations: Object.fromEntries(Object.entries(c.translations).map(([k, v]) => [k, v.common])),
          capital: c.capital[0] ?? null,
          region: c.region,
          subregion: c.subregion || null,
          latitude: c.latlng[0] ?? null,
          longitude: c.latlng[1] ?? null,
          area_km2: c.area > 0 ? c.area : null,
          landlocked: c.landlocked,
          independent: c.independent,
          un_member: c.unMember,
          flag: c.flag,
          tld: c.tld ?? [],
          calling_codes: (c.idd.suffixes ?? []).slice(0, 5).map((s) => `${c.idd.root}${s}`),
          borders: c.borders,
        }));
        await tx`
          insert into geo.countries ${tx(rows.map((r) => ({ ...r, translations: tx.json(r.translations) })))}
          on conflict (code) do update set
            iso2 = excluded.iso2, ccn3 = excluded.ccn3, name = excluded.name, official_name = excluded.official_name,
            name_ru = excluded.name_ru, translations = excluded.translations, capital = excluded.capital,
            region = excluded.region, subregion = excluded.subregion, latitude = excluded.latitude,
            longitude = excluded.longitude, area_km2 = excluded.area_km2, landlocked = excluded.landlocked,
            independent = excluded.independent, un_member = excluded.un_member, flag = excluded.flag,
            tld = excluded.tld, calling_codes = excluded.calling_codes, borders = excluded.borders, updated_at = now()`;

        const languages = new Map<string, string>();
        const currencies = new Map<string, { name: string; symbol: string | null }>();
        const countryLanguages: { country_code: string; language_code: string }[] = [];
        const countryCurrencies: { country_code: string; currency_code: string }[] = [];
        for (const c of data) {
          for (const [code, name] of Object.entries(c.languages ?? {})) {
            languages.set(code, name);
            countryLanguages.push({ country_code: c.cca3, language_code: code });
          }
          for (const [code, cur] of Object.entries(c.currencies ?? {})) {
            currencies.set(code, { name: cur.name, symbol: cur.symbol ?? null });
            countryCurrencies.push({ country_code: c.cca3, currency_code: code });
          }
        }
        await tx`insert into geo.languages ${tx([...languages].map(([code, name]) => ({ code, name })))}
          on conflict (code) do update set name = excluded.name`;
        await tx`insert into geo.currencies ${tx([...currencies].map(([code, c]) => ({ code, ...c })))}
          on conflict (code) do update set name = excluded.name, symbol = excluded.symbol`;
        await tx`delete from geo.country_languages`;
        await tx`delete from geo.country_currencies`;
        await tx`insert into geo.country_languages ${tx(countryLanguages)}`;
        await tx`insert into geo.country_currencies ${tx(countryCurrencies)}`;
        ctx.count(data.length, rows.length + languages.size + currencies.size + countryLanguages.length + countryCurrencies.length);
      });
      await refreshFacts(ctx.sql);
      await ctx.progress(1, "countries stored");
    },
  };
}

type WbPage<T> = [{ page: number; pages: number; total: number }, T[] | null];

export function worldBankCollector(): Collector {
  const fromYear = envInt("WB_FROM_YEAR", 1995);
  return {
    source: "worldbank",
    intervalMs: envInt("WORLDBANK_INTERVAL_MS", 24 * 3600_000),
    total: async (sql) =>
      (await sql`select ((select count(*) from geo.indicator_values) + (select count(*) from geo.wb_countries))::int as n`)[0]!.n as number,
    async run(ctx) {
      const opts = { source: "worldbank", log: ctx.log, breaker: wbBreaker, timeoutMs: 60_000 };
      const [, wbCountries] = await fetchJson<WbPage<{
        id: string; name: string; region: { value: string; id: string }; incomeLevel: { value: string };
        lendingType: { value: string }; capitalCity: string; latitude: string; longitude: string;
      }>>(`${WB}/country?format=json&per_page=400`, opts);
      const meta = (wbCountries ?? []).map((c) => ({
        code: c.id,
        name: c.name,
        is_aggregate: c.region.value.trim() === "Aggregates",
        region: c.region.value.trim() || null,
        income_level: c.incomeLevel.value.trim() || null,
        lending_type: c.lendingType.value.trim() || null,
        capital: c.capitalCity || null,
        capital_latitude: c.latitude ? Number(c.latitude) : null,
        capital_longitude: c.longitude ? Number(c.longitude) : null,
      }));
      await ctx.sql`insert into geo.wb_countries ${ctx.sql(meta)}
        on conflict (code) do update set name = excluded.name, is_aggregate = excluded.is_aggregate, region = excluded.region,
          income_level = excluded.income_level, lending_type = excluded.lending_type, capital = excluded.capital,
          capital_latitude = excluded.capital_latitude, capital_longitude = excluded.capital_longitude`;
      ctx.count(meta.length, meta.length);
      await ctx.progress(0.1, `${meta.length} World Bank economies`);

      const toYear = new Date().getUTCFullYear();
      let done = 0;
      await mapLimit([...INDICATORS], 3, async (indicator) => {
        try {
          const info = await fetchJson<WbPage<{ name: string; sourceNote: string }>>(`${WB}/indicator/${indicator.wbCode}?format=json`, opts);
          const def = info[1]?.[0];
          await ctx.sql`
            insert into geo.indicators (id, wb_code, name, unit, description)
            values (${indicator.id}, ${indicator.wbCode}, ${def?.name ?? indicator.id}, ${indicator.unit}, ${def?.sourceNote ?? null})
            on conflict (id) do update set name = excluded.name, description = excluded.description, unit = excluded.unit`;
          const [, values] = await fetchJson<WbPage<{ countryiso3code: string; date: string; value: number | null }>>(
            `${WB}/country/all/indicator/${indicator.wbCode}?format=json&per_page=20000&date=${fromYear}:${toYear}`,
            { ...opts, timeoutMs: 120_000 },
          );
          const rows = (values ?? [])
            .filter((v) => v.countryiso3code)
            .map((v) => ({ country_code: v.countryiso3code, indicator_id: indicator.id, year: Number(v.date), value: v.value }));
          for (let i = 0; i < rows.length; i += 2000) {
            await ctx.sql`insert into geo.indicator_values ${ctx.sql(rows.slice(i, i + 2000))}
              on conflict (country_code, indicator_id, year) do update set value = excluded.value`;
          }
          ctx.count(rows.length, rows.length);
        } catch (error) {
          ctx.warn(`${indicator.id}: ${(error as Error).message}`);
        }
        done++;
        await ctx.progress(0.1 + (0.9 * done) / INDICATORS.length, `${indicator.id} stored`);
      });
      await refreshFacts(ctx.sql);
    },
  };
}

export function openMeteoCollector(): Collector {
  return {
    source: "openmeteo",
    intervalMs: envInt("WEATHER_INTERVAL_MS", 30 * 60_000),
    total: async (sql) => (await sql`select count(*)::int as n from geo.weather`)[0]!.n,
    async run(ctx) {
      // Capital coordinates come from World Bank, with the country centroid as a fallback.
      let points: { code: string; lat: number; lon: number }[] = [];
      for (let attempt = 0; attempt < 12; attempt++) {
        points = (await ctx.sql`
          select c.code, coalesce(f.capital_latitude, c.latitude) as lat, coalesce(f.capital_longitude, c.longitude) as lon
          from geo.countries c join geo.country_facts f using (code)
          where coalesce(f.capital_latitude, c.latitude) is not null
          order by c.code`) as never;
        if (points.length > 0) break;
        await ctx.progress(0, "waiting for countries to be collected");
        await new Promise((r) => setTimeout(r, 10_000));
      }
      if (points.length === 0) throw new Error("no country coordinates available yet");

      const batches: (typeof points)[] = [];
      for (let i = 0; i < points.length; i += 50) batches.push(points.slice(i, i + 50));
      let done = 0;
      await mapLimit(batches, 2, async (batch) => {
        try {
          const url =
            `https://api.open-meteo.com/v1/forecast?latitude=${batch.map((p) => p.lat.toFixed(4)).join(",")}` +
            `&longitude=${batch.map((p) => p.lon.toFixed(4)).join(",")}` +
            "&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation,weather_code,is_day&timezone=UTC";
          const res = await fetchJson<unknown>(url, { source: "openmeteo", log: ctx.log, breaker: meteoBreaker });
          const list = (Array.isArray(res) ? res : [res]) as {
            current: { time: string; temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number;
              wind_speed_10m: number; wind_direction_10m: number; precipitation: number; weather_code: number; is_day: number };
          }[];
          const rows = list.map((w, i) => ({
            country_code: batch[i]!.code,
            latitude: batch[i]!.lat,
            longitude: batch[i]!.lon,
            temperature_c: w.current.temperature_2m,
            apparent_temperature_c: w.current.apparent_temperature,
            humidity: w.current.relative_humidity_2m,
            wind_speed_kmh: w.current.wind_speed_10m,
            wind_direction: w.current.wind_direction_10m,
            precipitation_mm: w.current.precipitation,
            weather_code: w.current.weather_code,
            is_day: w.current.is_day === 1,
            observed_at: new Date(`${w.current.time}Z`),
          }));
          await ctx.sql`insert into geo.weather ${ctx.sql(rows)}
            on conflict (country_code) do update set latitude = excluded.latitude, longitude = excluded.longitude,
              temperature_c = excluded.temperature_c, apparent_temperature_c = excluded.apparent_temperature_c,
              humidity = excluded.humidity, wind_speed_kmh = excluded.wind_speed_kmh, wind_direction = excluded.wind_direction,
              precipitation_mm = excluded.precipitation_mm, weather_code = excluded.weather_code, is_day = excluded.is_day,
              observed_at = excluded.observed_at`;
          ctx.count(rows.length, rows.length);
        } catch (error) {
          ctx.warn(`weather batch failed: ${(error as Error).message}`);
        }
        done++;
        await ctx.progress(done / batches.length, `${done}/${batches.length} batches`);
      });
    },
  };
}
