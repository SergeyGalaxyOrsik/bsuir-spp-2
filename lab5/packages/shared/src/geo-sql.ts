import { GraphQLError } from "graphql";
import type { Fragment, Sql } from "./db.ts";

/**
 * Radius filter on `latitude`/`longitude` columns using the earthdistance extension:
 * `earth_box` hits the GiST index on ll_to_earth(...), `earth_distance` trims the box corners.
 */
export function nearFragment(sql: Sql, lat: number, lon: number, radiusKm: number): Fragment {
  if (!(radiusKm > 0 && radiusKm <= 20_000)) {
    throw new GraphQLError("radiusKm must be in (0, 20000]", { extensions: { code: "BAD_USER_INPUT" } });
  }
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new GraphQLError("latitude/longitude out of range", { extensions: { code: "BAD_USER_INPUT" } });
  }
  const meters = radiusKm * 1000;
  return sql`earth_box(ll_to_earth(${lat}, ${lon}), ${meters}) @> ll_to_earth(latitude, longitude)
    and earth_distance(ll_to_earth(${lat}, ${lon}), ll_to_earth(latitude, longitude)) <= ${meters}`;
}

export function assertDays(days: number, max = 3650) {
  if (!(days >= 1 && days <= max)) {
    throw new GraphQLError(`days must be in [1, ${max}]`, { extensions: { code: "BAD_USER_INPUT" } });
  }
}

export const TIME_BUCKETS = { HOUR: "hour", DAY: "day", WEEK: "week", MONTH: "month" } as const;
export type TimeBucket = keyof typeof TIME_BUCKETS;
