import type { MiddlewareHandler } from "hono";
import { Counter, Gauge } from "prom-client";
import { INTERNAL_TOKEN, registry } from "@geopulse/shared";

const rejected = new Counter({
  name: "geopulse_gateway_rejected_requests_total",
  help: "Requests rejected by load control",
  labelNames: ["reason"],
  registers: [registry],
});

const inflightGauge = new Gauge({
  name: "geopulse_gateway_inflight_requests",
  help: "GraphQL requests currently being processed",
  registers: [registry],
});

/**
 * The rate-limit key. `x-real-ip` is honoured only from our own web proxy, which proves itself
 * with the internal service token; anyone else is keyed by the socket address they connect from.
 */
export function clientIp(headers: Headers, socketAddress = "unknown"): string {
  const forwarded = headers.get("x-real-ip");
  if (forwarded && headers.get("x-internal-token") === INTERNAL_TOKEN()) return forwarded;
  return socketAddress;
}

/**
 * Token bucket per client IP: `burst` requests immediately, refilled at `perSecond`.
 * Answers 429 with Retry-After when empty.
 */
export function rateLimit(opts: { perSecond: number; burst: number }): MiddlewareHandler {
  const buckets = new Map<string, { tokens: number; at: number }>();
  setInterval(() => {
    const cutoff = Date.now() - 60_000;
    for (const [ip, b] of buckets) if (b.at < cutoff) buckets.delete(ip);
  }, 30_000).unref();

  return async (c, next) => {
    const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
    const ip = clientIp(c.req.raw.headers, env?.incoming?.socket?.remoteAddress);
    const now = Date.now();
    const bucket = buckets.get(ip) ?? { tokens: opts.burst, at: now };
    bucket.tokens = Math.min(opts.burst, bucket.tokens + ((now - bucket.at) / 1000) * opts.perSecond);
    bucket.at = now;
    buckets.set(ip, bucket);
    c.header("x-ratelimit-limit", String(opts.burst));
    if (bucket.tokens < 1) {
      rejected.inc({ reason: "rate_limit" });
      const retryAfter = Math.ceil((1 - bucket.tokens) / opts.perSecond);
      c.header("retry-after", String(retryAfter));
      return c.json({ errors: [{ message: "Too many requests", extensions: { code: "RATE_LIMITED", retryAfter } }] }, 429);
    }
    bucket.tokens -= 1;
    c.header("x-ratelimit-remaining", String(Math.floor(bucket.tokens)));
    await next();
  };
}

/** Load shedding: beyond `max` concurrent requests the gateway answers 503 instead of queueing. */
export function concurrencyLimit(max: number): MiddlewareHandler {
  let inflight = 0;
  return async (c, next) => {
    if (inflight >= max) {
      rejected.inc({ reason: "overload" });
      c.header("retry-after", "1");
      return c.json({ errors: [{ message: "Server is overloaded, retry shortly", extensions: { code: "OVERLOADED" } }] }, 503);
    }
    inflight++;
    inflightGauge.set(inflight);
    try {
      await next();
    } finally {
      inflight--;
      inflightGauge.set(inflight);
    }
  };
}
