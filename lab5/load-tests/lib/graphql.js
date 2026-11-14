import http from "k6/http";
import { check } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { clientHeaders, GRAPHQL_URL, vuIp } from "./config.js";

/** Share of GraphQL responses that carried `errors` (HTTP 200 with errors counts as a failure). */
export const gqlErrors = new Rate("gql_errors");
/** Share of responses answered from the gateway response cache (`extensions.responseCache.hit`). */
export const cacheHit = new Rate("gql_cache_hit");
/** GraphQL latency tagged with op and cache=hit|miss, so cached and uncached paths are reported separately. */
export const gqlDuration = new Trend("gql_req_duration", true);
/** Responses rejected by the gateway's load control (429/503). */
export const rejected = new Counter("gql_rejected");

export function headers(ipOctet) {
  return { "content-type": "application/json", accept: "application/json", "accept-encoding": "gzip", ...clientHeaders(vuIp(ipOctet)) };
}

/**
 * POST a GraphQL operation and record metrics.
 * opts.variant: "fixed" (identical document+variables, cacheable) or "random" (randomized variables).
 * Returns { res, body } where body is the parsed JSON (or null).
 */
export function gql(op, query, variables, opts = {}) {
  const variant = opts.variant || "random";
  const res = http.post(GRAPHQL_URL, JSON.stringify({ query, variables, operationName: opNameOf(query) }), {
    headers: opts.headers || headers(opts.ipOctet),
    tags: { name: op, op, variant },
    timeout: opts.timeout || "30s",
  });

  let body = null;
  try {
    body = res.json();
  } catch (_) {
    body = null;
  }

  if (res.status === 429 || res.status === 503) rejected.add(1, { op, status: String(res.status) });

  const hasErrors = !body || !!(body.errors && body.errors.length);
  const hit = !!(body && body.extensions && body.extensions.responseCache && body.extensions.responseCache.hit);
  if (!opts.expectErrors) {
    gqlErrors.add(hasErrors, { op });
    cacheHit.add(hit, { op, variant });
    gqlDuration.add(res.timings.duration, { op, cache: hit ? "hit" : "miss", variant });
    check(res, {
      [`${op}: status 200`]: (r) => r.status === 200,
      [`${op}: no GraphQL errors`]: () => !hasErrors,
      [`${op}: has data`]: () => !!(body && body.data),
    });
  }
  return { res, body };
}

function opNameOf(query) {
  const m = /^\s*(?:query|mutation|subscription)\s+(\w+)/.exec(query);
  return m ? m[1] : undefined;
}
