import { Counter, Histogram } from "prom-client";
import type { Logger } from "./logger.ts";
import { registry } from "./metrics.ts";

export class CircuitOpenError extends Error {
  constructor(name: string, retryAt: number) {
    super(`circuit "${name}" is open until ${new Date(retryAt).toISOString()}`);
  }
}

type CircuitState = "closed" | "open" | "half-open";

/**
 * Classic three-state breaker: after `threshold` consecutive failures the circuit opens and
 * short-circuits calls for `cooldownMs`; the next call after that is a single probe.
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  state: CircuitState = "closed";

  constructor(
    readonly name: string,
    private readonly threshold = 5,
    private readonly cooldownMs = 30_000,
  ) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.openedAt < this.cooldownMs) {
        throw new CircuitOpenError(this.name, this.openedAt + this.cooldownMs);
      }
      this.state = "half-open";
    }
    try {
      const result = await fn();
      this.failures = 0;
      this.state = "closed";
      return result;
    } catch (error) {
      this.failures++;
      if (this.state === "half-open" || this.failures >= this.threshold) {
        this.state = "open";
        this.openedAt = Date.now();
      }
      throw error;
    }
  }
}

const upstreamDuration = new Histogram({
  name: "geopulse_upstream_request_duration_seconds",
  help: "Latency of requests to external data sources",
  labelNames: ["source", "status"],
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
  registers: [registry],
});

const upstreamRetries = new Counter({
  name: "geopulse_upstream_retries_total",
  help: "Retries performed against external data sources",
  labelNames: ["source"],
  registers: [registry],
});

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
  }
}

export interface FetchJsonOptions {
  source: string;
  log: Logger;
  breaker?: CircuitBreaker;
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRetryable(error: unknown): boolean {
  if (error instanceof HttpError) return error.status === 429 || error.status >= 500;
  return !(error instanceof CircuitOpenError);
}

/** GET + JSON parse with per-attempt timeout, exponential backoff with jitter, and a breaker. */
export async function fetchJson<T>(url: string, opts: FetchJsonOptions): Promise<T> {
  const { source, log, breaker, timeoutMs = 30_000, retries = 4 } = opts;
  for (let attempt = 0; ; attempt++) {
    const started = performance.now();
    try {
      const call = async () => {
        const res = await fetch(url, {
          headers: { accept: "application/json", "user-agent": "geopulse-collector/1.0", ...opts.headers },
          signal: AbortSignal.timeout(timeoutMs),
        });
        upstreamDuration.observe({ source, status: String(res.status) }, (performance.now() - started) / 1000);
        if (!res.ok) throw new HttpError(res.status, url);
        return (await res.json()) as T;
      };
      return breaker ? await breaker.run(call) : await call();
    } catch (error) {
      if (attempt >= retries || !isRetryable(error)) throw error;
      const delay = Math.min(30_000, 500 * 2 ** attempt) * (0.5 + Math.random());
      upstreamRetries.inc({ source });
      log.warn({ source, url, attempt: attempt + 1, delay: Math.round(delay), err: (error as Error).message }, "upstream request failed, retrying");
      await sleep(delay);
    }
  }
}

/** Runs `fn` over `items` with at most `concurrency` in flight. */
export async function mapLimit<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T, index);
    }
  });
  await Promise.all(workers);
  return results;
}
