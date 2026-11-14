// Baseline load: ramps up to 30 VUs (≈ 30 concurrent users with ~1 s think time) in < 2 min.
// Each VU emulates a separate client (X-Real-IP), so per-IP limits apply per user, as in production.
// Run with raised gateway limits (run.sh does it) so one load-generator IP is not throttled.
import { baseThresholds, thinkMs } from "../lib/config.js";
import { randomVisit } from "../lib/journeys.js";

const PEAK = Number(__ENV.PEAK_VUS || 30);

export const options = {
  scenarios: {
    users: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "20s", target: Math.ceil(PEAK / 3) },
        { duration: "30s", target: PEAK },
        { duration: "45s", target: PEAK },
        { duration: "10s", target: 0 },
      ],
      gracefulRampDown: "5s",
    },
  },
  thresholds: {
    ...baseThresholds,
    "http_req_duration{expected_response:true}": ["p(95)<800", "p(99)<2000"],
    // Sub-metrics below are listed so the end-of-test summary breaks numbers down.
    "gql_req_duration{cache:hit}": ["p(95)<100"],
    "gql_req_duration{cache:miss}": ["p(95)<1200"],
    "gql_cache_hit{variant:fixed}": ["rate>0.5"],
    "gql_cache_hit{variant:random}": ["rate>=0"],
    "http_req_duration{op:Dashboard}": ["p(95)<1500"],
    "http_req_duration{op:Earthquakes}": ["p(95)<800"],
    "http_req_duration{op:CountryDetail}": ["p(95)<1500"],
    "http_req_duration{op:CountryQuakes}": ["p(95)<800"],
    "http_req_duration{op:NaturalEvents}": ["p(95)<800"],
    "http_req_duration{op:Countries}": ["p(95)<800"],
  },
};

const T = thinkMs(1000);

export default function () {
  randomVisit(T);
}
