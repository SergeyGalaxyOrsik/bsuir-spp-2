#!/usr/bin/env bash
# Fault-tolerance drill for the Kubernetes deployment. A background prober sends a federated
# GraphQL query (geo + seismic + hazards) ~5 times per second while faults are injected; the
# summary shows how many requests failed outright and how many came back with partial data.
#
#   ./infra/k8s/resilience-demo.sh
set -uo pipefail
CONTEXT="${KUBE_CONTEXT:-orbstack}"
K="kubectl --context $CONTEXT -n geopulse"
URL="${GATEWAY_URL:-http://localhost:8040/graphql}"
LOG="$(mktemp -t geopulse-probe)"
QUERY='{"query":"{ country(code:\"JPN\") { name seismicStats { count } hazardStats { count } } earthquakes(first: 3) { nodes { id } } }"}'

phase() { echo "$1" >"$LOG.phase"; echo; echo "=== $1"; }
current() { cat "$LOG.phase" 2>/dev/null || echo init; }

prober() { while true; do probe_once; done; }
probe_once() {
  local p; p=$(current)
  out=$(curl -s -m 3 -o - -w ' HTTP%{http_code}' "$URL" -H 'content-type: application/json' -d "$QUERY" 2>/dev/null)
  code=${out##* HTTP}
  if [[ "$code" != "200" ]]; then echo "$p FAIL" >>"$LOG"
  elif [[ "$out" == *'"errors"'* ]]; then echo "$p PARTIAL" >>"$LOG"
  else echo "$p OK" >>"$LOG"; fi
  sleep 0.2
}

phase "baseline"
prober &
PROBER=$!
trap 'kill $PROBER 2>/dev/null; rm -f "$LOG" "$LOG.phase"' EXIT
sleep 10

phase "1. kill a seismic pod (self-healing + second replica)"
pod=$($K get pods -l app.kubernetes.io/name=seismic -o name | head -1)
echo "deleting $pod"
$K delete "$pod" --wait=false
sleep 20
$K get pods -l app.kubernetes.io/name=seismic --no-headers

phase "2. rolling restart of the gateway (maxUnavailable=0, preStop drain)"
$K rollout restart deployment/gateway
$K rollout status deployment/gateway --timeout=180s
sleep 5

phase "3. hazards subgraph completely down (graceful degradation)"
$K scale deployment/hazards --replicas=0
sleep 15

phase "4. hazards back"
$K scale deployment/hazards --replicas=2
$K rollout status deployment/hazards --timeout=180s
sleep 10

phase "done"
sleep 1
kill $PROBER 2>/dev/null
wait $PROBER 2>/dev/null

echo
echo "=== Probe results (requests per phase)"
printf "%-70s %6s %8s %6s\n" PHASE OK PARTIAL FAIL
grep -v '^done' "$LOG" | awk '{st=$NF; $NF=""; sub(/ +$/,""); c[$0" "st]++; p[$0]=1} END {for (k in p) printf "%-70s %6d %8d %6d\n", k, c[k" OK"], c[k" PARTIAL"], c[k" FAIL"]}' | sort
