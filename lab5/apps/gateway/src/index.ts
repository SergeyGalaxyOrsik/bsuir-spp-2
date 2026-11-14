import { blockFieldSuggestionsPlugin } from "@escape.tech/graphql-armor-block-field-suggestions";
import { maxAliasesPlugin } from "@escape.tech/graphql-armor-max-aliases";
import { maxDepthPlugin } from "@escape.tech/graphql-armor-max-depth";
import { maxTokensPlugin } from "@escape.tech/graphql-armor-max-tokens";
import { createLogger, envInt, registry } from "@geopulse/shared";
import { createGatewayRuntime } from "@graphql-hive/gateway-runtime";
import { useOpenTelemetry } from "@graphql-hive/plugin-opentelemetry";
import usePrometheus from "@graphql-mesh/plugin-prometheus";
import useMeshRateLimit from "@graphql-mesh/plugin-rate-limit";
import InMemoryLRUCache from "@graphql-mesh/cache-inmemory-lru";
import * as httpTransport from "@graphql-mesh/transport-http";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { subgraphsFromEnv, supergraphLoader } from "./compose.ts";
import { useSubgraphCircuitBreaker } from "./subgraph-breaker.ts";
import { clientIp, concurrencyLimit, rateLimit } from "./load-control.ts";

const log = createLogger("gateway");
const production = process.env.NODE_ENV === "production";
const subgraphs = subgraphsFromEnv();
const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:3100,http://127.0.0.1:3100").split(",");

const gateway = createGatewayRuntime({
  // Shared KV store for the response cache and per-field rate limits.
  cache: new InMemoryLRUCache({ max: 5000 }),
  supergraph: supergraphLoader(subgraphs, log),
  pollingInterval: envInt("SUPERGRAPH_POLL_MS", 30_000),
  // Static import: no runtime module resolution inside the bundled/isolated install.
  transports: { http: httpTransport },
  graphqlEndpoint: "/graphql",
  landingPage: false,
  graphiql: { title: "GeoPulse GraphQL", defaultQuery: "{ totalRecords dataSources { name health recordCount } }" },
  logging: (process.env.LOG_LEVEL as "info" | "warn" | "debug" | undefined) ?? "info",
  maskedErrors: production,
  requestId: true,
  contentEncoding: true,
  // Fault tolerance towards subgraphs.
  // Per subgraph call. Subscriptions are long-lived SSE streams and must not be cut by it
  // (otherwise clients silently reconnect every N seconds and miss events in between).
  upstreamTimeout: ({ executionRequest }) =>
    executionRequest?.operationType === "subscription" ? undefined : envInt("UPSTREAM_TIMEOUT_MS", 10_000),
  // One quick retry: enough to land on another replica when a pod dies mid-request, while a
  // subgraph that is down entirely costs the response ~0.2 s instead of seconds of backoff.
  upstreamRetry: { maxRetries: envInt("UPSTREAM_RETRIES", 1), retryDelay: 100, retryDelayFactor: 1 },
  requestDeadline: envInt("REQUEST_DEADLINE_MS", 20_000),
  inboundInflightRequestDeduplication: true,
  // Query cost analysis based on @cost/@listSize directives in the subgraphs.
  demandControl: {
    maxCost: envInt("MAX_QUERY_COST", 20_000),
    listSize: 25,
    includeExtensionMetadata: true,
  },
  // Gateway-level response cache; mutations on WatchZone invalidate cached entities.
  responseCaching: {
    session: () => null,
    ttl: envInt("RESPONSE_CACHE_TTL_MS", 30_000),
    ttlPerSchemaCoordinate: {
      "Query.ingestRuns": 0,
      "Query.ingestRun": 0,
      "Query.dataSources": 0,
      "Query.dataSource": 0,
      "Query.systemStatus": 0,
      "Query.totalRecords": 5_000,
      "Query.watchZones": 0,
      "Query.watchZone": 0,
      "Query.countries": 300_000,
      "Query.regions": 300_000,
    },
    invalidateViaMutation: true,
    includeExtensionMetadata: true,
  },
  cors: { origin: allowedOrigins, credentials: false },
  plugins: (ctx) => [
    useSubgraphCircuitBreaker({ threshold: envInt("SUBGRAPH_BREAKER_THRESHOLD", 3), cooldownMs: envInt("SUBGRAPH_BREAKER_COOLDOWN_MS", 5_000) }),
    maxDepthPlugin({ n: envInt("MAX_QUERY_DEPTH", 10), flattenFragments: true, ignoreIntrospection: true }),
    maxAliasesPlugin({ n: 15, allowList: [] }),
    maxTokensPlugin({ n: 3000 }),
    ...(production ? [blockFieldSuggestionsPlugin()] : []),
    useMeshRateLimit({
      cache: ctx.cache!,
      config: [
        // Expensive analytical root fields get their own per-client budget.
        { type: "Query", field: "earthquakeTimeline", max: 60, ttl: 60_000, identifier: "{context.headers.x-real-ip}" },
        { type: "Query", field: "magnitudeHistogram", max: 60, ttl: 60_000, identifier: "{context.headers.x-real-ip}" },
        { type: "Mutation", field: "triggerIngest", max: 10, ttl: 60_000, identifier: "{context.headers.x-real-ip}" },
        { type: "Mutation", field: "createWatchZone", max: 30, ttl: 60_000, identifier: "{context.headers.x-real-ip}" },
      ],
    }),
    usePrometheus({
      ...ctx,
      registry,
      metrics: {
        graphql_gateway_fetch_duration: true,
        graphql_gateway_subgraph_execute_duration: true,
        graphql_gateway_subgraph_execute_errors: true,
        graphql_envelop_request_duration: true,
        graphql_envelop_phase_execute: true,
        graphql_envelop_error_result: true,
        graphql_envelop_request: true,
        graphql_envelop_deprecated_field: false,
        graphql_yoga_http_duration: true,
      },
      labels: { subgraphName: true },
    }),
    useOpenTelemetry({ ...ctx, traces: { spans: { graphqlContextBuilding: false } } }),
  ],
});

