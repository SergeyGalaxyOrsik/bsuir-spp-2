#!/usr/bin/env bash
# Runs k6 scenarios against GeoPulse. Scenarios run strictly one after another.
#   ./load-tests/run.sh [smoke|load|stress|protections|web|all] [extra k6 args...]
# Env: BASE_URL, WEB_URL, GRAPHQL_PATH, SPOOF_IP, PEAK_VUS, THINK_MS (see lib/config.js)
#      RAISE_LIMITS=0  do not restart the gateway with raised limits for load/stress
#                      (set it for Kubernetes, where this script cannot reconfigure the gateway).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
RESULTS="$HERE/results"
mkdir -p "$RESULTS"
SCENARIO="${1:-smoke}"
shift || true
RAISE_LIMITS="${RAISE_LIMITS:-1}"

compose() { (cd "$ROOT" && docker compose "$@"); }

wait_gateway() {
  local url="${BASE_URL:-http://localhost:4000}/ready"
  for _ in $(seq 1 60); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      # The supergraph is composed asynchronously after /ready; wait for a real answer.
      if curl -fsS -H 'content-type: application/json' -d '{"query":"{ totalRecords }"}' "${BASE_URL:-http://localhost:4000}/graphql" | grep -q totalRecords; then
        return 0
      fi
    fi
    sleep 1
  done
  echo "gateway did not become ready" >&2
  return 1
}

raise_limits() {
  [[ "$RAISE_LIMITS" == "1" ]] || return 0
  echo ">> gateway: raising rate limits for throughput run"
  compose -f docker-compose.yml -f load-tests/compose.loadtest.yml up -d --no-deps gateway
  wait_gateway
}

restore_limits() {
  [[ "$RAISE_LIMITS" == "1" ]] || return 0
  echo ">> gateway: restoring normal limits"
  compose up -d --no-deps gateway
  wait_gateway
}

snapshot() {
  # Resource sample of the stack (skipped when docker is unavailable, e.g. remote cluster).
  command -v docker >/dev/null && docker stats --no-stream --format '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' 2>/dev/null \
    | grep geopulse >>"$RESULTS/$1-docker-stats.tsv" || true
}

run_k6() {
  local name="$1"; shift
  local stamp; stamp="$(date +%Y%m%d-%H%M%S)"
  echo ">> k6 scenario: $name"
  : >"$RESULTS/$name-docker-stats.tsv"
  # Sample container usage every 10 s while k6 runs.
  ( while sleep 10; do echo "# $(date +%T)" >>"$RESULTS/$name-docker-stats.tsv"; snapshot "$name"; done ) &
  local sampler=$!
  set +e
  k6 run --quiet \
    --summary-trend-stats "avg,min,med,p(90),p(95),p(99),max" \
    --summary-export "$RESULTS/$name-$stamp.json" \
    "$@" "$HERE/scenarios/$name.js" 2>&1 | tee "$RESULTS/$name-$stamp.log"
  local code=${PIPESTATUS[0]}
  set -e
  kill "$sampler" 2>/dev/null || true
  wait "$sampler" 2>/dev/null || true
  echo ">> $name finished with exit code $code (99 = thresholds crossed)"
  return 0
}

case "$SCENARIO" in
  smoke | protections | web)
    run_k6 "$SCENARIO" "$@"
    ;;
  load | stress)
    raise_limits
    trap restore_limits EXIT
    run_k6 "$SCENARIO" "$@"
    ;;
  all)
    run_k6 smoke "$@"
    run_k6 protections "$@"
    run_k6 web "$@"
    raise_limits
    trap restore_limits EXIT
    run_k6 load "$@"
    sleep 15 # let the stack settle between runs
    run_k6 stress "$@"
    ;;
  *)
    echo "usage: $0 [smoke|load|stress|protections|web|all] [k6 args]" >&2
    exit 2
    ;;
esac
