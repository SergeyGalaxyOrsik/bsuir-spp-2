import { readFileSync } from "node:fs";
import type { YogaInitialContext } from "graphql-yoga";
import { createDb, migrate, type Sql, waitForDb } from "./db.ts";
import { envInt } from "./env.ts";
import { type Collector, ensureOpsTables, scheduleCollectors, startRun } from "./ingest.ts";
import { createLogger, type Logger } from "./logger.ts";
import { startSubgraph } from "./subgraph.ts";

export interface ServiceDefinition<TContext> {
  name: string;
  defaultPort: number;
  schemaFile: URL;
  migrationsDir?: URL;
  collectors?: (log: Logger) => Collector[];
  resolvers: (deps: { sql: Sql; log: Logger }) => Record<string, unknown>;
  context: (sql: Sql, initial: YogaInitialContext) => TContext;
  internal?: Parameters<typeof startSubgraph>[0]["internal"];
}

/** Boots a subgraph service: DB, migrations, collectors with schedule, HTTP server. */
export async function runService<TContext extends object>(def: ServiceDefinition<TContext>) {
  const log = createLogger(def.name);
  const sql = createDb(def.name, envInt("DB_POOL_SIZE", 10));
  await waitForDb(sql, log);
  if (def.migrationsDir) await migrate(sql, def.name, def.migrationsDir.pathname, log);
  await ensureOpsTables(sql);

  const collectors = def.collectors?.(log) ?? [];
  const stopSchedule = scheduleCollectors(sql, log, collectors);

  return startSubgraph({
    name: def.name,
    port: envInt("PORT", def.defaultPort),
    typeDefs: readFileSync(def.schemaFile, "utf8"),
    resolvers: def.resolvers({ sql, log }),
    sql,
    log,
    context: (initial) => def.context(sql, initial),
    internal(app) {
      app.get("/collectors", (c) => c.json(collectors.map((x) => ({ source: x.source, intervalMs: x.intervalMs }))));
      app.post("/ingest/:source", async (c) => {
        const collector = collectors.find((x) => x.source === c.req.param("source"));
        if (!collector) return c.json({ error: "unknown source" }, 404);
        const body = (await c.req.json().catch(() => ({}))) as { mode?: "full" | "incremental"; triggeredBy?: string };
        const started = await startRun(sql, log, collector, body.mode ?? "incremental", body.triggeredBy ?? "manual");
        if (!started) return c.json({ error: "already running" }, 409);
        return c.json({ runId: started.runId }, 202);
      });
      def.internal?.(app);
    },
    onShutdown: stopSchedule,
  });
}
