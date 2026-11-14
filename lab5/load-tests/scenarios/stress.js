// Stress / spike: jump from 5 to 50 VUs, hold ≤ 20 s, drop. Short think time and mostly
// uncached (randomized) requests, so the subgraphs and Postgres take the hit.
// Looks for: latency degradation, 503 load shedding (MAX_INFLIGHT_REQUESTS), errors, recovery.
import { baseThresholds, thinkMs } from "../lib/config.js";
import { countries, countryDetail, dashboard, earthquakes, events, think } from "../lib/journeys.js";

const PEAK = Number(__ENV.PEAK_VUS || 50);

export const options = {
  scenarios: {
    spike: {
      executor: "ramping-vus",
      startVUs: 5,
      stages: [
        { duration: "5s", target: 5 },
        { duration: "5s", target: PEAK },
        { duration: "20s", target: PEAK },
        { duration: "5s", target: 5 },
        { duration: "5s", target: 5 },
      ],
      gracefulRampDown: "5s",
    },
  },
  thresholds: {
    ...baseThresholds,
    http_req_failed: ["rate<0.05"],
    gql_errors: ["rate<0.05"],
    checks: ["rate>0.95"],
    "http_req_duration{expected_response:true}": ["p(95)<2500"],
    "gql_req_duration{cache:hit}": ["p(95)<200"],
    "gql_req_duration{cache:miss}": ["p(95)<3000"],
    gql_rejected: ["count<50"],
  },
};

const T = thinkMs(300);

export default function () {
  const r = Math.random();
  if (r < 0.1) dashboard();
  else if (r < 0.55) earthquakes(T, { fixedShare: 0.1, maxPages: 3 });
  else if (r < 0.75) countryDetail(T);
  else if (r < 0.9) events(T, { fixedShare: 0.1 });
  else countries(T, { fixedShare: 0.1 });
  think(T);
}
