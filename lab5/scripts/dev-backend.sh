#!/usr/bin/env bash
# Runs all subgraphs and the gateway locally (infra from docker compose must be up).
set -euo pipefail
cd "$(dirname "$0")/.."
export OTEL_EXPORTER_OTLP_ENDPOINT="${OTEL_EXPORTER_OTLP_ENDPOINT:-http://localhost:4318}"
pids=()
for svc in geo seismic hazards ops; do
  (cd "services/$svc" && OTEL_SERVICE_NAME="$svc-subgraph" exec npx tsx --import @geopulse/shared/telemetry src/index.ts 2>&1 | sed -u "s/^/[$svc] /") &
  pids+=($!)
done
(cd apps/gateway && OTEL_SERVICE_NAME=gateway exec npx tsx --import ./src/instrument.ts src/index.ts 2>&1 | sed -u "s/^/[gateway] /") &
pids+=($!)
trap 'kill "${pids[@]}" 2>/dev/null' INT TERM EXIT
wait
