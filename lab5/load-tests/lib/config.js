// Environment-driven configuration so the same scripts run against docker compose and Kubernetes.
//   BASE_URL      gateway origin               (default http://localhost:4000)
//   GRAPHQL_PATH  GraphQL endpoint path         (default /graphql)
//   WEB_URL       SSR web origin                (default http://localhost:3100)
//   SPOOF_IP      1 = send a distinct X-Real-IP per VU to emulate separate clients (default 1).
//                 The gateway keys its token bucket and per-field limits by X-Real-IP; behind an
//                 ingress that overwrites the header, set SPOOF_IP=0 and raise the limits instead.
//   THINK_MS      mean pause between user actions in ms (scenario default if unset)

export const BASE_URL = (__ENV.BASE_URL || "http://localhost:4000").replace(/\/$/, "");
export const GRAPHQL_URL = BASE_URL + (__ENV.GRAPHQL_PATH || "/graphql");
export const WEB_URL = (__ENV.WEB_URL || "http://localhost:3100").replace(/\/$/, "");
export const SPOOF_IP = (__ENV.SPOOF_IP || "1") !== "0";

/** Stable pseudo client IP per VU (10.<scenario>.<hi>.<lo>). */
export function vuIp(scenarioOctet = 10) {
  const vu = typeof __VU === "number" ? __VU : 0;
  return `10.${scenarioOctet}.${Math.floor(vu / 250)}.${(vu % 250) + 1}`;
}

export function thinkMs(fallback) {
  return __ENV.THINK_MS ? Number(__ENV.THINK_MS) : fallback;
}

/** Common thresholds; scenarios extend or override. */
export const baseThresholds = {
  http_req_failed: ["rate<0.01"],
  gql_errors: ["rate<0.01"],
  checks: ["rate>0.99"],
};
