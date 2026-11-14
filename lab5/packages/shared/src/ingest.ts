import type { Sql } from "./db.ts";
import type { Logger } from "./logger.ts";
import { ingestLastSuccess, ingestRecords, ingestRuns } from "./metrics.ts";
import { withSpan } from "./tracing.ts";

export type IngestMode = "full" | "incremental";

export interface IngestContext {
  sql: Sql;
  log: Logger;
  mode: IngestMode;
  runId: number;
  /** Report fraction done (0..1) and a human readable step. Throttled DB writes. */
  progress(fraction: number, message: string): Promise<void>;
  /** Account fetched/upserted records for this run. */
  count(fetched: number, upserted: number): void;
  /** Mark that some chunks failed but the run continued. */
  warn(message: string): void;
  getCheckpoint<T>(key: string): Promise<T | undefined>;
  setCheckpoint(key: string, value: unknown): Promise<void>;
}

export interface Collector {
  /** Stable id, e.g. "usgs". */
  source: string;
  run(ctx: IngestContext): Promise<void>;
  /** Total rows this collector owns, reported after each run. */
  total(sql: Sql): Promise<number>;
  /** Incremental refresh interval. */
  intervalMs: number;
}

/** Shared operational tables. Every collector writes here; the `ops` subgraph reads it. */
export async function ensureOpsTables(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('migrate:ops-shared'))`;
    await tx.unsafe(`
      create schema if not exists ops;
      create table if not exists ops.ingest_runs (
        id bigserial primary key,
        source text not null,
        mode text not null,
        triggered_by text not null,
        status text not null default 'running',
        progress real not null default 0,
        message text,
        records_fetched integer not null default 0,
        records_upserted integer not null default 0,
        total_records integer,
        warnings text[] not null default '{}',
        error text,
        started_at timestamptz not null default now(),
        finished_at timestamptz,
        host text
      );
      create index if not exists ingest_runs_source_started_idx on ops.ingest_runs (source, started_at desc);
      create table if not exists ops.ingest_checkpoints (
        source text not null,
        key text not null,
        value jsonb not null,
        updated_at timestamptz not null default now(),
        primary key (source, key)
      );
    `);
  });
}

async function notify(sql: Sql, runId: number) {
  await sql`select pg_notify('ingest_runs', ${String(runId)})`;
}

export interface StartResult {
  runId: number;
  done: Promise<void>;
}

/**
 * Runs a collector under a cluster-wide advisory lock, so only one replica ingests a given
 * source at a time. Returns null when another run already holds the lock.
 */
export async function startRun(
  sql: Sql,
  log: Logger,
  collector: Collector,
  mode: IngestMode,
  triggeredBy: string,
): Promise<StartResult | null> {
  const conn = await sql.reserve();
  const [lock] = await conn`select pg_try_advisory_lock(hashtext(${`ingest:${collector.source}`})) as ok`;
  if (!lock?.ok) {
    conn.release();
    return null;
  }

  // Holding the lock proves no live process is running this source: anything still marked
  // running was interrupted (crash, kill, deploy) and is closed out here.
  await sql`
    update ops.ingest_runs set status = 'interrupted', finished_at = now(), error = 'process stopped before completion'
    where source = ${collector.source} and status = 'running'`;

  const [row] = await sql`
    insert into ops.ingest_runs (source, mode, triggered_by, host, message)
    values (${collector.source}, ${mode}, ${triggeredBy}, ${process.env.HOSTNAME ?? "local"}, 'starting')
    returning id`;
  const runId = Number(row!.id);
  await notify(sql, runId);

  const runLog = log.child({ source: collector.source, runId, mode });
  let fetched = 0;
  let upserted = 0;
  const warnings: string[] = [];
  let lastProgressWrite = 0;

  const ctx: IngestContext = {
    sql,
    log: runLog,
    mode,
    runId,
    async progress(fraction, message) {
      const now = Date.now();
      if (now - lastProgressWrite < 750 && fraction < 1) return;
      lastProgressWrite = now;
      await sql`
        update ops.ingest_runs
        set progress = ${Math.max(0, Math.min(1, fraction))}, message = ${message},
            records_fetched = ${fetched}, records_upserted = ${upserted}
        where id = ${runId}`;
      await notify(sql, runId);
    },
    count(f, u) {
      fetched += f;
      upserted += u;
      ingestRecords.inc({ source: collector.source }, u);
    },
    warn(message) {
      warnings.push(message);
      runLog.warn(message);
    },
    async getCheckpoint<T>(key: string) {
      const [cp] = await sql`select value from ops.ingest_checkpoints where source = ${collector.source} and key = ${key}`;
      return cp?.value as T | undefined;
    },
    async setCheckpoint(key, value) {
      await sql`
        insert into ops.ingest_checkpoints (source, key, value) values (${collector.source}, ${key}, ${sql.json(value as never)})
        on conflict (source, key) do update set value = excluded.value, updated_at = now()`;
    },
  };

  const done = (async () => {
    const started = Date.now();
    try {
      await withSpan(`ingest ${collector.source}`, { "ingest.source": collector.source, "ingest.mode": mode }, () =>
        collector.run(ctx),
      );
      const total = Number(await collector.total(sql));
      const status = warnings.length > 0 ? "partial" : "succeeded";
      await sql`
        update ops.ingest_runs
        set status = ${status}, progress = 1, message = 'done', finished_at = now(),
            records_fetched = ${fetched}, records_upserted = ${upserted}, total_records = ${total},
            warnings = ${warnings.slice(0, 50)}
        where id = ${runId}`;
      ingestRuns.inc({ source: collector.source, status });
      ingestLastSuccess.set({ source: collector.source }, Date.now() / 1000);
      runLog.info({ fetched, upserted, total, ms: Date.now() - started }, "ingest finished");
    } catch (error) {
      const message = (error as Error).message;
      await sql`
        update ops.ingest_runs
        set status = 'failed', error = ${message}, finished_at = now(),
            records_fetched = ${fetched}, records_upserted = ${upserted}, warnings = ${warnings.slice(0, 50)}
        where id = ${runId}`.catch(() => undefined);
      ingestRuns.inc({ source: collector.source, status: "failed" });
      runLog.error({ err: message }, "ingest failed");
    } finally {
      await notify(sql, runId).catch(() => undefined);
      await conn`select pg_advisory_unlock(hashtext(${`ingest:${collector.source}`}))`.catch(() => undefined);
      conn.release();
    }
  })();

  return { runId, done };
}

/**
 * Starts periodic collection: an immediate full backfill when the source has no data yet,
 * then incremental refreshes. Overlapping ticks are skipped by the advisory lock.
 */
export function scheduleCollectors(sql: Sql, log: Logger, collectors: Collector[]): () => void {
  const timers: NodeJS.Timeout[] = [];
  if (process.env.INGEST_SCHEDULE === "off") return () => undefined;
  for (const collector of collectors) {
    const tick = async (first: boolean) => {
      try {
        const empty = first && Number(await collector.total(sql)) === 0;
        const res = await startRun(sql, log, collector, empty ? "full" : "incremental", "schedule");
        await res?.done;
      } catch (error) {
        log.error({ source: collector.source, err: (error as Error).message }, "scheduled ingest crashed");
      }
    };
    const jitter = Math.round(Math.random() * 3000);
    timers.push(setTimeout(() => void tick(true), 2000 + jitter));
    timers.push(setInterval(() => void tick(false), collector.intervalMs));
  }
  return () => timers.forEach((t) => clearTimeout(t));
}
