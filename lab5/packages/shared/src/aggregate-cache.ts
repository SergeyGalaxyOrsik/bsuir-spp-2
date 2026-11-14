import { envInt } from "./env.ts";

/**
 * Short-lived, process-wide memo for heavy aggregate queries (full-table GROUP BY). Identical
 * arguments within `ttlMs` share one result, and concurrent identical calls share one in-flight
 * SQL query. The dashboard asks the same aggregates for every visitor, and the gateway cannot
 * cache that operation as a whole (it also selects uncacheable fields), so without this every
 * page view re-ran several sequential scans. Sources refresh every 5-15 minutes, so a few seconds
 * of staleness is invisible.
 */
export function createAggregateCache(ttlMs = envInt("AGGREGATE_CACHE_TTL_MS", 15_000), max = 500) {
  const entries = new Map<string, { at: number; value: Promise<unknown> }>();
  return <T>(key: string, load: () => PromiseLike<T>): Promise<T> => {
    if (ttlMs <= 0) return Promise.resolve(load());
    const now = Date.now();
    const hit = entries.get(key);
    if (hit && now - hit.at < ttlMs) return hit.value as Promise<T>;
    const value = Promise.resolve(load());
    entries.set(key, { at: now, value });
    // Failures are not cached.
    value.catch(() => {
      if (entries.get(key)?.value === value) entries.delete(key);
    });
    if (entries.size > max) entries.delete(entries.keys().next().value!);
    return value;
  };
}