const app = new Hono<{ Bindings: { incoming: { socket: { remoteAddress?: string } } } }>();
let stopping = false;

// While draining, ask keep-alive clients (the web proxy) not to reuse their socket to this pod.
app.use("*", async (c, next) => {
  await next();
  if (stopping) c.header("connection", "close");
});

app.get("/health", (c) => c.json({ status: "ok", service: "gateway" }));
app.get("/ready", async (c) => {
  if (stopping) return c.json({ status: "draining" }, 503);
  const res = await gateway.fetch(new Request("http://gateway/readiness"));
  return c.json({ status: res.ok ? "ready" : "not ready" }, res.ok ? 200 : 503);
});
app.get("/metrics", async (c) => c.text(await registry.metrics(), 200, { "content-type": registry.contentType }));

app.use(
  "/graphql",
  cors({ origin: allowedOrigins, allowHeaders: ["content-type", "accept", "x-request-id"], exposeHeaders: ["x-request-id", "retry-after"] }),
);
app.use("/graphql", rateLimit({ perSecond: envInt("RATE_LIMIT_PER_SECOND", 20), burst: envInt("RATE_LIMIT_BURST", 60) }));
const shed = concurrencyLimit(envInt("MAX_INFLIGHT_REQUESTS", 200));
app.use("/graphql", async (c, next) => {
  // Long-lived subscription streams are not counted against the in-flight budget.
  if (c.req.header("accept")?.includes("text/event-stream")) return next();
  return shed(c, next);
});
app.on(["GET", "POST", "OPTIONS"], "/graphql", (c) => {
  const headers = new Headers(c.req.raw.headers);
  headers.set("x-real-ip", clientIp(c.req.raw.headers, c.env?.incoming?.socket?.remoteAddress));
  headers.delete("x-internal-token");
  return gateway.fetch(new Request(c.req.raw, { headers }));
});

const port = envInt("PORT", 4000);
const server = serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, () => {
  log.info({ port, subgraphs }, "gateway listening");
  // Compose the supergraph eagerly instead of on the first client request.
  void Promise.resolve(gateway.fetch(new Request(`http://localhost:${port}/graphql?query=%7B__typename%7D`))).catch(() => undefined);
});

const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  log.info("gateway shutting down");
  const http = server as unknown as { closeIdleConnections?: () => void; closeAllConnections?: () => void };
  const closed = new Promise<void>((resolve) => server.close(() => resolve()));
  http.closeIdleConnections?.();
  // In-flight requests finish within the grace period; SSE streams are then cut and the
  // clients reconnect through the Service to another replica.
  const force = setTimeout(() => http.closeAllConnections?.(), envInt("SHUTDOWN_GRACE_MS", 5_000));
  await closed;
  clearTimeout(force);
  await gateway[Symbol.asyncDispose]();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
