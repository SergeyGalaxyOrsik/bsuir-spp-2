// Loaded with `--import` so tracing is configured before the gateway runtime starts.
import { openTelemetrySetup } from "@graphql-hive/plugin-opentelemetry/setup";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (endpoint) {
  openTelemetrySetup({
    contextManager: new AsyncLocalStorageContextManager(),
    resource: { serviceName: process.env.OTEL_SERVICE_NAME ?? "gateway", serviceVersion: "1.0.0" },
    traces: { exporter: new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, "")}/v1/traces` }), batching: true },
  });
}
