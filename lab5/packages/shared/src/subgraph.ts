import { buildSubgraphSchema } from "@apollo/subgraph";
import { useOpenTelemetry } from "@envelop/opentelemetry";
import { usePrometheus } from "@graphql-yoga/plugin-prometheus";
import { serve } from "@hono/node-server";
import { parse } from "graphql";
import { createYoga, type Plugin, type YogaInitialContext } from "graphql-yoga";
import { Hono } from "hono";
import type { Sql } from "./db.ts";
import { INTERNAL_TOKEN } from "./env.ts";
import type { Logger } from "./logger.ts";
import { registry } from "./metrics.ts";

export interface SubgraphOptions<TContext> {
  name: string;
  port: number;
  typeDefs: string;
  resolvers: Record<string, any>;
  sql: Sql;
  log: Logger;
  context: (initial: YogaInitialContext) => TContext | Promise<TContext>;
  /** Extra routes under `/internal`, protected by the shared service token. */
  internal?: (app: Hono) => void;
  onShutdown?: () => Promise<void> | void;
  plugins?: Plugin[];
}

export function startSubgraph<TContext extends object>(opts: SubgraphOptions<TContext>) {
  const { name, sql, log } = opts;
  const schema = buildSubgraphSchema([{ typeDefs: parse(opts.typeDefs), resolvers: opts.resolvers }]);

  const yoga = createYoga<Record<string, unknown>, TContext>({
    schema,
    graphqlEndpoint: "/graphql",
    landingPage: false,
    logging: (process.env.LOG_LEVEL as "debug" | "info" | "warn" | "error" | undefined) ?? "warn",
    maskedErrors: process.env.NODE_ENV === "production",
    context: opts.context,
    plugins: [
      useOpenTelemetry({ resolvers: true, variables: true, result: false, document: true }, undefined, undefined, { "service.name": name }),
      usePrometheus({
        endpoint: false,
        registry,
        metrics: {
          graphql_yoga_http_duration: true,
          graphql_envelop_request_duration: true,
          graphql_envelop_phase_execute: true,
          graphql_envelop_error_result: true,
          graphql_envelop_execute_resolver: false,
        },
      }),
      ...(opts.plugins ?? []),
    ],
  });

  const app = new Hono();
  let shuttingDown = false;

  app.get("/health", (c) => c.json({ status: "ok", service: name }));
  app.get("/ready", async (c) => {
    if (shuttingDown) return c.json({ status: "draining" }, 503);
    try {
      await sql`select 1`;
      return c.json({ status: "ready", service: name });
    } catch (error) {
      return c.json({ status: "unavailable", error: (error as Error).message }, 503);
    }
  });
  app.get("/metrics", async (c) => c.text(await registry.metrics(), 200, { "content-type": registry.contentType }));

  const internal = new Hono();
  internal.use("*", async (c, next) => {
    if (c.req.header("x-internal-token") !== INTERNAL_TOKEN()) return c.json({ error: "forbidden" }, 403);
    await next();
  });
  opts.internal?.(internal);
  app.route("/internal", internal);

  app.on(["GET", "POST", "OPTIONS"], "/graphql", (c) => yoga.fetch(c.req.raw));

  const server = serve({ fetch: app.fetch, port: opts.port, hostname: "0.0.0.0" }, (info) =>
    log.info({ port: info.port }, `${name} subgraph listening`),
  );

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, "shutting down");
    await opts.onShutdown?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await sql.end({ timeout: 5 });
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  return { app, yoga, server };
}
