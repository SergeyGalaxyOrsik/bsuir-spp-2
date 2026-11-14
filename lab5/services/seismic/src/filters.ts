import { and, type Fragment, nearFragment, type SortOption, type Sql } from "@geopulse/shared";

export interface EarthquakeFilter {
  search?: string | null;
  magnitude?: { min?: number | null; max?: number | null } | null;
  depthKm?: { min?: number | null; max?: number | null } | null;
  time?: { from?: Date | null; to?: Date | null } | null;
  countryCodes?: string[] | null;
  types?: string[] | null;
  alertLevels?: string[] | null;
  severities?: string[] | null;
  tsunami?: boolean | null;
  near?: { latitude: number; longitude: number; radiusKm: number } | null;
  minSignificance?: number | null;
  hasCountry?: boolean | null;
}

export interface EarthquakeSort {
  field: "TIME" | "MAGNITUDE" | "DEPTH" | "SIGNIFICANCE" | "FELT";
  direction: "ASC" | "DESC";
}

export const SORTS: Record<EarthquakeSort["field"], SortOption> = {
  TIME: { expr: "time", cast: "timestamptz" },
  MAGNITUDE: { expr: "coalesce(magnitude, -10)", cast: "float8" },
  DEPTH: { expr: "coalesce(depth_km, -1000)", cast: "float8" },
  SIGNIFICANCE: { expr: "coalesce(significance, 0)", cast: "int8" },
  FELT: { expr: "coalesce(felt, 0)", cast: "int8" },
};

export const SEVERITY_BANDS: [string, number, number][] = [
  ["MICRO", -10, 2],
  ["MINOR", 2, 4],
  ["LIGHT", 4, 5],
  ["MODERATE", 5, 6],
  ["STRONG", 6, 7],
  ["MAJOR", 7, 8],
  ["GREAT", 8, 100],
];

export function severityOf(magnitude: number | null): string {
  const m = magnitude ?? 0;
  return SEVERITY_BANDS.find(([, lo, hi]) => m >= lo && m < hi)?.[0] ?? "MICRO";
}

export const COLUMNS = (sql: Sql) => sql`
  id, time, updated_at as "updatedAt", magnitude, magnitude_type as "magnitudeType", depth_km as "depthKm",
  latitude, longitude, place, type, status, tsunami, upper(alert) as alert, felt, cdi, mmi,
  significance, network, url, country_code as "countryCode"`;

export function buildWhere(sql: Sql, filter: EarthquakeFilter | null | undefined): Fragment {
  if (!filter) return sql`true`;
  const parts: Fragment[] = [];
  const f = filter;
  if (f.search?.trim()) parts.push(sql`(place ilike ${`%${f.search.trim()}%`} or id = ${f.search.trim()})`);
  if (f.magnitude?.min != null) parts.push(sql`magnitude >= ${f.magnitude.min}`);
  if (f.magnitude?.max != null) parts.push(sql`magnitude <= ${f.magnitude.max}`);
  if (f.depthKm?.min != null) parts.push(sql`depth_km >= ${f.depthKm.min}`);
  if (f.depthKm?.max != null) parts.push(sql`depth_km <= ${f.depthKm.max}`);
  if (f.time?.from) parts.push(sql`time >= ${f.time.from}`);
  if (f.time?.to) parts.push(sql`time <= ${f.time.to}`);
  if (f.countryCodes?.length) {
    const codes = f.countryCodes.map((c) => c.toUpperCase());
    // Plain equality lets `Country.earthquakes` walk earthquakes_country_mag_idx in sort order; `= any` forces a sort.
    parts.push(codes.length === 1 ? sql`country_code = ${codes[0]!}` : sql`country_code = any(${codes})`);
  }
  if (f.types?.length) parts.push(sql`type = any(${f.types})`);
  if (f.alertLevels?.length) parts.push(sql`alert = any(${f.alertLevels.map((a) => a.toLowerCase())})`);
  if (f.severities?.length) {
    const bands = SEVERITY_BANDS.filter(([name]) => f.severities!.includes(name));
    const ors = bands.map(([, lo, hi]) => sql`(coalesce(magnitude, 0) >= ${lo} and coalesce(magnitude, 0) < ${hi})`);
    parts.push(ors.length ? sql`(${ors.reduce((a, b) => sql`${a} or ${b}`)})` : sql`false`);
  }
  if (f.tsunami != null) parts.push(sql`tsunami = ${f.tsunami}`);
  if (f.minSignificance != null) parts.push(sql`significance >= ${f.minSignificance}`);
  if (f.hasCountry != null) parts.push(f.hasCountry ? sql`country_code is not null` : sql`country_code is null`);
  if (f.near) parts.push(nearFragment(sql, f.near.latitude, f.near.longitude, f.near.radiusKm));
  return and(sql, parts);
}

/** Stable key for DataLoader caches keyed by (args, entity). */
export const argsKey = (value: unknown) => JSON.stringify(value ?? null);
