import { Counter, collectDefaultMetrics, Gauge, Registry } from "prom-client";

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const ingestRecords = new Counter({
  name: "geopulse_ingest_records_total",
  help: "Records upserted by collectors",
  labelNames: ["source"],
  registers: [registry],
});

export const ingestRuns = new Counter({
  name: "geopulse_ingest_runs_total",
  help: "Collector runs by outcome",
  labelNames: ["source", "status"],
  registers: [registry],
});

export const ingestLastSuccess = new Gauge({
  name: "geopulse_ingest_last_success_timestamp_seconds",
  help: "Unix time of the last successful collector run",
  labelNames: ["source"],
  registers: [registry],
});
