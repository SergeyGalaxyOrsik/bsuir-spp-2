#!/usr/bin/env python3
"""Generates the Kubernetes manifests in base/ (the four subgraphs share one template).

Run after changing replica counts or resources:  python3 infra/k8s/generate.py
The output is plain YAML managed by kustomize (kubectl apply -k infra/k8s).
"""
from pathlib import Path

BASE = Path(__file__).parent / "base"

# name, port, replicas, (hpa min, max), cpu request/limit, memory request/limit
SUBGRAPHS = [
    ("geo", 4001, 2, (2, 3), ("100m", "500m"), ("192Mi", "384Mi")),
    ("seismic", 4002, 2, (2, 4), ("100m", "600m"), ("192Mi", "384Mi")),
    ("hazards", 4003, 2, (2, 3), ("100m", "500m"), ("192Mi", "384Mi")),
    ("ops", 4004, 2, (2, 2), ("50m", "300m"), ("128Mi", "256Mi")),
]

LABELS = "app.kubernetes.io/part-of: geopulse"


def probes(port: int, path_ready="/ready", path_live="/health", startup_failures=60) -> str:
    return f"""          startupProbe:
            httpGet: {{ path: {path_live}, port: {port} }}
            periodSeconds: 2
            failureThreshold: {startup_failures}
          readinessProbe:
            httpGet: {{ path: {path_ready}, port: {port} }}
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 2
          livenessProbe:
            httpGet: {{ path: {path_live}, port: {port} }}
            periodSeconds: 10
            timeoutSeconds: 3
            failureThreshold: 3"""


def deployment(name, port, replicas, cpu, mem, tier, image, env_extra="", ready_path="/ready"):
    otel_name = f"{name}-subgraph" if tier == "backend" else name
    return f"""apiVersion: apps/v1
kind: Deployment
metadata:
  name: {name}
  labels: {{ app.kubernetes.io/name: {name}, app.kubernetes.io/part-of: geopulse, tier: {tier} }}
spec:
  replicas: {replicas}
  revisionHistoryLimit: 3
  selector:
    matchLabels: {{ app.kubernetes.io/name: {name} }}
  strategy:
    # Zero-downtime rollouts: a new pod must be Ready before an old one is removed.
    type: RollingUpdate
    rollingUpdate: {{ maxUnavailable: 0, maxSurge: 1 }}
  template:
    metadata:
      labels: {{ app.kubernetes.io/name: {name}, app.kubernetes.io/part-of: geopulse, tier: {tier} }}
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "{port}"
        prometheus.io/path: /metrics
    spec:
      terminationGracePeriodSeconds: 30
      # Spread replicas across nodes when there is more than one (no-op on a single-node cluster).
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: kubernetes.io/hostname
          whenUnsatisfiable: ScheduleAnyway
          labelSelector:
            matchLabels: {{ app.kubernetes.io/name: {name} }}
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
      containers:
        - name: {name}
          image: {image}
          imagePullPolicy: IfNotPresent
          ports:
            - {{ name: http, containerPort: {port} }}
          envFrom:
            - configMapRef: {{ name: geopulse-config }}
            - secretRef: {{ name: geopulse-secrets }}
          env:
            - {{ name: PORT, value: "{port}" }}
            - {{ name: OTEL_SERVICE_NAME, value: {otel_name} }}
            - name: HOSTNAME
              valueFrom: {{ fieldRef: {{ fieldPath: metadata.name }} }}
{env_extra}          resources:
            requests: {{ cpu: {cpu[0]}, memory: {mem[0]} }}
            limits: {{ cpu: {cpu[1]}, memory: {mem[1]} }}
          securityContext:
            allowPrivilegeEscalation: false
            capabilities: {{ drop: [ALL] }}
          lifecycle:
            # Give kube-proxy/endpoints time to drop the pod before SIGTERM starts the drain.
            preStop:
              exec: {{ command: ["sleep", "5"] }}
{probes(port, path_ready=ready_path)}
"""


def service(name, port, kind="ClusterIP", public_port=None):
    ports = f"    - {{ name: http, port: {public_port or port}, targetPort: {port} }}"
    return f"""apiVersion: v1
kind: Service
metadata:
  name: {name}{"-public" if kind == "LoadBalancer" else ""}
  labels: {{ app.kubernetes.io/name: {name}, {LABELS} }}
spec:
  type: {kind}
  selector: {{ app.kubernetes.io/name: {name} }}
  ports:
{ports}
"""


def hpa(name, lo, hi, cpu_target=70):
    return f"""apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {name}
  labels: {{ {LABELS} }}
spec:
  scaleTargetRef: {{ apiVersion: apps/v1, kind: Deployment, name: {name} }}
  minReplicas: {lo}
  maxReplicas: {hi}
  metrics:
    - type: Resource
      resource:
        name: cpu
        target: {{ type: Utilization, averageUtilization: {cpu_target} }}
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 15
      policies: [{{ type: Pods, value: 2, periodSeconds: 30 }}]
    scaleDown:
      stabilizationWindowSeconds: 120
      policies: [{{ type: Pods, value: 1, periodSeconds: 60 }}]
"""


def pdb(name):
    return f"""apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: {name}
  labels: {{ {LABELS} }}
spec:
  minAvailable: 1
  selector:
    matchLabels: {{ app.kubernetes.io/name: {name} }}
"""


def write(filename: str, *docs: str):
    (BASE / filename).write_text("# Generated by infra/k8s/generate.py — edit the generator, not this file.\n" + "---\n".join(docs))


def main():
    BASE.mkdir(exist_ok=True)
    for name, port, replicas, (lo, hi), cpu, mem in SUBGRAPHS:
        write(
            f"{name}.yaml",
            deployment(name, port, replicas, cpu, mem, "backend", f"geopulse-{name}:latest",
                       env_extra="            - { name: DB_POOL_SIZE, value: \"8\" }\n"),
            service(name, port),
            hpa(name, lo, hi),
            pdb(name),
        )

    write(
        "gateway.yaml",
        deployment("gateway", 4000, 2, ("200m", "1000m"), ("256Mi", "512Mi"), "edge", "geopulse-gateway:latest"),
        service("gateway", 4000),
        service("gateway", 4000, "LoadBalancer", public_port=8040),
        hpa("gateway", 2, 5),
        pdb("gateway"),
    )
    write(
        "web.yaml",
        deployment("web", 3000, 2, ("100m", "500m"), ("128Mi", "256Mi"), "edge", "geopulse-web:latest",
                   env_extra="            - { name: GRAPHQL_URL, value: \"http://gateway:4000/graphql\" }\n", ready_path="/health"),
        service("web", 3000),
        service("web", 3000, "LoadBalancer", public_port=8080),
        hpa("web", 2, 4),
        pdb("web"),
    )


if __name__ == "__main__":
    main()
