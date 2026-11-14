#!/usr/bin/env bash
# Deploys GeoPulse to a local Kubernetes cluster (OrbStack / Docker Desktop share the Docker
# image store, so locally built images are used directly — no registry needed).
#
#   ./infra/k8s/deploy.sh           build images + apply everything + wait for rollout
#   ./infra/k8s/deploy.sh --no-build
#   ./infra/k8s/deploy.sh --delete  remove the namespace (data volume included)
set -euo pipefail
cd "$(dirname "$0")/../.."

CONTEXT="${KUBE_CONTEXT:-orbstack}"
K="kubectl --context $CONTEXT"
NS=geopulse

if [[ "${1:-}" == "--delete" ]]; then
  $K delete namespace "$NS" --ignore-not-found
  exit 0
fi

if [[ "${1:-}" != "--no-build" ]]; then
  echo "==> Building images"
  docker compose build geo seismic hazards ops gateway web
fi

echo "==> metrics-server (required by HorizontalPodAutoscaler)"
$K apply -f infra/k8s/addons/metrics-server.yaml >/dev/null

echo "==> Namespace and file-based config maps"
$K apply -f infra/k8s/base/namespace.yaml >/dev/null
$K -n "$NS" create configmap grafana-dashboards --from-file=infra/grafana/dashboards/ --dry-run=client -o yaml | $K apply -f - >/dev/null
$K -n "$NS" create configmap prometheus-rules --from-file=infra/prometheus/alerts.yml --dry-run=client -o yaml | $K apply -f - >/dev/null

echo "==> Applying manifests"
$K apply -k infra/k8s

# Images are tagged :latest and rebuilt in place, so force pods onto the new build.
if [[ "${1:-}" != "--no-build" ]]; then
  $K -n "$NS" rollout restart deployment geo seismic hazards ops gateway web >/dev/null
fi

echo "==> Waiting for rollout"
$K -n "$NS" rollout status statefulset/postgres --timeout=180s
for d in geo seismic hazards ops gateway web jaeger prometheus grafana; do
  $K -n "$NS" rollout status "deployment/$d" --timeout=300s
done

cat <<EOF

GeoPulse is running in Kubernetes (namespace $NS):
  Web app      http://localhost:8080
  GraphQL      http://localhost:8040/graphql
  Grafana      http://localhost:8030
  Prometheus   http://localhost:8090
  Jaeger       http://localhost:8686

  kubectl --context $CONTEXT -n $NS get pods,hpa,pdb
EOF
