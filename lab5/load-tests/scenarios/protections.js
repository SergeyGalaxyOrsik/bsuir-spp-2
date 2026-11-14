// Protections: verifies that the gateway's defences actually fire. Run against NORMAL limits
// (RATE_LIMIT_PER_SECOND=20, RATE_LIMIT_BURST=60); with raised limits the 429 checks fail by design.
//   1. token bucket per IP  → 429 + Retry-After + code RATE_LIMITED
//   2. per-field limit       → earthquakeTimeline > 60/min per IP is refused
//   3. demand control        → COST_ESTIMATED_TOO_EXPENSIVE (> MAX_QUERY_COST = 20 000)
//   4. depth limit           → query deeper than 10 levels is rejected
//   5. alias limit           → more than 15 aliases is rejected
// Each check uses its own X-Real-IP (+ X-Internal-Token) so the steps do not influence each other.
// With SPOOF_IP=0 all steps share the load generator address; run it alone then.
import http from "k6/http";
import { check, group, sleep } from "k6";
import { Counter } from "k6/metrics";
import { clientHeaders, GRAPHQL_URL } from "../lib/config.js";
import * as Q from "../lib/queries.js";

const status429 = new Counter("protect_429");
const status200 = new Counter("protect_200");

export const options = {
  scenarios: {
    protections: { executor: "per-vu-iterations", vus: 1, iterations: 1, maxDuration: "60s" },
  },
  // All checks must pass; http_req_failed is irrelevant here (429s are expected).
  thresholds: { checks: ["rate==1"] },
  batchPerHost: 25,
};

const hdr = (ip) => ({ "content-type": "application/json", ...clientHeaders(ip) });
const post = (ip, query, tags = {}) =>
  http.post(GRAPHQL_URL, JSON.stringify({ query }), { headers: hdr(ip), tags, responseCallback: http.expectedStatuses(200, 429) });
const errorOf = (res) => {
  try {
    const b = res.json();
    return (b.errors && b.errors[0]) || null;
  } catch (_) {
    return null;
  }
};

export default function () {
  const run = `${Date.now() % 250}`;

  group("token bucket (429)", () => {
    // 100 concurrent requests from one client: the 60-token burst admits ~60, the rest get 429.
    const ip = `10.250.${run}.1`;
    const reqs = Array.from({ length: 100 }, () => ({
      method: "POST",
      url: GRAPHQL_URL,
      body: JSON.stringify({ query: Q.CHEAP }),
      params: { headers: hdr(ip), tags: { name: "burst" }, responseCallback: http.expectedStatuses(200, 429) },
    }));
    const res = http.batch(reqs);
    const limited = res.filter((r) => r.status === 429);
    const ok = res.filter((r) => r.status === 200);
    status429.add(limited.length);
    status200.add(ok.length);
    check(null, {
      "burst: some requests answered 200": () => ok.length >= 40,
      "burst: excess answered 429": () => limited.length >= 20,
      "burst: 429 carries Retry-After": () => limited.length > 0 && !!limited[0].headers["Retry-After"],
      "burst: 429 body has RATE_LIMITED": () => limited.length > 0 && (errorOf(limited[0]) || {}).extensions?.code === "RATE_LIMITED",
    });
    // After waiting for Retry-After the client is served again.
    sleep(Number((limited[0] && limited[0].headers["Retry-After"]) || 1) + 0.2);
    check(post(ip, Q.CHEAP), { "burst: served again after Retry-After": (r) => r.status === 200 });
  });

  group("per-field limit (earthquakeTimeline 60/min)", () => {
    const ip = `10.251.${run}.1`;
    let refused = 0;
    for (let i = 0; i < 70; i++) {
      // Distinct variables defeat the response cache, so every call reaches the limiter.
      const res = post(ip, `{ earthquakeTimeline(filter: { magnitude: { min: ${(2 + i / 100).toFixed(2)} } }, bucket: MONTH) { count } }`, { name: "timeline" });
      const e = errorOf(res);
      if (e && /Rate limit of "Query.earthquakeTimeline"/.test(e.message)) refused++;
      sleep(0.06); // stay under the token bucket (20 rps) so only the field limit can refuse
    }
    check(null, { "field limit: calls beyond 60/min refused": () => refused >= 5 });
  });

  group("demand control (cost)", () => {
    const res = post(`10.253.${run}.1`, Q.TOO_EXPENSIVE, { name: "too_expensive" });
    const e = errorOf(res) || {};
    check(res, {
      "cost: rejected with COST_ESTIMATED_TOO_EXPENSIVE": () => e.extensions && e.extensions.code === "COST_ESTIMATED_TOO_EXPENSIVE",
      "cost: no data returned": (r) => r.json().data == null,
    });
  });

  group("depth limit", () => {
    const res = post(`10.253.${run}.2`, Q.TOO_DEEP, { name: "too_deep" });
    const e = errorOf(res) || {};
    check(res, { "depth: rejected (> 10)": () => /depth limit of 10 exceeded/i.test(e.message || "") });
  });

  group("alias limit", () => {
    const res = post(`10.253.${run}.3`, Q.TOO_MANY_ALIASES, { name: "too_many_aliases" });
    const e = errorOf(res) || {};
    check(res, { "aliases: rejected (> 15)": () => /Aliases limit of 15 exceeded/i.test(e.message || "") });
  });

  group("legit query still allowed", () => {
    const res = post(`10.253.${run}.4`, Q.CHEAP, { name: "cheap" });
    check(res, { "cheap: 200 with data": (r) => r.status === 200 && !!r.json().data });
  });
}
